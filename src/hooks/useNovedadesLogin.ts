import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface NovedadesLogin {
  audienciasHoy: Array<{ id: string; hora: string | null; juzgado: string | null; tipo: string | null; cliente_nombre: string | null }>;
  tareasVencidas: number;
  tareasHoy: number;
  tareasPendientesTotal: number;
  tareasSinAvanzar: number; // >2 dias sin update
  loading: boolean;
}

/**
 * Panel de novedades para el Dashboard (login). Consulta:
 * - Audiencias de hoy (tabla audiencias_previsional)
 * - Tareas vencidas (fecha_limite < hoy, estado != completada)
 * - Tareas con vencimiento hoy
 * - Tareas pendientes totales
 * - Tareas sin avanzar hace mas de 2 dias (updated_at)
 *
 * Spec: "Al iniciar sesion debe mostrar audiencias del dia, tareas pendientes, tareas
 * vencidas y cargos de hora por vencer".
 */
export function useNovedadesLogin(): NovedadesLogin {
  const [state, setState] = useState<NovedadesLogin>({
    audienciasHoy: [],
    tareasVencidas: 0,
    tareasHoy: 0,
    tareasPendientesTotal: 0,
    tareasSinAvanzar: 0,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      const hoy = new Date().toISOString().split('T')[0];
      const hace2 = new Date(Date.now() - 2 * 86400000).toISOString();

      const [audRes, tareasRes] = await Promise.all([
        supabase
          .from('audiencias_previsional')
          .select('id,hora,juzgado,tipo,cliente_prev_id')
          .eq('fecha', hoy)
          .order('hora', { ascending: true }),
        supabase
          .from('tareas_previsional')
          .select('id,estado,fecha_limite,updated_at')
          .neq('estado', 'completada'),
      ]);

      if (!alive) return;

      // Resolve cliente names in a second query (simpler than FK-embed)
      const clienteIds = Array.from(new Set((audRes.data || []).map((a: any) => a.cliente_prev_id).filter(Boolean)));
      const namesMap = new Map<string, string>();
      if (clienteIds.length > 0) {
        const { data: clientesData } = await supabase
          .from('clientes_previsional')
          .select('id,apellido_nombre')
          .in('id', clienteIds);
        (clientesData || []).forEach((c: any) => namesMap.set(c.id, c.apellido_nombre));
      }

      const audiencias = (audRes.data || []).map((a: any) => ({
        id: a.id,
        hora: a.hora,
        juzgado: a.juzgado,
        tipo: a.tipo,
        cliente_nombre: a.cliente_prev_id ? namesMap.get(a.cliente_prev_id) || null : null,
      }));

      const tareas = tareasRes.data || [];
      const vencidas = tareas.filter(t => t.fecha_limite && t.fecha_limite < hoy).length;
      const today = tareas.filter(t => t.fecha_limite === hoy).length;
      const sinAvanzar = tareas.filter(t => t.updated_at && t.updated_at < hace2).length;

      setState({
        audienciasHoy: audiencias,
        tareasVencidas: vencidas,
        tareasHoy: today,
        tareasPendientesTotal: tareas.length,
        tareasSinAvanzar: sinAvanzar,
        loading: false,
      });
    }
    load();
    return () => { alive = false; };
  }, []);

  return state;
}
