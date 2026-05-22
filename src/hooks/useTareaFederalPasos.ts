import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import {
  notificarSiguientePasoFederal,
  notificarAsignacionPasoFederal,
} from '../lib/tareaFederalPasosNotify';

export interface TareaFederalPaso {
  id: string;
  tarea_federal_id: string;
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

export function useTareaFederalPasos(tareaFederalId: string | null | undefined) {
  const [pasos, setPasos] = useState<TareaFederalPaso[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const { user, perfil } = useAuth();

  const fetch = useCallback(async () => {
    if (!tareaFederalId) { setPasos([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('tarea_federal_pasos_completos')
      .select('*')
      .eq('tarea_federal_id', tareaFederalId)
      .order('orden', { ascending: true });
    if (error) {
      if (!/does not exist|42P01/.test(error.message)) {
        showToast('Error al cargar pasos: ' + error.message, 'error');
      }
    } else {
      setPasos((data as TareaFederalPaso[]) || []);
    }
    setLoading(false);
  }, [tareaFederalId, showToast]);

  useEffect(() => {
    fetch();
    if (!tareaFederalId) return;
    const ch = supabase
      .channel(`tarea-federal-pasos-${tareaFederalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tarea_federal_pasos', filter: `tarea_federal_id=eq.${tareaFederalId}` },
        () => fetch(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tareaFederalId, fetch]);

  const agregar = useCallback(async (descripcion: string, responsableId: string | null) => {
    if (!tareaFederalId || !descripcion.trim()) return false;
    const orden = pasos.length > 0 ? Math.max(...pasos.map(p => p.orden)) + 1 : 1;
    const { error } = await supabase.from('tarea_federal_pasos').insert({
      tarea_federal_id: tareaFederalId,
      orden,
      descripcion: descripcion.trim(),
      responsable_id: responsableId || null,
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    if (responsableId && user?.id) {
      notificarAsignacionPasoFederal(tareaFederalId, responsableId, descripcion.trim(), user.id, perfil?.nombre || 'Alguien');
    }
    fetch();
    return true;
  }, [tareaFederalId, pasos, showToast, fetch, user?.id, perfil?.nombre]);

  const actualizar = useCallback(async (id: string, patch: Partial<TareaFederalPaso>) => {
    const prev = pasos.find(p => p.id === id);
    const { error } = await supabase.from('tarea_federal_pasos').update(patch).eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    if (tareaFederalId && patch.responsable_id && patch.responsable_id !== prev?.responsable_id && user?.id) {
      const desc = patch.descripcion || prev?.descripcion || '(sin descripción)';
      notificarAsignacionPasoFederal(tareaFederalId, patch.responsable_id as string, desc, user.id, perfil?.nombre || 'Alguien');
    }
    fetch();
    return true;
  }, [pasos, tareaFederalId, showToast, fetch, user?.id, perfil?.nombre]);

  const eliminar = useCallback(async (id: string) => {
    const { error } = await supabase.from('tarea_federal_pasos').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    fetch();
    return true;
  }, [showToast, fetch]);

  const togglePaso = useCallback(async (paso: TareaFederalPaso, userId: string) => {
    const next = !paso.completado;
    const { error } = await supabase.rpc('tarea_federal_paso_set_completado', {
      p_paso_id: paso.id,
      p_hecho: next,
    });
    if (error) {
      const { error: e2 } = await supabase.from('tarea_federal_pasos').update({
        completado: next,
        completado_at: next ? new Date().toISOString() : null,
        completado_por: next ? userId : null,
      }).eq('id', paso.id);
      if (e2) { showToast('Error: ' + e2.message, 'error'); return; }
    }
    showToast(next ? 'Paso completado — se notificó al siguiente' : 'Paso reabierto', 'success');
    if (next) {
      notificarSiguientePasoFederal(
        paso.tarea_federal_id,
        paso.orden,
        paso.descripcion,
        userId,
        perfil?.nombre || 'Alguien',
      );
    }
    fetch();
  }, [showToast, fetch, perfil?.nombre]);

  const mover = useCallback(async (paso: TareaFederalPaso, direccion: 'up' | 'down') => {
    const idx = pasos.findIndex(p => p.id === paso.id);
    if (idx < 0) return;
    const targetIdx = direccion === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= pasos.length) return;
    const otro = pasos[targetIdx];
    await supabase.from('tarea_federal_pasos').update({ orden: otro.orden }).eq('id', paso.id);
    await supabase.from('tarea_federal_pasos').update({ orden: paso.orden }).eq('id', otro.id);
    fetch();
  }, [pasos, fetch]);

  return { pasos, loading, agregar, actualizar, eliminar, togglePaso, mover, refetch: fetch };
}
