import { describe, it, expect } from 'vitest';
import { planChat, planificar, frena, intercalar, telefonoFormatoERP, normalizarTexto, TOPE_MENSAJES, type ChatExport, type FilaConv, type MsgERP } from './importarChats';

// Datos falsos: teléfono 5493880000001 (clave 3880000001).
const T = (hhmm: string, dia = '2026-10-20') => `${dia}T${hhmm}:00-03:00`;
const ms = (hhmmss: string, dia = '2026-10-20') => Date.parse(`${dia}T${hhmmss}-03:00`);
const chat = (mensajes: ChatExport['mensajes'], tel: string | null = '5493880000001', contacto = '+54 9 388 000-0001'): ChatExport =>
  ({ contacto, telefono: tel, telefono_ultimos10: tel ? tel.slice(-10) : null, sin_telefono: !tel, mensajes });
const fila = (mensajes: MsgERP[], id = 'respaldo-543880000001', clave = '3880000001', nombre: string | null = null): FilaConv =>
  ({ conversation_id: id, telefono: '543880000001', telefono_clave: clave, nombre, mensajes });

describe('importación de chats manuales', () => {
  it('chat existente: carga solo los mensajes que faltan', () => {
    const c = chat([
      { fecha: T('19:00'), de: 'cliente', texto: 'Hola, quiero consultar' },
      { fecha: T('19:01'), de: 'estudio', texto: 'Hola! ¿Es jubilado docente?' },
      { fecha: T('19:05'), de: 'cliente', texto: 'Sí, por ANSES' },
    ]);
    const existentes: MsgERP[] = [
      { from: 'cliente', texto: 'Hola, quiero consultar', at: ms('19:00:12') },
      { from: 'agente', texto: 'Hola! ¿Es jubilado docente?', at: ms('19:01:40') },
    ];
    const p = planChat(c, existentes);
    expect(p.yaEstaban).toBe(2);
    expect(p.nuevos.map(n => n.texto)).toEqual(['Sí, por ANSES']);
    expect(p.final.map(f => f.texto)).toEqual(['Hola, quiero consultar', 'Hola! ¿Es jubilado docente?', 'Sí, por ANSES']);
  });

  it('chat que no existe: se crea una sola fila con el teléfono en el formato del ERP y su lead', () => {
    const plan = planificar([chat([{ fecha: T('10:00'), de: 'cliente', texto: 'Hola' }, { fecha: T('10:01'), de: 'estudio', texto: 'Buen día' }])], [], []);
    expect(plan).toHaveLength(1);
    expect(plan[0].accion).toBe('crear');
    expect(plan[0].conversation_id).toBe('respaldo-543880000001');
    expect(plan[0].crearLead).toBe(true);
    expect(plan[0].nuevos).toHaveLength(2);
    expect(telefonoFormatoERP('5493880000001')).toBe('543880000001');
  });

  it('dos "Si" en el mismo minuto y uno ya está: carga uno', () => {
    const c = chat([
      { fecha: T('19:00'), de: 'cliente', texto: 'Si', ocurrencia: 1 },
      { fecha: T('19:00'), de: 'cliente', texto: 'Si', ocurrencia: 2 },
    ]);
    const p = planChat(c, [{ from: 'cliente', texto: 'Si', at: ms('19:00:30') }]);
    expect(p.yaEstaban).toBe(1);
    expect(p.nuevos).toHaveLength(1);
    expect(p.final).toHaveLength(2);
  });

  it('diferencia de segundos dentro de ±1 minuto: no duplica (y a 2 minutos sí es otro mensaje)', () => {
    const c = chat([{ fecha: T('19:01'), de: 'cliente', texto: 'Ok' }]);
    expect(planChat(c, [{ from: 'cliente', texto: 'Ok', at: ms('19:00:59') }]).nuevos).toHaveLength(0);
    expect(planChat(c, [{ from: 'cliente', texto: 'Ok', at: ms('19:02:05') }]).nuevos).toHaveLength(0);
    expect(planChat(c, [{ from: 'cliente', texto: 'Ok', at: ms('19:03:05') }]).nuevos).toHaveLength(1);
  });

  it('segunda corrida: 0 nuevos', () => {
    const c = chat([
      { fecha: T('19:00'), de: 'cliente', texto: 'Si' },
      { fecha: T('19:00'), de: 'cliente', texto: 'Si' },
      { fecha: T('19:02'), de: 'estudio', texto: 'Perfecto' },
      { fecha: T('19:03'), de: 'cliente', texto: '[Audio: PTT-1.opus]', adjunto: { tipo: 'audio' } },
    ]);
    const primera = planificar([c], [fila([{ from: 'agente', texto: 'Perfecto' }])], []);
    const despues = fila(primera[0].final);
    const segunda = planificar([c], [despues], [{ telefono_clave: '3880000001', nombre: null, apellido: null }]);
    expect(segunda[0].nuevos).toHaveLength(0);
    expect(segunda[0].totalFinal).toBe(primera[0].totalFinal);
    // Lo mismo con un chat que se creó en la primera corrida.
    const creado = planificar([c], [], []);
    expect(planificar([c], [fila(creado[0].final)], [])[0].nuevos).toHaveLength(0);
  });

  it('teléfono con dos filas en el ERP: frena y las lista', () => {
    const plan = planificar([chat([{ fecha: T('10:00'), de: 'cliente', texto: 'Hola' }])],
      [fila([], 'respaldo-543880000001'), fila([], 'respaldo-5493880000001')], []);
    expect(plan[0].accion).toBe('frenar_varias_filas');
    expect(plan[0].detalle).toContain('respaldo-543880000001');
    expect(plan[0].detalle).toContain('respaldo-5493880000001');
    expect(frena(plan)).toHaveLength(1);
  });

  it('mensaje del ERP sin hora: se compara entre el anterior y el siguiente con hora', () => {
    const existentes: MsgERP[] = [
      { from: 'cliente', texto: 'Hola', at: ms('10:00:10') },
      { from: 'agente', texto: 'Buen día, ¿en qué la ayudo?' },
      { from: 'cliente', texto: 'Quiero un turno', at: ms('10:05:00') },
    ];
    const dentro = chat([{ fecha: T('10:02'), de: 'estudio', texto: 'Buen día,  ¿en qué la ayudo?' }]);
    expect(planChat(dentro, existentes).nuevos).toHaveLength(0);
    const fuera = chat([{ fecha: T('11:30'), de: 'estudio', texto: 'Buen día, ¿en qué la ayudo?' }]);
    expect(planChat(fuera, existentes).nuevos).toHaveLength(1);
    // Sin ningún vecino con hora: se compara contra todo el chat.
    expect(planChat(fuera, [{ from: 'agente', texto: 'Buen día, ¿en qué la ayudo?' }]).nuevos).toHaveLength(0);
  });

  it('adjunto del cliente: el "[Audio: …]" del export es el "[Audio] …" del ERP', () => {
    const c = chat([{ fecha: T('11:01'), de: 'cliente', texto: '[Audio: PTT-20261021-WA0000.opus]', adjunto: { tipo: 'audio' } }]);
    const p = planChat(c, [{ from: 'cliente', texto: '[Audio] quería saber el costo', at: ms('11:01:20') }]);
    expect(p.nuevos).toHaveLength(0);
    expect(p.porMedia).toBe(1);
  });

  it('el estudio queda como agente; todo lo importado lleva manual: true', () => {
    const p = planChat(chat([{ fecha: T('09:00'), de: 'estudio', texto: 'Hola' }, { fecha: T('09:01'), de: 'cliente', texto: 'Hola' }]), []);
    expect(p.nuevos[0]).toEqual({ from: 'agente', texto: 'Hola', at: ms('09:00:00'), manual: true });
    expect(p.nuevos[1]).toEqual({ from: 'cliente', texto: 'Hola', at: ms('09:01:00'), manual: true });
  });

  it('intercala por fecha sin mover los existentes', () => {
    const e: MsgERP[] = [{ from: 'cliente', texto: 'a', at: ms('10:00:00') }, { from: 'agente', texto: 'b' }, { from: 'cliente', texto: 'c', at: ms('10:10:00') }];
    const r = intercalar(e, [{ from: 'agente', texto: 'n2', at: ms('10:20:00') }, { from: 'agente', texto: 'n1', at: ms('10:05:00') }]);
    expect(r.map(x => x.texto)).toEqual(['a', 'b', 'n1', 'c', 'n2']);
  });

  it('sin teléfono: se usa la única fila con ese nombre; con ninguna o varias queda sin resolver', () => {
    const hugo = chat([{ fecha: T('16:41', '2026-11-03'), de: 'cliente', texto: 'Hola' }], null, 'Hugo Santi');
    const una = planificar([hugo], [fila([], 'respaldo-543880000009', '3880000009', 'Hugo Santi')], []);
    expect(una[0].accion).toBe('agregar');
    expect(una[0].clave).toBe('3880000009');
    expect(planificar([hugo], [], [])[0].accion).toBe('sin_resolver');
    const dos = planificar([hugo], [fila([], 'a', '3880000009', 'Hugo Santi')], [{ telefono_clave: '3880000008', nombre: 'Hugo', apellido: 'Santi' }]);
    expect(dos[0].accion).toBe('sin_resolver');
  });

  it('si al sumar se pasa del tope de mensajes, frena', () => {
    const existentes: MsgERP[] = Array.from({ length: TOPE_MENSAJES }, (_, i) => ({ from: 'cliente', texto: `m${i}`, at: ms('08:00:00') + i * 60_000 }));
    const plan = planificar([chat([{ fecha: T('20:00', '2026-10-25'), de: 'cliente', texto: 'nuevo' }])], [fila(existentes)], []);
    expect(plan[0].accion).toBe('frenar_tope');
  });

  it('normaliza espacios y caracteres invisibles', () => {
    expect(normalizarTexto('  Hola​  mundo  ')).toBe('Hola mundo');
  });
});
