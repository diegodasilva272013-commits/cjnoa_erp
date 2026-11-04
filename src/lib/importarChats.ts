// Importación de chats de WhatsApp atendidos a mano (export del celular) a conversaciones_whatsapp y leads.
// Lógica pura, sin base: arma el plan (qué se agrega, qué ya estaba, qué frena). La escritura la hace scripts/importar_chats_manuales.ts.

export type MsgExport = { fecha: string; de: 'cliente' | 'estudio'; texto: string; ocurrencia?: number; clave?: string; adjunto?: { tipo: string } | null };
export type ChatExport = { contacto: string; telefono: string | null; telefono_ultimos10: string | null; sin_telefono?: boolean; mensajes: MsgExport[] };
export type MsgERP = { from: 'cliente' | 'agente'; texto: string; at?: number; wid?: string; t?: number | null; humano?: string; manual?: boolean };
export type FilaConv = { conversation_id: string; telefono: string | null; telefono_clave: string | null; nombre: string | null; mensajes: MsgERP[] | null };
export type LeadMin = { telefono_clave: string | null; nombre: string | null; apellido: string | null };

export const TOPE_MENSAJES = 400;
const MIN = 60_000;

/** Sin espacios de más ni caracteres invisibles. */
export function normalizarTexto(s: unknown): string {
  return String(s ?? '')
    .replace(/[​-‍⁠﻿‪-‮⁦-⁩]/g, '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const sinAcentos = (s: string) => normalizarTexto(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Un adjunto del cliente no se compara por texto: el export dice "[Audio: PTT…]" y el ERP guarda "[Audio] transcripción" o "[El cliente envió una foto…]". */
// También el formato del propio export ("[Foto: …]", "[Multimedia omitido]"), para que lo ya importado se reconozca en la corrida siguiente.
const MEDIA_ERP = /^\[(?:Audio\]|El cliente envi[oó]|(?:Audio|Foto|PDF|Sticker|Video|Documento|Imagen|Archivo|Multimedia)\b)/;
const llaveExport = (m: MsgExport) => `${m.de === 'cliente' ? 'cliente' : 'agente'}|${m.de === 'cliente' && m.adjunto ? '#media' : normalizarTexto(m.texto)}`;
const llaveERP = (m: MsgERP) => `${m.from}|${m.from === 'cliente' && MEDIA_ERP.test(normalizarTexto(m.texto)) ? '#media' : normalizarTexto(m.texto)}`;

/** Ventana (en minutos) donde puede estar cada mensaje del ERP: su minuto ±1, o, si no tiene hora, entre el anterior y el siguiente que sí tienen (±1).
 *  Los vecinos de un mensaje sin hora son solo los originales (no los importados): así la ventana no cambia de una corrida a otra. */
export function ventanasERP(ms: MsgERP[]): { lo: number; hi: number; conHora: boolean }[] {
  const minuto = (m: MsgERP) => (typeof m.at === 'number' && !m.manual ? Math.floor(m.at / MIN) : null);
  return ms.map((m, i) => {
    const propio = typeof m.at === 'number' ? Math.floor(m.at / MIN) : null;
    if (propio !== null) return { lo: propio - 1, hi: propio + 1, conHora: true };
    let antes: number | null = null, despues: number | null = null;
    for (let j = i - 1; j >= 0 && antes === null; j--) antes = minuto(ms[j]);
    for (let j = i + 1; j < ms.length && despues === null; j++) despues = minuto(ms[j]);
    return { lo: antes === null ? -Infinity : antes - 1, hi: despues === null ? Infinity : despues + 1, conHora: false };
  });
}

export type PlanChat = { nuevos: MsgERP[]; yaEstaban: number; porMedia: number; final: MsgERP[] };

/** Qué mensajes del export faltan en la fila del ERP (por conteo: cada mensaje existente cubre a uno solo del export) y cómo queda la lista. */
export function planChat(chat: ChatExport, existentes: MsgERP[]): PlanChat {
  const ventanas = ventanasERP(existentes);
  const llaves = existentes.map(llaveERP);
  const usado = new Array(existentes.length).fill(false);
  const nuevos: MsgERP[] = [];
  let yaEstaban = 0, porMedia = 0;
  for (const m of chat.mensajes) {
    const at = Date.parse(m.fecha);
    if (!Number.isFinite(at)) throw new Error(`fecha inválida en ${chat.contacto}: ${m.fecha}`);
    const t = Math.floor(at / MIN), llave = llaveExport(m);
    let mejor = -1, dist = Infinity;
    for (let i = 0; i < existentes.length; i++) {
      if (usado[i] || llaves[i] !== llave || t < ventanas[i].lo || t > ventanas[i].hi) continue;
      // Primero el que tiene hora y está más cerca; uno sin hora solo si no hay otro.
      const d = ventanas[i].conHora ? Math.abs(Math.floor((existentes[i].at as number) / MIN) - t) : 2;
      if (d < dist) { dist = d; mejor = i; }
    }
    if (mejor >= 0) { usado[mejor] = true; yaEstaban++; if (llave.endsWith('|#media')) porMedia++; continue; }
    nuevos.push({ from: m.de === 'cliente' ? 'cliente' : 'agente', texto: m.texto, at, manual: true });
  }
  return { nuevos, yaEstaban, porMedia, final: intercalar(existentes, nuevos) };
}

/** Mete los nuevos por fecha entre los existentes sin mover nunca a los existentes (los que no tienen hora toman la del anterior). */
export function intercalar(existentes: MsgERP[], nuevos: MsgERP[]): MsgERP[] {
  const pend = [...nuevos].sort((a, b) => (a.at as number) - (b.at as number));
  const out: MsgERP[] = [];
  let ultimo = -Infinity, k = 0;
  for (const e of existentes) {
    const t = typeof e.at === 'number' ? e.at : ultimo;
    while (k < pend.length && (pend[k].at as number) < t) out.push(pend[k++]);
    out.push(e);
    ultimo = Math.max(ultimo, t);
  }
  while (k < pend.length) out.push(pend[k++]);
  return out;
}

/** Teléfono con el formato que usan las filas del ERP (54 + área + número, sin el 9). */
export function telefonoFormatoERP(tel: string): string {
  const d = String(tel).replace(/\D/g, '');
  return d.startsWith('549') && d.length === 13 ? '54' + d.slice(3) : d;
}

export type Accion = 'agregar' | 'crear' | 'frenar_varias_filas' | 'frenar_tope' | 'sin_resolver';
export type ItemPlan = {
  contacto: string; clave: string | null; accion: Accion; conversation_id: string | null; telefono: string | null;
  crearLead: boolean; nuevos: MsgERP[]; yaEstaban: number; porMedia: number; totalFinal: number; final: MsgERP[]; detalle?: string;
};

/** Plan completo del export contra lo que hay en la base. */
export function planificar(chats: ChatExport[], convs: FilaConv[], leads: LeadMin[]): ItemPlan[] {
  const porClave = new Map<string, FilaConv[]>();
  for (const c of convs) { const k = c.telefono_clave ?? ''; if (k) porClave.set(k, [...(porClave.get(k) ?? []), c]); }
  const leadClaves = new Set(leads.map(l => l.telefono_clave).filter(Boolean) as string[]);
  return chats.map(chat => {
    let clave = chat.telefono_ultimos10;
    let detalle: string | undefined;
    if (!clave) {
      // Sin teléfono: se busca por nombre; con una sola coincidencia se usa esa, si no queda para resolver a mano.
      const nom = sinAcentos(chat.contacto);
      const hallados = new Set<string>();
      for (const c of convs) if (c.telefono_clave && sinAcentos(c.nombre ?? '') === nom) hallados.add(c.telefono_clave);
      for (const l of leads) if (l.telefono_clave && (sinAcentos(`${l.nombre ?? ''} ${l.apellido ?? ''}`) === nom || sinAcentos(l.nombre ?? '') === nom)) hallados.add(l.telefono_clave);
      if (hallados.size !== 1) return vacio(chat, 'sin_resolver', `sin teléfono; coincidencias por nombre: ${hallados.size}`);
      clave = [...hallados][0];
      detalle = 'sin teléfono, encontrado por nombre';
    }
    const filas = porClave.get(clave) ?? [];
    if (filas.length > 1) return { ...vacio(chat, 'frenar_varias_filas', `${filas.length} filas: ${filas.map(f => f.conversation_id).join(', ')}`), clave };
    const fila = filas[0];
    const p = planChat(chat, fila && Array.isArray(fila.mensajes) ? fila.mensajes : []);
    const telefono = fila?.telefono ?? (chat.telefono ? telefonoFormatoERP(chat.telefono) : null);
    const item: ItemPlan = {
      contacto: chat.contacto, clave, accion: fila ? 'agregar' : 'crear',
      conversation_id: fila?.conversation_id ?? (telefono ? `respaldo-${telefono}` : null), telefono,
      crearLead: !leadClaves.has(clave), nuevos: p.nuevos, yaEstaban: p.yaEstaban, porMedia: p.porMedia, totalFinal: p.final.length, final: p.final, detalle,
    };
    if (p.final.length > TOPE_MENSAJES) return { ...item, accion: 'frenar_tope' };
    return item;
  });
}

function vacio(chat: ChatExport, accion: Accion, detalle: string): ItemPlan {
  return { contacto: chat.contacto, clave: chat.telefono_ultimos10, accion, conversation_id: null, telefono: null, crearLead: false, nuevos: [], yaEstaban: 0, porMedia: 0, totalFinal: 0, final: [], detalle };
}

export const frena = (plan: ItemPlan[]) => plan.filter(p => p.accion === 'frenar_varias_filas' || p.accion === 'frenar_tope');
