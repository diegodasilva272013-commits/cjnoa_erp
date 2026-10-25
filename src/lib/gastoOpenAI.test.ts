import { describe, it, expect } from 'vitest';
import { resumenGasto, saldoEstimado, usd, type UsoOpenAI } from './gastoOpenAI';

const ahora = new Date('2026-10-25T15:00:00Z'); // 12:00 en Jujuy
const fila = (id: number, minutosAtras: number, usdV: number, origen = 'agente', modelo = 'gpt-4o-mini'): UsoOpenAI =>
  ({ id, at: new Date(ahora.getTime() - minutosAtras * 60000).toISOString(), origen, modelo, entrada: 9000, salida: 100, usd: usdV });

describe('gasto de OpenAI · cuentas de la pantalla', () => {
  it('suma lo de hoy, la última hora y el mes con las filas reales', () => {
    const filas = [fila(1, 5, 0.0014), fila(2, 30, 0.002), fila(3, 90, 0.003), fila(4, 60 * 24 * 3, 0.5), fila(5, 60 * 24 * 20, 1)];
    const r = resumenGasto(filas, ahora);
    expect(r.hoy).toBeCloseTo(0.0064, 6);
    expect(r.ultimaHora).toBeCloseTo(0.0034, 6);
    expect(r.llamadasHoy).toBe(3);
    expect(r.tokensHoy).toBe(3 * 9100);
    expect(r.mes).toBeCloseTo(1.5064, 6);
    expect(r.porHora.reduce((a, b) => a + b, 0)).toBeCloseTo(0.0064, 6);
    expect(r.porDia).toHaveLength(14);
  });
  it('agrupa por uso y por modelo, de mayor a menor gasto', () => {
    const r = resumenGasto([fila(1, 5, 1, 'pruebas', 'gpt-4o'), fila(2, 6, 0.1, 'agente'), fila(3, 7, 0.2, 'agente')], ahora);
    expect(r.porOrigen.map(x => x.clave)).toEqual(['pruebas', 'agente']);
    expect(r.porOrigen[1]).toMatchObject({ llamadas: 2 });
    expect(r.porModelo[0].clave).toBe('gpt-4o');
  });
  it('el saldo parte del último saldo anotado y resta lo gastado desde entonces', () => {
    const config = { saldo_inicial: 10, saldo_desde: new Date(ahora.getTime() - 20 * 60000).toISOString() };
    const filas = [fila(1, 5, 0.5), fila(2, 10, 0.25), fila(3, 60, 3)]; // la última es anterior al saldo anotado
    const s = saldoEstimado(config, filas, null);
    expect(s.saldo).toBeCloseTo(9.25, 6);
    expect(s.fuente).toBe('registro');
    expect(saldoEstimado(null, filas, null).saldo).toBeNull();
  });
  it('con el gasto oficial de OpenAI usa el mayor entre el oficial y el medido, y nunca baja de cero', () => {
    const config = { saldo_inicial: 1, saldo_desde: '2026-10-25T10:00:00Z' };
    const s = saldoEstimado(config, [fila(1, 5, 0.1)], { configurado: true, dias: [{ fecha: '2026-10-25', usd: 5 }] });
    expect(s.fuente).toBe('openai');
    expect(s.gastado).toBe(5);
    expect(s.saldo).toBe(0);
  });
  it('formatea el dinero con la precisión que hace falta', () => {
    expect(usd(0.00135, 5)).toContain('0,00135');
    expect(usd(12.5)).toContain('12,50');
  });
});
