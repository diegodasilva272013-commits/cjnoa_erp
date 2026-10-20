import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import OficinaAgentes from './OficinaAgentes';
import { hace, ORDEN_AGENTES, type EstadoAgente } from '../../lib/agentesApi';

const base = (o: Partial<EstadoAgente>): EstadoAgente => ({
  agente: 'analista', nombre: 'Analista', rol: 'Lee las conversaciones', estado: 'inactivo', tarea: 'Esperando conversaciones nuevas', progreso: 0, actualizado_at: new Date().toISOString(), ...o,
});
const dibujar = (agentes: EstadoAgente[]) => renderToStaticMarkup(React.createElement(OficinaAgentes, { agentes }));

describe('agentes · la oficina', () => {
  it('dibuja a los cuatro agentes en cualquier estado sin fallar', () => {
    for (const estado of ['inactivo', 'trabajando', 'pausado', 'error'] as const) {
      const html = dibujar(ORDEN_AGENTES.map(a => base({ agente: a, nombre: a.toUpperCase(), estado })));
      for (const a of ORDEN_AGENTES) expect(html).toContain(a.toUpperCase());
      expect(html).toContain(`ag-${estado}`);
    }
  });

  it('un agente trabajando muestra qué hace, su progreso y se mueve', () => {
    const html = dibujar([base({ estado: 'trabajando', tarea: 'Midiendo el embudo hasta la cita…', progreso: 45 })]);
    expect(html).toContain('Trabajando');
    expect(html).toContain('Midiendo el embudo hasta la cita…');
    expect(html).toContain('width:45%');
    expect(html).toContain('class="ag-progreso ');
    expect(html).toContain('class="ag-brazo-i"');
  });

  it('un agente sin trabajo descansa: se ve dormido y sin barra de progreso', () => {
    const html = dibujar([base({ estado: 'inactivo' })]);
    expect(html).toContain('Descansando');
    expect(html).toContain('class="ag-z"');
    expect(html).not.toContain('class="ag-progreso ');
  });

  it('pausa y error se distinguen', () => {
    expect(dibujar([base({ estado: 'pausado', tarea: 'En pausa' })])).toContain('En pausa');
    expect(dibujar([base({ estado: 'pausado' })])).not.toContain('class="ag-z"');
    expect(dibujar([base({ estado: 'error', tarea: 'Falló: sin saldo' })])).toContain('Con un error');
  });

  it('respeta a quien pidió menos movimiento en su sistema', () => {
    expect(dibujar([base({})])).toContain('prefers-reduced-motion');
  });

  it('el progreso nunca queda en cero visible mientras trabaja', () => {
    expect(dibujar([base({ estado: 'trabajando', progreso: 0 })])).toContain('width:4%');
  });
});

describe('agentes · tiempos legibles', () => {
  it('dice hace cuánto pasó algo', () => {
    const ahora = Date.now();
    expect(hace(new Date(ahora - 2000).toISOString())).toBe('ahora');
    expect(hace(new Date(ahora - 30000).toISOString())).toBe('hace 30 s');
    expect(hace(new Date(ahora - 5 * 60000).toISOString())).toBe('hace 5 min');
    expect(hace(new Date(ahora - 3 * 3600000).toISOString())).toBe('hace 3 h');
    expect(hace(new Date(ahora - 2 * 86400000).toISOString())).toBe('hace 2 d');
    expect(hace(null)).toBe('—');
  });
});
