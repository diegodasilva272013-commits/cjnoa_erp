import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { CargoHora, CargoHoraCompleto } from '../types/database';

export function useCargosHora(filtros?: { casoId?: string | null; soloPendientes?: boolean }) {
  const [cargos, setCargos] = useState<CargoHoraCompleto[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('cargos_hora_completo')
      .select('*')
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false });
    if (filtros?.casoId) q = q.eq('caso_id', filtros.casoId);
    if (filtros?.soloPendientes) q = q.eq('realizado', false);
    const { data, error } = await q;
    if (error) showToast('Error al cargar cargos: ' + error.message, 'error');
    else if (data) setCargos(data as CargoHoraCompleto[]);
    setLoading(false);
  }, [filtros?.casoId, filtros?.soloPendientes, showToast]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const ch = supabase
      .channel('cargos_hora_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cargos_hora' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const upsert = useCallback(async (data: Partial<CargoHora> & { titulo: string; fecha: string; tipo: CargoHora['tipo'] }) => {
    const payload: Record<string, unknown> = { ...data };
    const { id, ...rest } = payload as { id?: string } & Record<string, unknown>;
    if (id) {
      const { error } = await supabase.from('cargos_hora').update(rest).eq('id', id);
      if (error) { showToast('Error: ' + error.message, 'error'); return false; }
      showToast('Cargo actualizado', 'success');
    } else {
      const { error } = await supabase.from('cargos_hora').insert(rest);
      if (error) { showToast('Error: ' + error.message, 'error'); return false; }
      showToast('Cargo agregado', 'success');
    }
    fetch();
    return true;
  }, [showToast, fetch]);

  const toggleRealizado = useCallback(async (id: string, realizado: boolean) => {
    const { error } = await supabase.from('cargos_hora').update({ realizado }).eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    fetch();
  }, [showToast, fetch]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('cargos_hora').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('Cargo eliminado', 'success');
    fetch();
  }, [showToast, fetch]);

  return { cargos, loading, upsert, toggleRealizado, remove, refetch: fetch };
}
