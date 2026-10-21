import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import TableroAgente, { formatearTelefono, type PropsTablero } from './TableroAgente';
import AgenteAvatar from './AgenteAvatar';
import type { InformeMejoras, MetricasAgente } from '../../lib/agentesApi';
import { agregarMetricasAgente, personaMetrica, evaluarOptimizaciones } from '../../../api/turnos/[accion]';

const AHORA = Date.parse('2026-10-21T15:00:00Z');
const hace = (h: number) => new Date(AHORA - h * 3600000).toISOString();
const mm = (from: 'cliente' | 'agente', texto: string) => ({ from, texto });
const conv = (mensajes: any[], horas: number, nombre: string) => ({ nombre, mensajes, created_at: hace(horas + 1), updated_at: hace(horas) });

// Las métricas salen del MISMO código del servidor: si el modelo cambia, este test (y el compilador) lo avisan.
const personas = [
  personaMetrica(conv([mm('cliente', 'Hola'), mm('agente', 'Hola, soy el asistente virtual.'), mm('cliente', '[El cliente envió una foto]\n[SISTEMA ERP: Recibo validado correctamente: Criterio aplicado: Consulta sin cargo con el Dr. Alejandro Reyes]'), mm('agente', 'La consulta ya quedó agendada.')], 2, 'Marta Gómez'), { nombre: 'Marta', rama: 'Art 9', datos: {} }, [{ fecha_consulta: '2026-10-27', observaciones: '' }], AHORA),
  personaMetrica(conv([mm('cliente', 'Hola'), mm('agente', 'Hola'), mm('cliente', '58'), mm('agente', 'La consulta vale $80.000 y la reserva $40.000. ¿Prefiere transferencia o efectivo?')], 70, 'Luis Paz'), { nombre: 'Luis', rama: 'docente', datos: {} }, [], AHORA),
  personaMetrica(conv([mm('cliente', 'Hola'), mm('agente', 'Hola, soy el asistente virtual. ¿En qué puedo ayudarle?')], 60, 'Eva Ruiz'), null, [], AHORA),
  personaMetrica(conv([mm('cliente', '[Audio] buen día'), mm('agente', 'Buen día'), mm('cliente', 'necesito ayuda')], 0.1, 'Ana Díaz'), null, [], AHORA),
];
const metricas: MetricasAgente = agregarMetricasAgente(personas, { ahoraMs: AHORA, dias: 30, turnosPorDia: { '2026-10-21': 1 } });
const vacias: MetricasAgente = agregarMetricasAgente([], { ahoraMs: AHORA, dias: 7 });

const informe: InformeMejoras = {
  id: 'i1', creado_at: new Date().toISOString(), fuente: 'reglas', personas: 4, resumen: 'Se encontraron 2 cosas para mejorar a partir de 4 conversaciones.',
  mejoras: [
    { id: 'a', titulo: 'Mejorar el primer mensaje', evidencia: 'Solo 3 de 4 personas contestaron.', cambio: 'Acortar el saludo y hacer una sola pregunta.', impacto: 'alto', afectadas: 1, fuente: 'reglas' },
    { id: 'b', titulo: 'Recibos ilegibles', evidencia: '2 de 5 recibos ilegibles.', cambio: 'Pedir el PDF.', impacto: 'bajo', afectadas: 2, fuente: 'reglas' },
  ],
};

const props = (o: Partial<PropsTablero> = {}): PropsTablero => ({ m: metricas, dias: 30, onDias: () => {}, informe: null, optimizando: false, progreso: null, onOptimizar: () => {}, ...o });
const dibujar = (p: PropsTablero) => renderToStaticMarkup(React.createElement(StaticRouter, { location: '/agente-whatsapp' }, React.createElement(TableroAgente, p)));

