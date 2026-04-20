import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import {
  ClientePrevisional,
  AporteLaboral,
  HistorialAvance,
  TareaPrevisional,
  Audiencia,
} from '../types/previsional';

// ── Hook: Clientes Previsionales ──
export function useClientesPrevisional() {
  const [clientes, setClientes] = useState<ClientePrevisional[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('clientes_previsional')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) showToast('Error al cargar clientes previsionales: ' + error.message, 'error');
      else setClientes((data || []) as ClientePrevisional[]);
    } catch { showToast('Error de conexión', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    fetch();
    const ch = supabase.channel('prev-clientes-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes_previsional' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const upsert = async (data: Partial<ClientePrevisional>, id?: string) => {
    if (id) {
      const { error } = await supabase.from('clientes_previsional').update(data).eq('id', id);
      if (error) { showToast('Error al actualizar: ' + error.message, 'error'); return false; }
      showToast('Cliente actualizado', 'success');
    } else {
      const { error } = await supabase.from('clientes_previsional').insert(data);
      if (error) { showToast('Error al crear: ' + error.message, 'error'); return false; }
      showToast('Cliente creado', 'success');
    }
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('clientes_previsional').delete().eq('id', id);
    if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return false; }
    showToast('Cliente eliminado', 'success');
    await fetch();
    return true;
  };

  return { clientes, loading, refetch: fetch, upsert, remove };
}

// ── Hook: Aportes Laborales ──
export function useAportesLaborales(clientePrevId: string | null) {
  const [aportes, setAportes] = useState<AporteLaboral[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    if (!clientePrevId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('aportes_laborales')
      .select('*')
      .eq('cliente_prev_id', clientePrevId)
      .order('fecha_desde', { ascending: true });
    if (!error) setAportes((data || []) as AporteLaboral[]);
    setLoading(false);
  }, [clientePrevId]);

  useEffect(() => { fetch(); }, [fetch]);

  const calcMeses = (desde: string, hasta: string) => {
    const d = new Date(desde), h = new Date(hasta);
    return Math.max(0, (h.getFullYear() - d.getFullYear()) * 12 + (h.getMonth() - d.getMonth()) + (h.getDate() - d.getDate() > 15 ? 1 : 0));
  };

  const add = async (aporte: Partial<AporteLaboral>) => {
    const total_meses = aporte.fecha_desde && aporte.fecha_hasta ? calcMeses(aporte.fecha_desde, aporte.fecha_hasta) : 0;
    const { error } = await supabase.from('aportes_laborales').insert({ ...aporte, cliente_prev_id: clientePrevId, total_meses });
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    await fetch();
    return true;
  };

  const update = async (id: string, data: Partial<AporteLaboral>) => {
    if (data.fecha_desde && data.fecha_hasta) data.total_meses = calcMeses(data.fecha_desde, data.fecha_hasta);
    const { error } = await supabase.from('aportes_laborales').update(data).eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('aportes_laborales').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    await fetch();
    return true;
  };

  return { aportes, loading, refetch: fetch, add, update, remove };
}

// ── Hook: Historial de Avances ──
export function useHistorialAvances(clientePrevId: string | null) {
  const [avances, setAvances] = useState<HistorialAvance[]>([]);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    if (!clientePrevId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('historial_avances')
      .select('*')
      .eq('cliente_prev_id', clientePrevId)
      .order('created_at', { ascending: false });
    if (!error) setAvances((data || []) as HistorialAvance[]);
    setLoading(false);
  }, [clientePrevId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (avance: Partial<HistorialAvance>) => {
    const { error } = await supabase.from('historial_avances').insert({ ...avance, cliente_prev_id: clientePrevId });
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    showToast('Avance registrado', 'success');
    await fetch();
    return true;
  };

  return { avances, loading, refetch: fetch, add };
}

// ── Hook: Tareas Previsionales ──
export function useTareasPrevisional(filtroResponsable?: string) {
  const [tareas, setTareas] = useState<TareaPrevisional[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    try {
      let query = supabase
        .from('tareas_previsional')
        .select('*, clientes_previsional(apellido_nombre)')
        .order('created_at', { ascending: false });

      if (filtroResponsable) {
        query = query.eq('responsable_id', filtroResponsable);
      }

      const { data, error } = await query;
      if (error) showToast('Error al cargar tareas: ' + error.message, 'error');
      else {
        const mapped = (data || []).map((t: any) => ({
          ...t,
          cliente_nombre: t.clientes_previsional?.apellido_nombre || null,
        }));
        setTareas(mapped as TareaPrevisional[]);
      }
    } catch { showToast('Error de conexión', 'error'); }
    finally { setLoading(false); }
  }, [showToast, filtroResponsable]);

  useEffect(() => {
    fetch();
    const ch = supabase.channel('prev-tareas-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas_previsional' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const upsert = async (data: Partial<TareaPrevisional>, id?: string) => {
    if (id) {
      const { error } = await supabase.from('tareas_previsional').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) { showToast('Error: ' + error.message, 'error'); return false; }
      showToast('Tarea actualizada', 'success');
    } else {
      const { error } = await supabase.from('tareas_previsional').insert(data);
      if (error) { showToast('Error: ' + error.message, 'error'); return false; }
      showToast('Tarea creada', 'success');
    }
    await fetch();
    return true;
  };

  const completar = async (id: string, userId: string) => {
    const { error } = await supabase.from('tareas_previsional').update({
      estado: 'completada',
      fecha_completada: new Date().toISOString(),
      completada_por: userId,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    showToast('Tarea completada', 'success');
    await fetch();
    return true;
  };

  const remove = async (id: string, tarea: TareaPrevisional, userId: string) => {
    // Guardar en historial antes de eliminar
    await supabase.from('historial_tareas_eliminadas').insert({
      tarea_titulo: tarea.titulo,
      cliente_nombre: tarea.cliente_nombre || null,
      responsable_nombre: tarea.responsable_nombre || null,
      fecha_creacion: tarea.created_at,
      eliminada_por: userId,
    });
    const { error } = await supabase.from('tareas_previsional').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    showToast('Tarea eliminada y archivada', 'success');
    await fetch();
    return true;
  };

  return { tareas, loading, refetch: fetch, upsert, completar, remove };
}

// ── Hook: Audiencias ──
export function useAudiencias() {
  const [audiencias, setAudiencias] = useState<Audiencia[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('audiencias')
        .select('*, clientes_previsional(apellido_nombre)')
        .order('fecha', { ascending: true });
      if (error) showToast('Error al cargar audiencias: ' + error.message, 'error');
      else {
        const mapped = (data || []).map((a: any) => ({
          ...a,
          cliente_nombre: a.clientes_previsional?.apellido_nombre || null,
        }));
        setAudiencias(mapped as Audiencia[]);
      }
    } catch { showToast('Error de conexión', 'error'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    fetch();
    const ch = supabase.channel('prev-audiencias-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audiencias' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const upsert = async (data: Partial<Audiencia>, id?: string) => {
    if (id) {
      const { error } = await supabase.from('audiencias').update(data).eq('id', id);
      if (error) { showToast('Error: ' + error.message, 'error'); return false; }
      showToast('Audiencia actualizada', 'success');
    } else {
      const { error } = await supabase.from('audiencias').insert(data);
      if (error) { showToast('Error: ' + error.message, 'error'); return false; }
      showToast('Audiencia agendada', 'success');
    }
    await fetch();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('audiencias').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return false; }
    showToast('Audiencia eliminada', 'success');
    await fetch();
    return true;
  };

  return { audiencias, loading, refetch: fetch, upsert, remove };
}

// ── Hook: Stats del módulo previsional (para dashboard y gráficas) ──
export function usePrevisionalStats() {
  const [stats, setStats] = useState({
    totalClientes: 0,
    porPipeline: {} as Record<string, number>,
    porSemaforo: { verde: 0, amarillo: 0, rojo: 0, gris: 0 },
    cobradoTotal: 0,
    pendienteTotal: 0,
    tareasActivas: 0,
    tareasVencidas: 0,
    audienciasProximas: 0,
    clientesPorCaptador: {} as Record<string, number>,
    cobradoPorMes: [] as { mes: string; monto: number }[],
  });
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const [clientesRes, tareasRes, audienciasRes] = await Promise.all([
        supabase.from('clientes_previsional').select('*'),
        supabase.from('tareas_previsional').select('*').neq('estado', 'completada'),
        supabase.from('audiencias').select('*').gte('fecha', new Date().toISOString().split('T')[0]),
      ]);

      const clientes = (clientesRes.data || []) as ClientePrevisional[];
      const tareas = (tareasRes.data || []) as TareaPrevisional[];
      const audiencias = (audienciasRes.data || []) as Audiencia[];

      const hoy = new Date();
      const porPipeline: Record<string, number> = {};
      const porSemaforo = { verde: 0, amarillo: 0, rojo: 0, gris: 0 };
      let cobradoTotal = 0;
      let pendienteTotal = 0;
      const clientesPorCaptador: Record<string, number> = {};

      clientes.forEach(c => {
        porPipeline[c.pipeline] = (porPipeline[c.pipeline] || 0) + 1;
        cobradoTotal += c.monto_cobrado || 0;
        pendienteTotal += c.saldo_pendiente || 0;
        if (c.captado_por) {
          clientesPorCaptador[c.captado_por] = (clientesPorCaptador[c.captado_por] || 0) + 1;
        }
        // Semáforo
        if (!c.fecha_ultimo_contacto) porSemaforo.gris++;
        else {
          const dias = Math.floor((hoy.getTime() - new Date(c.fecha_ultimo_contacto).getTime()) / 86400000);
          if (dias <= 7) porSemaforo.verde++;
          else if (dias <= 15) porSemaforo.amarillo++;
          else porSemaforo.rojo++;
        }
      });

      const tareasVencidas = tareas.filter(t =>
        t.fecha_limite && new Date(t.fecha_limite) < hoy && t.estado !== 'completada'
      ).length;

      // Próximos 7 días audiencias
      const en7dias = new Date(hoy);
      en7dias.setDate(en7dias.getDate() + 7);
      const audienciasProximas = audiencias.filter(a =>
        new Date(a.fecha) <= en7dias
      ).length;

      setStats({
        totalClientes: clientes.length,
        porPipeline,
        porSemaforo,
        cobradoTotal,
        pendienteTotal,
        tareasActivas: tareas.length,
        tareasVencidas,
        audienciasProximas,
        clientesPorCaptador,
        cobradoPorMes: [],
      });
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { stats, loading, refetch: fetch };
}

// ── Hook: Alertas Previsionales ──
export interface AlertaPrevisional {
  id: string;
  cliente_prev_id: string | null;
  tarea_id: string | null;
  tipo: string;
  mensaje: string | null;
  leida: boolean;
  creada_en: string;
  cliente_nombre?: string;
}

export function useAlertasPrevisional() {
  const [alertas, setAlertas] = useState<AlertaPrevisional[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetch = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('alertas_previsional')
        .select('*, clientes_previsional(apellido_nombre)')
        .eq('leida', false)
        .order('creada_en', { ascending: false })
        .limit(50);
      if (error) throw error;
      const mapped = (data || []).map((a: any) => ({
        ...a,
        cliente_nombre: a.clientes_previsional?.apellido_nombre || null,
      }));
      setAlertas(mapped as AlertaPrevisional[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    const ch = supabase.channel('alertas-prev-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas_previsional' }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetch]);

  const marcarLeida = async (id: string) => {
    await supabase.from('alertas_previsional').update({ leida: true }).eq('id', id);
    setAlertas(prev => prev.filter(a => a.id !== id));
  };

  const marcarTodasLeidas = async () => {
    await supabase.from('alertas_previsional').update({ leida: true }).eq('leida', false);
    setAlertas([]);
    showToast('Alertas marcadas como leídas', 'success');
  };

  return { alertas, loading, marcarLeida, marcarTodasLeidas };
}
