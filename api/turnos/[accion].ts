import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Puente entre el agente de ElevenLabs y el calendario del ERP.
 * Un solo archivo para no sumar funciones serverless (una ruta dinámica):
 *
 *   GET  /api/turnos/disponibles?profesional=Alejandro&fecha=2026-10-20
 *   POST /api/turnos/agendar
 *   POST /api/turnos/post-call      (webhook de ElevenLabs: transcripción + audio)
 *   GET/POST /api/turnos/respaldo   (agente de respaldo de WhatsApp, ver más abajo; inactivo hasta activarlo)
 *
 * disponibles/agendar: header `Authorization: Bearer <TURNOS_AGENTE_SECRET>` (o `x-api-key`).
 * post-call: firma HMAC de ElevenLabs con ELEVENLABS_WEBHOOK_SECRET.
 *
 * Disponibilidad = horarios que cargan Alejandro/Fabricio (disponibilidad_horarios)
 * menos lo ya ocupado en el sistema: consultas_agendadas, audiencias_general,
 * audiencias (previsional) y eventos_internos. Los turnos se guardan en
 * consultas_agendadas, que es lo que ya muestra el Calendario.
 */

export const config = { api: { bodyParser: false } };

const PROFESIONALES = ['Alejandro', 'Fabricio'] as const;
type Profesional = (typeof PROFESIONALES)[number];

const TZ_OFFSET_MIN = -3 * 60; // America/Argentina/Jujuy, sin horario de verano
const CONSULTA_EXISTENTE_MIN = 30; // consultas_agendadas no guarda duración
const AUDIENCIA_MIN = 60;
const EVENTO_DEFAULT_MIN = 60;
const DIAS_BUSQUEDA = 14;

// ---------------------------------------------------------------- utilidades puras

export function normalizar(v: string | null | undefined) {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function resolverProfesional(v: unknown): Profesional | null {
  const n = normalizar(String(v ?? ''));
  if (!n) return null;
  return PROFESIONALES.find(p => n.includes(normalizar(p))) ?? null;
}

export function nombreEs(nombre: string | null | undefined, prof: Profesional) {
  return normalizar(nombre).includes(normalizar(prof));
}

/** Últimos 10 dígitos de un teléfono (ignora +, espacios, guiones y prefijos 54/9). */
export function telefonoClave(v: unknown) {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-10) : '';
}

