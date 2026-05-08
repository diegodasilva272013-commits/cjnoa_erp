import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface CasoFederal {
  id: string;
  titulo: string;
  expediente: string | null;
  estado: string | null;
  tipo_caso: string | null;
  abogado: string | null;
  personeria: string | null;
  telefono: string | null;
  radicado: string | null;
  url_drive: string | null;
  actualizacion: string | null;
  audiencias: string | null;
  vencimiento: string | null;
  prioridad: boolean;
  archivado: boolean;
  estadisticas_estado: string | null;
  escrito_subido?: boolean;
  escrito_url?: string | null;
  escrito_subido_at?: string | null;
  escrito_subido_por?: string | null;
  escrito_ultima_verificacion?: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export const ESTADOS_CASO_FEDERAL = [
  'activos',
  'esperando audiencia',
  'esperando sentencias',
  'complicacion judicial/analisis',
  'suspendido por falta de directivas',
  'suspendido por falta de pago',
  'seguimiento',
  'archivo',
] as const;

export const TIPOS_CASO_FEDERAL = [
  'sucesorio', 'laboral', 'civil', 'ejecutivo', 'familia',
  'reales', 'previsional', 'prescripciones', 'otro',
] as const;

export const ABOGADOS_FEDERAL = [
  'DR. RODRIGO', 'DRA. NOELIA', 'DR. ALEJANDRO',
  'DRA. MARIANELA', 'DR. FABRICIO',
] as const;

export function useCasosFederales() {
  const [casos, setCasos] = useState<CasoFederal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCasos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('casos_federales')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) setCasos(data as CasoFederal[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCasos();
    const ch = supabase
      .channel(`casos-federales-rt-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casos_federales' }, fetchCasos)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCaso = useCallback(async (
    data: Partial<Omit<CasoFederal, 'id' | 'created_at' | 'updated_at'>>,
    id?: string
  ): Promise<{ ok: boolean; id?: string; error?: string }> => {
    const { data: user } = await supabase.auth.getUser();
    const userId = user?.user?.id;
    if (id) {
      const { error } = await supabase
        .from('casos_federales')
        .update({ ...data, updated_by: userId })
        .eq('id', id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, id };
    } else {
      const { data: row, error } = await supabase
        .from('casos_federales')
        .insert({ ...data, created_by: userId })
        .select('id')
        .single();
      if (error || !row) return { ok: false, error: error?.message };
      return { ok: true, id: row.id };
    }
  }, []);

  const deleteCaso = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('casos_federales').delete().eq('id', id);
    return !error;
  }, []);

  const deleteMany = useCallback(async (ids: string[]): Promise<{ ok: number; fail: number }> => {
    const { data, error } = await supabase
      .from('casos_federales').delete().in('id', ids).select('id');
    if (error) return { ok: 0, fail: ids.length };
    return { ok: data?.length || 0, fail: ids.length - (data?.length || 0) };
  }, []);

  return { casos, loading, refetch: fetchCasos, saveCaso, deleteCaso, deleteMany };
}
