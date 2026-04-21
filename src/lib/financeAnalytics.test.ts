import { describe, expect, it, vi } from 'vitest';
import { buildFinanceOverview, buildRepartoOverview, type ExpenseLike } from './financeAnalytics';
import type { Ingreso } from '../types/database';
import { resolveOperationalSocio } from './operationalSocios';

describe('buildRepartoOverview', () => {
  it('distributes only the available pool between base and performance shares', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));

    const ingresos: Ingreso[] = [
      {
        id: 'ing-1',
        caso_id: null,
        fecha: '2026-04-10',
        cliente_nombre: 'Cliente A',
        materia: 'Jubilaciones',
        concepto: 'Honorarios',
        monto_total: 300000,
        monto_cj_noa: 300000,
        comision_captadora: 0,
        captadora_nombre: null,
        socio_cobro: 'Noelia',
        modalidad: 'Transferencia',
        notas: null,
        es_manual: true,
        created_at: '2026-04-10T00:00:00Z',
        created_by: null,
        updated_by: null,
      },
      {
        id: 'ing-2',
        caso_id: null,
        fecha: '2026-04-11',
        cliente_nombre: 'Cliente B',
        materia: 'Sucesorios',
        concepto: 'Honorarios',
        monto_total: 100000,
        monto_cj_noa: 100000,
        comision_captadora: 0,
        captadora_nombre: null,
        socio_cobro: 'Fabricio',
        modalidad: 'Efectivo',
        notas: null,
        es_manual: true,
        created_at: '2026-04-11T00:00:00Z',
        created_by: null,
        updated_by: null,
      },
    ];

    const expenses: ExpenseLike[] = [
      {
        source: 'operativo',
        fecha: '2026-04-12',
        concepto: 'Servicios: Internet',
        monto: 80000,
        responsable: 'Noelia',
        modalidad: 'Transferencia',
        cliente_nombre: null,
      },
    ];

    const overview = buildRepartoOverview(ingresos, expenses, 6, ['Noelia', 'Fabricio'], {
      basePct: 0.65,
      rendimientoPct: 0.35,
    });

    expect(overview.global.totalARepartir).toBe(320000);
    expect(overview.global.reparto65).toBe(208000);
    expect(overview.global.reparto35).toBe(112000);
    expect(overview.global.basePorPersona).toBe(104000);

    const noelia = overview.socios.find(item => item.socio === 'Noelia');
    const fabricio = overview.socios.find(item => item.socio === 'Fabricio');

    expect(noelia).toMatchObject({
      ingresoNeto: 300000,
      participacion: 0.75,
      baseAsignada: 104000,
      variableRendimiento: 84000,
      egresosResponsable: 80000,
      montoACobrar: 188000,
    });
    expect(fabricio).toMatchObject({
      ingresoNeto: 100000,
      participacion: 0.25,
      baseAsignada: 104000,
      variableRendimiento: 28000,
      montoACobrar: 132000,
    });
    expect(overview.socios.reduce((sum, socio) => sum + socio.montoACobrar, 0)).toBe(overview.global.totalARepartir);

    const currentMonth = overview.mensual.find(item => item.mes === '2026-04');
    expect(currentMonth?.socios.reduce((sum, socio) => sum + socio.montoACobrar, 0)).toBe(currentMonth?.totalARepartir);

    vi.useRealTimers();
  });

  it('anchors monthly flow series to the latest month with data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));

    const ingresos: Ingreso[] = [
      {
        id: 'old-1',
        caso_id: null,
        fecha: '2025-01-15',
        cliente_nombre: 'Cliente 1',
        materia: 'Jubilaciones',
        concepto: 'Ingreso enero',
        monto_total: 100000,
        monto_cj_noa: 100000,
        comision_captadora: 0,
        captadora_nombre: null,
        socio_cobro: 'Noelia',
        modalidad: 'Transferencia',
        notas: null,
        es_manual: true,
        created_at: '2025-01-15T00:00:00Z',
        created_by: null,
        updated_by: null,
      },
      {
        id: 'old-2',
        caso_id: null,
        fecha: '2025-02-10',
        cliente_nombre: 'Cliente 2',
        materia: 'Sucesorios',
        concepto: 'Ingreso febrero',
        monto_total: 200000,
        monto_cj_noa: 200000,
        comision_captadora: 0,
        captadora_nombre: null,
        socio_cobro: 'Fabricio',
        modalidad: 'Efectivo',
        notas: null,
        es_manual: true,
        created_at: '2025-02-10T00:00:00Z',
        created_by: null,
        updated_by: null,
      },
    ];

    const expenses: ExpenseLike[] = [
      {
        source: 'operativo',
        fecha: '2025-02-15',
        concepto: 'Alquileres: Oficina',
        monto: 50000,
        responsable: 'Noelia',
        modalidad: 'Transferencia',
        cliente_nombre: null,
      },
    ];

    const overview = buildFinanceOverview(ingresos, expenses, 2);

    expect(overview.monthlySeries.map(item => item.income)).toEqual([100000, 200000]);
    expect(overview.monthlySeries.map(item => item.expense)).toEqual([0, 50000]);
    expect(overview.monthlySeries.map(item => item.net)).toEqual([100000, 150000]);

    vi.useRealTimers();
  });

  it('normalizes partner aliases like profile emails to operational socios', () => {
    expect(resolveOperationalSocio('martinalejandroreyes07@gmail.com')).toBe('Alejandro');
    expect(resolveOperationalSocio('reyesfabricio232@gmail.com')).toBe('Fabricio');
    expect(resolveOperationalSocio('Noelia')).toBe('Noelia');
  });

  it('attributes legacy split imports to socios via the Distribucion note', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));

    const baseIngreso = {
      caso_id: null,
      cliente_nombre: 'Cliente Compartido',
      materia: 'Jubilaciones',
      concepto: 'Ingreso importado',
      comision_captadora: 0,
      captadora_nombre: null,
      modalidad: 'Transferencia' as const,
      es_manual: false,
      created_at: '2026-04-10T00:00:00Z',
      created_by: null,
      updated_by: null,
    };

    const ingresos: Ingreso[] = [
      {
        ...baseIngreso,
        id: 'split-1',
        fecha: '2026-04-10',
        monto_total: 432000,
        monto_cj_noa: 432000,
        socio_cobro: null,
        notas: 'Hoja: abril | Distribucion: Noelia 144000, Fabricio 144000, Alejandro 144000',
      },
    ];

    const overview = buildRepartoOverview(ingresos, [], 6, ['Noelia', 'Fabricio', 'Alejandro'], {
      basePct: 0.65,
      rendimientoPct: 0.35,
    });

    expect(overview.global.totalIngresos).toBe(432000);
    expect(overview.global.totalARepartir).toBe(432000);

    const noelia = overview.socios.find(item => item.socio === 'Noelia');
    const fabricio = overview.socios.find(item => item.socio === 'Fabricio');
    const alejandro = overview.socios.find(item => item.socio === 'Alejandro');

    // Each socio took 1/3 of the imported pool, so per-socio income must reflect that.
    expect(noelia?.ingresoNeto).toBeCloseTo(144000, 5);
    expect(fabricio?.ingresoNeto).toBeCloseTo(144000, 5);
    expect(alejandro?.ingresoNeto).toBeCloseTo(144000, 5);

    // Participation must be 1/3 each, and montoACobrar must equal pool / socios.
    expect(noelia?.participacion).toBeCloseTo(1 / 3, 5);
    const totalACobrar = overview.socios.reduce((sum, socio) => sum + socio.montoACobrar, 0);
    expect(totalACobrar).toBeCloseTo(432000, 5);

    vi.useRealTimers();
  });
});