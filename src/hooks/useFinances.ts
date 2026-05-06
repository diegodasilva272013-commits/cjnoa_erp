import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import type { CasoCompleto, Egreso, FinanzaExcelResumen, Ingreso, MovimientoCaso } from '../types/database';
import { reconcileAllCaseIncomeLedgers } from '../lib/caseIncomeLedger';
import { describeCaseFinanceAmounts } from '../lib/caseFinance';
import { buildCaseFinancePipeline, type CaseFinancePipelineOverview, type PipelineCaseSource, type PipelineCuotaSource, type PipelineMovimientoSource } from '../lib/financePipeline';

export interface GastoCasoFinanciero {
  id: string;
  source: 'caso';
  fecha: string;
  concepto: string;
  concepto_detalle: string | null;
  monto: number;
  moneda: 'ARS' | 'USD';
  modalidad: null;
  responsable: null;
  observaciones: string | null;
  caso_id: string;
  cliente_nombre: string | null;
  materia: string | null;
  created_at: string;
  created_by: string | null;
}

export interface EgresoFinanciero {
  id: string;
  source: 'operativo' | 'caso';
  fecha: string;
  concepto: string;
  concepto_detalle: string | null;
  monto: number;
  moneda: 'ARS' | 'USD';
  modalidad: 'Efectivo' | 'Transferencia' | null;
  responsable: string | null;
  observaciones: string | null;
  caso_id: string | null;
  cliente_nombre: string | null;
  materia: string | null;
  created_at: string;
  created_by: string | null;
}

function sortByFechaDesc<T extends { fecha: string; created_at: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const fechaDiff = right.fecha.localeCompare(left.fecha);
    if (fechaDiff !== 0) return fechaDiff;
    return right.created_at.localeCompare(left.created_at);
  });
}

let historicalCaseIncomeSyncPromise: Promise<void> | null = null;

async function ensureHistoricalCaseIncomeSync() {
  if (!historicalCaseIncomeSyncPromise) {
    historicalCaseIncomeSyncPromise = reconcileAllCaseIncomeLedgers()
      .then(() => undefined)
      .catch(error => {
        historicalCaseIncomeSyncPromise = null;
        throw error;
      });
  }

  return historicalCaseIncomeSyncPromise;
}

export function useIngresos() {
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingCases, setSyncingCases] = useState(false);
  const { showToast } = useToast();

  const cleanupOrphans = useCallback(async () => {
    // Borra ingresos auto-generados cuyo caso ya no existe (caso_id NULL).
    // No toca ingresos manuales (es_manual=true) ni los que tienen caso vivo.
    // Incluye filas con es_manual NULL (legacy) usando filtro OR.
    try {
      await supabase
        .from('ingresos')
        .delete()
        .or('es_manual.is.null,es_manual.eq.false')
        .is('caso_id', null);
    } catch {
      // silencioso: si falla por RLS u otro motivo, no rompemos la carga
    }
  }, []);

  const readIngresos = useCallback(async () => {
    await cleanupOrphans();
    const { data, error } = await supabase
      .from('ingresos')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) {
      throw error;
    }

    setIngresos((data || []) as Ingreso[]);
  }, [cleanupOrphans]);

  const fetchIngresos = useCallback(async (options?: { syncHistoricalCases?: boolean }) => {
    const shouldSyncHistoricalCases = options?.syncHistoricalCases === true;

    setLoading(true);
    try {
      if (shouldSyncHistoricalCases) {
        await ensureHistoricalCaseIncomeSync().catch(() => undefined);
      }

      await readIngresos();
    } catch (err) {
      showToast('Error al cargar ingresos', 'error');
    } finally {
      setLoading(false);
    }
  }, [readIngresos, showToast]);

  const syncWithCases = useCallback(async () => {
    setSyncingCases(true);
    try {
      const summary = await reconcileAllCaseIncomeLedgers();
      await readIngresos();
      return summary;
    } finally {
      setSyncingCases(false);
    }
  }, [readIngresos]);

  useEffect(() => {
    fetchIngresos({ syncHistoricalCases: true });

    const channel = supabase
      .channel('ingresos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingresos' }, () => {
        fetchIngresos();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'casos' }, () => {
        // Si se borra un caso en cualquier parte de la app, refrescar ingresos
        // (la cascada de la FK + cleanupOrphans dejan la lista consistente)
        fetchIngresos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchIngresos]);

  return { ingresos, loading, refetch: fetchIngresos, syncWithCases, syncingCases };
}

