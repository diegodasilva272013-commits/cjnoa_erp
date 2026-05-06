import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { CasoCompleto, Cuota, FilterState } from '../types/database';

export function useCases() {
  const [casos, setCasos] = useState<CasoCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetchCasos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('casos_completos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        showToast('Error al cargar casos: ' + error.message, 'error');
      } else if (data) {
        setCasos(data as CasoCompleto[]);
      }
    } catch (err) {
      showToast('Error al cargar casos', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchCasos();

    const channel = supabase
      .channel('casos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casos' }, () => {
        fetchCasos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => {
        fetchCasos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuotas' }, () => {
        fetchCasos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCasos]);

  const removeCase = useCallback(async (id: string): Promise<boolean> => {
    // Borrar primero ingresos vinculados al caso
    await supabase.from('ingresos').delete().eq('caso_id', id);
    await supabase.from('cuotas').delete().eq('caso_id', id);
    const { error, data } = await supabase.from('casos').delete().eq('id', id).select('id');
    if (error) {
      showToast(`No se pudo borrar: ${error.message}`, 'error');
      return false;
    }
    if (!data || data.length === 0) {
      showToast('Sin permiso para borrar el caso (RLS)', 'error');
      return false;
    }
    await fetchCasos();
    return true;
  }, [fetchCasos, showToast]);

  const removeCasesBulk = useCallback(async (ids: string[]): Promise<{ ok: number; fail: number }> => {
    if (ids.length === 0) return { ok: 0, fail: 0 };
    await supabase.from('ingresos').delete().in('caso_id', ids);
    await supabase.from('cuotas').delete().in('caso_id', ids);
    const { error, data } = await supabase.from('casos').delete().in('id', ids).select('id');
    if (error) {
      showToast(`Error al borrar: ${error.message}`, 'error');
      await fetchCasos();
      return { ok: 0, fail: ids.length };
    }
    const ok = data?.length || 0;
    const fail = ids.length - ok;
    await fetchCasos();
    return { ok, fail };
  }, [fetchCasos, showToast]);

  return { casos, loading, refetch: fetchCasos, removeCase, removeCasesBulk };
}

export function useCuotas(casoId: string | null) {
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCuotas = useCallback(async () => {
    if (!casoId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('cuotas')
      .select('*')
      .eq('caso_id', casoId)
      .order('fecha', { ascending: true });

    if (!error && data) {
      setCuotas(data as Cuota[]);
    }
    setLoading(false);
  }, [casoId]);

  useEffect(() => {
    fetchCuotas();
  }, [fetchCuotas]);

  return { cuotas, loading, refetch: fetchCuotas };
}

export function filterCases(casos: CasoCompleto[], filters: FilterState): CasoCompleto[] {
  return casos.filter(caso => {
    // Búsqueda por nombre
    if (filters.busqueda) {
      const search = filters.busqueda.toLowerCase();
      if (!caso.nombre_apellido.toLowerCase().includes(search)) return false;
    }

    // Por materia
    if (filters.materias.length > 0) {
      if (!filters.materias.includes(caso.materia)) return false;
    }

    // Por estado
    if (filters.estados.length > 0) {
      if (!filters.estados.includes(caso.estado)) return false;
    }

    // Por socio
    if (filters.socios.length > 0) {
      if (!filters.socios.includes(caso.socio)) return false;
    }

    // Por interés
    if (filters.interes.length > 0 && caso.interes) {
      if (!filters.interes.includes(caso.interes)) return false;
    }

    // Solo deudores
    if (filters.soloDeudores) {
      if (caso.saldo_pendiente <= 0) return false;
    }

    // Solo cuotas vencidas
    if (filters.soloCuotasVencidas) {
      // This would require checking cuotas dates, simplified here
      if (caso.saldo_pendiente <= 0) return false;
    }

    // Rango de fechas
    if (filters.fechaDesde && caso.fecha) {
      if (caso.fecha < filters.fechaDesde) return false;
    }
    if (filters.fechaHasta && caso.fecha) {
      if (caso.fecha > filters.fechaHasta) return false;
    }

    return true;
  });
}

export const emptyFilters: FilterState = {
  busqueda: '',
  materias: [],
  estados: [],
  socios: [],
  interes: [],
  soloDeudores: false,
  soloCuotasVencidas: false,
  fechaDesde: '',
  fechaHasta: '',
};
