import type { CasoCompleto, Cuota, MovimientoCaso } from '../types/database';
import { describeCaseFinanceAmounts, toCaseNetAmount } from './caseFinance';

export type PipelineCaseSource = Pick<
  CasoCompleto,
  'id' | 'nombre_apellido' | 'materia' | 'materia_otro' | 'socio' | 'fecha' | 'captadora' | 'modalidad_pago' | 'pago_unico_pagado' | 'pago_unico_fecha' | 'total_acordado' | 'total_cobrado' | 'saldo_pendiente'
>;

export type PipelineCuotaSource = Pick<
  Cuota,
  'id' | 'caso_id' | 'fecha' | 'monto' | 'estado'
>;

export type PipelineMovimientoSource = Pick<
  MovimientoCaso,
  'caso_id' | 'tipo' | 'monto' | 'moneda' | 'fecha'
>;

export interface CaseFinancePendingItem {
  id: string;
  casoId: string;
  cuotaId: string | null;
  type: 'cuota' | 'consulta' | 'saldo';
  clientName: string;
  materia: string;
  socio: string;
  captadora: string | null;
  amount: number;
  dueDate: string | null;
  overdue: boolean;
}

export interface CaseFinancePipelineOverview {
  summary: {
    totalAgreed: number;
    totalAgreedNet: number;
    totalCollected: number;
    totalCollectedNet: number;
    totalPending: number;
    totalPendingNet: number;
    collectionRate: number;
    activeDebtors: number;
    overdueCount: number;
    overdueAmount: number;
    overdueNetAmount: number;
    dueNext30Days: number;
    dueNext30DaysNet: number;
    noDueDateAmount: number;
    noDueDateNetAmount: number;
    pendingInstallments: number;
    pendingSinglePayments: number;
  };
  pendingItems: CaseFinancePendingItem[];
  monthlyCollections: Array<{ label: string; value: number; color: string }>;
  monthlyCollectionsNet: Array<{ label: string; value: number; color: string }>;
  fundsByCurrency: Record<'ARS' | 'USD', { depositos: number; gastos: number; disponible: number }>;
}

