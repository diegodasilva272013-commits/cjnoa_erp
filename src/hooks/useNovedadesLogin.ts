import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface NovedadAudiencia {
  id: string;
  fecha: string;
  juzgado: string | null;
  tipo: string | null;
  cliente_nombre: string | null;
  origen: 'previsional' | 'general';
}

export interface NovedadTarea {
  id: string;
  titulo: string;
  prioridad: 'alta' | 'media' | 'sin_prioridad';
  fecha_limite: string | null;
  cliente_nombre: string | null;
  responsable_nombre: string | null;
  cargo_hora: string | null;
  origen: 'previsional' | 'general';
}

export interface NovedadesLogin {
  audienciasHoy: NovedadAudiencia[];
  proximasAudiencias: NovedadAudiencia[];
  tareasVencidas: NovedadTarea[];
  tareasHoy: NovedadTarea[];
  tareasPendientes: NovedadTarea[];
  cargosHoraSemana: NovedadTarea[];
  tareasSinAvanzar: number;
  loading: boolean;
}

/**
 * Panel de novedades para el Dashboard al iniciar sesion (spec seccion 7.1).
 * Combina previsional + nuevos modulos generales (tareas, audiencias_general).
 */
export function useNovedadesLogin(): NovedadesLogin {
  const [state, setState] = useState<NovedadesLogin>({
    audienciasHoy: [],
    proximasAudiencias: [],
    tareasVencidas: [],
    tareasHoy: [],
    tareasPendientes: [],
    cargosHoraSemana: [],
    tareasSinAvanzar: 0,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    async function load() {
      const hoyDate = new Date();
      const hoy = hoyDate.toISOString().split('T')[0];
      const en7 = new Date(Date.now() + 7 * 86400000).toISOString();
      const hace2 = new Date(Date.now() - 2 * 86400000).toISOString();

      const [audPrevRes, audGenRes, tareasPrevRes, tareasGenRes] = await Promise.all([
        supabase.from('audiencias_previsional')
          .select('id,fecha,hora,juzgado,tipo,cliente_prev_id')
          .gte('fecha', hoy)
          .order('fecha', { ascending: true }),
        supabase.from('audiencias_general_completas')
          .select('id,fecha,juzgado,tipo,cliente_nombre,realizada')
          .gte('fecha', hoyDate.toISOString())
          .lte('fecha', en7)
          .eq('realizada', false)
          .order('fecha', { ascending: true }),
        supabase.from('tareas_previsional')
          .select('id,titulo,estado,prioridad,fecha_limite,updated_at,cliente_nombre,responsable_nombre')
          .neq('estado', 'completada'),
        supabase.from('tareas_completas')
          .select('id,titulo,estado,prioridad,fecha_limite,updated_at,cliente_nombre,responsable_nombre,cargo_hora,archivada')
          .neq('estado', 'completada')
          .eq('archivada', false),
      ]);

      if (!alive) return;

      const clientePrevIds = Array.from(new Set((audPrevRes.data || []).map((a: any) => a.cliente_prev_id).filter(Boolean)));
      const namesMap = new Map<string, string>();
      if (clientePrevIds.length > 0) {
        const { data } = await supabase.from('clientes_previsional')
          .select('id,apellido_nombre')
          .in('id', clientePrevIds);
        (data || []).forEach((c: any) => namesMap.set(c.id, c.apellido_nombre));
      }

      const audienciasPrev: NovedadAudiencia[] = (audPrevRes.data || []).map((a: any) => ({
        id: a.id,
        fecha: `${a.fecha}T${a.hora || '00:00'}`,
        juzgado: a.juzgado,
        tipo: a.tipo,
        cliente_nombre: a.cliente_prev_id ? namesMap.get(a.cliente_prev_id) || null : null,
        origen: 'previsional' as const,
      }));
      const audienciasGen: NovedadAudiencia[] = (audGenRes.data || []).map((a: any) => ({
        id: a.id,
        fecha: a.fecha,
        juzgado: a.juzgado,
        tipo: a.tipo,
        cliente_nombre: a.cliente_nombre,
        origen: 'general' as const,
      }));

      const todas = [...audienciasPrev, ...audienciasGen].sort((a, b) => a.fecha.localeCompare(b.fecha));
      const hoyEnd = hoy + 'T23:59:59';
      const audienciasHoy = todas.filter(a => a.fecha >= hoy && a.fecha <= hoyEnd);
      const proximasAudiencias = todas.filter(a => a.fecha > hoyEnd);

      const tareasPrev: NovedadTarea[] = (tareasPrevRes.data || []).map((t: any) => ({
        id: t.id, titulo: t.titulo, prioridad: t.prioridad, fecha_limite: t.fecha_limite,
        cliente_nombre: t.cliente_nombre, responsable_nombre: t.responsable_nombre, cargo_hora: null,
        origen: 'previsional' as const,
      }));
      const tareasGen: NovedadTarea[] = (tareasGenRes.data || []).map((t: any) => ({
        id: t.id, titulo: t.titulo, prioridad: t.prioridad, fecha_limite: t.fecha_limite,
        cliente_nombre: t.cliente_nombre, responsable_nombre: t.responsable_nombre, cargo_hora: t.cargo_hora,
        origen: 'general' as const,
      }));
      const tareas = [...tareasPrev, ...tareasGen];

      const prioridadOrder: Record<string, number> = { alta: 0, media: 1, sin_prioridad: 2 };
      const ordered = [...tareas].sort((a, b) => (prioridadOrder[a.prioridad] ?? 9) - (prioridadOrder[b.prioridad] ?? 9));

      const vencidas = ordered.filter(t => t.fecha_limite && t.fecha_limite < hoy);
      const hoyTar = ordered.filter(t => t.fecha_limite === hoy);
      const cargos = tareasGen.filter(t => t.cargo_hora);

      const rawGen = tareasGenRes.data || [];
      const rawPrev = tareasPrevRes.data || [];
      const sinAvanzar = [...rawGen, ...rawPrev].filter((t: any) => t.updated_at && t.updated_at < hace2).length;

      setState({
        audienciasHoy,
        proximasAudiencias,
        tareasVencidas: vencidas,
        tareasHoy: hoyTar,
        tareasPendientes: ordered.slice(0, 10),
        cargosHoraSemana: cargos,
        tareasSinAvanzar: sinAvanzar,
        loading: false,
      });
    }
    load().catch(() => { if (alive) setState(s => ({ ...s, loading: false })); });
    return () => { alive = false; };
  }, []);

  return state;
}
