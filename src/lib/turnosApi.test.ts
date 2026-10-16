import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import handler, {
  clasificarRecibo, TIPOS_CONSULTA,
  aMin, limpiarSecreto, camposDeLead, etapaAutomatica, fusionarLead, registrarMensaje, upsertLead, firmaMetaValida, firmaKapsoValida, extraerMensajesKapso, extraerMensajes, aMensajesLLM, procesarMensaje, notaDeImagen, montoValidadoDe, quitarEtiquetas, aMensajesOpenAI, deOpenAI, ejecutarHerramienta, PROMPT_AGENTE, type Deps, telefonoClave, historialDe, inferirNombre, normalizarFecha, normalizarHora, bloquesDelDia, huecosLibres, localDe, resolverProfesional, diaSemanaISO, fechaValida,
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

  it('valida la firma de Kapso (hex, sin prefijo)', () => {
    const raw = '{"a":1}';
    const sig = createHmac('sha256', 'whsec').update(raw).digest('hex');
    expect(firmaKapsoValida('whsec', sig, raw)).toBe(true);
    expect(firmaKapsoValida('whsec', sig, raw + ' ')).toBe(false);
    expect(firmaKapsoValida('otro', sig, raw)).toBe(false);
    expect(firmaKapsoValida('whsec', '', raw)).toBe(false);
  });

  it('extrae mensajes de Kapso: texto, audio, imagen, lote y salientes', () => {
    const conv = { phone_number: '5493885775043', contact_name: 'Jaime' };
    const texto = { phone_number_id: '999371756590594', conversation: conv, message: { id: 'w1', from: '5493885775043', type: 'text', text: { body: 'hola' }, kapso: { direction: 'inbound' } } };
    const r = extraerMensajesKapso(texto);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'w1', from: '5493885775043', nombre: 'Jaime', texto: 'hola', esTexto: true });

    const audio = { conversation: conv, message: { id: 'w2', type: 'audio', audio: { id: 'm1' }, kapso: { direction: 'inbound', media_url: 'https://api.kapso.ai/media/x' } } };
    expect(extraerMensajesKapso(audio)[0]).toMatchObject({ id: 'w2', from: '5493885775043', tipo: 'audio', mediaId: 'm1', mediaUrl: 'https://api.kapso.ai/media/x', esTexto: false });

    const imagen = { conversation: conv, message: { id: 'w3', from: '549', type: 'image', image: { id: 'm2', caption: 'recibo' }, kapso: { media_data: { url: 'https://api.kapso.ai/media/y' } } } };
    expect(extraerMensajesKapso(imagen)[0]).toMatchObject({ tipo: 'image', caption: 'recibo', mediaUrl: 'https://api.kapso.ai/media/y' });

    expect(extraerMensajesKapso({ batch: true, data: [texto, audio] })).toHaveLength(2);
    expect(extraerMensajesKapso({ conversation: conv, message: { ...texto.message, id: 'w4', kapso: { direction: 'outbound' } } })).toEqual([]);
    expect(extraerMensajesKapso({ conversation: conv, message: { ...texto.message, id: 'w5', kapso: { origin: 'business_app' } } })).toEqual([]);
    expect(extraerMensajesKapso({})).toEqual([]);
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
    expect(llamadas).toEqual([{ nombre: 'consultar_disponibilidad', input: { profesional: 'alejandro' }, ctx: { telefono: '5493884867965', conversationId: 'respaldo-5493884867965', montoValidado: null } }]);
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
    for (const k of ['WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'OPENAI_API_KEY', 'api_openai', 'AGENTE_PROMPT']) delete process.env[k];
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
    for (const k of ['META_APP_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'OPENAI_API_KEY', 'api_openai', 'AGENTE_PROMPT']) process.env[k] = 'v';
    const r = await correr('POST', {}, '{"entry":[]}', { 'x-hub-signature-256': 'sha256=00' });
    expect(r.code).toBe(401);
  });

  it('con firma correcta y sin mensajes responde OK', async () => {
    for (const k of ['META_APP_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'OPENAI_API_KEY', 'api_openai', 'AGENTE_PROMPT']) process.env[k] = 'v';
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
  it('lee datos como {value} y mapea alias', () => {
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

  it('el mismo teléfono en otro formato es el mismo lead y la misma conversación, aunque cambie el conversation_id', async () => {
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

describe('leads · turno agendado', () => {
  it('un turno ya agendado lleva al lead a Agendado', async () => {
    const { db, tablas } = dbMemoria({ consultas_agendadas: [{ id: 't1', telefono: '+54 9 388 486-7965' }] });
    await upsertLead(db, '5493884867965', { nombre: 'Juan' });
    expect(tablas.leads[0].etapa).toBe('agendado');
  });
});

describe('api/turnos · inferirNombre', () => {
  it('"me llamo" y "mi nombre es"', () => {
    expect(inferirNombre(undefined, 'Hola, me llamo Diego Da Silva')).toEqual({ nombre: 'Diego', apellido: 'Da Silva' });
    expect(inferirNombre(undefined, 'mi nombre es maria.')).toEqual({ nombre: 'Maria', apellido: undefined });
  });
  it('respuesta suelta cuando el agente preguntó el nombre', () => {
    expect(inferirNombre('¿Cómo te llamás?', 'Diego')).toEqual({ nombre: 'Diego', apellido: undefined });
    expect(inferirNombre('¿Me decís tu nombre y apellido?', 'Juan Pérez')).toEqual({ nombre: 'Juan', apellido: 'Pérez' });
  });
  it('no confunde profesiones ni respuestas comunes', () => {
    expect(inferirNombre(undefined, 'Soy docente')).toBeNull();
    expect(inferirNombre('¿Cómo te llamás?', 'no quiero decirlo ahora')).toBeNull();
    expect(inferirNombre('¿En qué te puedo ayudar?', 'Diego')).toBeNull();
    expect(inferirNombre('¿Cómo te llamás?', 'si')).toBeNull();
  });
});

describe('api/turnos · formatos que puede mandar el agente', () => {
  it('fecha', () => {
    expect(normalizarFecha('2026-10-20')).toBe('2026-10-20');
    expect(normalizarFecha('20/10/2026')).toBe('2026-10-20');
    expect(normalizarFecha('5-3-2026')).toBe('2026-03-05');
  });
  it('hora', () => {
    expect(normalizarHora('10:30')).toBe('10:30');
    expect(normalizarHora('10.30')).toBe('10:30');
    expect(normalizarHora('10:30:00')).toBe('10:30');
    expect(normalizarHora('9')).toBe('09:00');
    expect(normalizarHora('10 hs')).toBe('10:00');
    expect(normalizarHora('10:30 hs')).toBe('10:30');
    expect(normalizarHora('3:30 PM')).toBe('15:30');
    expect(normalizarHora('12:00 AM')).toBe('00:00');
    expect(normalizarHora('12:00 PM')).toBe('12:00');
  });
});


describe('agente · reglas de plata (notaDeImagen)', () => {
  const rec = (a9: number | null, g: number | null = null) => ({ tipo: 'recibo_sueldo' as const, descuento_articulo_9: a9, descuento_ganancias: g, monto: null, destinatario: null });
  const trf = (monto: number | null, destinatario: string | null = 'Arturo Rodrigo Reyes') => ({ tipo: 'transferencia' as const, descuento_articulo_9: null, descuento_ganancias: null, monto, destinatario });

  it('descuento mayor a $100.000: consulta sin cargo', () => {
    const n = notaDeImagen(rec(125000));
    expect(n).toContain('Consulta sin cargo con el Dr. Alejandro Reyes');
    expect(n).not.toContain('$125.000'); // el monto del descuento no le llega al modelo
  });
  it('descuento menor a $100.000: consulta de $100.000 con reserva de $50.000', () => {
    const n = notaDeImagen(rec(45000));
    expect(n).not.toContain('$45.000');
    expect(n).toContain('valor de $100.000');
    expect(n).toContain('reserva de $50.000');
    expect(n).toContain('saldo de $50.000');
  });
  it('exactamente $100.000 no supera el umbral', () => expect(notaDeImagen(rec(100000))).toContain('reserva de $50.000'));
  it('clasifica el recibo por el descuento individual más alto', () => {
    expect(clasificarRecibo(rec(100001))).toMatchObject({ categoria: 'art9_sin_cargo', valor: 0, reserva: 0 });
    expect(clasificarRecibo(rec(100000))).toMatchObject({ categoria: 'art9_con_cargo', valor: 100000, reserva: 50000, descuento: 100000 });
    expect(clasificarRecibo(rec(20000, 130000))).toMatchObject({ categoria: 'art9_sin_cargo', descuento: 130000 });
    expect(clasificarRecibo(rec(null))).toMatchObject({ categoria: 'sin_descuento' });
  });
  it('toma el mayor entre Artículo 9 y Ganancias', () => expect(notaDeImagen(rec(30000, 150000))).toContain('sin cargo'));
  it('sin descuentos', () => expect(notaDeImagen(rec(null))).toContain('No se detectaron descuentos'));
  it('transferencia válida', () => {
    const n = notaDeImagen(trf(250000), 'Arturo Reyes', 50000);
    expect(n).toContain('validado exitosamente por $250.000');
    expect(montoValidadoDe([n])).toBe(250000);
  });
  it('la reserva exigida depende del tipo de consulta', () => {
    expect(montoValidadoDe([notaDeImagen(trf(40000), 'Arturo Reyes', TIPOS_CONSULTA.jubilacion_docente.reserva)])).toBe(40000);
    expect(montoValidadoDe([notaDeImagen(trf(50000), 'Arturo Reyes', TIPOS_CONSULTA.otras_situaciones_anses.reserva)])).toBeNull();
    expect(montoValidadoDe([notaDeImagen(trf(75000), 'Arturo Reyes', TIPOS_CONSULTA.otras_situaciones_anses.reserva)])).toBe(75000);
  });
  it('sin tipo de consulta definido no se valida ninguna transferencia', () => {
    const n = notaDeImagen(trf(250000), 'Arturo Reyes');
    expect(n).toContain('NO dar la seña por pagada');
    expect(montoValidadoDe([n])).toBeNull();
  });
  it('transferencia a otra persona, sin importe o menor a la seña no se da por válida', () => {
    for (const n of [notaDeImagen(trf(250000, 'Juan Pérez'), 'Arturo Reyes'), notaDeImagen(trf(null)), notaDeImagen(trf(20000), 'Arturo Reyes', 50000), notaDeImagen(trf(250000, null), 'Arturo Reyes', 50000)]) {
      expect(n).toContain('NO dar la seña por pagada');
      expect(montoValidadoDe([n])).toBeNull();
    }
  });
  it('imagen que no es recibo ni transferencia', () => {
    expect(notaDeImagen({ tipo: 'otro', descuento_articulo_9: null, descuento_ganancias: null, monto: null, destinatario: null })).toContain('envíe de nuevo');
  });
  it('quita las etiquetas de emoción del texto', () => {
    expect(quitarEtiquetas('[warmly] Hola, buen día. [calm] Le cuento.')).toBe('Hola, buen día. Le cuento.');
    expect(quitarEtiquetas('Turno el [martes] 10:00')).toBe('Turno el [martes] 10:00');
  });
});

describe('agente · OpenAI', () => {
  it('convierte herramientas y resultados al formato de OpenAI', () => {
    const r = aMensajesOpenAI('SYS', [
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: [{ type: 'text', text: 'veo' }, { type: 'tool_use', id: 't1', name: 'consultar_disponibilidad', input: { profesional: 'alejandro' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"ok":1}' }] },
    ]);
    expect(r[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(r[2].tool_calls[0]).toMatchObject({ id: 't1', type: 'function', function: { name: 'consultar_disponibilidad', arguments: '{"profesional":"alejandro"}' } });
    expect(r[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: '{"ok":1}' });
  });
  it('lee la respuesta con herramientas o con texto', () => {
    expect(deOpenAI({ content: 'Hola' })).toEqual({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hola' }] });
    const r = deOpenAI({ content: null, tool_calls: [{ id: 'c1', function: { name: 'agendar_turno', arguments: '{"hora":"10:00"}' } }, { id: 'c2', function: { name: 'x', arguments: 'roto' } }] });
    expect(r.stop_reason).toBe('tool_use');
    expect(r.content[0]).toEqual({ type: 'tool_use', id: 'c1', name: 'agendar_turno', input: { hora: '10:00' } });
    expect(r.content[1].input).toEqual({});
  });
  it('el prompt por defecto trae el flujo del brief y no filtra los precios', () => {
    expect(PROMPT_AGENTE).toContain('asistente virtual del Centro Jurídico NOA');
    expect(PROMPT_AGENTE).toContain('definir_tipo_consulta');
    expect(PROMPT_AGENTE).toContain('NUNCA la pidas de entrada');
    expect(PROMPT_AGENTE).not.toMatch(/\$\s?\d/); // los importes los fija el sistema, no el prompt
  });
});

describe('agente · audio y fotos', () => {
  it('extrae el id de audio e imagen', () => {
    const payload = { entry: [{ changes: [{ value: { messages: [
      { id: 'a', from: '549', type: 'audio', audio: { id: 'AUD1' } },
      { id: 'b', from: '549', type: 'image', image: { id: 'IMG1', caption: 'mi recibo' } },
    ] } }] }] };
    const r = extraerMensajes(payload);
    expect(r[0]).toMatchObject({ tipo: 'audio', mediaId: 'AUD1', esTexto: false });
    expect(r[1]).toMatchObject({ tipo: 'image', mediaId: 'IMG1', caption: 'mi recibo' });
  });

  it('si escribió con audio, contesta con nota de voz; el texto guardado no lleva etiquetas', async () => {
    const { db, estado } = dbConversaciones();
    const audios: string[] = [];
    const { d, enviados } = deps(db, {
      preparar: async () => ({ texto: '[Audio] quiero un turno', esAudio: true }),
      llm: async () => texto('[warmly] Claro, ¿con quién?'),
      enviarAudio: async (_t, x) => { audios.push(x); },
    });
    await procesarMensaje(d, { ...msg, esTexto: false, tipo: 'audio', mediaId: 'A' });
    expect(audios).toEqual(['[warmly] Claro, ¿con quién?']);
    expect(enviados).toHaveLength(0);
    expect(estado.upserts[0].mensajes[0].texto).toBe('[Audio] quiero un turno');
    expect(estado.upserts[0].mensajes[1].texto).toBe('Claro, ¿con quién?');
  });

  it('si falla la voz, contesta por texto', async () => {
    const { db } = dbConversaciones();
    const { d, enviados } = deps(db, {
      preparar: async () => ({ texto: '[Audio] hola', esAudio: true }),
      llm: async () => texto('[calm] Buen día'),
      enviarAudio: async () => { throw new Error('sin saldo de voz'); },
    });
    expect(await procesarMensaje(d, { ...msg, esTexto: false, tipo: 'audio', mediaId: 'A' })).toBe('ok');
    expect(enviados).toEqual(['Buen día']);
  });

  it('si escribió por texto, no manda audio', async () => {
    const { db } = dbConversaciones();
    const { d, enviados } = deps(db, { enviarAudio: async () => { throw new Error('no debería llamarse'); } });
    await procesarMensaje(d, msg);
    expect(enviados).toHaveLength(1);
  });

  it('el comprobante validado llega a las herramientas como importe verificado', async () => {
    const { db } = dbConversaciones();
    const ctxs: any[] = [];
    let n = 0;
    const { d } = deps(db, {
      preparar: async () => ({ texto: '[El cliente envió una foto]\n[SISTEMA ERP: Comprobante de transferencia validado exitosamente por $50.000 hacia Arturo Rodrigo Reyes. Proceder con el agendamiento.]', esAudio: false }),
      llm: async () => (n++ === 0 ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'agendar_turno', input: {} }] } : texto('ok')),
      ejecutar: async (_n, _i, ctx) => { ctxs.push(ctx); return {}; },
    });
    await procesarMensaje(d, { ...msg, esTexto: false, tipo: 'image', mediaId: 'I' });
    expect(ctxs[0].montoValidado).toBe(50000);
  });
});

describe('agente · herramientas', () => {
  it('guardar_datos_cliente completa el lead con el teléfono de WhatsApp', async () => {
    const { db, tablas } = dbMemoria();
    const r = await ejecutarHerramienta(db, 'guardar_datos_cliente', { nombre: 'Ana', dni_o_cuil: '20111222', rama_consulta: 'Artículo 9', clave_anses: 'secreta' }, { telefono: '5493884867965', conversationId: 'c' });
    expect(r).toEqual({ guardado: true });
    expect(tablas.leads[0]).toMatchObject({ nombre: 'Ana', dni_cuil: '20111222', rama: 'Artículo 9' });
    expect(JSON.stringify(tablas.leads[0])).not.toContain('secreta');
  });
  it('definir_tipo_consulta fija valor y reserva en código y los deja en el lead', async () => {
    const { db, tablas } = dbMemoria();
    const r: any = await ejecutarHerramienta(db, 'definir_tipo_consulta', { tipo: 'jubilacion_docente' }, { telefono: '5493884867965', conversationId: 'c' });
    expect(r).toMatchObject({ valor_consulta: 80000, reserva: 40000, saldo_dia_consulta: 40000, abogado: 'Fabricio' });
    expect(r.datos_para_transferir).toContain('centrojuridiconoa680');
    expect(tablas.leads[0].datos).toMatchObject({ tipo_consulta: 'jubilacion_docente', reserva_esperada: 40000 });
    const o: any = await ejecutarHerramienta(db, 'definir_tipo_consulta', { tipo: 'otras_situaciones_anses' }, { telefono: '5493884867965', conversationId: 'c' });
    expect(o).toMatchObject({ valor_consulta: 150000, reserva: 75000, abogado: 'Alejandro' });
    expect(await ejecutarHerramienta(db, 'definir_tipo_consulta', { tipo: 'gratis' }, { telefono: '1', conversationId: 'c' })).toHaveProperty('error');
  });
  it('derivar_a_humano deja el motivo en el lead', async () => {
    const { db, tablas } = dbMemoria();
    const r: any = await ejecutarHerramienta(db, 'derivar_a_humano', { motivo: 'Reclamo por un pago' }, { telefono: '5493884867965', conversationId: 'c' });
    expect(r.derivado).toBe(true);
    expect(tablas.leads[0].datos.derivar_a_humano).toBe('Reclamo por un pago');
  });
  it('herramienta desconocida', async () => {
    const { db } = dbMemoria();
    expect(await ejecutarHerramienta(db, 'borrar_todo', {}, { telefono: '1', conversationId: 'c' })).toEqual({ error: 'Herramienta desconocida: borrar_todo' });
  });
});

describe('agente · comportamiento humano', () => {
  it('marca "escribiendo" y espera 4 a 5 segundos antes de contestar', async () => {
    const { db } = dbConversaciones();
    const orden: string[] = []; const pausas: number[] = [];
    const { d } = deps(db, {
      escribiendo: async () => { orden.push('escribiendo'); },
      pausa: async (ms) => { pausas.push(ms); orden.push('pausa'); },
      enviar: async () => { orden.push('enviar'); },
    });
    await procesarMensaje(d, msg);
    expect(orden[0]).toBe('escribiendo');
    expect(orden[orden.length - 1]).toBe('enviar');
    expect(pausas).toHaveLength(1);
    expect(pausas[0]).toBeGreaterThan(3500);
    expect(pausas[0]).toBeLessThanOrEqual(5000);
  });

  it('si el trabajo ya tardó más de 5 segundos, no espera de más', async () => {
    const { db } = dbConversaciones();
    let ahora = 1_000_000;
    const real = Date.now; Date.now = () => ahora;
    try {
      const pausas: number[] = [];
      const { d } = deps(db, { llm: async () => { ahora += 6000; return texto('ok'); }, pausa: async (ms) => { pausas.push(ms); } });
      await procesarMensaje(d, msg);
      expect(pausas).toHaveLength(0);
    } finally { Date.now = real; }
  });

  it('una foto recibe primero el aviso "Foto recibida" y después la respuesta; el texto no', async () => {
    const { db, estado } = dbConversaciones();
    const { d, enviados } = deps(db, { preparar: async () => ({ texto: '[foto]', esAudio: false }), llm: async () => texto('Listo, lo revisé.') });
    await procesarMensaje(d, { ...msg, esTexto: false, tipo: 'image', mediaId: 'I' });
    expect(enviados).toEqual(['Foto recibida. Estamos revisando, aguarde un instante por favor.', 'Listo, lo revisé.']);
    expect(estado.upserts[0].mensajes.map((x: any) => x.from)).toEqual(['cliente', 'agente', 'agente']);

    const otro = dbConversaciones(); const t = deps(otro.db);
    await procesarMensaje(t.d, msg);
    expect(t.enviados).toEqual(['Hola Juan, ¿con qué profesional?']);
  });

  it('si falla el "escribiendo" igual contesta', async () => {
    const { db } = dbConversaciones();
    const { d, enviados } = deps(db, { escribiendo: async () => { throw new Error('sin permiso'); } });
    expect(await procesarMensaje(d, msg)).toBe('ok');
    expect(enviados).toHaveLength(1);
  });
});
