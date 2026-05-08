import type { CasoCompleto, Cuota, Ingreso } from '../types/database';
import { matchesIncomeReference, parseIncomeReference, withIncomeReference } from './financeRefs';
import { supabase } from './supabase';

export type CaseIncomeLedgerSource = Pick<
  CasoCompleto,
  'id' | 'nombre_apellido' | 'materia' | 'materia_otro' | 'socio' | 'fecha' | 'captadora' | 'honorarios_monto' | 'modalidad_pago' | 'pago_unico_pagado' | 'pago_unico_monto' | 'pago_unico_fecha'
>;

export interface CaseIncomeLedgerSummary {
  processedCases: number;
  inserted: number;
  updated: number;
  deleted: number;
  linkedLegacy: number;
}

type IncomePayload = Omit<Ingreso, 'id' | 'created_at' | 'created_by' | 'updated_by'>;

const DEFAULT_CAPTADORA_COMMISSION_PCT = 0.2;

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getMateriaLabel(sourceCase: Pick<CaseIncomeLedgerSource, 'materia' | 'materia_otro'>) {
  return sourceCase.materia === 'Otro' ? sourceCase.materia_otro?.trim() || 'Otro' : sourceCase.materia;
}

function sameMoney(left: number | null | undefined, right: number | null | undefined) {
  return Math.round(Number(left || 0) * 100) === Math.round(Number(right || 0) * 100);
}

function getCuotaLedgerDate(cuota: Partial<Cuota>) {
  return cuota.fecha_pago || cuota.fecha || getToday();
}

function emptySummary(processedCases = 0): CaseIncomeLedgerSummary {
  return {
    processedCases,
    inserted: 0,
    updated: 0,
    deleted: 0,
    linkedLegacy: 0,
  };
}

export function countCaseIncomeLedgerChanges(summary: CaseIncomeLedgerSummary) {
  return summary.inserted + summary.updated + summary.deleted;
}

export function mergeCaseIncomeLedgerSummaries(left: CaseIncomeLedgerSummary, right: CaseIncomeLedgerSummary): CaseIncomeLedgerSummary {
  return {
    processedCases: left.processedCases + right.processedCases,
    inserted: left.inserted + right.inserted,
    updated: left.updated + right.updated,
    deleted: left.deleted + right.deleted,
    linkedLegacy: left.linkedLegacy + right.linkedLegacy,
  };
}

function sameNullableText(left: string | null | undefined, right: string | null | undefined) {
  return (left || null) === (right || null);
}

function incomeNeedsUpdate(targetIncome: Ingreso, payload: IncomePayload) {
  return !(
    sameNullableText(targetIncome.caso_id, payload.caso_id)
    && targetIncome.fecha === payload.fecha
    && sameNullableText(targetIncome.cliente_nombre, payload.cliente_nombre)
    && sameNullableText(targetIncome.materia, payload.materia)
    && sameNullableText(targetIncome.concepto, payload.concepto)
    && sameMoney(targetIncome.monto_total, payload.monto_total)
    && sameMoney(targetIncome.monto_cj_noa, payload.monto_cj_noa)
    && sameMoney(targetIncome.comision_captadora, payload.comision_captadora)
    && sameNullableText(targetIncome.captadora_nombre, payload.captadora_nombre)
    && sameNullableText(targetIncome.socio_cobro, payload.socio_cobro)
    && sameNullableText(targetIncome.modalidad, payload.modalidad)
    && sameNullableText(targetIncome.notas, payload.notas)
    && targetIncome.es_manual === payload.es_manual
  );
}

function findLegacyIncome(ingresos: Ingreso[], consumedIds: Set<string>, matcher: (ingreso: Ingreso) => boolean) {
  return ingresos.find(ingreso => !consumedIds.has(ingreso.id) && !parseIncomeReference(ingreso.notas).reference && matcher(ingreso));
}

async function getCaptadoraCommissionPct(commissionPct?: number) {
  if (typeof commissionPct === 'number') {
    return commissionPct;
  }

  const { data, error } = await supabase
    .from('configuracion_estudio')
    .select('comision_captadora_pct')
    .limit(1)
    .single();

  if (error) {
    throw error;
  }

  return Number(data?.comision_captadora_pct || DEFAULT_CAPTADORA_COMMISSION_PCT);
}

export async function syncCaseIncomeLedger(_args: {
  sourceCase: CaseIncomeLedgerSource;
  existingCuotas: Cuota[];
  savedCuotas: Cuota[];
  commissionPct: number;
  existingIngresos?: Ingreso[];
  deleteLegacyMissing?: boolean;
}) {
  // No-op tras migration_finanzas_v2: la tabla 'ingresos' ya no existe.
  // Los nuevos ingresos_operativos se cargan manualmente sin vinculo a casos.
  return emptySummary(1);
}

