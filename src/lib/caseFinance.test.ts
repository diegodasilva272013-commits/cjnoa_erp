import { describe, expect, it } from 'vitest';
import { describeCaseFinanceAmounts, getCaseNetMultiplier, toCaseNetAmount } from './caseFinance';

describe('caseFinance', () => {
  it('keeps direct cases at full value', () => {
    expect(getCaseNetMultiplier(null, 0.2)).toBe(1);
    expect(toCaseNetAmount(100000, null, 0.2)).toBe(100000);
  });

  it('discounts captadora commission for studio net', () => {
    expect(getCaseNetMultiplier('Milagros - La Quiaca', 0.2)).toBe(0.8);
    expect(toCaseNetAmount(100000, 'Milagros - La Quiaca', 0.2)).toBe(80000);
  });

  it('describes gross and net case amounts coherently', () => {
    expect(describeCaseFinanceAmounts({
      captadora: 'Milagros - La Quiaca',
      total_acordado: 200000,
      total_cobrado: 50000,
      saldo_pendiente: 150000,
    }, 0.2)).toEqual({
      agreedGross: 200000,
      agreedNet: 160000,
      collectedGross: 50000,
      collectedNet: 40000,
      pendingGross: 150000,
      pendingNet: 120000,
    });
  });
});