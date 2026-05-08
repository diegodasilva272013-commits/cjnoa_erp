import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface CierreMes {
  id: string;
  periodo: string;
  fecha_cierre: string;
  snapshot: any;
  observaciones: string | null;
  created_by: string | null;
}

export function useCierresMes() {
  const { user } = useAuth();
  const [items, setItems] = useState<CierreMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cierres_mes_finanzas')
      .select('*')
      .order('periodo', { ascending: false });
    if (error) setError(error.message);
    else { setItems((data || []) as CierreMes[]); setError(null); }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const cerrarMes = async (periodo: string, snapshot: any, observaciones?: string) => {
    const { error } = await supabase
      .from('cierres_mes_finanzas')
      .upsert({
        periodo,
        snapshot,
        observaciones: observaciones || null,
        created_by: user?.id,
        fecha_cierre: new Date().toISOString(),
      }, { onConflict: 'periodo' });
    if (error) throw error;
    await cargar();
  };

  const eliminar = async (id: string) => {
    const { error } = await supabase.from('cierres_mes_finanzas').delete().eq('id', id);
    if (error) throw error;
    await cargar();
  };

  return { items, loading, error, cargar, cerrarMes, eliminar };
}
