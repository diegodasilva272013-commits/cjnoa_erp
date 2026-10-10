import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  aMin, bloquesDelDia, firmaValida, huecosLibres, localDe, resolverProfesional, diaSemanaISO, fechaValida,
  type Bloque,
} from '../../api/turnos/[accion]';

const bloque = (o: Partial<Bloque>): Bloque => ({
  dia_semana: null, fecha: null, hora_desde: '09:00', hora_hasta: '11:00', duracion_min: 30, ...o,
});

describe('api/turnos · disponibilidad', () => {
  it('genera slots y descarta los ocupados', () => {
    const libres = huecosLibres([bloque({ dia_semana: 1 })], [{ desde: 9 * 60 + 30, hasta: 10 * 60 }]);
    expect(libres).toEqual(['09:00', '10:00', '10:30']);
  });

  it('un evento largo bloquea todos los slots que pisa', () => {
    const libres = huecosLibres([bloque({ dia_semana: 1 })], [{ desde: 9 * 60 + 15, hasta: 10 * 60 + 15 }]);
    expect(libres).toEqual(['10:30']);
  });

  it('soporta tramos fraccionados y no duplica', () => {
    const libres = huecosLibres(
      [bloque({ dia_semana: 1, hora_desde: '09:00', hora_hasta: '10:00' }), bloque({ dia_semana: 1, hora_desde: '16:00', hora_hasta: '17:00', duracion_min: 60 })],
      [],
    );
    expect(libres).toEqual(['09:00', '09:30', '16:00']);
  });

  it('descarta horarios que ya pasaron hoy', () => {
    expect(huecosLibres([bloque({})], [], 9 * 60 + 30)).toEqual(['10:00', '10:30']);
  });

  it('la fecha puntual reemplaza al recurrente de ese día', () => {
    const rec = bloque({ dia_semana: 2 });
    const punt = bloque({ fecha: '2026-10-20', hora_desde: '15:00', hora_hasta: '16:00' });
    expect(bloquesDelDia([rec, punt], '2026-10-20')).toEqual([punt]);
    expect(bloquesDelDia([rec, punt], '2026-10-27')).toEqual([rec]);
  });

  it('día de la semana ISO y fechas', () => {
    expect(diaSemanaISO('2026-10-19')).toBe(1); // lunes
    expect(diaSemanaISO('2026-10-18')).toBe(7); // domingo
    expect(fechaValida('2026-02-30')).toBe(false);
    expect(fechaValida('2026-10-19')).toBe(true);
  });

  it('hora y zona horaria UTC-3', () => {
    expect(aMin('09:30:00')).toBe(570);
    expect(aMin('25:00')).toBeNull();
    expect(localDe('2026-10-20T02:30:00Z')).toEqual({ fecha: '2026-10-19', min: 23 * 60 + 30 });
  });

  it('solo reconoce Alejandro y Fabricio', () => {
    expect(resolverProfesional('alejandro')).toBe('Alejandro');
    expect(resolverProfesional('Dr. Fabricio Pérez')).toBe('Fabricio');
    expect(resolverProfesional('Rodrigo')).toBeNull();
  });
});

describe('api/turnos · firma post-call', () => {
  const secret = 'whsec_test';
  const body = '{"type":"post_call_transcription"}';
  const now = Date.now();
  const t = Math.floor(now / 1000);
  const v0 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

  it('acepta firma correcta', () => expect(firmaValida(secret, `t=${t},v0=${v0}`, body, now)).toBe(true));
  it('rechaza cuerpo alterado', () => expect(firmaValida(secret, `t=${t},v0=${v0}`, body + ' ', now)).toBe(false));
  it('rechaza firma vieja', () => expect(firmaValida(secret, `t=${t - 4000},v0=${v0}`, body, now)).toBe(false));
  it('rechaza header vacío', () => expect(firmaValida(secret, '', body, now)).toBe(false));
});
