import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface CasoGeneral {
  id: string;
  titulo: string;
  expediente: string | null;
  estado: string | null;
  tipo_caso: string | null;
  abogado: string | null;
  personeria: string | null;
  radicado: string | null;
  url_drive: string | null;
  actualizacion: string | null;
  audiencias: string | null;
  vencimiento: string | null;
  prioridad: boolean;
  archivado: boolean;
  estadisticas_estado: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export const ESTADOS_CASO_GENERAL = [
  'activos',
  'federales',
  'esperando audiencia',
  'esperando sentencias',
  'complicacion judicial/analisis',
  'suspendido por falta de directivas',
  'suspendido por falta de pago',
] as const;

export const TIPOS_CASO = [
  'sucesorio', 'laboral', 'civil', 'ejecutivo', 'familia',
  'reales', 'previsional', 'prescripciones', 'otro',
] as const;

export const ABOGADOS = [
  'DR. RODRIGO', 'DRA. NOELIA', 'DR. ALEJANDRO',
  'DRA. MARIANELA', 'DR. FABRICIO',
] as const;

export function useCasosGenerales() {
  const [casos, setCasos] = useState<CasoGeneral[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCasos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('casos_generales')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) setCasos(data as CasoGeneral[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCasos();
    // Unique name prevents "cannot add callbacks after subscribe()" on StrictMode double-mount
    const ch = supabase
      .channel(`casos-generales-rt-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casos_generales' }, fetchCasos)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCaso = useCallback(async (
    data: Partial<Omit<CasoGeneral, 'id' | 'created_at' | 'updated_at'>>,
    id?: string
  ): Promise<{ ok: boolean; id?: string; error?: string }> => {
    const { data: user } = await supabase.auth.getUser();
    const userId = user?.user?.id;
    if (id) {
      const { error } = await supabase
        .from('casos_generales')
        .update({ ...data, updated_by: userId })
        .eq('id', id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, id };
    } else {
      const { data: row, error } = await supabase
        .from('casos_generales')
        .insert({ ...data, created_by: userId })
        .select('id')
        .single();
      if (error || !row) return { ok: false, error: error?.message };
      return { ok: true, id: row.id };
    }
  }, []);

  const deleteCaso = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('casos_generales').delete().eq('id', id);
    return !error;
  }, []);

  const deleteMany = useCallback(async (ids: string[]): Promise<{ ok: number; fail: number }> => {
    const { data, error } = await supabase
      .from('casos_generales').delete().in('id', ids).select('id');
    if (error) return { ok: 0, fail: ids.length };
    return { ok: data?.length || 0, fail: ids.length - (data?.length || 0) };
  }, []);

  return { casos, loading, refetch: fetchCasos, saveCaso, deleteCaso, deleteMany };
}