describe('tablero de Noa · lo que se ve', () => {
  it('muestra a Noa, su estado y el botón de análisis', () => {
    const html = dibujar(props());
    expect(html).toContain('>Noa<');
    expect(html).toContain('En línea');
    expect(html).toContain('Analizar y proponer mejoras');
    expect(html).toContain('role="img"');
    expect(html).toContain('4 personas');
  });

  it('muestra las cifras y el recorrido con cuántos se pierden en cada paso', () => {
    const html = dibujar(props());
    for (const t of ['Personas que escribieron', 'Mensajes recibidos', 'Mensajes enviados por Noa', 'Contestaron el primer mensaje', 'Agendaron su cita', 'Dieron sus datos', 'Recibieron el valor de la consulta', 'Pagaron la reserva']) expect(html).toContain(t);
    expect(html).toContain('se fueron');
    expect(html).toContain('75%'); // 3 de 4 contestaron
  });

  it('muestra dónde se enfría la conversación y quién espera respuesta', () => {
    const html = dibujar(props());
    expect(html).toContain('¿Dónde se enfría la conversación?');
    expect(html).toContain('Después de preguntarles cómo pagar');
    expect(html).toContain('espera una respuesta de Noa');
  });

  it('muestra lo que mandan, los recibos, los comprobantes y los pagos', () => {
    const html = dibujar(props());
    for (const t of ['Audios', 'Fotos', 'Documentos', 'Recibos de sueldo', 'Consulta sin cargo', 'Comprobantes de pago', 'Links de Mercado Pago enviados', 'se activa al conectar Mercado Pago', 'Datos de pago enviados']) expect(html).toContain(t);
  });

  it('avisa que son pocas conversaciones', () => {
    expect(dibujar(props())).toContain('pocas conversaciones');
  });

  it('muestra la actividad reciente con el estado de cada persona', () => {
    const html = dibujar(props());
    expect(html).toContain('Actividad reciente');
    expect(html).toContain('Agendó su cita');
    expect(html).toContain('Conversando');
    expect(html).toContain('esperando respuesta');
  });

  it('sin análisis previo invita a tocar el botón', () => {
    expect(dibujar(props({ informe: null }))).toContain('Todavía no se analizó nada');
  });

  it('con análisis muestra el resumen, el orden, el impacto y qué cambiar', () => {
    const html = dibujar(props({ informe }));
    expect(html).toContain('Se encontraron 2 cosas para mejorar');
    expect(html).toContain('Mejorar el primer mensaje');
    expect(html).toContain('Impacto alto');
    expect(html).toContain('Impacto bajo');
    expect(html).toContain('Qué cambiar');
    expect(html).toContain('Acortar el saludo');
    expect(html).toContain('Calculado con reglas');
    expect(html).toContain('nada se aplica solo');
    expect(html).toContain('href="/agentes"');
  });

  it('el análisis hecho con IA lo dice', () => {
    expect(dibujar(props({ informe: { ...informe, fuente: 'ia' } }))).toContain('Con IA');
  });

  it('mientras analiza, muestra el progreso real y bloquea el botón', () => {
    const html = dibujar(props({ optimizando: true, progreso: { tarea: 'Buscando dónde se pierde más gente…', porcentaje: 45 } }));
    expect(html).toContain('Buscando dónde se pierde más gente…');
    expect(html).toContain('width:45%');
    expect(html).toContain('Analizando…');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Analizando…/s);
  });

  it('marca el período elegido', () => {
    const html = dibujar(props({ dias: 7 }));
    expect(html).toContain('últimos 7 días');
    expect(dibujar(props({ dias: null }))).toContain('desde el principio');
  });

  it('con cero conversaciones no muestra NaN, undefined ni Infinity', () => {
    const html = dibujar(props({ m: vacias }));
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
    expect(html).toContain('Sin datos todavía');
    expect(html).toContain('Todavía no hay conversaciones que se hayan enfriado');
    expect(html).toContain('Sin conversaciones en este período');
  });

  it('las mejoras que calcula el servidor se pueden mostrar tal cual', () => {
    const mejoras = evaluarOptimizaciones({ ...metricas, personas: 40, primer_contacto: { contestaron: 10, no_contestaron: 30, pct_contestaron: 25 } } as any);
    const html = dibujar(props({ informe: { ...informe, mejoras } }));
    expect(html).toContain('Mejorar el primer mensaje');
    expect(html).toContain('10 de 40');
  });
});

describe('tablero de Noa · la ilustración', () => {
  it('dibuja al agente con auricular y mensajes, y respeta el movimiento reducido', () => {
    const html = renderToStaticMarkup(React.createElement(AgenteAvatar, { activo: true }));
    expect(html).toContain('aria-label="Noa, asistente de WhatsApp"');
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('nw-pulso');
    expect(renderToStaticMarkup(React.createElement(AgenteAvatar, { activo: false }))).not.toContain('class="nw-pulso"');
  });
});

describe('tablero de Noa · números consistentes y sin datos de más', () => {
  it('el número grande de citas es el de personas con cita, el mismo del gráfico', () => {
    const html = dibujar(props());
    expect(html).toContain('Personas con cita agendada');
    expect(html).toContain('con cita');
    expect(html).not.toContain('>Citas agendadas<');
  });

  it('avisa cuando hay más citas que personas', () => {
    const m2: MetricasAgente = { ...metricas, turnos: { ...metricas.turnos, agendados: metricas.estados.agendadas + 2 } };
    expect(dibujar(props({ m: m2 }))).toContain('algunas personas agendaron más de una');
    expect(dibujar(props())).not.toContain('algunas personas agendaron más de una');
  });

  it('no muestra lo de "pasadas a una persona" (todavía no está armado) y sí las reservas pagadas', () => {
    const html = dibujar(props());
    expect(html).not.toContain('Pasadas a una');
    expect(html).toContain('Con reserva pagada');
    expect(html).toContain('Reprogramadas');
    expect(html).toContain('Piden cancelar');
  });
});