async function _legacy_syncCaseIncomeLedger({
  sourceCase,
  existingCuotas,
  savedCuotas,
  commissionPct,
  existingIngresos,
  deleteLegacyMissing = true,
}: {
  sourceCase: CaseIncomeLedgerSource;
  existingCuotas: Cuota[];
  savedCuotas: Cuota[];
  commissionPct: number;
  existingIngresos?: Ingreso[];
  deleteLegacyMissing?: boolean;
}) {
  const summary = emptySummary(1);
  let incomeRecords = existingIngresos || [];

  if (!existingIngresos) {
    const { data, error } = await supabase.from('ingresos').select('*').eq('caso_id', sourceCase.id);
    if (error) throw error;
    incomeRecords = (data || []) as Ingreso[];
  }

  const desiredRefs = new Set<string>();
  const consumedIds = new Set<string>();
  const deleteIds = new Set<string>();
  const clientName = sourceCase.nombre_apellido.trim();
  const materia = getMateriaLabel(sourceCase);
  const captadora = sourceCase.captadora || null;

  async function upsertIncome(
    reference: { type: 'cuota'; id: string } | { type: 'pago_unico'; caseId: string },
    payload: IncomePayload,
    legacyMatcher: (ingreso: Ingreso) => boolean,
  ) {
    const linkedIncome = incomeRecords.find(ingreso => matchesIncomeReference(ingreso.notas, reference));
    const legacyIncome = linkedIncome ? null : findLegacyIncome(incomeRecords, consumedIds, legacyMatcher);
    const targetIncome = linkedIncome || legacyIncome;

    if (targetIncome) {
      consumedIds.add(targetIncome.id);

      if (!incomeNeedsUpdate(targetIncome, payload)) {
        return;
      }

      const { error: updateIncomeError } = await supabase.from('ingresos').update(payload).eq('id', targetIncome.id);
      if (updateIncomeError) throw updateIncomeError;

      summary.updated += 1;
      if (!linkedIncome && legacyIncome) {
        summary.linkedLegacy += 1;
      }
      return;
    }

    const { error: insertIncomeError } = await supabase.from('ingresos').insert(payload);
    if (insertIncomeError) throw insertIncomeError;

    summary.inserted += 1;
  }

  const paidCuotas = savedCuotas.filter((cuota): cuota is Cuota => cuota.estado === 'Pagado' && Boolean(cuota.id));

  for (const cuota of paidCuotas) {
    const referenceKey = `cuota:${cuota.id}`;
    desiredRefs.add(referenceKey);

    const montoTotal = Number(cuota.monto || 0);
    const comision = captadora ? montoTotal * commissionPct : 0;
    const fechaCobro = getCuotaLedgerDate(cuota);

    await upsertIncome(
      { type: 'cuota', id: cuota.id },
      {
        caso_id: sourceCase.id,
        fecha: fechaCobro,
        cliente_nombre: clientName,
        materia,
        concepto: 'Pago de cuota',
        monto_total: montoTotal,
        monto_cj_noa: montoTotal - comision,
        comision_captadora: comision,
        captadora_nombre: captadora,
        socio_cobro: cuota.cobrado_por || sourceCase.socio,
        modalidad: cuota.modalidad_pago || 'Efectivo',
        notas: withIncomeReference({ type: 'cuota', id: cuota.id }, cuota.notas),
        es_manual: false,
      },
      ingreso => ingreso.concepto === 'Pago de cuota'
        && sameMoney(ingreso.monto_total, cuota.monto)
        && ingreso.fecha === fechaCobro,
    );
  }

  const pagoUnicoMonto = Number(sourceCase.pago_unico_monto || sourceCase.honorarios_monto || 0);
  const pagoUnicoActivo = sourceCase.modalidad_pago === 'Único' && sourceCase.pago_unico_pagado === true && pagoUnicoMonto > 0;

  if (pagoUnicoActivo) {
    desiredRefs.add(`pago_unico:${sourceCase.id}`);
    const comision = captadora ? pagoUnicoMonto * commissionPct : 0;

    await upsertIncome(
      { type: 'pago_unico', caseId: sourceCase.id },
      {
        caso_id: sourceCase.id,
        fecha: sourceCase.pago_unico_fecha || sourceCase.fecha || getToday(),
        cliente_nombre: clientName,
        materia,
        concepto: 'Pago de consulta',
        monto_total: pagoUnicoMonto,
        monto_cj_noa: pagoUnicoMonto - comision,
        comision_captadora: comision,
        captadora_nombre: captadora,
        socio_cobro: sourceCase.socio,
        modalidad: 'Efectivo',
        notas: withIncomeReference({ type: 'pago_unico', caseId: sourceCase.id }),
        es_manual: false,
      },
      ingreso => ingreso.concepto === 'Pago de consulta',
    );
  }

  incomeRecords.forEach(ingreso => {
    const reference = parseIncomeReference(ingreso.notas).reference;
    if (!reference) return;

    if (reference.type === 'cuota' && !desiredRefs.has(`cuota:${reference.id}`)) {
      deleteIds.add(ingreso.id);
    }

    if (reference.type === 'pago_unico' && reference.caseId === sourceCase.id && !desiredRefs.has(`pago_unico:${sourceCase.id}`)) {
      deleteIds.add(ingreso.id);
    }
  });

  if (deleteLegacyMissing) {
    existingCuotas
      .filter(cuota => cuota.estado === 'Pagado' && !desiredRefs.has(`cuota:${cuota.id}`))
      .forEach(cuota => {
        const linkedIncome = incomeRecords.find(ingreso => matchesIncomeReference(ingreso.notas, { type: 'cuota', id: cuota.id }));
        if (linkedIncome) {
          deleteIds.add(linkedIncome.id);
          return;
        }

        const legacyIncome = findLegacyIncome(
          incomeRecords,
          consumedIds,
          ingreso => ingreso.concepto === 'Pago de cuota'
            && sameMoney(ingreso.monto_total, cuota.monto)
            && ingreso.fecha === getCuotaLedgerDate(cuota),
        );

        if (legacyIncome) {
          consumedIds.add(legacyIncome.id);
          deleteIds.add(legacyIncome.id);
        }
      });

    if (!pagoUnicoActivo) {
      const linkedIncome = incomeRecords.find(ingreso => matchesIncomeReference(ingreso.notas, { type: 'pago_unico', caseId: sourceCase.id }));
      if (linkedIncome) {
        deleteIds.add(linkedIncome.id);
      } else {
        const legacyIncome = findLegacyIncome(incomeRecords, consumedIds, ingreso => ingreso.concepto === 'Pago de consulta');
        if (legacyIncome) {
          consumedIds.add(legacyIncome.id);
          deleteIds.add(legacyIncome.id);
        }
      }
    }
  }

  if (deleteIds.size > 0) {
    const ids = Array.from(deleteIds);
    const { error: deleteIncomeError } = await supabase.from('ingresos').delete().in('id', ids);
    if (deleteIncomeError) throw deleteIncomeError;
    summary.deleted += ids.length;
  }

  return summary;
}

