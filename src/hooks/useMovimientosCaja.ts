import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { MovimientoCaja } from '../types/finanzas';

export function useMovimientosCaja() {
  const { user } = useAuth();
  const [items, setItems] = useState<MovimientoCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('movimientos_caja')
      .select('*')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) setError(error.message);
    else { setItems((data || []) as MovimientoCaja[]); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const ch = supabase
      .channel('movimientos_caja_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos_caja' }, () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargar]);

  const crear = async (payload: Partial<MovimientoCaja>) => {
    const { error } = await supabase.from('movimientos_caja').insert({
      ...payload,
      created_by: user?.id,
    });
    if (error) throw error;
    await cargar();
  };

  return { items, loading, error, cargar, crear };
}
