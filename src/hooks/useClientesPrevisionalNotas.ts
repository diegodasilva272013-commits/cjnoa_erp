import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface ClientePrevisionalNota {
  id: string;
  cliente_prev_id: string;
  contenido: string;
  tarea_previsional_id: string | null;
  audio_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  editado: boolean;
  autor_nombre: string | null;
  autor_avatar: string | null;
  // tarea (si hay)
  tarea_titulo: string | null;
  tarea_estado: string | null;
  tarea_fecha_limite: string | null;
  tarea_responsable_id: string | null;
  tarea_prioridad: string | null;
  tarea_descripcion: string | null;
  tarea_responsable_nombre: string | null;
  tarea_responsable_avatar: string | null;
}

export function useClientesPrevisionalNotas(clienteId: string | null) {
  const [notas, setNotas] = useState<ClientePrevisionalNota[]>([]);
  const [loading, setLoading] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const fetchNotas = useCallback(async () => {
    if (!clienteId) { setNotas([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes_previsional_notas_completo')
      .select('*')
      .eq('cliente_prev_id', clienteId)
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01' || /does not exist/i.test(error.message)) {
        setMigrationError('Falta correr la migración SQL en Supabase: supabase/migration_previsional_seguimiento_y_pasos.sql');
      } else {
        setMigrationError(error.message);
      }
    } else if (data) {
      setMigrationError(null);
      setNotas(data as ClientePrevisionalNota[]);
    }
    setLoading(false);
  }, [clienteId]);

  useEffect(() => { fetchNotas(); }, [fetchNotas]);

  // Realtime
  useEffect(() => {
    if (!clienteId) return;
    const ch = supabase
      .channel(`cli-prev-notas-${clienteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes_previsional_notas', filter: `cliente_prev_id=eq.${clienteId}` },
        () => fetchNotas())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tareas_previsional' },
        () => fetchNotas())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clienteId, fetchNotas]);

  async function agregarNota(contenido: string, userId: string, audioBlob?: Blob | null): Promise<boolean> {
    if (!clienteId || !contenido.trim()) return false;
    let audio_path: string | null = null;
    if (audioBlob) {
      audio_path = `clientes-previsional/${clienteId}/${Date.now()}.webm`;
      const up = await supabase.storage.from('notas-voz').upload(audio_path, audioBlob, { contentType: 'audio/webm', upsert: false });
      if (up.error) { console.error('[audio upload]', up.error); audio_path = null; }
    }
    const { error } = await supabase.from('clientes_previsional_notas')
      .insert({ cliente_prev_id: clienteId, contenido: contenido.trim(), created_by: userId, audio_path });
    if (error) { console.error(error); return false; }
    await fetchNotas();
    return true;
  }

  async function agregarNotaConTarea(params: {
    contenido: string;
    userId: string;
    tareaTitulo: string;
    responsableId: string;
    responsableNombre?: string | null;
    fechaLimite: string | null;
    descripcion?: string;
    prioridad?: 'alta' | 'media' | 'sin_prioridad';
    cargoHora?: string;
    audioBlob?: Blob | null;
    pasos?: { descripcion: string; responsable_id: string | null }[];
  }): Promise<{ ok: boolean; error?: string }> {
    if (!clienteId) return { ok: false, error: 'clienteId vacío' };
    let audio_path: string | null = null;
    if (params.audioBlob) {
      audio_path = `clientes-previsional/${clienteId}/${Date.now()}.webm`;
      const up = await supabase.storage.from('notas-voz').upload(audio_path, params.audioBlob, { contentType: 'audio/webm', upsert: false });
      if (up.error) { console.error('[audio upload]', up.error); audio_path = null; }
    }

    // 1) Crear tarea_previsional
    const { data: tareaIns, error: errTarea } = await supabase
      .from('tareas_previsional')
      .insert({
        titulo: params.tareaTitulo.trim() || params.contenido.slice(0, 80),
        descripcion: params.descripcion?.trim() || params.contenido.trim(),
        responsable_id: params.responsableId,
        responsable_nombre: params.responsableNombre || null,
        fecha_limite: params.fechaLimite,
        prioridad: params.prioridad ?? 'media',
        cargo_hora: params.cargoHora?.trim() || null,
        estado: 'pendiente',
        cliente_prev_id: clienteId,
        created_by: params.userId,
      })
      .select('id')
      .single();

    if (errTarea || !tareaIns) {
      console.error('[tareas_previsional insert]', errTarea);
      return { ok: false, error: errTarea?.message || 'No se pudo crear la tarea' };
    }

    // 1.b) Insertar pasos si los hay
    const pasosValidos = (params.pasos || []).filter(p => p.descripcion.trim());
    if (pasosValidos.length > 0) {
      const rows = pasosValidos.map((p, i) => ({
        tarea_previsional_id: tareaIns.id,
        orden: i + 1,
        descripcion: p.descripcion.trim(),
        responsable_id: p.responsable_id || null,
      }));
      const { error: errPasos } = await supabase.from('tarea_pasos_previsional').insert(rows);
      if (errPasos) console.error('[tarea_pasos_previsional insert]', errPasos);
    }

    // 2) Crear nota apuntando a la tarea
    const { error: errNota } = await supabase.from('clientes_previsional_notas')
      .insert({
        cliente_prev_id: clienteId,
        contenido: params.contenido.trim(),
        tarea_previsional_id: tareaIns.id,
        audio_path,
        created_by: params.userId,
      });

    if (errNota) {
      console.error('[nota insert]', errNota);
      return { ok: false, error: errNota.message || 'No se pudo crear la nota' };
    }

    await fetchNotas();
    return { ok: true };
  }

  async function eliminarNota(id: string): Promise<boolean> {
    const { error } = await supabase.from('clientes_previsional_notas').delete().eq('id', id);
    if (error) { console.error(error); return false; }
    await fetchNotas();
    return true;
  }

  return {
    notas, loading, refetch: fetchNotas, migrationError,
    agregarNota, agregarNotaConTarea, eliminarNota,
  };
}

// ─── Pasos de tareas previsionales ──────────────────────────────────────────
export interface TareaPasoPrevisional {
  id: string;
  tarea_previsional_id: string;
  orden: number;
  descripcion: string;
  responsable_id: string | null;
  completado: boolean;
  completado_at: string | null;
  completado_por: string | null;
  responsable_nombre: string | null;
  responsable_avatar: string | null;
  completado_por_nombre: string | null;
}

export function useTareaPasosPrevisional(tareaId: string | null) {
  const [pasos, setPasos] = useState<TareaPasoPrevisional[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPasos = useCallback(async () => {
    if (!tareaId) { setPasos([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('tarea_pasos_previsional_completos')
      .select('*')
      .eq('tarea_previsional_id', tareaId)
      .order('orden', { ascending: true });
    if (!error && data) setPasos(data as TareaPasoPrevisional[]);
    setLoading(false);
  }, [tareaId]);

  useEffect(() => { fetchPasos(); }, [fetchPasos]);

  useEffect(() => {
    if (!tareaId) return;
    const ch = supabase
      .channel(`tarea-pasos-prev-${tareaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarea_pasos_previsional', filter: `tarea_previsional_id=eq.${tareaId}` },
        () => fetchPasos())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tareaId, fetchPasos]);

  async function togglePaso(pasoId: string, completado: boolean, userId: string): Promise<boolean> {
    const updates: Record<string, unknown> = {
      completado,
      completado_at: completado ? new Date().toISOString() : null,
      completado_por: completado ? userId : null,
    };
    const { error } = await supabase.from('tarea_pasos_previsional').update(updates).eq('id', pasoId);
    if (error) { console.error(error); return false; }
    await fetchPasos();
    return true;
  }

  return { pasos, loading, refetch: fetchPasos, togglePaso };
}
