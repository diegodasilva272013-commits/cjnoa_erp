import { describe, expect, it } from 'vitest';
import { buildCaseFinancePipeline } from './financePipeline';

function isoDay(offsetDays: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().split('T')[0];
}

describe('buildCaseFinancePipeline', () => {
  it('summarizes pending case revenue and case funds coherently', () => {
    const overview = buildCaseFinancePipeline(
      [
        {
          id: 'case-1',
          nombre_apellido: 'Ana Perez',
          materia: 'Jubilaciones',
          materia_otro: null,
          socio: 'Rodrigo',
          fecha: isoDay(-15),
          captadora: null,
          modalidad_pago: 'En cuotas',
          pago_unico_pagado: null,
          pago_unico_fecha: null,
          total_acordado: 300000,
          total_cobrado: 100000,
          saldo_pendiente: 200000,
        },
        {
          id: 'case-2',
          nombre_apellido: 'Luis Gomez',
          materia: 'Otro',
          materia_otro: 'Laboral',
          socio: 'Noelia',
          fecha: isoDay(0),
          captadora: 'Milagros - La Quiaca',
          modalidad_pago: 'Único',
          pago_unico_pagado: false,
          pago_unico_fecha: null,
          total_acordado: 50000,
          total_cobrado: 0,
          saldo_pendiente: 50000,
        },
      ],
      [
        { id: 'cuota-1', caso_id: 'case-1', fecha: isoDay(-5), monto: 80000, estado: 'Pendiente' },
        { id: 'cuota-2', caso_id: 'case-1', fecha: isoDay(45), monto: 120000, estado: 'Pendiente' },
        { id: 'cuota-3', caso_id: 'case-1', fecha: isoDay(-30), monto: 100000, estado: 'Pagado' },
      ],
      [
        { caso_id: 'case-1', tipo: 'deposito', monto: 1000, moneda: 'ARS', fecha: isoDay(0) },
        { caso_id: 'case-1', tipo: 'gasto', monto: 250, moneda: 'ARS', fecha: isoDay(1) },
        { caso_id: 'case-2', tipo: 'deposito', monto: 100, moneda: 'USD', fecha: isoDay(0) },
      ],
      3,
    );

    expect(overview.summary.totalAgreed).toBe(350000);
    expect(overview.summary.totalAgreedNet).toBe(340000);
    expect(overview.summary.totalCollected).toBe(100000);
    expect(overview.summary.totalCollectedNet).toBe(100000);
    expect(overview.summary.totalPending).toBe(250000);
    expect(overview.summary.totalPendingNet).toBe(240000);
    expect(overview.summary.pendingInstallments).toBe(2);
    expect(overview.summary.pendingSinglePayments).toBe(1);
    expect(overview.summary.overdueCount).toBe(1);
    expect(overview.summary.overdueAmount).toBe(80000);
    expect(overview.summary.overdueNetAmount).toBe(80000);
    expect(overview.summary.dueNext30Days).toBe(50000);
    expect(overview.summary.dueNext30DaysNet).toBe(40000);
    expect(overview.monthlyCollectionsNet.reduce((sum, item) => sum + item.value, 0)).toBe(240000);
    expect(overview.fundsByCurrency.ARS.disponible).toBe(750);
    expect(overview.fundsByCurrency.USD.disponible).toBe(100);
    expect(overview.pendingItems[0]).toMatchObject({
      casoId: 'case-1',
      type: 'cuota',
      overdue: true,
    });
  });
});