export async function reconcileAllCaseIncomeLedgers(_commissionPct?: number) {
  // No-op tras migration_finanzas_v2: la tabla 'ingresos' ya no existe.
  return emptySummary();
}

async function _legacy_reconcileAllCaseIncomeLedgers(commissionPct?: number) {
  const effectiveCommissionPct = await getCaptadoraCommissionPct(commissionPct);
  const [casesRes, cuotasRes, ingresosRes] = await Promise.all([
    supabase
      .from('casos_completos')
      .select('id, nombre_apellido, materia, materia_otro, socio, fecha, captadora, honorarios_monto, modalidad_pago, pago_unico_pagado, pago_unico_monto, pago_unico_fecha'),
    supabase
      .from('cuotas')
      .select('id, caso_id, fecha, monto, estado, fecha_pago, cobrado_por, modalidad_pago, notas'),
    supabase
      .from('ingresos')
      .select('*')
      .not('caso_id', 'is', null),
  ]);

  if (casesRes.error) throw casesRes.error;
  if (cuotasRes.error) throw cuotasRes.error;
  if (ingresosRes.error) throw ingresosRes.error;

  const groupedCuotas = new Map<string, Cuota[]>();
  ((cuotasRes.data || []) as Cuota[]).forEach(cuota => {
    const list = groupedCuotas.get(cuota.caso_id) || [];
    list.push(cuota);
    groupedCuotas.set(cuota.caso_id, list);
  });

  const groupedIngresos = new Map<string, Ingreso[]>();
  ((ingresosRes.data || []) as Ingreso[]).forEach(ingreso => {
    if (!ingreso.caso_id) return;
    const list = groupedIngresos.get(ingreso.caso_id) || [];
    list.push(ingreso);
    groupedIngresos.set(ingreso.caso_id, list);
  });

  let summary = emptySummary();

  for (const sourceCase of (casesRes.data || []) as CaseIncomeLedgerSource[]) {
    const cuotas = groupedCuotas.get(sourceCase.id) || [];
    const ingresos = groupedIngresos.get(sourceCase.id) || [];
    const caseSummary = await syncCaseIncomeLedger({
      sourceCase,
      existingCuotas: cuotas,
      savedCuotas: cuotas,
      commissionPct: effectiveCommissionPct,
      existingIngresos: ingresos,
      deleteLegacyMissing: false,
    });

    summary = mergeCaseIncomeLedgerSummaries(summary, caseSummary);
  }

  return summary;
}