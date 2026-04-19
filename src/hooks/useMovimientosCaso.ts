import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { MovimientoCaso } from '../types/database';

export function useMovimientosCaso(casoId: string | null) {
  const [movimientos, setMovimientos] = useState<MovimientoCaso[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetchMovimientos = useCallback(async () => {
    if (!casoId) {
      setMovimientos([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('movimientos_caso')
        .select('*')
        .eq('caso_id', casoId)
        .order('fecha', { ascending: false });

      if (error) {
        showToast('Error al cargar movimientos: ' + error.message, 'error');
      } else {
        setMovimientos((data || []) as MovimientoCaso[]);
      }
    } catch (err) {
      showToast('Error al cargar movimientos', 'error');
    } finally {
      setLoading(false);
    }
  }, [casoId, showToast]);

  useEffect(() => {
    fetchMovimientos();
  }, [fetchMovimientos]);

  return { movimientos, loading, refetch: fetchMovimientos };
}

export async function addMovimiento(
  casoId: string,
  tipo: 'deposito' | 'gasto',
  monto: number,
  moneda: 'ARS' | 'USD',
  concepto: string,
  fecha: string,
  observaciones: string | null,
  createdBy: string | undefined
) {
  const { error } = await supabase.from('movimientos_caso').insert({
    caso_id: casoId,
    tipo,
    monto,
    moneda,
    concepto,
    fecha,
    observaciones: observaciones || null,
    created_by: createdBy || null,
  });
  if (error) throw error;
}

export async function deleteMovimiento(id: string) {
  const { error } = await supabase.from('movimientos_caso').delete().eq('id', id);
  if (error) throw error;
}
