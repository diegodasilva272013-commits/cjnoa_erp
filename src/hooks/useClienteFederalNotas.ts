// ============================================================================
// useClienteFederalNotas
// ----------------------------------------------------------------------------
// Hook ESPEJO de useCasoGeneralNotas. La nota vive en clientes_federales_notas
// pero la TAREA asociada vive en public.tareas (con cliente_federal_id), igual
// que las tareas provinciales. Asi disparan los mismos triggers de
// notificacion y aparecen en Mi Dia, Control de Tareas y la pagina de Tareas.
//
// Devuelve EXACTAMENTE la misma API publica que useCasoGeneralNotas:
//   { notas, loading, refetch, migrationError,
//     agregarNota, agregarNotaConTarea, eliminarNota,
//     marcarTareaVista, cambiarEstadoTarea }
//
// Asi NotasFeedPanel puede usar uno u otro segun el `variant`, sin duplicar UI.
// ============================================================================
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { CasoGeneralNota, EstadoTareaFlujo } from './useCasoGeneralNotas';

export function useClienteFederalNotas(clienteId: string | null) {
  const [notas, setNotas] = useState<CasoGeneralNota[]>([]);
  const [loading, setLoading] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const fetchNotas = useCallback(async () => {
    if (!clienteId) { setNotas([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes_federales_notas_completo')
      .select('*')
      .eq('caso_id', clienteId)
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message)) {
        setMigrationError('Falta correr las migraciones SQL en Supabase: migration_federales_seguimiento_paridad.sql + migration_federales_tareas_unificadas.sql');
      } else {
        setMigrationError(error.message);
      }
    } else {
      setMigrationError(null);
      setNotas((data || []) as CasoGeneralNota[]);
    }
    setLoading(false);
  }, [clienteId]);

  useEffect(() => { fetchNotas(); }, [fetchNotas]);

  // Realtime: notas o tareas federales asociadas
  useEffect(() => {
    if (!clienteId) return;
    const ch = supabase
      .channel(`fed-notas-rich-${clienteId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'clientes_federales_notas', filter: `cliente_fed_id=eq.${clienteId}` },
        () => fetchNotas())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tareas', filter: `cliente_federal_id=eq.${clienteId}` },
        () => fetchNotas())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clienteId, fetchNotas]);

  async function agregarNota(contenido: string, userId: string, audioBlob?: Blob | null): Promise<boolean> {
    if (!clienteId || !contenido.trim()) return false;
    let audio_path: string | null = null;
    if (audioBlob) {
      audio_path = `clientes-federales/${clienteId}/${Date.now()}.webm`;
      const up = await supabase.storage.from('notas-voz').upload(audio_path, audioBlob, { contentType: 'audio/webm', upsert: false });
      if (up.error) { console.error('[audio upload]', up.error); audio_path = null; }
    }
    const { error } = await supabase.from('clientes_federales_notas').insert({
      cliente_fed_id: clienteId,
      contenido: contenido.trim(),
      created_by: userId,
      audio_path,
    });
    if (error) { console.error(error); return false; }
    await fetchNotas();
    return true;
  }

  async function agregarNotaConTarea(params: {
    contenido: string;
    userId: string;
    tareaTitulo: string;
    responsableId: string;
    fechaLimite: string | null;
    descripcion?: string;
    prioridad?: 'alta' | 'media' | 'sin_prioridad';
    cargoHora?: string;
    cargoHoraFavor?: string;
    cargoHoraFavorFecha?: string | null;
    audioBlob?: Blob | null;
    pasos?: { descripcion: string; responsable_id: string | null }[];
  }): Promise<{ ok: boolean; error?: string }> {
    if (!clienteId) return { ok: false, error: 'clienteId vacío' };
    let audio_path: string | null = null;
    if (params.audioBlob) {
      audio_path = `clientes-federales/${clienteId}/${Date.now()}.webm`;
      const up = await supabase.storage.from('notas-voz').upload(audio_path, params.audioBlob, { contentType: 'audio/webm', upsert: false });
      if (up.error) { console.error('[audio upload]', up.error); audio_path = null; }
    }

    // Resolver nombre del responsable para guardarlo desnormalizado
    let responsable_nombre: string | null = null;
    if (params.responsableId) {
      const { data: perfil } = await supabase
        .from('perfiles').select('nombre').eq('id', params.responsableId).maybeSingle();
      responsable_nombre = (perfil as any)?.nombre ?? null;
    }

    // 1) crear tarea en public.tareas (unica fuente de verdad)
    const { data: tareaIns, error: errTarea } = await supabase
      .from('tareas')
      .insert({
        cliente_federal_id: clienteId,
        titulo: params.tareaTitulo.trim() || params.contenido.slice(0, 80),
        descripcion: params.descripcion?.trim() || params.contenido.trim(),
        responsable_id: params.responsableId || null,
        responsable_nombre,
        fecha_limite: params.fechaLimite,
        prioridad: params.prioridad ?? 'sin_prioridad',
        cargo_hora: params.cargoHora?.trim() || null,
        cargo_hora_favor: params.cargoHoraFavor?.trim() || null,
        cargo_hora_favor_fecha: params.cargoHoraFavorFecha || null,
        estado: 'activa',
        created_by: params.userId,
        updated_by: params.userId,
      })
      .select('id')
      .single();
    if (errTarea || !tareaIns) {
      console.error('[tareas insert federal]', errTarea);
      return { ok: false, error: errTarea?.message || 'No se pudo crear la tarea' };
    }

    // 1.b) pasos compartidos (misma tabla que tareas provinciales)
    const pasosValidos = (params.pasos || []).filter(p => p.descripcion.trim());
    if (pasosValidos.length > 0) {
      const rows = pasosValidos.map((p, i) => ({
        tarea_id: tareaIns.id,
        orden: i + 1,
        descripcion: p.descripcion.trim(),
        responsable_id: p.responsable_id || null,
      }));
      const { error: errPasos } = await supabase.from('tarea_pasos').insert(rows);
      if (errPasos) console.error('[tarea_pasos insert]', errPasos);
    }

    // 2) crear nota apuntando a la tarea
    const { error: errNota } = await supabase.from('clientes_federales_notas').insert({
      cliente_fed_id: clienteId,
      contenido: params.contenido.trim(),
      tarea_federal_id: tareaIns.id,
      audio_path,
      created_by: params.userId,
    });
    if (errNota) {
      console.error('[nota fed insert]', errNota);
      return { ok: false, error: errNota.message || 'No se pudo crear la nota' };
    }
    await fetchNotas();
    return { ok: true };
  }

  async function eliminarNota(id: string): Promise<boolean> {
    const { error } = await supabase.from('clientes_federales_notas').delete().eq('id', id);
    if (error) { console.error(error); return false; }
    await fetchNotas();
    return true;
  }

  async function marcarTareaVista(tareaId: string): Promise<boolean> {
    const { error } = await supabase
      .from('tareas')
      .update({ visto_por_asignado: true, visto_at: new Date().toISOString() })
      .eq('id', tareaId);
    if (error) { console.error(error); return false; }
    await fetchNotas();
    return true;
  }

  async function cambiarEstadoTarea(tareaId: string, estado: EstadoTareaFlujo, userId: string): Promise<boolean> {
    const updates: Record<string, unknown> = { estado, updated_by: userId };
    if (estado === 'finalizada') updates.fecha_completada = new Date().toISOString();
    const { error } = await supabase.from('tareas').update(updates).eq('id', tareaId);
    if (error) { console.error(error); return false; }
    await fetchNotas();
    return true;
  }

  return {
    notas, loading, refetch: fetchNotas, migrationError,
    agregarNota, agregarNotaConTarea, eliminarNota,
    marcarTareaVista, cambiarEstadoTarea,
  };
}
