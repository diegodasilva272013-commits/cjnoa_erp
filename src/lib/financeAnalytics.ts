import type { Ingreso } from '../types/database';
import { buildRecentMonths } from './financeFormat';
import { getIngresoSocioShares, parseDistributionShares, resolveOperationalSocio, sameOperationalSocio, sortOperationalSocios } from './operationalSocios';

/**
 * Aggregates per-socio totals over a list of ingresos using the same attribution rules
 * as the rest of the analytics pipeline (canonical `socio_cobro` first, legacy `Distribucion:`
 * note as fallback). Each ingreso contributes its `monto_*` values pro-rated by share ratio.
 */
export interface PerSocioIngresoTotals {
  ingresoNeto: number;
  ingresoBruto: number;
  comisiones: number;
  registros: number;
  clientes: Set<string>;
}

export function aggregateIngresosPorSocio(ingresos: Ingreso[], socios: string[]): Map<string, PerSocioIngresoTotals> {
  const result = new Map<string, PerSocioIngresoTotals>();
  socios.forEach(socio => {
    result.set(socio, { ingresoNeto: 0, ingresoBruto: 0, comisiones: 0, registros: 0, clientes: new Set<string>() });
  });

  ingresos.forEach(ingreso => {
    const shares = getIngresoSocioShares(ingreso);
    if (shares.length === 0) return;

    const monto = Number(ingreso.monto_cj_noa || 0);
    const bruto = Number(ingreso.monto_total || 0);
    const comision = Number(ingreso.comision_captadora || 0);
    const cliente = ingreso.cliente_nombre?.toLowerCase().trim() || '';

    shares.forEach(({ socio, ratio }) => {
      const bucket = result.get(socio);
      if (!bucket) return;
      bucket.ingresoNeto += monto * ratio;
      bucket.ingresoBruto += bruto * ratio;
      bucket.comisiones += comision * ratio;
      bucket.registros += 1;
      if (cliente) bucket.clientes.add(cliente);
    });
  });

  return result;
}

export interface ExpenseLike {
  source: 'operativo' | 'caso';
  fecha: string;
  concepto: string;
  monto: number;
  responsable: string | null;
  modalidad: 'Efectivo' | 'Transferencia' | null;
  cliente_nombre: string | null;
}

export interface FinanceChartDatum {
  label: string;
  value: number;
  color: string;
}

export interface FinanceMonthlyPoint {
  label: string;
  income: number;
  expense: number;
  net: number;
}

const PALETTE = ['#34d399', '#38bdf8', '#f59e0b', '#fb7185', '#a78bfa', '#22c55e', '#f97316', '#06b6d4'];

function ratio(value: number, total: number) {
  if (total <= 0) return 0;
  return (value / total) * 100;
}

function sumValues(values: number[]) {
  return values.reduce((total, current) => total + current, 0);
}

function topMapEntries(entries: Map<string, number>, limit = 6): FinanceChartDatum[] {
  return [...entries.entries()]
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, value], index) => ({
      label,
      value,
      color: PALETTE[index % PALETTE.length],
    }));
}

function addToMap(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) || 0) + value);
}

function monthFromDate(value: string) {
  return value.slice(0, 7);
}

