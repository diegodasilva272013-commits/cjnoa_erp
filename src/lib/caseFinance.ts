import type { CasoCompleto } from '../types/database';

export type CaseFinanceAmountSource = Pick<
  CasoCompleto,
  'captadora' | 'total_acordado' | 'total_cobrado' | 'saldo_pendiente'
>;

export interface CaseFinanceAmounts {
  agreedGross: number;
  agreedNet: number;
  collectedGross: number;
  collectedNet: number;
  pendingGross: number;
  pendingNet: number;
}

function toAmount(value: number | null | undefined) {
  return Number(value || 0);
}

export function caseHasCaptadora(captadora: string | null | undefined) {
  return Boolean(captadora);
}

export function getCaseNetMultiplier(captadora: string | null | undefined, commissionPct: number) {
  return caseHasCaptadora(captadora) ? Math.max(0, 1 - Number(commissionPct || 0)) : 1;
}

export function toCaseNetAmount(amount: number | null | undefined, captadora: string | null | undefined, commissionPct: number) {
  return toAmount(amount) * getCaseNetMultiplier(captadora, commissionPct);
}

export function describeCaseFinanceAmounts(caso: CaseFinanceAmountSource, commissionPct: number): CaseFinanceAmounts {
  return {
    agreedGross: toAmount(caso.total_acordado),
    agreedNet: toCaseNetAmount(caso.total_acordado, caso.captadora, commissionPct),
    collectedGross: toAmount(caso.total_cobrado),
    collectedNet: toCaseNetAmount(caso.total_cobrado, caso.captadora, commissionPct),
    pendingGross: toAmount(caso.saldo_pendiente),
    pendingNet: toCaseNetAmount(caso.saldo_pendiente, caso.captadora, commissionPct),
  };
}