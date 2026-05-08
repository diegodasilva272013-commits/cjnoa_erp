import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';

export interface TareaPaso {
  id: string;
  tarea_id: string;
  orden: number;
  descripcion: string;
  responsable_id: string | null;
  completado: boolean;
  completado_at: string | null;
  completado_por: string | null;
  created_at: string;
  updated_at: string;
  // joined
  responsable_nombre?: string | null;
  responsable_avatar?: string | null;
  completado_por_nombre?: string | null;
}

export function useTareaPasos(tareaId: string | null | undefined) {
  const [pasos, setPasos] = useState<TareaPaso[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    if (!tareaId) { setPasos([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('tarea_pasos_completos')
      .select('*')
      .eq('tarea_id', tareaId)
      .order('orden', { ascending: true });
    if (error) {
      if (!/does not exist|42P01/.test(error.message)) {
        showToast('Error al cargar pasos: ' + error.message, 'error');
      }
    } else {
      setPasos((data as TareaPaso[]) || []);
    }
    setLoading(false);
  }, [tareaId, showToast]);

  useEffect(() => {
    fetch();
    if (!tareaId) return;
    const ch = supabase
      .channel(`tarea-pasos-${tareaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarea_pasos', filter: `tarea_id=eq.${tareaId}` }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tareaId, fetch]);

  const agregar = useCallback(async (descripcion: string, responsableId: string | null) => {
    if (!tareaId || !descripcion.trim()) return false;
    const orden = pasos.length > 0 ? Math.max(...pasos.map(p => p.orden)) + 1 : 1;
    const { error } = await supabase.from('tarea_pasos').insert({
      tarea_id: tareaId,
      orden,
      descripcion: descripcion.trim(),
      responsable_id: responsableId || null,
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    fetch();
    return true;
  }, [tareaId, pasos, showToast, fetch]);

  const actualizar = useCallback(async (id: string, patch: Partial<TareaPaso>) => {
    const { error } = await supabase.from('tarea_pasos').update(patch).eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    fetch();
    return true;
  }, [showToast, fetch]);

  const eliminar = useCallback(async (id: string) => {
    const { error } = await supabase.from('tarea_pasos').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    fetch();
    return true;
  }, [showToast, fetch]);

  const togglePaso = useCallback(async (paso: TareaPaso, userId: string) => {
    const next = !paso.completado;
    const { error } = await supabase.from('tarea_pasos').update({
      completado: next,
      completado_at: next ? new Date().toISOString() : null,
      completado_por: next ? userId : null,
    }).eq('id', paso.id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast(next ? 'Paso completado — se notificó al siguiente' : 'Paso reabierto', 'success');
    fetch();
  }, [showToast, fetch]);

  const mover = useCallback(async (paso: TareaPaso, direccion: 'up' | 'down') => {
    const idx = pasos.findIndex(p => p.id === paso.id);
    if (idx < 0) return;
    const targetIdx = direccion === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= pasos.length) return;
    const otro = pasos[targetIdx];
    // swap orden
    await supabase.from('tarea_pasos').update({ orden: otro.orden }).eq('id', paso.id);
    await supabase.from('tarea_pasos').update({ orden: paso.orden }).eq('id', otro.id);
    fetch();
  }, [pasos, fetch]);

  return { pasos, loading, agregar, actualizar, eliminar, togglePaso, mover, refetch: fetch };
}

// ============================================
// Listar TODAS las tareas que tienen pasos (para vista "Compartidas")
// ============================================
export function useTareasConPasos() {
  const [data, setData] = useState<{ tarea_id: string; pasos: TareaPaso[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('tarea_pasos_completos')
      .select('*')
      .order('tarea_id', { ascending: true })
      .order('orden', { ascending: true });
    if (error) {
      if (!/does not exist|42P01/.test(error.message)) {
        showToast('Error al cargar pasos: ' + error.message, 'error');
      }
      setData([]);
    } else {
      const map = new Map<string, TareaPaso[]>();
      (rows as TareaPaso[]).forEach(p => {
        if (!map.has(p.tarea_id)) map.set(p.tarea_id, []);
        map.get(p.tarea_id)!.push(p);
      });
      setData(Array.from(map.entries()).map(([tarea_id, pasos]) => ({ tarea_id, pasos })));
    }
    setLoading(false);
  }, [showToast]);

  useEffect(() => {
    fetch();
    const ch = supabase
      .channel('tarea-pasos-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarea_pasos' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  return { data, loading, refetch: fetch };
}