function parseFinanceDate(value: string | null | undefined) {
  if (!value) return null;

  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function resolveLatestFinanceDate(...collections: Array<Array<{ fecha: string }>>) {
  let latest: Date | null = null;

  collections.forEach(collection => {
    collection.forEach(item => {
      const parsed = parseFinanceDate(item.fecha);
      if (!parsed) return;
      if (!latest || parsed > latest) {
        latest = parsed;
      }
    });
  });

  return latest ?? new Date();
}

export function getExpenseCategory(concepto: string) {
  if (!concepto) return 'Sin categoría';
  if (concepto === 'Gasto del caso') return 'Gastos del caso';
  const [category] = concepto.split(':');
  return category.trim() || 'Sin categoría';
}

function getIncomeSource(ingreso: Ingreso) {
  if (ingreso.captadora_nombre) return 'Captadora';
  if (ingreso.caso_id) return 'Caso / cuota';
  if (ingreso.es_manual) return 'Manual / directo';
  return 'Directo';
}

export function buildIncomeOverview(ingresos: Ingreso[], months = 6, anchorDate?: Date) {
  const grossIncome = sumValues(ingresos.map(item => Number(item.monto_total || 0)));
  const netIncome = sumValues(ingresos.map(item => Number(item.monto_cj_noa || 0)));
  const commissions = sumValues(ingresos.map(item => Number(item.comision_captadora || 0)));
  const averageTicket = ingresos.length > 0 ? netIncome / ingresos.length : 0;
  const collectionRate = ratio(netIncome, grossIncome);
  const captadoraRate = ratio(commissions, grossIncome);
  const monthAnchor = anchorDate ?? resolveLatestFinanceDate(ingresos);

  const monthlyBase = buildRecentMonths(months, monthAnchor).map(month => ({
    key: month.key,
    label: month.label,
    gross: 0,
    net: 0,
    commission: 0,
  }));
  const monthlyMap = new Map(monthlyBase.map(item => [item.key, item]));

  const sourceTotals = new Map<string, number>();
  const partnerTotals = new Map<string, number>();
  const paymentTotals = new Map<string, number>();
  const clientTotals = new Map<string, number>();

  ingresos.forEach(ingreso => {
    const gross = Number(ingreso.monto_total || 0);
    const net = Number(ingreso.monto_cj_noa || 0);
    const commission = Number(ingreso.comision_captadora || 0);
    const monthKey = monthFromDate(ingreso.fecha);
    const bucket = monthlyMap.get(monthKey);
    if (bucket) {
      bucket.gross += gross;
      bucket.net += net;
      bucket.commission += commission;
    }

    addToMap(sourceTotals, getIncomeSource(ingreso), net);
    const partnerShares = getIngresoSocioShares(ingreso);
    if (partnerShares.length === 0) {
      addToMap(partnerTotals, 'Sin asignar', net);
    } else {
      partnerShares.forEach(({ socio, ratio }) => {
        addToMap(partnerTotals, socio, net * ratio);
      });
    }
    addToMap(paymentTotals, ingreso.modalidad || 'Sin definir', net);
    addToMap(clientTotals, ingreso.cliente_nombre || 'Sin cliente', net);
  });

  return {
    totals: {
      grossIncome,
      netIncome,
      commissions,
      averageTicket,
      collectionRate,
      captadoraRate,
      records: ingresos.length,
    },
    monthlySeries: monthlyBase.map(item => ({
      label: item.label,
      income: item.gross,
      expense: item.commission,
      net: item.net,
    })),
    sourceBreakdown: topMapEntries(sourceTotals, 4),
    partnerBreakdown: topMapEntries(partnerTotals, 6),
    paymentBreakdown: topMapEntries(paymentTotals, 4),
    topClients: topMapEntries(clientTotals, 6),
  };
}

export function buildExpenseOverview(expenses: ExpenseLike[], months = 6, anchorDate?: Date) {
  const total = sumValues(expenses.map(item => Number(item.monto || 0)));
  const operativo = sumValues(expenses.filter(item => item.source === 'operativo').map(item => Number(item.monto || 0)));
  const casos = sumValues(expenses.filter(item => item.source === 'caso').map(item => Number(item.monto || 0)));
  const averageTicket = expenses.length > 0 ? total / expenses.length : 0;
  const caseShare = ratio(casos, total);
  const highestExpense = expenses.reduce((highest, item) => Math.max(highest, Number(item.monto || 0)), 0);
  const monthAnchor = anchorDate ?? resolveLatestFinanceDate(expenses);

  const monthlyBase = buildRecentMonths(months, monthAnchor).map(month => ({
    key: month.key,
    label: month.label,
    operativo: 0,
    casos: 0,
  }));
  const monthlyMap = new Map(monthlyBase.map(item => [item.key, item]));

  const categoryTotals = new Map<string, number>();
  const responsibleTotals = new Map<string, number>();
  const sourceTotals = new Map<string, number>();

  expenses.forEach(expense => {
    const value = Number(expense.monto || 0);
    const monthKey = monthFromDate(expense.fecha);
    const bucket = monthlyMap.get(monthKey);
    if (bucket) {
      if (expense.source === 'caso') bucket.casos += value;
      else bucket.operativo += value;
    }

    addToMap(categoryTotals, getExpenseCategory(expense.concepto), value);
    addToMap(
      responsibleTotals,
      resolveOperationalSocio(expense.responsable) || (expense.source === 'caso' ? 'Caso' : 'Sin asignar'),
      value,
    );
    addToMap(sourceTotals, expense.source === 'caso' ? 'Gastos del caso' : 'Operativos', value);
  });

  return {
    totals: {
      total,
      operativo,
      casos,
      averageTicket,
      caseShare,
      highestExpense,
      records: expenses.length,
    },
    monthlySeries: monthlyBase.map(item => ({
      label: item.label,
      income: item.operativo,
      expense: item.casos,
      net: item.operativo + item.casos,
    })),
    categoryBreakdown: topMapEntries(categoryTotals, 6),
    responsibleBreakdown: topMapEntries(responsibleTotals, 6),
    sourceBreakdown: topMapEntries(sourceTotals, 3),
  };
}

export function buildFinanceOverview(ingresos: Ingreso[], expenses: ExpenseLike[], months = 6) {
  const anchorDate = resolveLatestFinanceDate(ingresos, expenses);
  const income = buildIncomeOverview(ingresos, months, anchorDate);
  const expense = buildExpenseOverview(expenses, months, anchorDate);
  const monthlySeries: FinanceMonthlyPoint[] = income.monthlySeries.map((item, index) => ({
    label: item.label,
    income: item.net,
    expense: expense.monthlySeries[index]?.net || 0,
    net: item.net - (expense.monthlySeries[index]?.net || 0),
  }));

  return {
    totals: {
      grossIncome: income.totals.grossIncome,
      netIncome: income.totals.netIncome,
      commissions: income.totals.commissions,
      totalExpenses: expense.totals.total,
      netFlow: income.totals.netIncome - expense.totals.total,
      profitMargin: ratio(income.totals.netIncome - expense.totals.total, income.totals.netIncome),
      expenseCoverage: ratio(income.totals.netIncome, expense.totals.total),
    },
    monthlySeries,
    incomeSourceBreakdown: income.sourceBreakdown,
    paymentBreakdown: income.paymentBreakdown,
    expenseCategoryBreakdown: expense.categoryBreakdown,
    topClients: income.topClients,
  };
}

// ---------------------------------------------------------------------------
// Reparto / distribution engine — computes everything from DB data
// ---------------------------------------------------------------------------

export interface SocioReparto {
  socio: string;
  ingresoBruto: number;
  ingresoNeto: number;
  comisiones: number;
  participacion: number;
  baseAsignada: number;
  variableRendimiento: number;
  egresosResponsable: number;
  montoACobrar: number;
  casosAtendidos: number;
}

export interface RepartoMensual {
  mes: string;
  label: string;
  totalIngresos: number;
  totalEgresos: number;
  totalARepartir: number;
  basePorPersona: number;
  reparto65: number;
  reparto35: number;
  socios: SocioReparto[];
  clientesUnicos: number;
}

export interface RepartoOverview {
  global: {
    totalIngresos: number;
    totalEgresos: number;
    totalARepartir: number;
    basePorPersona: number;
    reparto65: number;
    reparto35: number;
    clientesUnicos: number;
    margen: number;
  };
  socios: SocioReparto[];
  mensual: RepartoMensual[];
}

export interface RepartoConfig {
  basePct: number;      // e.g. 0.65
  rendimientoPct: number; // e.g. 0.35
}

const DEFAULT_REPARTO: RepartoConfig = { basePct: 0.65, rendimientoPct: 0.35 };

function normalizeRepartoConfig(repartoConfig: RepartoConfig): RepartoConfig {
  const safeBasePct = Math.max(Number(repartoConfig.basePct) || 0, 0);
  const safeRendimientoPct = Math.max(Number(repartoConfig.rendimientoPct) || 0, 0);
  const totalPct = safeBasePct + safeRendimientoPct;

  if (totalPct <= 0) {
    return DEFAULT_REPARTO;
  }

  return {
    basePct: safeBasePct / totalPct,
    rendimientoPct: safeRendimientoPct / totalPct,
  };
}

export function buildRepartoOverview(
  ingresos: Ingreso[],
  expenses: ExpenseLike[],
  months = 6,
  socios: string[] = [],
  repartoConfig: RepartoConfig = DEFAULT_REPARTO,
): RepartoOverview {
  const { basePct, rendimientoPct } = normalizeRepartoConfig(repartoConfig);
  const recentMonths = buildRecentMonths(months, resolveLatestFinanceDate(ingresos, expenses));
  const monthKeys = new Set(recentMonths.map(m => m.key));

  // Filter to period
  const filteredIngresos = ingresos.filter(i => monthKeys.has(monthFromDate(i.fecha)));
  const filteredExpenses = expenses.filter(e => monthKeys.has(monthFromDate(e.fecha)));

  // Defensive: any socio que aparezca en ingresos/egresos del periodo TIENE que estar en
  // el reparto, aunque la lista pasada por el caller no lo incluya. Si no, su cobro
  // queda sin atribuir y el resto recibe base sin variable -> tarjetas con $0 ingreso
  // pero base inflada (sintoma exacto de Rodrigo desaparecido).
  const socioCandidates: Array<string | null> = [...socios];
  filteredIngresos.forEach(i => {
    socioCandidates.push(i.socio_cobro);
    const distribution = parseDistributionShares(i.notas);
    distribution?.forEach(share => socioCandidates.push(share.socio));
  });
  filteredExpenses.forEach(e => socioCandidates.push(e.responsable));
  const effectiveSocios = sortOperationalSocios(socioCandidates);

  const totalIngresos = sumValues(filteredIngresos.map(i => Number(i.monto_cj_noa || 0)));
  const totalEgresos = sumValues(filteredExpenses.map(e => Number(e.monto || 0)));
  const totalARepartir = Math.max(totalIngresos - totalEgresos, 0);
  const reparto65 = totalARepartir * basePct;
  const reparto35 = totalARepartir * rendimientoPct;
  const basePorPersona = effectiveSocios.length > 0 ? reparto65 / effectiveSocios.length : 0;

  const clientesSet = new Set<string>();
  filteredIngresos.forEach(i => {
    if (i.cliente_nombre) clientesSet.add(i.cliente_nombre.toLowerCase().trim());
  });

  // Per-socio global
  const aggregatedGlobal = aggregateIngresosPorSocio(filteredIngresos, effectiveSocios);
  const sociosData: SocioReparto[] = effectiveSocios.map((socio: string) => {
    const totals = aggregatedGlobal.get(socio) || { ingresoNeto: 0, ingresoBruto: 0, comisiones: 0, registros: 0, clientes: new Set<string>() };
    const participacion = totalIngresos > 0 ? totals.ingresoNeto / totalIngresos : 0;
    const egresosResponsable = sumValues(
      filteredExpenses.filter(e => sameOperationalSocio(e.responsable, socio)).map(e => Number(e.monto || 0)),
    );
    const variableRendimiento = participacion * reparto35;
    // Los egresos ya fueron descontados al calcular totalARepartir; aqui solo distribuimos ese remanente.
    const montoACobrar = basePorPersona + variableRendimiento;

    return {
      socio,
      ingresoBruto: totals.ingresoBruto,
      ingresoNeto: totals.ingresoNeto,
      comisiones: totals.comisiones,
      participacion,
      baseAsignada: basePorPersona,
      variableRendimiento,
      egresosResponsable,
      montoACobrar,
      casosAtendidos: totals.clientes.size,
    };
  });

  // Per-month breakdown
  const mensual: RepartoMensual[] = recentMonths.map(month => {
    const mesIngresos = filteredIngresos.filter(i => monthFromDate(i.fecha) === month.key);
    const mesExpenses = filteredExpenses.filter(e => monthFromDate(e.fecha) === month.key);
    const mesTotal = sumValues(mesIngresos.map(i => Number(i.monto_cj_noa || 0)));
    const mesEgresos = sumValues(mesExpenses.map(e => Number(e.monto || 0)));
    const mesRepartir = Math.max(mesTotal - mesEgresos, 0);
    const mesRepartoBase = mesRepartir * basePct;
    const mesRepartoVariable = mesRepartir * rendimientoPct;
    const base = effectiveSocios.length > 0 ? mesRepartoBase / effectiveSocios.length : 0;

    const mesClientes = new Set<string>();
    mesIngresos.forEach(i => { if (i.cliente_nombre) mesClientes.add(i.cliente_nombre.toLowerCase().trim()); });

    const aggregatedMes = aggregateIngresosPorSocio(mesIngresos, effectiveSocios);
    const mesSocios: SocioReparto[] = effectiveSocios.map((socio: string) => {
      const totals = aggregatedMes.get(socio) || { ingresoNeto: 0, ingresoBruto: 0, comisiones: 0, registros: 0, clientes: new Set<string>() };
      const part = mesTotal > 0 ? totals.ingresoNeto / mesTotal : 0;
      const egr = sumValues(mesExpenses.filter(e => sameOperationalSocio(e.responsable, socio)).map(e => Number(e.monto || 0)));
      const variableRendimiento = part * mesRepartoVariable;
      const cobrar = base + variableRendimiento;
      return {
        socio,
        ingresoBruto: totals.ingresoBruto,
        ingresoNeto: totals.ingresoNeto,
        comisiones: totals.comisiones,
        participacion: part,
        baseAsignada: base,
        variableRendimiento,
        egresosResponsable: egr,
        montoACobrar: cobrar,
        casosAtendidos: totals.clientes.size,
      };
    });

    return {
      mes: month.key,
      label: month.label,
      totalIngresos: mesTotal,
      totalEgresos: mesEgresos,
      totalARepartir: mesRepartir,
      basePorPersona: base,
      reparto65: mesRepartoBase,
      reparto35: mesRepartoVariable,
      socios: mesSocios,
      clientesUnicos: mesClientes.size,
    };
  });

  return {
    global: {
      totalIngresos,
      totalEgresos,
      totalARepartir,
      basePorPersona,
      reparto65,
      reparto35,
      clientesUnicos: clientesSet.size,
      margen: ratio(totalARepartir, totalIngresos),
    },
    socios: sociosData,
    mensual,
  };
}