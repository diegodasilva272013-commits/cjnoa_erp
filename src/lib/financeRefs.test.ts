import { describe, expect, it } from 'vitest';
import { matchesIncomeReference, parseIncomeReference, stripIncomeReference, withIncomeReference } from './financeRefs';

describe('financeRefs', () => {
  it('encodes and decodes cuota references without leaking public notes', () => {
    const note = withIncomeReference({ type: 'cuota', id: 'cuota-1' }, 'Pago recibido en caja');

    expect(matchesIncomeReference(note, { type: 'cuota', id: 'cuota-1' })).toBe(true);
    expect(parseIncomeReference(note)).toEqual({
      reference: { type: 'cuota', id: 'cuota-1' },
      publicNote: 'Pago recibido en caja',
    });
    expect(stripIncomeReference(note)).toBe('Pago recibido en caja');
  });

  it('keeps legacy notes readable when no metadata exists', () => {
    expect(parseIncomeReference('Nota manual')).toEqual({
      reference: null,
      publicNote: 'Nota manual',
    });
    expect(stripIncomeReference('Nota manual')).toBe('Nota manual');
  });
});