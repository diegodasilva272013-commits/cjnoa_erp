import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import handler, {
  aMin, limpiarSecreto, camposDeLead, etapaAutomatica, fusionarLead, registrarMensaje, guardarTranscripcion, upsertLead, firmaMetaValida, extraerMensajes, aMensajesLLM, procesarMensaje, type Deps, telefonoClave, historialDe, bloquesDelDia, firmaValida, huecosLibres, localDe, resolverProfesional, diaSemanaISO, fechaValida,
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

describe('api/turnos · historial', () => {
  it('une formatos distintos del mismo teléfono', () => {
    expect(telefonoClave('+54 9 388 486-7965')).toBe(telefonoClave('5493884867965'));
    expect(telefonoClave('5493884867965')).toBe('3884867965');
  });
  it('descarta teléfonos inválidos o vacíos', () => {
    expect(telefonoClave('')).toBe('');
    expect(telefonoClave(null)).toBe('');
    expect(telefonoClave('12345')).toBe('');
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

function dbFalsa(tablas: Record<string, any[]>) {
  const q = (rows: any[]) => {
    const o: any = { not: () => o, eq: () => o, order: () => o, maybeSingle: () => Promise.resolve({ data: null, error: null }), limit: () => Promise.resolve({ data: rows, error: null }) };
    return o;
  };
  return { from: (t: string) => ({ select: () => q(tablas[t] ?? []) }) } as any;
}

describe('api/turnos · historialDe', () => {
  const db = dbFalsa({
    consultas_agendadas: [
      { cliente_nombre: 'Juan Pérez', telefono: '+54 9 388 486-7965', fecha_consulta: '2026-10-20', hora_consulta: '10:30:00', abogado_asignado: 'Alejandro', detalle_consulta: 'Previsional', reserva_pagada: true },
      { cliente_nombre: 'Otro', telefono: '5493884111111', fecha_consulta: '2026-10-21', hora_consulta: '09:00:00', abogado_asignado: 'Fabricio', detalle_consulta: null, reserva_pagada: false },
    ],
    conversaciones_whatsapp: [{ nombre: 'Juan', telefono: '5493884867965', resumen: 'Envió recibo de sueldo', updated_at: '2026-10-09T10:00:00Z' }],
  });

  it('cliente conocido: nombre, recurrente e historial en texto', async () => {
    const h = await historialDe(db, '5493884867965');
    expect(h.es_recurrente).toBe('true');
    expect(h.cliente_nombre).toBe('Juan Pérez');
    expect(h.cliente_historial).toContain('Turno 20/10/2026 10:30 con Alejandro por "Previsional" (reserva pagada)');
    expect(h.cliente_historial).toContain('Envió recibo de sueldo');
    expect(h.cliente_historial).not.toContain('Fabricio');
  });

  it('cliente nuevo o sin teléfono: vacío y no recurrente', async () => {
    expect((await historialDe(db, '5491100000000')).es_recurrente).toBe('false');
    expect((await historialDe(db, undefined)).tiene_historial).toBe('false');
  });
});

describe('api/turnos · limpiarSecreto', () => {
  it('ignora espacios, saltos de línea y comillas', () => {
    expect(limpiarSecreto('abc-123\n')).toBe('abc-123');
    expect(limpiarSecreto('  "abc-123" ')).toBe('abc-123');
    expect(limpiarSecreto("'abc-123'")).toBe('abc-123');
    expect(limpiarSecreto('abc-123')).toBe('abc-123');
  });
});

// ------------------------------------------------------------------ agente de respaldo
function dbConversaciones(inicial: any | null = null) {
  const estado = { fila: inicial as any, upserts: [] as any[] };
  const cadena = (tabla: string) => {
    const c: any = {
      eq: () => c, not: () => c, order: () => c,
      limit: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => Promise.resolve({ data: tabla === 'conversaciones_whatsapp' ? estado.fila : null, error: null }),
    };
    return c;
  };
  const db = {
    from: (tabla: string) => ({
      select: () => cadena(tabla),
      upsert: (row: any) => { estado.upserts.push(row); estado.fila = { mensajes: row.mensajes, nombre: row.nombre }; return Promise.resolve({ error: null }); },
    }),
  } as any;
  return { db, estado };
}

const msg = { id: 'wamid.1', from: '5493884867965', nombre: 'Juan', texto: 'Hola, quiero un turno', esTexto: true };
const texto = (t: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });

function deps(db: any, over: Partial<Deps> = {}) {
  const enviados: string[] = [];
  const d: Deps = {
    db,
    prompt: 'PROMPT',
    ahora: () => new Date('2026-10-12T15:00:00Z'),
    llm: async () => texto('Hola Juan, ¿con qué profesional?'),
    enviar: async (_to, t) => { enviados.push(t); },
    ejecutar: async () => ({}),
    ...over,
  };
  return { d, enviados };
}

describe('respaldo · entrada de WhatsApp', () => {
  it('valida la firma de Meta', () => {
    const raw = '{"a":1}';
    const sig = 'sha256=' + createHmac('sha256', 'app').update(raw).digest('hex');
    expect(firmaMetaValida('app', sig, raw)).toBe(true);
    expect(firmaMetaValida('app', sig, raw + ' ')).toBe(false);
    expect(firmaMetaValida('otra', sig, raw)).toBe(false);
    expect(firmaMetaValida('app', '', raw)).toBe(false);
  });

  it('extrae texto y marca lo que no es texto', () => {
    const payload = { entry: [{ changes: [{ value: {
      contacts: [{ wa_id: '549388', profile: { name: 'Ana' } }],
      messages: [
        { id: 'a', from: '549388', type: 'text', text: { body: 'hola' } },
        { id: 'b', from: '549388', type: 'image' },
      ],
    } }] }] };
    const r = extraerMensajes(payload);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ id: 'a', texto: 'hola', nombre: 'Ana', esTexto: true });
    expect(r[1].esTexto).toBe(false);
    expect(r[1].texto).toContain('image');
    expect(extraerMensajes({})).toEqual([]);
  });

  it('arma el contexto alternando roles y empezando por el cliente', () => {
    const r = aMensajesLLM([
      { from: 'agente', texto: 'bienvenido' },
      { from: 'cliente', texto: 'hola' },
      { from: 'cliente', texto: 'quiero turno' },
      { from: 'agente', texto: 'ok' },
    ]);
    expect(r).toEqual([{ role: 'user', content: 'hola\nquiero turno' }, { role: 'assistant', content: 'ok' }]);
  });
});

describe('respaldo · procesarMensaje', () => {
  it('responde, envía por WhatsApp y guarda la conversación', async () => {
    const { db, estado } = dbConversaciones();
    const { d, enviados } = deps(db);
    expect(await procesarMensaje(d, msg)).toBe('ok');
    expect(enviados).toEqual(['Hola Juan, ¿con qué profesional?']);
    const fila = estado.upserts[0];
    expect(fila.conversation_id).toBe('respaldo-5493884867965');
    expect(fila.telefono).toBe('5493884867965');
    expect(fila.mensajes).toEqual([
      { from: 'cliente', texto: 'Hola, quiero un turno', wid: 'wamid.1' },
      { from: 'agente', texto: 'Hola Juan, ¿con qué profesional?' },
    ]);
  });

  it('usa herramientas y toma el teléfono de WhatsApp, no del modelo', async () => {
    const { db } = dbConversaciones();
    const llamadas: any[] = [];
    let n = 0;
    const { d, enviados } = deps(db, {
      llm: async () => (n++ === 0
        ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'consultar_disponibilidad', input: { profesional: 'alejandro' } }] }
        : texto('Tengo lugar el martes 09:00')),
      ejecutar: async (nombre, input, ctx) => { llamadas.push({ nombre, input, ctx }); return { horarios_disponibles: ['09:00'] }; },
    });
    await procesarMensaje(d, msg);
    expect(llamadas).toEqual([{ nombre: 'consultar_disponibilidad', input: { profesional: 'alejandro' }, ctx: { telefono: '5493884867965', conversationId: 'respaldo-5493884867965' } }]);
    expect(enviados).toEqual(['Tengo lugar el martes 09:00']);
  });

  it('si el modelo falla, igual contesta con un mensaje seguro y guarda la conversación', async () => {
    const { db, estado } = dbConversaciones();
    const { d, enviados } = deps(db, { llm: async () => { throw new Error('sin saldo'); } });
    expect(await procesarMensaje(d, msg)).toBe('ok');
    expect(enviados[0]).toContain('integrante del equipo');
    expect(estado.upserts).toHaveLength(1);
  });

  it('si falla el envío, lo deja registrado como NO ENVIADO', async () => {
    const { db, estado } = dbConversaciones();
    const { d } = deps(db, { enviar: async () => { throw new Error('token vencido'); } });
    expect(await procesarMensaje(d, msg)).toBe('no_enviado');
    expect(estado.upserts[0].mensajes[1].texto).toMatch(/^\[NO ENVIADO\]/);
  });

  it('ignora reintentos de Meta del mismo mensaje', async () => {
    const { db, estado } = dbConversaciones({ mensajes: [{ from: 'cliente', texto: 'x', wid: 'wamid.1' }], nombre: 'Juan' });
    const { d, enviados } = deps(db);
    expect(await procesarMensaje(d, msg)).toBe('duplicado');
    expect(enviados).toHaveLength(0);
    expect(estado.upserts).toHaveLength(0);
  });

  it('una herramienta que falla no corta la conversación', async () => {
    const { db } = dbConversaciones();
    let n = 0;
    const { d, enviados } = deps(db, {
      llm: async () => (n++ === 0
        ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'agendar_turno', input: {} }] }
        : texto('Un integrante del equipo lo contacta en el día.')),
      ejecutar: async () => { throw new Error('db caída'); },
    });
    expect(await procesarMensaje(d, msg)).toBe('ok');
    expect(enviados[0]).toContain('equipo');
  });
});