const PIPELINE_COLORS = ['#f59e0b', '#38bdf8', '#34d399', '#a78bfa', '#fb7185', '#f97316'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function ratio(value: number, total: number) {
  if (total <= 0) return 0;
  return (value / total) * 100;
}

function monthKey(dateValue: string) {
  return dateValue.slice(0, 7);
}

function buildUpcomingMonths(count: number) {
  const cursor = new Date();
  cursor.setDate(1);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() + index, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_LABELS[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`,
    };
  });
}

function normalizeMateria(caso: Pick<CasoCompleto, 'materia' | 'materia_otro'>) {
  return caso.materia === 'Otro' ? caso.materia_otro || 'Otro' : caso.materia;
}

function toAmount(value: number | null | undefined) {
  return Number(value || 0);
}

export function buildCaseFinancePipeline(
  cases: PipelineCaseSource[],
  cuotas: PipelineCuotaSource[],
  movimientos: PipelineMovimientoSource[],
  months = 6,
  commissionPct = 0.2,
): CaseFinancePipelineOverview {
  const today = new Date().toISOString().split('T')[0];
  const next30Days = new Date();
  next30Days.setDate(next30Days.getDate() + 30);
  const next30Iso = next30Days.toISOString().split('T')[0];

  const pendingCuotasByCase = new Map<string, PipelineCuotaSource[]>();
  cuotas
    .filter(cuota => cuota.estado !== 'Pagado')
    .forEach(cuota => {
      const list = pendingCuotasByCase.get(cuota.caso_id) || [];
      list.push(cuota);
      pendingCuotasByCase.set(cuota.caso_id, list);
    });

  const pendingItems: CaseFinancePendingItem[] = [];

  cases.forEach(caso => {
    const pendingCuotas = (pendingCuotasByCase.get(caso.id) || []).sort((left, right) => left.fecha.localeCompare(right.fecha));
    const saldoPendiente = toAmount(caso.saldo_pendiente);

    if (pendingCuotas.length > 0) {
      pendingCuotas.forEach(cuota => {
        pendingItems.push({
          id: cuota.id,
          casoId: caso.id,
          cuotaId: cuota.id,
          type: 'cuota',
          clientName: caso.nombre_apellido,
          materia: normalizeMateria(caso),
          socio: caso.socio,
          captadora: caso.captadora,
          amount: toAmount(cuota.monto),
          dueDate: cuota.fecha || null,
          overdue: !!cuota.fecha && cuota.fecha < today,
        });
      });

      const cuotasPendientes = pendingCuotas.reduce((total, cuota) => total + toAmount(cuota.monto), 0);
      const residual = saldoPendiente - cuotasPendientes;
      if (residual > 0.009) {
        pendingItems.push({
          id: `${caso.id}-saldo`,
          casoId: caso.id,
          cuotaId: null,
          type: 'saldo',
          clientName: caso.nombre_apellido,
          materia: normalizeMateria(caso),
          socio: caso.socio,
          captadora: caso.captadora,
          amount: residual,
          dueDate: null,
          overdue: false,
        });
      }

      return;
    }

    if (saldoPendiente <= 0) {
      return;
    }

    pendingItems.push({
      id: `${caso.id}-${caso.modalidad_pago === 'Único' ? 'consulta' : 'saldo'}`,
      casoId: caso.id,
      cuotaId: null,
      type: caso.modalidad_pago === 'Único' ? 'consulta' : 'saldo',
      clientName: caso.nombre_apellido,
      materia: normalizeMateria(caso),
      socio: caso.socio,
      captadora: caso.captadora,
      amount: saldoPendiente,
      dueDate: caso.pago_unico_fecha || caso.fecha || null,
      overdue: !!(caso.pago_unico_fecha || caso.fecha) && (caso.pago_unico_fecha || caso.fecha)! < today,
    });
  });

  pendingItems.sort((left, right) => {
    if (left.dueDate && right.dueDate) {
      return left.dueDate.localeCompare(right.dueDate) || right.amount - left.amount;
    }
    if (left.dueDate) return -1;
    if (right.dueDate) return 1;
    return right.amount - left.amount;
  });

  const upcomingMonths = buildUpcomingMonths(months);
  const monthlyMap = new Map(upcomingMonths.map(month => [month.key, 0]));
  const monthlyNetMap = new Map(upcomingMonths.map(month => [month.key, 0]));
  pendingItems.forEach(item => {
    if (!item.dueDate) return;
    const key = monthKey(item.dueDate);
    if (!monthlyMap.has(key)) return;
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + item.amount);
    monthlyNetMap.set(key, (monthlyNetMap.get(key) || 0) + toCaseNetAmount(item.amount, item.captadora, commissionPct));
  });

  const fundsByCurrency: Record<'ARS' | 'USD', { depositos: number; gastos: number; disponible: number }> = {
    ARS: { depositos: 0, gastos: 0, disponible: 0 },
    USD: { depositos: 0, gastos: 0, disponible: 0 },
  };

  movimientos.forEach(movimiento => {
    const currency = movimiento.moneda === 'USD' ? 'USD' : 'ARS';
    const target = fundsByCurrency[currency];
    const amount = toAmount(movimiento.monto);
    if (movimiento.tipo === 'deposito') target.depositos += amount;
    if (movimiento.tipo === 'gasto') target.gastos += amount;
    target.disponible = target.depositos - target.gastos;
  });

  const caseAmounts = cases.map(caso => describeCaseFinanceAmounts(caso, commissionPct));
  const totalAgreed = caseAmounts.reduce((total, caso) => total + caso.agreedGross, 0);
  const totalAgreedNet = caseAmounts.reduce((total, caso) => total + caso.agreedNet, 0);
  const totalCollected = caseAmounts.reduce((total, caso) => total + caso.collectedGross, 0);
  const totalCollectedNet = caseAmounts.reduce((total, caso) => total + caso.collectedNet, 0);
  const totalPending = pendingItems.reduce((total, item) => total + item.amount, 0);
  const totalPendingNet = pendingItems.reduce((total, item) => total + toCaseNetAmount(item.amount, item.captadora, commissionPct), 0);
  const overdueItems = pendingItems.filter(item => item.overdue);
  const dueNext30Items = pendingItems.filter(item => item.dueDate && item.dueDate >= today && item.dueDate <= next30Iso);
  const noDueDateItems = pendingItems.filter(item => !item.dueDate);

  return {
    summary: {
      totalAgreed,
      totalAgreedNet,
      totalCollected,
      totalCollectedNet,
      totalPending,
      totalPendingNet,
      collectionRate: ratio(totalCollected, totalAgreed),
      activeDebtors: new Set(pendingItems.map(item => item.casoId)).size,
      overdueCount: overdueItems.length,
      overdueAmount: overdueItems.reduce((total, item) => total + item.amount, 0),
      overdueNetAmount: overdueItems.reduce((total, item) => total + toCaseNetAmount(item.amount, item.captadora, commissionPct), 0),
      dueNext30Days: dueNext30Items.reduce((total, item) => total + item.amount, 0),
      dueNext30DaysNet: dueNext30Items.reduce((total, item) => total + toCaseNetAmount(item.amount, item.captadora, commissionPct), 0),
      noDueDateAmount: noDueDateItems.reduce((total, item) => total + item.amount, 0),
      noDueDateNetAmount: noDueDateItems.reduce((total, item) => total + toCaseNetAmount(item.amount, item.captadora, commissionPct), 0),
      pendingInstallments: pendingItems.filter(item => item.type === 'cuota').length,
      pendingSinglePayments: pendingItems.filter(item => item.type === 'consulta').length,
    },
    pendingItems,
    monthlyCollections: upcomingMonths.map((month, index) => ({
      label: month.label,
      value: monthlyMap.get(month.key) || 0,
      color: PIPELINE_COLORS[index % PIPELINE_COLORS.length],
    })),
    monthlyCollectionsNet: upcomingMonths.map((month, index) => ({
      label: month.label,
      value: monthlyNetMap.get(month.key) || 0,
      color: PIPELINE_COLORS[index % PIPELINE_COLORS.length],
    })),
    fundsByCurrency,
  };
}