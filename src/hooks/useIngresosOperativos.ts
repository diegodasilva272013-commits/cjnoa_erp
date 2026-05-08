import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { IngresoOperativo } from '../types/finanzas';

export function useIngresosOperativos() {
  const { user } = useAuth();
  const [items, setItems] = useState<IngresoOperativo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ingresos_operativos')
      .select('*')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) setError(error.message);
    else { setItems((data || []) as IngresoOperativo[]); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('ingresos_operativos_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingresos_operativos' }, () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargar]);

  const crear = async (payload: Partial<IngresoOperativo>) => {
    const { error } = await supabase.from('ingresos_operativos').insert({
      ...payload,
      created_by: user?.id,
      updated_by: user?.id,
    });
    if (error) throw error;
    await cargar();
  };

  const actualizar = async (id: string, payload: Partial<IngresoOperativo>) => {
    const { error } = await supabase
      .from('ingresos_operativos')
      .update({ ...payload, updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    await cargar();
  };

  return { items, loading, error, cargar, crear, actualizar };
}