describe('tablero de Noa · la tabla de personas', () => {
  const fila = (i: number, o: any = {}) => ({
    nombre: `Persona ${i}`, telefono: `54938800${String(i).padStart(5, '0')}`, whatsapp: `54938800${String(i).padStart(5, '0')}`, primer_mensaje: hace(30), ultimo_mensaje: hace(2),
    recibidos: 4, enviados: 5, contesto: true, estado: 'en_curso' as const, etapa: 'datos', se_enfrio_despues_de: null, esperando_respuesta: false,
    audios: 0, fotos: 0, documentos: 0, recibos: [], comprobantes: [], datos_de_pago: false, link_mp: false, importe_asignado: false, reserva_mp: false, cita: null, campana: null, rama: null, errores: [], ...o,
  });
  const conFilas = (filas: any[]): MetricasAgente => ({ ...metricas, personas_detalle: filas });

  it('muestra a cada persona con su teléfono real y un botón que abre su WhatsApp', () => {
    const html = dibujar(props({ m: conFilas([fila(1, { nombre: 'Marta Gómez', telefono: '5493884867965', whatsapp: '5493884867965' })]) }));
    expect(html).toContain('Todas las personas');
    expect(html).toContain('Marta Gómez');
    expect(html).toContain('+54 9 388 486-7965');
    expect(html).toContain('href="https://wa.me/5493884867965"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Abrir el WhatsApp de Marta Gómez"');
  });

  it('muestra toda la información: actividad, mensajes, cómo va, lo que mandó, pago y cita', () => {
    const html = dibujar(props({ m: conFilas([fila(1, {
      estado: 'agendada', etapa: 'agendada', audios: 2, fotos: 1, recibos: ['con_cargo'], comprobantes: ['validado'], datos_de_pago: true, importe_asignado: true, reserva_mp: true,
      cita: { fecha: '2026-10-28', hora: '10:30', abogado: 'Fabricio', reserva_pagada: true, reprogramada: true, cancelacion: false }, campana: 'DOCENTE', rama: 'jubilación docente',
    }), fila(2, { estado: 'abandonada', contesto: false, se_enfrio_despues_de: 'valor_de_la_consulta', esperando_respuesta: true, errores: ['tuteo'] })]) }));
    for (const t of ['DOCENTE', 'jubilación docente', 'Contestó', 'No contestó', 'Agendó su cita', 'Se enfrió', 'Espera respuesta', 'Llegó a: Agendaron su cita', 'Después de decirles el valor', 'Falló: tutea',
      'Recibo: Consulta con reserva', 'Comprobante: Validado', 'Datos de pago enviados', 'Importe exacto asignado', 'Reserva confirmada', 'Cita 28/10/2026 10:30 · Fabricio', 'reserva pagada', 'reprogramada', 'Sin cita']) expect(html).toContain(t);
  });

  it('trae los filtros con cuántas personas hay en cada uno, para comprobar cada métrica', () => {
    const html = dibujar(props({ m: conFilas([fila(1, { estado: 'agendada' }), fila(2, { contesto: false }), fila(3, { audios: 1 })]) }));
    for (const t of ['Todas', 'Agendaron', 'Conversando', 'Se enfriaron', 'No contestaron', 'Esperan respuesta', 'Mandaron recibo', 'Mandaron comprobante', 'Recibieron datos de pago', 'Mandaron audio', 'Con errores']) expect(html).toContain(t);
    expect(html).toContain('Mostrando 3 de 3');
  });

  it('pagina de a 20 y avisa cuántas hay en total', () => {
    const html = dibujar(props({ m: conFilas(Array.from({ length: 45 }, (_, i) => fila(i))) }));
    expect(html).toContain('Mostrando 20 de 45');
    expect(html).toContain('Mostrar 20 más');
    expect((html.match(/https:\/\/wa\.me\//g) ?? []).length).toBe(20);
  });

  it('sin personas lo dice, y sin NaN ni undefined', () => {
    const html = dibujar(props({ m: conFilas([]) }));
    expect(html).toContain('Todavía no hay personas en este período');
    expect(html).not.toMatch(/NaN|undefined/);
  });

  it('el comprobante del conteo lleva a la tabla y muestra la cuenta', () => {
    const m2: MetricasAgente = { ...metricas, detalle: { filas_en_periodo: 9, de_noa: 7, agente_anterior: 2, fichas_en_periodo: 8, excluidas: [{ nombre: 'Rodrigo Reyes', tel: '***1234', motivo: 'equipo' }], fichas_sin_conversacion: [{ nombre: 'Sin Conversación', tel: '***0077', creada: hace(5) }] } };
    const html = dibujar(props({ m: m2 }));
    expect(html).toContain('Comprobante del conteo');
    expect(html).toContain('Conversaciones con Noa');
    expect(html).toContain('href="#personas"');
    expect(html).toContain('No se cuentan 2 conversaciones del agente anterior (ElevenLabs)');
    expect(html).toContain('1 no tienen conversación con Noa');
    expect(html).toContain('id="personas"');
  });

  it('el teléfono se muestra prolijo, y si no es argentino móvil se muestra con +', () => {
    expect(formatearTelefono('5493884867965')).toBe('+54 9 388 486-7965');
    expect(formatearTelefono('+54 9 388 486-7965')).toBe('+54 9 388 486-7965');
    expect(formatearTelefono('59899123456')).toBe('+59899123456');
    expect(formatearTelefono('')).toBe('—');
  });
});
