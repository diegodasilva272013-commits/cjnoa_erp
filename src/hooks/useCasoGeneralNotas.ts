import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface CasoGeneralNota {
  id: string;
  caso_id: string;
  contenido: string;
  tarea_id: string | null;
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
  tarea_visto: boolean | null;
  tarea_visto_at: string | null;
  tarea_responsable_nombre: string | null;
  tarea_responsable_avatar: string | null;
  tarea_prioridad: string | null;
  tarea_descripcion: string | null;
  tarea_culminacion: string | null;
  tarea_cargo_hora: string | null;
  tarea_cargo_hora_favor: string | null;
  tarea_cargo_hora_favor_fecha: string | null;
  tarea_adjunto_path: string | null;
  tarea_adjunto_nombre: string | null;
}

export type EstadoTareaFlujo =
  | 'activa' | 'aceptada' | 'pendiente' | 'en_proceso' | 'finalizada';

export const ESTADOS_TAREA_FLUJO: EstadoTareaFlujo[] = [
  'activa', 'aceptada', 'pendiente', 'en_proceso', 'finalizada'
];

export const ESTADO_TAREA_LABEL: Record<string, string> = {
  activa: 'Activa', aceptada: 'Aceptada', pendiente: 'Pendiente',
  en_proceso: 'En proceso', finalizada: 'Finalizada',
  en_curso: 'En curso', completada: 'Completada',
};
export const ESTADO_TAREA_COLOR: Record<string, string> = {
  activa:     'bg-blue-500/10 text-blue-300 border-blue-500/30',
  aceptada:   'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  pendiente:  'bg-amber-500/10 text-amber-300 border-amber-500/30',
  en_proceso: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  finalizada: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  en_curso:   'bg-violet-500/10 text-violet-300 border-violet-500/30',
  completada: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

export function useCasoGeneralNotas(casoId: string | null) {
  const [notas, setNotas] = useState<CasoGeneralNota[]>([]);
  const [loading, setLoading] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const fetchNotas = useCallback(async () => {
    if (!casoId) { setNotas([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('caso_general_notas_completo')
      .select('*')
      .eq('caso_id', casoId)
      .order('created_at', { ascending: false });
    if (error) {
      // Tabla / vista inexistente → migración no aplicada
      if (error.code === '42P01' || /does not exist/i.test(error.message)) {
        setMigrationError('Falta correr la migración SQL en Supabase: supabase/migration_caso_general_notas_y_notificaciones.sql');
      } else {
        setMigrationError(error.message);
      }
    } else if (data) {
      setMigrationError(null);
      setNotas(data as CasoGeneralNota[]);
    }
    setLoading(false);
  }, [casoId]);

  useEffect(() => { fetchNotas(); }, [fetchNotas]);

  // realtime: nueva nota o tarea asociada cambió
  useEffect(() => {
    if (!casoId) return;
    const ch = supabase
      .channel(`caso-gen-notas-${casoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caso_general_notas', filter: `caso_id=eq.${casoId}` },
        () => fetchNotas())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tareas' },
        () => fetchNotas())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [casoId, fetchNotas]);

  async function agregarNota(contenido: string, userId: string, audioBlob?: Blob | null): Promise<boolean> {
    if (!casoId || !contenido.trim()) return false;
    let audio_path: string | null = null;
    if (audioBlob) {
      audio_path = `casos-generales/${casoId}/${Date.now()}.webm`;
      const up = await supabase.storage.from('notas-voz').upload(audio_path, audioBlob, { contentType: 'audio/webm', upsert: false });
      if (up.error) { console.error('[audio upload]', up.error); audio_path = null; }
    }
    const { error } = await supabase.from('caso_general_notas')
      .insert({ caso_id: casoId, contenido: contenido.trim(), created_by: userId, audio_path });
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
    if (!casoId) return { ok: false, error: 'casoId vacío' };
    let audio_path: string | null = null;
    if (params.audioBlob) {
      audio_path = `casos-generales/${casoId}/${Date.now()}.webm`;
      const up = await supabase.storage.from('notas-voz').upload(audio_path, params.audioBlob, { contentType: 'audio/webm', upsert: false });
      if (up.error) { console.error('[audio upload]', up.error); audio_path = null; }
    }
    // 1) crear tarea (los triggers se encargan de notificar)
    const { data: tareaIns, error: errTarea } = await supabase
      .from('tareas')
      .insert({
        titulo: params.tareaTitulo.trim() || params.contenido.slice(0, 80),
        descripcion: params.descripcion?.trim() || params.contenido.trim(),
        responsable_id: params.responsableId,
        fecha_limite: params.fechaLimite,
        prioridad: params.prioridad ?? 'sin_prioridad',
        cargo_hora: params.cargoHora?.trim() || null,
        cargo_hora_favor: params.cargoHoraFavor?.trim() || null,
        cargo_hora_favor_fecha: params.cargoHoraFavorFecha || null,
        estado: 'activa',
        caso_general_id: casoId,
        created_by: params.userId,
        updated_by: params.userId,
      })
      .select('id')
      .single();
    if (errTarea || !tareaIns) {
      console.error('[tareas insert]', errTarea);
      return { ok: false, error: errTarea?.message || 'No se pudo crear la tarea' };
    }
    // 1.b) si hay pasos, los insertamos en tarea_pasos
    const pasosValidos = (params.pasos || []).filter(p => p.descripcion.trim());
    if (pasosValidos.length > 0) {
      const rows = pasosValidos.map((p, i) => ({
        tarea_id: tareaIns.id,
        orden: i + 1,
        descripcion: p.descripcion.trim(),
        responsable_id: p.responsable_id || null,
      }));
      const { error: errPasos } = await supabase.from('tarea_pasos').insert(rows);
      if (errPasos) {
        console.error('[tarea_pasos insert]', errPasos);
        // no abortamos: la tarea ya existe; avisamos pero seguimos creando la nota
      }
    }
    // 2) crear nota apuntando a la tarea
    const { error: errNota } = await supabase.from('caso_general_notas')
      .insert({
        caso_id: casoId,
        contenido: params.contenido.trim(),
        tarea_id: tareaIns.id,
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
    const { error } = await supabase.from('caso_general_notas').delete().eq('id', id);
    if (error) { console.error(error); return false; }
    await fetchNotas();
    return true;
  }

  async function marcarTareaVista(tareaId: string): Promise<boolean> {
    const { error } = await supabase
      .from('tareas')
      .update({ visto_por_asignado: true })
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
