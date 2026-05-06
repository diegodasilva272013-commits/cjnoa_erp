import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import {
  TareaCompleta,
  Tarea,
  AudienciaGeneralCompleta,
  AudienciaGeneral,
  HistorialCasoCompleto,
  HonorarioCompleto,
  Honorario,
} from '../types/database';

// ============================================
// TAREAS
// ============================================
export function useTareas() {
  const [tareas, setTareas] = useState<TareaCompleta[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    // Intenta primero la vista v2 (incluye caso_general + avatares); si no existe, cae a la legacy
    let { data, error } = await supabase
      .from('tareas_completas_v2')
      .select('*')
      .eq('archivada', false)
      .order('created_at', { ascending: false });
    if (error && (error.code === '42P01' || /does not exist/i.test(error.message))) {
      const r = await supabase.from('tareas_completas').select('*').eq('archivada', false).order('created_at', { ascending: false });
      data = r.data; error = r.error;
    }
    if (error) {
      showToast('Error al cargar tareas: ' + error.message, 'error');
    } else if (data) {
      setTareas(data as TareaCompleta[]);
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    fetch();
    const ch = supabase
      .channel('tareas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const upsert = useCallback(async (t: Partial<Tarea>, userId: string) => {
    const payload: any = { ...t, updated_by: userId, updated_at: new Date().toISOString() };
    if (!t.id) payload.created_by = userId;
    const { error } = await supabase.from('tareas').upsert(payload).select().single();
    if (error) { showToast('Error al guardar tarea: ' + error.message, 'error'); return false; }
    showToast(t.id ? 'Tarea actualizada' : 'Tarea creada', 'success');
    fetch();
    return true;
  }, [showToast, fetch]);

  const completar = useCallback(async (id: string, userId: string) => {
    const { error } = await supabase.from('tareas')
      .update({ estado: 'completada', fecha_completada: new Date().toISOString(), updated_by: userId })
      .eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Tarea completada', 'success');
    fetch();
  }, [showToast, fetch]);

  const reabrir = useCallback(async (id: string, userId: string) => {
    const { error } = await supabase.from('tareas')
      .update({ estado: 'en_curso', fecha_completada: null, updated_by: userId })
      .eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    fetch();
  }, [showToast, fetch]);

  const archivar = useCallback(async (id: string, userId: string) => {
    const { error } = await supabase.from('tareas')
      .update({ archivada: true, updated_by: userId })
      .eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Tarea archivada (queda en historial)', 'success');
    fetch();
  }, [showToast, fetch]);

  return { tareas, loading, upsert, completar, reabrir, archivar, refetch: fetch };
}

export async function uploadTareaAdjunto(file: File, tareaId: string): Promise<{ path: string; nombre: string } | null> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${tareaId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('tareas-adjuntos').upload(path, file, { upsert: true });
  if (error) return null;
  return { path, nombre: file.name };
}

export async function getTareaAdjuntoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('tareas-adjuntos').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// ============================================
// AUDIENCIAS GENERAL
// ============================================
export function useAudienciasGeneral() {
  const [audiencias, setAudiencias] = useState<AudienciaGeneralCompleta[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('audiencias_general_completas')
      .select('*')
      .order('fecha', { ascending: true });
    if (error) {
      showToast('Error al cargar audiencias: ' + error.message, 'error');
    } else if (data) {
      setAudiencias(data as AudienciaGeneralCompleta[]);
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    fetch();
    const ch = supabase
      .channel('audiencias-general-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audiencias_general' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const upsert = useCallback(async (a: Partial<AudienciaGeneral>, userId: string) => {
    const payload: any = { ...a };
    if (!a.id) payload.created_by = userId;
    const { error } = await supabase.from('audiencias_general').upsert(payload).select().single();
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    showToast(a.id ? 'Audiencia actualizada' : 'Audiencia creada', 'success');
    fetch();
    return true;
  }, [showToast, fetch]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('audiencias_general').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Audiencia eliminada', 'success');
    fetch();
  }, [showToast, fetch]);

  return { audiencias, loading, upsert, remove, refetch: fetch };
}

// ============================================
// HISTORIAL DE CASO (inmutable)
// ============================================
export function useHistorialCaso(casoId: string | null) {
  const [historial, setHistorial] = useState<HistorialCasoCompleto[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    if (!casoId) { setHistorial([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('historial_caso_completo')
      .select('*')
      .eq('caso_id', casoId)
      .order('created_at', { ascending: false });
    if (error) {
      showToast('Error al cargar historial: ' + error.message, 'error');
    } else if (data) {
      setHistorial(data as HistorialCasoCompleto[]);
    }
    setLoading(false);
  }, [casoId, showToast]);

  useEffect(() => { fetch(); }, [fetch]);

  const agregar = useCallback(async (
    titulo: string,
    descripcion: string,
    tareaSiguiente: string,
    userId: string
  ) => {
    if (!casoId) return false;
    const { error } = await supabase.from('historial_caso').insert({
      caso_id: casoId,
      titulo,
      descripcion: descripcion || null,
      tarea_siguiente: tareaSiguiente || null,
      created_by: userId,
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    showToast('Avance registrado en historial', 'success');
    fetch();
    return true;
  }, [casoId, showToast, fetch]);

  return { historial, loading, agregar, refetch: fetch };
}

// ============================================
// HONORARIOS
// ============================================
export function useHonorarios() {
  const [honorarios, setHonorarios] = useState<HonorarioCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    const { data, error } = await supabase
      .from('honorarios_completos')
      .select('*')
      .order('fecha', { ascending: false });
    if (error) {
      // Procurador no puede leer (RLS) - silencioso
      if (!/row.level security|permission denied/i.test(error.message)) {
        showToast('Error al cargar honorarios: ' + error.message, 'error');
      }
    } else if (data) {
      setHonorarios(data as HonorarioCompleto[]);
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    fetch();
    const ch = supabase
      .channel('honorarios-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'honorarios' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const upsert = useCallback(async (h: Partial<Honorario>, userId: string) => {
    const payload: any = { ...h };
    if (!h.id) payload.created_by = userId;
    const { error } = await supabase.from('honorarios').upsert(payload).select().single();
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    showToast(h.id ? 'Honorario actualizado' : 'Honorario creado', 'success');
    fetch();
    return true;
  }, [showToast, fetch]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('honorarios').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Honorario eliminado', 'success');
    fetch();
  }, [showToast, fetch]);

  return { honorarios, loading, upsert, remove, refetch: fetch };
}

// ============================================
// COMENTARIOS DE CASO (thread libre, editable por el autor)
// ============================================
export interface ComentarioCasoCompleto {
  id: string;
  caso_id: string;
  contenido: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  editado: boolean;
  autor_nombre: string | null;
  autor_avatar: string | null;
}

export function useComentariosCaso(casoId: string | null) {
  const [comentarios, setComentarios] = useState<ComentarioCasoCompleto[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    if (!casoId) { setComentarios([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('comentarios_caso_completo')
      .select('*')
      .eq('caso_id', casoId)
      .order('created_at', { ascending: true });
    if (error) {
      showToast('Error al cargar comentarios: ' + error.message, 'error');
    } else if (data) {
      setComentarios(data as ComentarioCasoCompleto[]);
    }
    setLoading(false);
  }, [casoId, showToast]);

  useEffect(() => { fetch(); }, [fetch]);

  const agregar = useCallback(async (contenido: string, userId: string) => {
    if (!casoId || !contenido.trim()) return false;
    const { error } = await supabase.from('comentarios_caso').insert({
      caso_id: casoId,
      contenido: contenido.trim(),
      created_by: userId,
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    fetch();
    return true;
  }, [casoId, showToast, fetch]);

  const editar = useCallback(async (id: string, contenido: string) => {
    const { error } = await supabase.from('comentarios_caso')
      .update({ contenido: contenido.trim() })
      .eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    fetch();
    return true;
  }, [showToast, fetch]);

  const eliminar = useCallback(async (id: string) => {
    const { error } = await supabase.from('comentarios_caso').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    fetch();
    return true;
  }, [showToast, fetch]);

  return { comentarios, loading, agregar, editar, eliminar, refetch: fetch };
}