export function aMin(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

export function aHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function diaSemanaISO(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0=dom
  return d === 0 ? 7 : d;
}

export function fechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

export function sumarDias(fecha: string, n: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Fecha y minutos locales (UTC-3) de un instante. */
export function localDe(iso: string | Date) {
  const t = new Date(iso).getTime() + TZ_OFFSET_MIN * 60000;
  const d = new Date(t);
  return { fecha: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export type Bloque = { dia_semana: number | null; fecha: string | null; hora_desde: string; hora_hasta: string; duracion_min: number };
export type Ocupado = { desde: number; hasta: number };

/** Bloques que aplican a esa fecha (puntual + recurrente), si hay puntual para el día gana sobre el recurrente. */
export function bloquesDelDia(bloques: Bloque[], fecha: string) {
  const puntuales = bloques.filter(b => b.fecha === fecha);
  if (puntuales.length) return puntuales;
  const dow = diaSemanaISO(fecha);
  return bloques.filter(b => b.fecha === null && b.dia_semana === dow);
}

/** Huecos libres de un día: genera los slots de cada bloque y descarta los que pisan algo ocupado o ya pasaron. */
export function huecosLibres(bloques: Bloque[], ocupados: Ocupado[], minPasado = -1) {
  const out = new Set<number>();
  for (const b of bloques) {
    const desde = aMin(b.hora_desde), hasta = aMin(b.hora_hasta), dur = b.duracion_min;
    if (desde === null || hasta === null || !dur) continue;
    for (let s = desde; s + dur <= hasta; s += dur) {
      if (s <= minPasado) continue;
      const choca = ocupados.some(o => s < o.hasta && o.desde < s + dur);
      if (!choca) out.add(s);
    }
  }
  return [...out].sort((a, b) => a - b).map(aHHMM);
}

// ---------------------------------------------------------------- acceso a datos

type Db = SupabaseClient;

async function bloquesDe(db: Db, prof: Profesional): Promise<Bloque[]> {
  const { data, error } = await db
    .from('disponibilidad_horarios')
    .select('dia_semana, fecha, hora_desde, hora_hasta, duracion_min')
    .eq('profesional', prof);
  if (error) throw new Error(`disponibilidad: ${error.message}`);
  return (data ?? []) as Bloque[];
}

async function ocupadosDelDia(db: Db, prof: Profesional, fecha: string): Promise<Ocupado[]> {
  const out: Ocupado[] = [];
  const diaIni = `${fecha}T00:00:00-03:00`;
  const diaFin = `${sumarDias(fecha, 1)}T00:00:00-03:00`;

  const { data: perfiles, error: ePerf } = await db.from('perfiles').select('id, nombre').ilike('nombre', `%${prof}%`);
  if (ePerf) throw new Error(`perfiles: ${ePerf.message}`);
  const ids = (perfiles ?? []).filter(p => nombreEs(p.nombre, prof)).map(p => p.id as string);

  const [cons, aud, audPrev, evs] = await Promise.all([
    db.from('consultas_agendadas').select('hora_consulta, abogado_asignado').eq('fecha_consulta', fecha),
    ids.length
      ? db.from('audiencias_general').select('fecha').in('abogado_id', ids).gte('fecha', diaIni).lt('fecha', diaFin)
      : Promise.resolve({ data: [], error: null }),
    db.from('audiencias').select('hora, abogado_cargo').eq('fecha', fecha),
    ids.length
      ? db.from('eventos_internos').select('fecha_inicio, fecha_fin, todo_el_dia').in('user_id', ids).gte('fecha_inicio', diaIni).lt('fecha_inicio', diaFin)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Si una fuente falla, no ofrecemos horarios "a ciegas" (salvo eventos_internos, que puede no existir).
  if (cons.error) throw new Error(`consultas_agendadas: ${cons.error.message}`);
  if (aud.error) throw new Error(`audiencias_general: ${aud.error.message}`);
  if (audPrev.error) throw new Error(`audiencias: ${audPrev.error.message}`);
  if (evs.error && !/does not exist|42P01/.test(`${evs.error.code} ${evs.error.message}`)) {
    throw new Error(`eventos_internos: ${evs.error.message}`);
  }

  for (const r of (cons.data ?? []) as any[]) {
    const m = aMin(r.hora_consulta);
    // Turno cargado a mano sin abogado asignado: por las dudas bloquea a ambos (evita doble reserva).
    const sinAbogado = !normalizar(r.abogado_asignado);
    if (m !== null && (sinAbogado || nombreEs(r.abogado_asignado, prof))) out.push({ desde: m, hasta: m + CONSULTA_EXISTENTE_MIN });
  }
  for (const r of (aud.data ?? []) as any[]) {
    const l = localDe(r.fecha);
    if (l.fecha === fecha) out.push({ desde: l.min, hasta: l.min + AUDIENCIA_MIN });
  }
  for (const r of (audPrev.data ?? []) as any[]) {
    const m = aMin(r.hora);
    if (m !== null && nombreEs(r.abogado_cargo, prof)) out.push({ desde: m, hasta: m + AUDIENCIA_MIN });
  }
  for (const r of ((evs.data ?? []) as any[])) {
    if (r.todo_el_dia) { out.push({ desde: 0, hasta: 24 * 60 }); continue; }
    const ini = localDe(r.fecha_inicio);
    const fin = r.fecha_fin ? localDe(r.fecha_fin) : null;
    const hasta = fin && fin.fecha === ini.fecha ? fin.min : ini.min + EVENTO_DEFAULT_MIN;
    out.push({ desde: ini.min, hasta: Math.max(hasta, ini.min + 1) });
  }
  return out;
}

async function libresDelDia(db: Db, prof: Profesional, fecha: string, bloques?: Bloque[]) {
  const todos = bloques ?? (await bloquesDe(db, prof));
  const delDia = bloquesDelDia(todos, fecha);
  if (!delDia.length) return [];
  const ahora = localDe(new Date());
  const minPasado = fecha < ahora.fecha ? 24 * 60 : fecha === ahora.fecha ? ahora.min : -1;
  return huecosLibres(delDia, await ocupadosDelDia(db, prof, fecha), minPasado);
}

// ---------------------------------------------------------------- http

function leerCuerpo(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function iguales(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Valores pegados en Vercel suelen traer espacios, saltos de línea o comillas de más. */
export function limpiarSecreto(v: string) {
  return v.trim().replace(/^["']|["']$/g, '').trim();
}

function autorizadoAgente(req: VercelRequest, secretCrudo: string) {
  const secret = limpiarSecreto(secretCrudo);
  const h = String(req.headers.authorization ?? '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : String(req.headers['x-api-key'] ?? '');
  return token.length > 0 && iguales(token.trim(), secret);
}

/** Firma de ElevenLabs: header `elevenlabs-signature: t=<ts>,v0=<hex>` = HMAC-SHA256(secret, `${ts}.${body}`). */
export function firmaValida(secret: string, header: string, body: string, ahoraMs = Date.now()) {
  const partes = Object.fromEntries(header.split(',').map(p => p.trim().split('=') as [string, string]));
  const t = partes.t, v0 = partes.v0;
  if (!t || !v0) return false;
  if (Math.abs(ahoraMs / 1000 - Number(t)) > 30 * 60) return false;
  const esperado = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return iguales(esperado, v0);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const accion = String(Array.isArray(req.query.accion) ? req.query.accion[0] : req.query.accion ?? '');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Faltan variables de entorno de Supabase' });
  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const raw = req.method === 'POST' ? await leerCuerpo(req) : '';

    if (accion === 'post-call') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
      return await postCall(req, res, db, raw);
    }

    if (accion === 'respaldo') return await respaldo(req, res, db, raw);

    if (!['disponibles', 'agendar', 'historial', 'inicio'].includes(accion)) return res.status(404).json({ error: 'Ruta inexistente' });

    const secret = process.env.TURNOS_AGENTE_SECRET;
    if (!secret) return res.status(500).json({ error: 'Falta TURNOS_AGENTE_SECRET' });
    if (!autorizadoAgente(req, secret)) return res.status(401).json({ error: 'No autorizado' });

    if (accion === 'disponibles') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
      return await disponibles(req, res, db);
    }
    if (accion === 'historial') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
      return res.status(200).json(await historialDe(db, req.query.telefono));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    if (accion === 'inicio') return await inicio(res, db, raw);
    return await agendar(res, db, raw);
  } catch (e) {
    console.error('[turnos]', accion, e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Error interno' });
  }
}

type Resp = { code: number; body: any };

export async function disponibilidadDe(db: Db, profesional: unknown, fechaIn: unknown): Promise<Resp> {
  const prof = resolverProfesional(profesional);
  if (!prof) return { code: 400, body: { error: 'profesional debe ser Alejandro o Fabricio' } };
  const fecha = fechaIn ? String(fechaIn) : null;
  if (fecha && !fechaValida(fecha)) return { code: 400, body: { error: 'fecha debe ser YYYY-MM-DD' } };

  const bloques = await bloquesDe(db, prof);
  if (fecha) {
    return { code: 200, body: { profesional: prof, fecha, horarios_disponibles: await libresDelDia(db, prof, fecha, bloques) } };
  }

  // Sin fecha: próximos días con lugar, para que el agente pueda ofrecer opciones.
  const hoy = localDe(new Date()).fecha;
  const dias: { fecha: string; horarios_disponibles: string[] }[] = [];
  for (let i = 0; i < DIAS_BUSQUEDA && dias.length < 5; i++) {
    const f = sumarDias(hoy, i);
    const libres = await libresDelDia(db, prof, f, bloques);
    if (libres.length) dias.push({ fecha: f, horarios_disponibles: libres });
  }
  return { code: 200, body: { profesional: prof, proximos_dias: dias } };
}

async function disponibles(req: VercelRequest, res: VercelResponse, db: Db) {
  const r = await disponibilidadDe(db, req.query.profesional, req.query.fecha);
  return res.status(r.code).json(r.body);
}

async function agendar(res: VercelResponse, db: Db, raw: string) {
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw || '{}'); } catch { return res.status(400).json({ error: 'JSON inválido' }); }
  const p = (b.parameters && typeof b.parameters === 'object' ? b.parameters : b) as Record<string, unknown>;
  const r = await crearTurno(db, p);
  return res.status(r.code).json(r.body);
}

export async function crearTurno(db: Db, p: Record<string, unknown>): Promise<Resp> {
  const s = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

  const prof = resolverProfesional(p.profesional);
  const nombre = s(p.nombre), apellido = s(p.apellido), fecha = s(p.fecha);
  const hMin = aMin(s(p.hora));
  if (!prof) return { code: 400, body: { error: 'profesional debe ser Alejandro o Fabricio' } };
  if (!nombre) return { code: 400, body: { error: 'Falta nombre' } };
  if (!fechaValida(fecha)) return { code: 400, body: { error: 'fecha debe ser YYYY-MM-DD' } };
  if (hMin === null) return { code: 400, body: { error: 'hora debe ser HH:MM' } };
  const hora = aHHMM(hMin);

  const libres = await libresDelDia(db, prof, fecha);
  if (!libres.includes(hora)) {
    return { code: 409, body: { status: 'conflict', mensaje: 'Ese horario ya no está disponible', horarios_disponibles: libres } };
  }

  const pago = p.pago === true || p.pago === 'true' || p.pago_reserva === true || p.pago_reserva === 'true';
  const monto = Math.max(0, Number(p.monto_reserva ?? 0) || 0);
  const modalidadIn = normalizar(s(p.modalidad));
  const modalidad = modalidadIn === 'efectivo' ? 'Efectivo' : modalidadIn === 'transferencia' ? 'Transferencia' : (pago && monto > 0 ? 'Transferencia' : null);

  const { data, error } = await db.from('consultas_agendadas').insert({
    cliente_nombre: [nombre, apellido].filter(Boolean).join(' '),
    telefono: s(p.telefono) || null,
    detalle_consulta: s(p.tema ?? p.detalle) || null,
    socio_carga: prof,
    fecha_carga: localDe(new Date()).fecha,
    fecha_consulta: fecha,
    hora_consulta: hora,
    abogado_asignado: prof,
    monto_reserva: monto,
    monto_a_cancelar: 0,
    reserva_pagada: pago,
    reserva_modalidad: modalidad,
    observaciones: ['Agendado por el agente de IA', /^(presencial|virtual)$/.test(modalidadIn) ? `Modalidad: ${modalidadIn === 'virtual' ? 'Virtual' : 'Presencial'}` : '']
      .filter(Boolean).join(' · '),
    conversation_id: s(p.conversation_id) || null,
    origen: 'agente',
  }).select('id').single();

  if (error) {
    if (error.code === '23505') {
      return { code: 409, body: { status: 'conflict', mensaje: 'Ese horario acaba de ser tomado', horarios_disponibles: await libresDelDia(db, prof, fecha) } };
    }
    throw new Error(`insert consulta: ${error.message}`);
  }
  return {
    code: 200,
    body: {
      status: 'success',
      mensaje: `Turno agendado con ${prof} el ${fecha} a las ${hora}`,
      turno: { id: data.id, profesional: prof, fecha, hora },
    },
  };
}

async function postCall(req: VercelRequest, res: VercelResponse, db: Db, raw: string) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return res.status(500).json({ error: 'Falta ELEVENLABS_WEBHOOK_SECRET' });
  const firma = String(req.headers['elevenlabs-signature'] ?? '');
  if (!firmaValida(limpiarSecreto(secret), firma, raw)) return res.status(401).json({ error: 'Firma inválida' });

  let ev: any;
  try { ev = JSON.parse(raw); } catch { return res.status(400).json({ error: 'JSON inválido' }); }
  const data = ev?.data ?? {};
  const conversationId = typeof data.conversation_id === 'string' ? data.conversation_id : null;

  if (ev?.type === 'post_call_transcription' && conversationId) {
    const mensajes = (Array.isArray(data.transcript) ? data.transcript : [])
      .filter((m: any) => typeof m?.message === 'string' && m.message.trim())
      .map((m: any) => ({
        from: m.role === 'user' ? 'cliente' : 'agente',
        texto: String(m.message).trim(),
        t: typeof m.time_in_call_secs === 'number' ? m.time_in_call_secs : null,
      }));
    const vars = data.conversation_initiation_client_data?.dynamic_variables ?? {};
    const reco = data.analysis?.data_collection_results ?? {};
    const telefono = vars.system__caller_id ?? vars.telefono ?? data.metadata?.phone_call?.external_number ?? reco.telefono?.value ?? null;
    const nombre = vars.nombre ?? reco.nombre?.value ?? reco.nombre_consultante?.value ?? null;

    const { error } = await db.from('conversaciones_whatsapp').upsert({
      conversation_id: conversationId,
      telefono: telefono ? String(telefono) : null,
      nombre: nombre ? String(nombre) : null,
      resumen: data.analysis?.transcript_summary ?? null,
      mensajes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id' });
    if (error) throw new Error(`conversaciones: ${error.message}`);
  } else if (ev?.type === 'post_call_audio' && conversationId) {
    const b64 = data.full_audio ?? data.audio;
    if (typeof b64 === 'string' && b64) {
      const path = `${conversationId}.mp3`;
      const up = await db.storage.from('conversaciones-audio').upload(path, Buffer.from(b64, 'base64'), { contentType: 'audio/mpeg', upsert: true });
      if (up.error) throw new Error(`audio: ${up.error.message}`);
      const { error } = await db.from('conversaciones_whatsapp').upsert(
        { conversation_id: conversationId, audio_path: path, updated_at: new Date().toISOString() },
        { onConflict: 'conversation_id' },
      );
      if (error) throw new Error(`conversaciones audio: ${error.message}`);
    }
  }
  return res.status(200).send('OK');
}

/** Historial del cliente a partir de lo que ya existe (turnos + conversaciones), buscado por teléfono. */
export async function historialDe(db: Db, telefono: unknown) {
  const clave = telefonoClave(telefono);
  const vacio = { tiene_historial: 'false', es_recurrente: 'false', cliente_nombre: '', cliente_historial: '' };
  if (!clave) return vacio;

  const [cons, convs] = await Promise.all([
    db.from('consultas_agendadas')
      .select('cliente_nombre, telefono, fecha_consulta, hora_consulta, abogado_asignado, detalle_consulta, reserva_pagada')
      .not('telefono', 'is', null).order('fecha_consulta', { ascending: false }).limit(2000),
    db.from('conversaciones_whatsapp')
      .select('nombre, telefono, resumen, updated_at')
      .not('telefono', 'is', null).order('updated_at', { ascending: false }).limit(500),
  ]);
  if (cons.error) throw new Error(`historial consultas: ${cons.error.message}`);
  if (convs.error) throw new Error(`historial conversaciones: ${convs.error.message}`);

  const turnos = ((cons.data ?? []) as any[]).filter(r => telefonoClave(r.telefono) === clave);
  const charlas = ((convs.data ?? []) as any[]).filter(r => telefonoClave(r.telefono) === clave);
  if (!turnos.length && !charlas.length) return vacio;

  const nombre = turnos[0]?.cliente_nombre || charlas.find(c => c.nombre)?.nombre || '';
  const partes: string[] = [];
  for (const t of turnos.slice(0, 3)) {
    const f = String(t.fecha_consulta).split('-').reverse().join('/');
    partes.push(`Turno ${f}${t.hora_consulta ? ' ' + String(t.hora_consulta).slice(0, 5) : ''}${t.abogado_asignado ? ' con ' + t.abogado_asignado : ''}`
      + `${t.detalle_consulta ? ` por "${t.detalle_consulta}"` : ''} (${t.reserva_pagada ? 'reserva pagada' : 'reserva sin pagar'})`);
  }
  const resumen = charlas.find(c => c.resumen)?.resumen;
  if (resumen) partes.push(`Última conversación: ${String(resumen).slice(0, 500)}`);

  return {
    tiene_historial: 'true',
    es_recurrente: 'true',
    cliente_nombre: String(nombre),
    cliente_historial: partes.join('. '),
  };
}

/** Pre-call webhook de ElevenLabs: devuelve el historial como dynamic_variables al iniciar la conversación. */
async function inicio(res: VercelResponse, db: Db, raw: string) {
  let b: any = {};
  try { b = JSON.parse(raw || '{}'); } catch { /* sin cuerpo */ }
  const h = await historialDe(db, b?.caller_id ?? b?.telefono);
  return res.status(200).json({ type: 'conversation_initiation_client_data', dynamic_variables: h });
}

// =====================================================================================
// AGENTE DE RESPALDO (WhatsApp ↔ modelo de lenguaje, sin ElevenLabs)
//
//   GET/POST /api/turnos/respaldo   (webhook de WhatsApp Cloud API de Meta)
//
// Está INACTIVO mientras Meta no apunte su webhook acá. Si ElevenLabs falla o se queda sin
// saldo, se cambia la URL del webhook de la app de Meta a esta ruta y el agente sigue
// atendiendo con las mismas reglas y las mismas herramientas (historial, disponibilidad,
// agendar) y las conversaciones quedan en /consultas-whatsapp igual que siempre.
//
// Variables de entorno (Vercel): WHATSAPP_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_TOKEN,
// WHATSAPP_PHONE_ID, ANTHROPIC_API_KEY, RESPALDO_PROMPT (el system prompt del agente).
// Opcionales: RESPALDO_MODELO (default claude-haiku-5-5).
// =====================================================================================

const GRAPH_URL = 'https://graph.facebook.com/v20.0';
const MODELO_DEFAULT = 'claude-haiku-5-5';
const MAX_VUELTAS_HERRAMIENTAS = 5;
const MAX_MENSAJES_CONTEXTO = 24;
const MSG_SIN_RESPUESTA = 'Gracias por escribir al Centro Jurídico NOA. En este momento no podemos atenderlo automáticamente, pero un integrante del equipo le responde a la brevedad.';

export type MsgEntrante = { id: string; from: string; nombre: string | null; texto: string; esTexto: boolean };
export type MsgGuardado = { from: 'cliente' | 'agente'; texto: string; t?: number | null; wid?: string };
type BloqueLLM = { type: string; [k: string]: any };
type MsgLLM = { role: 'user' | 'assistant'; content: string | BloqueLLM[] };

/** Meta firma el cuerpo con `X-Hub-Signature-256: sha256=<hex>` usando el App Secret. */
export function firmaMetaValida(appSecret: string, header: string, raw: string) {
  const m = /^sha256=([0-9a-f]+)$/i.exec(header.trim());
  if (!m) return false;
  return iguales(createHmac('sha256', appSecret).update(raw).digest('hex'), m[1].toLowerCase());
}

/** Mensajes entrantes de un payload de WhatsApp Cloud API. Lo que no es texto se deja marcado. */
export function extraerMensajes(payload: any): MsgEntrante[] {
  const out: MsgEntrante[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      const nombres: Record<string, string> = {};
      for (const c of v?.contacts ?? []) if (c?.wa_id) nombres[c.wa_id] = c?.profile?.name ?? '';
      for (const m of v?.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        const esTexto = m.type === 'text' && typeof m.text?.body === 'string';
        out.push({
          id: String(m.id),
          from: String(m.from),
          nombre: nombres[m.from] || null,
          esTexto,
          texto: esTexto ? String(m.text.body) : `[El cliente envió un mensaje de tipo "${m.type ?? 'desconocido'}" que no puedo leer]`,
        });
      }
    }
  }
  return out;
}

/** Historial guardado → mensajes para el modelo: últimos N, alternando roles y empezando por el cliente. */
export function aMensajesLLM(guardados: MsgGuardado[], max = MAX_MENSAJES_CONTEXTO): MsgLLM[] {
  const out: MsgLLM[] = [];
  for (const g of guardados.slice(-max)) {
    const role: 'user' | 'assistant' = g.from === 'cliente' ? 'user' : 'assistant';
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.content = `${prev.content as string}\n${g.texto}`;
    else out.push({ role, content: g.texto });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export const HERRAMIENTAS_LLM = [
  {
    name: 'consultar_disponibilidad',
    description: 'Horarios libres de Alejandro o Fabricio. Usala SIEMPRE antes de ofrecer un turno. Sin fecha devuelve los próximos días con lugar.',
    input_schema: {
      type: 'object',
      properties: {
        profesional: { type: 'string', enum: ['alejandro', 'fabricio'] },
        fecha: { type: 'string', description: 'YYYY-MM-DD (opcional)' },
      },
      required: ['profesional'],
    },
  },
  {
    name: 'agendar_turno',
    description: 'Registra el turno en el ERP. Usala solo cuando el cliente confirmó día y hora ofrecidos por consultar_disponibilidad. No confirmes el turno al cliente si no devuelve status "success".',
    input_schema: {
      type: 'object',
      properties: {
        profesional: { type: 'string', enum: ['alejandro', 'fabricio'] },
        nombre: { type: 'string' },
        apellido: { type: 'string' },
        fecha: { type: 'string', description: 'YYYY-MM-DD' },
        hora: { type: 'string', description: 'HH:MM' },
        tema: { type: 'string' },
        modalidad: { type: 'string', description: 'Presencial o Virtual' },
        pago: { type: 'boolean', description: 'true SOLO si el cliente ya envió el comprobante de la seña' },
        monto_reserva: { type: 'number' },
      },
      required: ['profesional', 'nombre', 'fecha', 'hora'],
    },
  },
];

export type Deps = {
  db: Db;
  llm: (system: string, mensajes: MsgLLM[]) => Promise<{ stop_reason: string; content: BloqueLLM[] }>;
  enviar: (to: string, texto: string) => Promise<void>;
  ejecutar: (nombre: string, input: any, ctx: { telefono: string; conversationId: string }) => Promise<unknown>;
  prompt: string;
  ahora?: () => Date;
};

export async function ejecutarHerramienta(db: Db, nombre: string, input: any, ctx: { telefono: string; conversationId: string }) {
  if (nombre === 'consultar_disponibilidad') return (await disponibilidadDe(db, input?.profesional, input?.fecha)).body;
  if (nombre === 'agendar_turno') {
    // El teléfono y la conversación salen de WhatsApp, no de lo que diga el modelo.
    return (await crearTurno(db, { ...input, telefono: ctx.telefono, conversation_id: ctx.conversationId })).body;
  }
  return { error: `Herramienta desconocida: ${nombre}` };
}

function sistema(prompt: string, hist: Awaited<ReturnType<typeof historialDe>>, ahora: Date) {
  const l = localDe(ahora);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const dow = new Date(`${l.fecha}T12:00:00Z`).getUTCDay();
  return [
    prompt,
    '',
    '--- CONTEXTO DE ESTA CONVERSACIÓN (lo agrega el sistema) ---',
    `Hoy es ${dias[dow]} ${l.fecha}, hora ${aHHMM(l.min)} (Jujuy). Los turnos solo se ofrecen en fechas futuras.`,
    `{{cliente_nombre}}: ${hist.cliente_nombre}`,
    `{{es_recurrente}}: ${hist.es_recurrente}`,
    `{{tiene_historial}}: ${hist.tiene_historial}`,
    `{{cliente_historial}}: ${hist.cliente_historial}`,
    'Usá las herramientas para disponibilidad y agenda. Respondé siempre en texto plano, corto, sin markdown.',
  ].join('\n');
}

/** Procesa un mensaje entrante: arma contexto, deja al modelo usar herramientas, contesta y guarda la conversación. */
export async function procesarMensaje(deps: Deps, m: MsgEntrante) {
  const { db } = deps;
  const conversationId = `respaldo-${m.from}`;
  const ahora = (deps.ahora ?? (() => new Date()))();

  const { data: fila, error: eLeer } = await db.from('conversaciones_whatsapp')
    .select('mensajes, nombre').eq('conversation_id', conversationId).maybeSingle();
  if (eLeer) throw new Error(`leer conversación: ${eLeer.message}`);
  const previos: MsgGuardado[] = Array.isArray(fila?.mensajes) ? (fila!.mensajes as MsgGuardado[]) : [];
  if (previos.some(x => x.wid === m.id)) return 'duplicado'; // Meta reintenta entregas

  const hist = await historialDe(db, m.from).catch(() => ({ tiene_historial: 'false', es_recurrente: 'false', cliente_nombre: '', cliente_historial: '' }));
  const mensajes: MsgLLM[] = aMensajesLLM([...previos, { from: 'cliente', texto: m.texto }]);

  let respuesta = '';
  try {
    for (let i = 0; i < MAX_VUELTAS_HERRAMIENTAS; i++) {
      const r = await deps.llm(sistema(deps.prompt, hist, ahora), mensajes);
      if (r.stop_reason !== 'tool_use') {
        respuesta = r.content.filter(b => b.type === 'text').map(b => String(b.text)).join('\n').trim();
        break;
      }
      mensajes.push({ role: 'assistant', content: r.content });
      const resultados: BloqueLLM[] = [];
      for (const b of r.content.filter(x => x.type === 'tool_use')) {
        let out: unknown;
        try { out = await deps.ejecutar(b.name, b.input, { telefono: m.from, conversationId }); }
        catch (e) { out = { error: e instanceof Error ? e.message : 'falló la herramienta' }; }
        resultados.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) });
      }
      mensajes.push({ role: 'user', content: resultados });
    }
  } catch (e) {
    console.error('[respaldo] modelo', e);
  }
  if (!respuesta) respuesta = MSG_SIN_RESPUESTA; // nunca dejamos al cliente sin respuesta

  let enviado = true;
  try { await deps.enviar(m.from, respuesta); } catch (e) { enviado = false; console.error('[respaldo] envío', e); }

  const t = ahora.toISOString();
  const guardados: MsgGuardado[] = [
    ...previos,
    { from: 'cliente', texto: m.texto, wid: m.id },
    { from: 'agente', texto: enviado ? respuesta : `[NO ENVIADO] ${respuesta}` },
  ];
  const { error } = await db.from('conversaciones_whatsapp').upsert({
    conversation_id: conversationId,
    telefono: m.from,
    nombre: m.nombre ?? fila?.nombre ?? (hist.cliente_nombre || null),
    mensajes: guardados,
    updated_at: t,
  }, { onConflict: 'conversation_id' });
  if (error) throw new Error(`guardar conversación: ${error.message}`);
  return enviado ? 'ok' : 'no_enviado';
}

async function llamarModelo(system: string, mensajes: MsgLLM[]) {
  const key = limpiarSecreto(process.env.ANTHROPIC_API_KEY ?? '');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: limpiarSecreto(process.env.RESPALDO_MODELO ?? '') || MODELO_DEFAULT,
      max_tokens: 500,
      temperature: 0.25,
      system,
      messages: mensajes,
      tools: HERRAMIENTAS_LLM,
    }),
  });
  if (!r.ok) throw new Error(`modelo ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as { stop_reason: string; content: BloqueLLM[] };
}

async function enviarWhatsApp(to: string, texto: string) {
  const r = await fetch(`${GRAPH_URL}/${limpiarSecreto(process.env.WHATSAPP_PHONE_ID ?? '')}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${limpiarSecreto(process.env.WHATSAPP_TOKEN ?? '')}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: texto.slice(0, 3800) } }),
  });
  if (!r.ok) throw new Error(`whatsapp ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function respaldo(req: VercelRequest, res: VercelResponse, db: Db, raw: string) {
  const env = (k: string) => limpiarSecreto(process.env[k] ?? '');

  // Verificación inicial del webhook (Meta)
  if (req.method === 'GET') {
    const verify = env('WHATSAPP_VERIFY_TOKEN');
    if (!verify) return res.status(500).json({ error: 'Falta WHATSAPP_VERIFY_TOKEN' });
    if (req.query['hub.mode'] === 'subscribe' && iguales(String(req.query['hub.verify_token'] ?? ''), verify)) {
      return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
    }
    return res.status(403).json({ error: 'Verificación inválida' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const faltan = ['META_APP_SECRET', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'ANTHROPIC_API_KEY', 'RESPALDO_PROMPT'].filter(k => !env(k));
  if (faltan.length) return res.status(500).json({ error: `Faltan variables: ${faltan.join(', ')}` });
  if (!firmaMetaValida(env('META_APP_SECRET'), String(req.headers['x-hub-signature-256'] ?? ''), raw)) {
    return res.status(401).json({ error: 'Firma inválida' });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return res.status(400).json({ error: 'JSON inválido' }); }

  const deps: Deps = {
    db,
    llm: llamarModelo,
    enviar: enviarWhatsApp,
    ejecutar: (n, i, c) => ejecutarHerramienta(db, n, i, c),
    prompt: env('RESPALDO_PROMPT'),
  };
  // Secuencial: un mismo cliente puede mandar varios mensajes seguidos y el contexto debe respetar el orden.
  for (const m of extraerMensajes(payload)) {
    try { await procesarMensaje(deps, m); }
    catch (e) { console.error('[respaldo] mensaje', m.id, e); }
  }
  return res.status(200).send('OK'); // siempre 200 para que Meta no reintente en bucle
}