describe('respaldo · ruta /api/turnos/respaldo', () => {
  const guardar = { ...process.env };
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://localhost:1'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
    for (const k of ['WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'ANTHROPIC_API_KEY', 'RESPALDO_PROMPT']) delete process.env[k];
  });
  afterEach(() => { process.env = { ...guardar }; });

  function correr(method: string, query: Record<string, string>, body = '', headers: Record<string, string> = {}) {
    const { Readable } = require('node:stream');
    const req: any = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { method, query: { accion: 'respaldo', ...query }, headers });
    const out: any = { code: 0, body: undefined };
    const res: any = { status(c: number) { out.code = c; return res; }, json(b: any) { out.body = b; return res; }, send(b: any) { out.body = b; return res; } };
    return handler(req, res).then(() => out);
  }

  it('inactivo y seguro por defecto: sin configurar no responde nada útil', async () => {
    expect((await correr('GET', {})).code).toBe(500);
    expect((await correr('POST', {}, '{}')).code).toBe(500);
  });

  it('verificación de Meta: devuelve el challenge solo con el token correcto', async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'mi-token';
    const ok = await correr('GET', { 'hub.mode': 'subscribe', 'hub.verify_token': 'mi-token', 'hub.challenge': '12345' });
    expect(ok).toEqual({ code: 200, body: '12345' });
    expect((await correr('GET', { 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '1' })).code).toBe(403);
  });

  it('rechaza un POST con firma falsa', async () => {
    for (const k of ['META_APP_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'ANTHROPIC_API_KEY', 'RESPALDO_PROMPT']) process.env[k] = 'v';
    const r = await correr('POST', {}, '{"entry":[]}', { 'x-hub-signature-256': 'sha256=00' });
    expect(r.code).toBe(401);
  });

  it('con firma correcta y sin mensajes responde OK', async () => {
    for (const k of ['META_APP_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'ANTHROPIC_API_KEY', 'RESPALDO_PROMPT']) process.env[k] = 'v';
    const raw = '{"entry":[]}';
    const sig = 'sha256=' + createHmac('sha256', 'v').update(raw).digest('hex');
    expect((await correr('POST', {}, raw, { 'x-hub-signature-256': sig })).code).toBe(200);
  });
});

// ------------------------------------------------------------------ leads
/** Base en memoria que imita lo que usa la API (incluida la columna calculada telefono_clave). */
function dbMemoria(tablas: Record<string, any[]> = {}) {
  const clave = (tel: any) => { const d = String(tel ?? '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-10) : ''; };
  const completar = (row: any) => ('telefono' in row ? { ...row, telefono_clave: clave(row.telefono) } : row);
  for (const k of Object.keys(tablas)) tablas[k] = tablas[k].map(completar); // la base real calcula telefono_clave también en lo que ya existe
  let seq = 0;
  const from = (nombre: string) => {
    const filas = () => (tablas[nombre] ??= []);
    let modo = 'select'; let payload: any; let opts: any; let lim = Infinity;
    const filtros: Array<(r: any) => boolean> = [];
    const ejecutar = () => {
      if (modo === 'insert') { filas().push(completar({ id: `id${++seq}`, ...payload })); return { data: null, error: null }; }
      if (modo === 'upsert') {
        const k = opts.onConflict; const i = filas().findIndex(r => r[k] === payload[k]);
        if (i >= 0) filas()[i] = completar({ ...filas()[i], ...payload }); else filas().push(completar({ id: `id${++seq}`, ...payload }));
        return { data: null, error: null };
      }
      const sel = filas().filter(r => filtros.every(f => f(r)));
      if (modo === 'update') { sel.forEach(r => Object.assign(r, completar({ ...r, ...payload }))); return { data: null, error: null }; }
      return { data: sel.slice(0, lim), error: null };
    };
    const q: any = {
      select: () => q, not: () => q, order: () => q,
      eq: (c: string, v: any) => { filtros.push(r => r[c] === v); return q; },
      limit: (n: number) => { lim = n; return q; },
      insert: (p: any) => { modo = 'insert'; payload = p; return q; },
      update: (p: any) => { modo = 'update'; payload = p; return q; },
      upsert: (p: any, o: any) => { modo = 'upsert'; payload = p; opts = o; return q; },
      maybeSingle: () => Promise.resolve({ data: (ejecutar().data as any[])[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  return { db: { from } as any, tablas };
}

describe('leads · camposDeLead', () => {
  it('lee el Data Collection de ElevenLabs ({value}) y mapea alias', () => {
    const c = camposDeLead({
      nombre_consultante: { value: 'Juan', rationale: 'x' }, apellido: { value: 'Pérez' }, mail: { value: 'j@x.com' },
      dni_o_cuil: { value: '20-12345678-9' }, rama_consulta: { value: 'Artículo 9' }, tipo_tramite_previsional: { value: null },
      campana: { value: 'GANANCIAS' }, calificacion: { value: 'Alto valor' }, requiere_turno: { value: true },
    });
    expect(c).toMatchObject({ nombre: 'Juan', apellido: 'Pérez', email: 'j@x.com', dni_cuil: '20-12345678-9', rama: 'Artículo 9', campana: 'GANANCIAS', calificacion: 'alto_valor', requiere_turno: true });
    expect(c.tipo_tramite).toBeUndefined();
  });

  it('lo desconocido va a datos, lo vacío se ignora y las claves NUNCA se guardan', () => {
    const c = camposDeLead({ es_docente: { value: 'si' }, anio_jubilacion: { value: '2019' }, clave_anses: { value: 'secreta' }, password: 'x', otros: { value: 'null' }, datos_adicionales: 'recibo enviado' });
    expect(c.datos).toEqual({ es_docente: 'si', anio_jubilacion: '2019', datos_adicionales: 'recibo enviado' });
    expect(JSON.stringify(c)).not.toContain('secreta');
  });
});

describe('leads · etapas', () => {
  const base = { tieneTurno: false, calificacion: null, rama: null, dniCuil: null, mensajesCliente: 0 };
  it('sigue las categorías de seguimiento del agente', () => {
    expect(etapaAutomatica({ ...base, mensajesCliente: 1 })).toBe('nuevo');
    expect(etapaAutomatica({ ...base, mensajesCliente: 3 })).toBe('calificacion_a_medias');
    expect(etapaAutomatica({ ...base, mensajesCliente: 3, rama: 'Art 9', dniCuil: '20' })).toBe('califico_sin_horario');
    expect(etapaAutomatica({ ...base, calificacion: 'fuera_avatar' })).toBe('fuera_de_avatar');
    expect(etapaAutomatica({ ...base, tieneTurno: true, calificacion: 'fuera_avatar' })).toBe('agendado');
  });
  it('conserva campaña original y no pisa etapas manuales', () => {
    const ahora = '2026-10-11T10:00:00Z';
    const ex = { telefono: '549388', etapa: 'cliente', campana: 'GANANCIAS', datos: { a: 1 } };
    const f = fusionarLead(ex, '549388', { campana: 'ART', nombre: 'Ana', datos: { b: 2 } }, { tieneTurno: true, mensajesCliente: 5, ahora });
    expect(f.etapa).toBe('cliente');
    expect(f.campana).toBe('GANANCIAS');
    expect(f.nombre).toBe('Ana');
    expect(f.datos).toEqual({ a: 1, b: 2 });
  });
});

describe('leads · registro en tiempo real (registrarMensaje)', () => {
  const p = { conversation_id: 'conv_1', telefono_cliente: '+54 9 388 486-7965', nombre_cliente: 'Juan', apellido: 'Pérez', mensaje: 'Hola, quiero consultar por Ganancias', respuesta_agente: 'Bienvenido, ¿es docente?', campana: 'GANANCIAS' };

  it('crea la conversación y el lead con todos los datos', async () => {
    const { db, tablas } = dbMemoria();
    const r = await registrarMensaje(db, p);
    expect(r).toEqual({ code: 200, body: { registrado: true, conversation_id: 'conv_1' } });
    expect(tablas.conversaciones_whatsapp[0].mensajes).toEqual([
      { from: 'cliente', texto: 'Hola, quiero consultar por Ganancias' },
      { from: 'agente', texto: 'Bienvenido, ¿es docente?' },
    ]);
    expect(tablas.conversaciones_whatsapp[0].nombre).toBe('Juan Pérez');
    expect(tablas.leads).toHaveLength(1);
    expect(tablas.leads[0]).toMatchObject({ nombre: 'Juan', apellido: 'Pérez', campana: 'GANANCIAS', etapa: 'nuevo', telefono_clave: '3884867965' });
  });

  it('cada mensaje se agrega; un reintento idéntico no duplica', async () => {
    const { db, tablas } = dbMemoria();
    await registrarMensaje(db, p);
    await registrarMensaje(db, { ...p, mensaje: 'Soy docente', respuesta_agente: '¿Qué año se jubiló?' });
    await registrarMensaje(db, { ...p, mensaje: 'Soy docente', respuesta_agente: '¿Qué año se jubiló?' });
    expect(tablas.conversaciones_whatsapp[0].mensajes).toHaveLength(4);
    expect(tablas.leads).toHaveLength(1);
    expect(tablas.leads[0].etapa).toBe('calificacion_a_medias'); // 2 mensajes del cliente
  });

  it('el mismo teléfono en otro formato es el mismo lead y la misma conversación, aunque ElevenLabs cambie el conversation_id', async () => {
    const { db, tablas } = dbMemoria();
    await registrarMensaje(db, p);
    await registrarMensaje(db, { ...p, conversation_id: 'conv_2', telefono_cliente: '5493884867965', campana: 'ART', email: 'j@x.com' });
    expect(tablas.leads).toHaveLength(1);
    expect(tablas.leads[0].email).toBe('j@x.com');
    expect(tablas.leads[0].campana).toBe('GANANCIAS'); // se conserva la campaña del primer contacto
    expect(tablas.conversaciones_whatsapp).toHaveLength(1); // una persona = una conversación
    expect(tablas.conversaciones_whatsapp[0].mensajes).toHaveLength(2);
  });

  it('sin conversation_id ni teléfono responde 400', async () => {
    expect((await registrarMensaje(dbMemoria().db, { mensaje: 'hola' })).code).toBe(400);
  });

  it('si el lead falla, la conversación igual se guarda', async () => {
    const { db, tablas } = dbMemoria();
    const orig = db.from;
    db.from = (n: string) => { if (n === 'leads') throw new Error('tabla leads no existe'); return orig(n); };
    expect((await registrarMensaje(db, p)).code).toBe(200);
    expect(tablas.conversaciones_whatsapp).toHaveLength(1);
  });
});

describe('leads · post-llamada de ElevenLabs', () => {
  const data = {
    transcript: [{ role: 'user', message: 'Hola' }, { role: 'agent', message: 'Bienvenido' }, { role: 'user', message: 'Quiero info' }],
    analysis: { transcript_summary: 'Consulta por Art. 9', data_collection_results: { nombre_consultante: { value: 'Juan' }, rama_consulta: { value: 'Artículo 9' }, campana: { value: 'ARTICULO9' }, clave_anses: { value: 'secreta' } } },
    conversation_initiation_client_data: { dynamic_variables: { system__caller_id: '5493884867965' } },
  };

  it('guarda el chat completo y completa el lead; el audio y los datos previos no se pisan', async () => {
    const { db, tablas } = dbMemoria({ conversaciones_whatsapp: [{ id: 'x', conversation_id: 'conv_1', telefono: '5493884867965', nombre: 'Juan Pérez', audio_path: 'conv_1.mp3', mensajes: [] }] });
    await guardarTranscripcion(db, 'conv_1', data);
    const c = tablas.conversaciones_whatsapp[0];
    expect(c.mensajes).toHaveLength(3);
    expect(c.audio_path).toBe('conv_1.mp3');
    expect(c.resumen).toBe('Consulta por Art. 9');
    expect(tablas.leads[0]).toMatchObject({ rama: 'Artículo 9', campana: 'ARTICULO9', resumen: 'Consulta por Art. 9' });
    expect(JSON.stringify(tablas.leads[0])).not.toContain('secreta');
  });

  it('un post-llamada sin teléfono no borra el que ya estaba', async () => {
    const { db, tablas } = dbMemoria({ conversaciones_whatsapp: [{ id: 'x', conversation_id: 'conv_1', telefono: '5493884867965', mensajes: [] }] });
    await guardarTranscripcion(db, 'conv_1', { transcript: [{ role: 'user', message: 'Hola' }] });
    expect(tablas.conversaciones_whatsapp[0].telefono).toBe('5493884867965');
    expect(tablas.leads ?? []).toHaveLength(0); // sin teléfono no hay lead
  });

  it('un turno ya agendado lleva al lead a Agendado', async () => {
    const { db, tablas } = dbMemoria({ consultas_agendadas: [{ id: 't1', telefono: '+54 9 388 486-7965' }] });
    await upsertLead(db, '5493884867965', { nombre: 'Juan' });
    expect(tablas.leads[0].etapa).toBe('agendado');
  });
});
