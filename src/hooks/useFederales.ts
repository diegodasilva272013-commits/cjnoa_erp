import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { ClienteFederal, NotaFederal, TareaFederal } from '../types/federales';

// ── Hook: Clientes Federales ──
export function useClientesFederales() {
  const [clientes, setClientes] = useState<ClienteFederal[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('clientes_federales')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) showToast('Error al cargar casos federales: ' + error.message, 'error');
      else setClientes((data || []) as ClienteFederal[]);
    } catch { showToast('Error de conexión', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    fetch();
    const ch = supabase.channel('fed-clientes-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes_federales' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const upsert = async (data: Partial<ClienteFederal>, id?: string) => {
    if (id) {
      const { error } = await supabase.from('clientes_federales').update(data).eq('id', id);
      if (error) { showToast('Error al actualizar: ' + error.message, 'error'); return false; }
      showToast('Caso federal actualizado', 'success');
    } else {
      const { error } = await supabase.from('clientes_federales').insert(data);
      if (error) { showToast('Error al crear: ' + error.message, 'error'); return false; }
      showToast('Caso federal creado', 'success');
    }
    await fetch();
    return true;
  };

  const updatePipeline = async (id: string, pipeline: ClienteFederal['pipeline']) => {
    const { error } = await supabase.from('clientes_federales').update({ pipeline }).eq('id', id);
    if (error) { showToast('Error al mover: ' + error.message, 'error'); return false; }
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('clientes_federales').delete().eq('id', id);
    if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return false; }
    showToast('Caso federal eliminado', 'success');
    await fetch();
    return true;
  };

  return { clientes, loading, refetch: fetch, upsert, updatePipeline, remove };
}

// ── Hook: Notas (seguimiento) ──
export function useNotasFederales(clienteId: string | null) {
  const [notas, setNotas] = useState<NotaFederal[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    if (!clienteId) { setNotas([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes_federales_notas')
      .select('*')
      .eq('cliente_fed_id', clienteId)
      .order('created_at', { ascending: false });
    if (!error) setNotas((data || []) as NotaFederal[]);
    setLoading(false);
  }, [clienteId]);

  useEffect(() => {
    fetch();
    if (!clienteId) return;
    const ch = supabase.channel(`fed-notas-${clienteId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'clientes_federales_notas', filter: `cliente_fed_id=eq.${clienteId}` },
        () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch, clienteId]);

  const add = async (contenido: string, userId: string | null) => {
    if (!clienteId || !contenido.trim()) return false;
    const { error } = await supabase.from('clientes_federales_notas').insert({
      cliente_fed_id: clienteId,
      contenido: contenido.trim(),
      created_by: userId,
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('clientes_federales_notas').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    await fetch();
    return true;
  };

  return { notas, loading, refetch: fetch, add, remove };
}

// ── Hook: Tareas Federales (por cliente) ──
export function useTareasFederales(clienteId: string | null) {
  const [tareas, setTareas] = useState<TareaFederal[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    if (!clienteId) { setTareas([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('tareas_federales')
      .select('*')
      .eq('cliente_fed_id', clienteId)
      .order('created_at', { ascending: false });
    if (!error) setTareas((data || []) as TareaFederal[]);
    setLoading(false);
  }, [clienteId]);

  useEffect(() => {
    fetch();
    if (!clienteId) return;
    const ch = supabase.channel(`fed-tareas-${clienteId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tareas_federales', filter: `cliente_fed_id=eq.${clienteId}` },
        () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch, clienteId]);

  const upsert = async (data: Partial<TareaFederal>, id?: string) => {
    if (id) {
      const { error } = await supabase.from('tareas_federales').update(data).eq('id', id);
      if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    } else {
      const { error } = await supabase.from('tareas_federales').insert({ ...data, cliente_fed_id: clienteId });
      if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    }
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('tareas_federales').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    await fetch();
    return true;
  };

  const toggleEstado = async (t: TareaFederal) => {
    const next = t.estado === 'completada' ? 'pendiente' : 'completada';
    return upsert({
      estado: next,
      fecha_completada: next === 'completada' ? new Date().toISOString() : null,
    }, t.id);
  };

  return { tareas, loading, refetch: fetch, upsert, remove, toggleEstado };
}