export function useEgresos() {
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [gastosCaso, setGastosCaso] = useState<GastoCasoFinanciero[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetchEgresos = useCallback(async () => {
    try {
      const [egresosRes, movimientosRes, casosRes] = await Promise.all([
        supabase.from('egresos').select('*').order('fecha', { ascending: false }),
        supabase.from('movimientos_caso').select('*').eq('tipo', 'gasto').order('fecha', { ascending: false }),
        supabase.from('casos_completos').select('id, nombre_apellido, materia'),
      ]);

      if (egresosRes.error) {
        showToast('Error al cargar egresos: ' + egresosRes.error.message, 'error');
      } else {
        setEgresos((egresosRes.data || []) as Egreso[]);
      }

      if (movimientosRes.error) {
        showToast('Error al cargar gastos de caso: ' + movimientosRes.error.message, 'error');
      } else {
        const caseLookup = new Map<string, { nombre_apellido: string; materia: string }>();
        ((casosRes.data || []) as Pick<CasoCompleto, 'id' | 'nombre_apellido' | 'materia'>[]).forEach(caso => {
          caseLookup.set(caso.id, { nombre_apellido: caso.nombre_apellido, materia: caso.materia });
        });

        const mapped = ((movimientosRes.data || []) as MovimientoCaso[]).map(movimiento => ({
          id: movimiento.id,
          source: 'caso' as const,
          fecha: movimiento.fecha,
          concepto: 'Gasto del caso',
          concepto_detalle: movimiento.concepto,
          monto: Number(movimiento.monto || 0),
          moneda: movimiento.moneda,
          modalidad: null,
          responsable: null,
          observaciones: movimiento.observaciones,
          caso_id: movimiento.caso_id,
          cliente_nombre: caseLookup.get(movimiento.caso_id)?.nombre_apellido || null,
          materia: caseLookup.get(movimiento.caso_id)?.materia || null,
          created_at: movimiento.created_at,
          created_by: movimiento.created_by,
        }));

        setGastosCaso(sortByFechaDesc(mapped));
      }
    } catch (err) {
      showToast('Error al cargar egresos', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchEgresos();

    const channel = supabase
      .channel('egresos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'egresos' }, () => {
        fetchEgresos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos_caso' }, () => {
        fetchEgresos();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casos' }, () => {
        fetchEgresos();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEgresos]);

  const egresosCombinados: EgresoFinanciero[] = sortByFechaDesc([
    ...egresos.map(egreso => ({
      id: egreso.id,
      source: 'operativo' as const,
      fecha: egreso.fecha,
      concepto: egreso.concepto,
      concepto_detalle: egreso.concepto_detalle,
      monto: Number(egreso.monto || 0),
      moneda: 'ARS' as const,
      modalidad: egreso.modalidad,
      responsable: egreso.responsable,
      observaciones: egreso.observaciones,
      caso_id: egreso.caso_id,
      cliente_nombre: null,
      materia: null,
      created_at: egreso.created_at,
      created_by: egreso.created_by,
    })),
    ...gastosCaso,
  ]);

  return { egresos, gastosCaso, egresosCombinados, loading, refetch: fetchEgresos };
}

export function useCaseFinancePipeline(months = 6) {
  const [pipeline, setPipeline] = useState<CaseFinancePipelineOverview>(() => buildCaseFinancePipeline([], [], [], months));
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetchPipeline = useCallback(async () => {
    try {
      const [casosRes, cuotasRes, movimientosRes, configRes] = await Promise.all([
        supabase.from('casos_completos').select('id, nombre_apellido, materia, materia_otro, socio, fecha, captadora, modalidad_pago, pago_unico_pagado, pago_unico_fecha, total_acordado, total_cobrado, saldo_pendiente'),
        supabase.from('cuotas').select('id, caso_id, fecha, monto, estado'),
        supabase.from('movimientos_caso').select('caso_id, tipo, monto, moneda, fecha'),
        supabase.from('configuracion_estudio').select('comision_captadora_pct').limit(1).single(),
      ]);

      if (casosRes.error) {
        showToast('Error al cargar cartera de casos: ' + casosRes.error.message, 'error');
      }
      if (cuotasRes.error) {
        showToast('Error al cargar cuotas pendientes: ' + cuotasRes.error.message, 'error');
      }
      if (movimientosRes.error) {
        showToast('Error al cargar fondos de casos: ' + movimientosRes.error.message, 'error');
      }

      const commissionPct = Number(configRes.data?.comision_captadora_pct || 0.2);

      setPipeline(buildCaseFinancePipeline(
        (casosRes.data || []) as PipelineCaseSource[],
        (cuotasRes.data || []) as PipelineCuotaSource[],
        (movimientosRes.data || []) as PipelineMovimientoSource[],
        months,
        commissionPct,
      ));
    } catch (err) {
      showToast('Error al cargar pipeline financiero de casos', 'error');
    } finally {
      setLoading(false);
    }
  }, [months, showToast]);

  useEffect(() => {
    fetchPipeline();

    const channel = supabase
      .channel(`finanzas-casos-pipeline-${months}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casos' }, () => {
        fetchPipeline();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuotas' }, () => {
        fetchPipeline();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos_caso' }, () => {
        fetchPipeline();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPipeline, months]);

  return { pipeline, loading, refetch: fetchPipeline };
}

export function useDashboardStats() {
  const [stats, setStats] = useState({
    porCobrar: 0,
    cobradoMes: 0,
    flujoNeto: 0,
    totalCasos: 0,
    casosPorMateria: {} as Record<string, number>,
    cuotasVencidas: 0,
    sinPagarConsulta: 0,
    muyInteresantes: 0,
    nuevosClientes7d: 0,
    ingresosMes: 0,
    egresosMes: 0,
    casosFondosBajos: 0,
  });
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetchStats = useCallback(async () => {
    try {
    await ensureHistoricalCaseIncomeSync().catch(() => undefined);
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all data in parallel
    const [casosRes, ingresosRes, egresosRes, cuotasRes, movimientosRes, configRes] = await Promise.all([
      supabase.from('casos_completos').select('*'),
      supabase.from('ingresos').select('*').gte('fecha', firstDay).lte('fecha', lastDay),
      supabase.from('egresos').select('*').gte('fecha', firstDay).lte('fecha', lastDay),
      supabase.from('cuotas').select('*').eq('estado', 'Pendiente').lt('fecha', new Date().toISOString().split('T')[0]),
      supabase.from('movimientos_caso').select('caso_id, tipo, monto, moneda, fecha'),
      supabase.from('configuracion_estudio').select('comision_captadora_pct').limit(1).single(),
    ]);

    if (casosRes.error) showToast('Error al cargar estadísticas de casos', 'error');
    if (ingresosRes.error) showToast('Error al cargar estadísticas de ingresos', 'error');
    if (egresosRes.error) showToast('Error al cargar estadísticas de egresos', 'error');

    const casos = (casosRes.data || []) as CasoCompleto[];
    const ingresos = (ingresosRes.data || []) as Ingreso[];
    const egresos = (egresosRes.data || []) as Egreso[];
    const cuotasVencidas = cuotasRes.data || [];
    const movimientos = (movimientosRes.data || []) as { caso_id: string; tipo: string; monto: number; moneda?: string; fecha?: string }[];
    const commissionPct = Number(configRes.data?.comision_captadora_pct || 0.2);

    // Calculate cases with low funds (>=80% used or negative balance) - per currency
    const fondosPorCaso: Record<string, Record<string, { depositos: number; gastos: number }>> = {};
    movimientos.forEach(m => {
      const cur = m.moneda || 'ARS';
      if (!fondosPorCaso[m.caso_id]) fondosPorCaso[m.caso_id] = {};
      if (!fondosPorCaso[m.caso_id][cur]) fondosPorCaso[m.caso_id][cur] = { depositos: 0, gastos: 0 };
      if (m.tipo === 'deposito') fondosPorCaso[m.caso_id][cur].depositos += Number(m.monto);
      else fondosPorCaso[m.caso_id][cur].gastos += Number(m.monto);
    });
    const casosFondosBajos = Object.values(fondosPorCaso).filter(currencies =>
      Object.values(currencies).some(f => f.depositos > 0 && (f.gastos / f.depositos) >= 0.8)
    ).length;

    const porCobrar = casos.reduce((sum, c) => sum + describeCaseFinanceAmounts(c, commissionPct).pendingNet, 0);
    const ingresosMes = ingresos.reduce((sum, i) => sum + (i.monto_cj_noa || 0), 0);
    const gastosCasoMes = movimientos
      .filter(m => m.tipo === 'gasto' && m.moneda !== 'USD' && m.fecha && m.fecha >= firstDay && m.fecha <= lastDay)
      .reduce((sum, movement) => sum + Number(movement.monto || 0), 0);
    const egresosMes = egresos.reduce((sum, e) => sum + (e.monto || 0), 0) + gastosCasoMes;

    const casosPorMateria: Record<string, number> = {};
    casos.forEach(c => {
      casosPorMateria[c.materia] = (casosPorMateria[c.materia] || 0) + 1;
    });

    const sinPagarConsulta = casos.filter(
      c => c.modalidad_pago === 'Único' && c.pago_unico_pagado === false
    ).length;

    const muyInteresantes = casos.filter(
      c => c.estado === 'Vino a consulta' && c.interes === 'Muy interesante'
    ).length;

    const nuevosClientes7d = casos.filter(
      c => c.created_at >= sevenDaysAgo
    ).length;

    setStats({
      porCobrar,
      cobradoMes: ingresosMes,
      flujoNeto: ingresosMes - egresosMes,
      totalCasos: casos.length,
      casosPorMateria,
      cuotasVencidas: cuotasVencidas.length,
      sinPagarConsulta,
      muyInteresantes,
      nuevosClientes7d,
      ingresosMes,
      egresosMes,
      casosFondosBajos,
    });
    } catch (err) {
      showToast('Error al cargar estadísticas del dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStats();

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casos' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingresos' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'egresos' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cuotas' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos_caso' }, () => fetchStats())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

export function useExcelFinanceSummaries() {
  const [summaries, setSummaries] = useState<FinanzaExcelResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetchSummaries = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('finanzas_excel_resumenes')
        .select('*')
        .order('periodo', { ascending: false });

      if (error) {
        showToast('Error al cargar resúmenes Excel: ' + error.message, 'error');
      } else {
        setSummaries((data || []) as FinanzaExcelResumen[]);
      }
    } catch (err) {
      showToast('Error al cargar resúmenes Excel', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSummaries();

    const channel = supabase
      .channel('finanzas-excel-resumenes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finanzas_excel_resumenes' }, () => {
        fetchSummaries();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSummaries]);

  return { summaries, loading, refetch: fetchSummaries };
}
