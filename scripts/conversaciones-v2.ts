// Corre DENTRO de Vercel (con la clave de OpenAI de Vercel) cuando el build se pide con --build-env RUN_V2_REAL=1.
// Verifica la v2 completa (extractor + director + redactor + verificador con gpt-4o-mini REAL) con conversaciones de mensajes fijos (C1..C4, A, X)
// y con personas simuladas (B1..B10: la persona la hace gpt-4o-mini, que sigue la charla como una persona real hasta que agenda, la derivan o se cierra).
// Imprime todo como lo vería la persona, con la traza de cada turno. Nunca imprime claves ni variables de entorno.
// Variables opcionales: V2_CONVERSACIONES=C1,A,B1,... · V2_MAX_USD=0.30 · V2_ETIQUETA=nombre-del-uso · V2_MENSAJES=a|b|c (conversación X)
import { createClient } from '@supabase/supabase-js';
import { chatAgentePaso, fijarDbUso, fijarOrigenUso, funcionesV2, usoOpenAI, horasEnTexto, horasSinDia, REGEX_PROMESAS, leerEstadoV2, costoUsd, registrarUso } from '../api/turnos/[accion]';

const log = (...a: unknown[]) => console.log('[V2]', ...a);
const silencio = console.error;
console.error = () => {};

const CONVERSACIONES: Record<string, { titulo: string; mensajes: string[] }> = {
  C1: {
    titulo: 'Art. 9 completo',
    mensajes: ['Hola, soy docente jubilada por ANSES y me descuentan ganancias', 'Quiero que dejen de sacarme plata, es injusto', 'Nunca hice nada, no sabía que se podía reclamar', 'Sí, me interesa', 'Virtual', 'Sí', 'El primero', 'María López'],
  },
  C2: { titulo: 'No califica', mensajes: ['No soy docente, era administrativa, me jubilé por ANSES y me descuentan ganancias'] },
  C3: { titulo: 'Palabra de compra', mensajes: ['Me preocupa que me sigan sacando plata todos los meses', 'Soy maestra jubilada de ANSES'] },
  C4: { titulo: 'Mensaje largo', mensajes: ['hola mire yo fui maestra 30 años en una escuela de palpala me jubile por anses y ahora me retienen del haber todos los meses y no se que hacer'] },
  A: {
    titulo: 'A · agenda, pregunta por la conexión, reprograma y cancela',
    mensajes: ['HOLA', 'SOBRE EL ARTICULO 9', 'SI', 'SI', 'SI', 'virtual', 'martes 27', 'Diego Da Silva', 'por donde es?', 'quiero cambiar la fecha', 'el jueves', 'el primero', 'al final quiero cancelar', 'no, cancelalo igual'],
  },
  D1: {
    titulo: 'D1 · el chat que falló: presencial con tipeo, mañana, qué horarios tenés, en la mañana',
    mensajes: ['hola', 'art 9', 'si', 'si', 'si', 'donde seria si fuera presencial?', 'precencial', 'mañana', 'que horarios tenes?', 'en la mañana', 'el primero', 'Diego Da Silva'],
  },
  D3: {
    titulo: 'D3 · presencial, "mañana" elige el horario del día siguiente, da el nombre',
    mensajes: ['hola', 'art 9', 'si', 'si', 'si', 'precencial', 'mañana', 'Diego Da Silva'],
  },
  D2: {
    titulo: 'D2 · el chat que falló: quiero una llamada virtual, qué horarios tienen, por la mañana',
    mensajes: ['hola soy docente jubilada de ANSES y me descuentan ganancias', 'quiero una llamada virtual', 'que horarios tienen?', 'por la mañana', 'el primero', 'Marta Pérez'],
  },
  X: { titulo: 'Conversación a medida (V2_MENSAJES, separada por |)', mensajes: (process.env.V2_MENSAJES ?? '').split('|').map(x => x.trim()).filter(Boolean) },
};

// Personas simuladas: el primer mensaje es fijo; el resto lo escribe gpt-4o-mini siguiendo el perfil y la guía.
type Persona = { titulo: string; semilla: string; nombre: string; perfil: string; guia: string };
const PERSONAS: Record<string, Persona> = {
  B1: { titulo: 'maestra jubilada que pregunta cuánto sale', semilla: 'hola soy maestra jubilada me sacan plata todos los meses del recibo cuanto sale la consulta', nombre: 'Marta Pérez', perfil: 'Sos docente jubilada por ANSES y te descuentan ganancias del haber.', guia: 'Después de que te contesten cuánto sale, seguí el curso normal: querés que no te descuenten más. Elegí consulta virtual y seguí hasta agendar.' },
  B2: { titulo: 'no sabe si se jubiló por ANSES o por la provincia', semilla: 'no se si me jubile por anses o por la provincia', nombre: 'Elena Ruiz', perfil: 'Fuiste maestra y te jubilaste hace años. En realidad cobrás de ANSES pero no lo tenés claro. Si te preguntan con qué entidad cobrás o si el recibo dice ANSES, lo mirás y decís que dice ANSES. Sos docente y te descuentan ganancias.', guia: 'Seguí el curso normal hasta agendar (virtual).' },
  B3: { titulo: 'lo tengo que pensar', semilla: 'hola soy docente jubilada de ANSES y me descuentan ganancias', nombre: 'Lidia Gómez', perfil: 'Sos docente jubilada por ANSES y te descuentan ganancias.', guia: 'Cuando te ofrezcan la consulta, respondé exactamente: lo tengo que pensar. Si te preguntan qué te hace dudar, decí que no estás segura de que sirva para algo y que ya probaste antes sin suerte. Después de que te contesten con calma, aceptá la consulta, elegí virtual y seguí hasta agendar.' },
  B4: { titulo: 'desconfiada: es una estafa', semilla: 'esto es una estafa? quien sos vos', nombre: 'Norma Vega', perfil: 'Sos desconfiada. Sos docente jubilada por ANSES y te descuentan ganancias.', guia: 'Después de que te expliquen quién es el agente y del estudio, quedás más tranquila: contás que sos docente jubilada de ANSES y que te descuentan ganancias. Seguí el curso normal hasta agendar (virtual).' },
  B5: { titulo: 'sos un robot?', semilla: 'sos un robot?', nombre: 'Carmen Sosa', perfil: 'Sos docente jubilada por ANSES y te descuentan ganancias.', guia: 'Después de la respuesta, decí que querés consultar por lo de los descuentos de ganancias. Seguí el curso normal hasta agendar (presencial).' },
  B6: { titulo: 'divorcio (fuera de alcance)', semilla: 'y por un divorcio me pueden ayudar?', nombre: 'Julia Paz', perfil: 'Querés saber si el estudio te ayuda con un divorcio.', guia: 'Después de que te digan que no atienden eso, agradecé y despedite.' },
  B7: { titulo: 'ningún horario sirve, tiene a la tarde', semilla: 'hola soy docente jubilada de ANSES y me descuentan ganancias quiero la consulta', nombre: 'Silvia Torres', perfil: 'Sos docente jubilada por ANSES y te descuentan ganancias.', guia: 'Elegí consulta virtual. Cuando te ofrezcan dos horarios decí exactamente: ninguno de esos me sirve, tiene a la tarde? Después elegí uno de los dos horarios de tarde y seguí hasta agendar.' },
  B8: { titulo: 'administrativa, no docente', semilla: 'era administrativa en la escuela, no docente', nombre: 'Rita Luna', perfil: 'Fuiste administrativa en una escuela, te jubilaste por ANSES y te descuentan ganancias.', guia: 'Después de que te expliquen, preguntá si hay otra forma de reclamar, y despedite cuando te respondan.' },
  B9: { titulo: 'quiere jubilarse (video)', semilla: 'quiero jubilarme, tengo 58 y sigo dando clases', nombre: 'Rosa Díaz', perfil: 'Sos docente en actividad, tenés 58 años y sigo trabajando como docente.', guia: 'Contestá lo que te pregunten. Cuando te manden el video, decí que lo viste y despedite.' },
  // Segunda campaña: jubilación y compra de aportes (Ley 27.705), con el Dr. Fabricio Reyes; se abona en el estudio.
  J1: { titulo: 'jubilación · mujer de 54 a la que le faltan aportes', semilla: 'hola vi lo de la compra de aportes, me van a faltar años para jubilarme', nombre: 'Graciela Pérez', perfil: 'Sos mujer, tenés 54 años, trabajaste en comercio y te faltan unos 8 años de aportes. No sos docente.', guia: 'Contestá lo que te pregunten. Preguntá cuánto sale la consulta. Aceptá la consulta, elegí el primer horario y dá tu nombre.' },
  J2: { titulo: 'jubilación · mensaje cambiado, no dice el tema', semilla: 'hola quiero info', nombre: 'Jorge Ruiz', perfil: 'Sos varón, tenés 60 años, te faltan aportes para jubilarte y viste un anuncio sobre jubilación.', guia: 'Si te preguntan por qué tema consultás, decí que es por la jubilación porque te faltan aportes. Contestá lo que te pregunten, aceptá la consulta y elegí el segundo horario.' },
  J3: { titulo: 'jubilación · ya jubilada, quiere mejorar el haber (fuera del plan)', semilla: 'ya estoy jubilada y quiero saber si puedo mejorar mi jubilacion', nombre: 'Elena Ruiz', perfil: 'Sos mujer, tenés 66 años, ya estás jubilada y cobrás poco. No te descuentan ganancias.', guia: 'Contestá lo que te pregunten. Preguntá si se paga algo. Aceptá la consulta y elegí uno de los horarios.' },
  J4: { titulo: 'jubilación · duda por el precio', semilla: 'me faltan aportes, cuanto cuesta la consulta?', nombre: 'Marta Sosa', perfil: 'Sos mujer, tenés 57 años y te faltan aportes. Te parece caro pagar una consulta.', guia: 'Cuando te digan el precio, decí que lo tenés que pensar porque es mucha plata. Si te responden bien, aceptá la consulta y elegí el primer horario.' },
  B10: { titulo: 'no me interesa', semilla: 'no me interesa', nombre: 'Ana Gómez', perfil: 'No querés que te escriban.', guia: 'Si te contestan con respeto, agradecé y despedite.' },
};

const NECESITO = /necesito (?:que me )?confirm|necesito saber|un par de detalles|confirmar algunos datos|confirmar esos datos/i;

function marcas(msg: string) {
  const preguntas = (msg.match(/\?/g) ?? []).length;
  const horas = horasEnTexto(msg);
  return {
    una_pregunta_como_maximo: preguntas <= 1,
    sin_promesas: !REGEX_PROMESAS.test(msg),
    sin_necesito_confirmar: !NECESITO.test(msg),
    horarios: horas.length === 0 ? null : { cantidad: horas.length, cada_uno_con_su_dia: horasSinDia(msg).length === 0 },
  };
}

let usdPersonas = 0;
async function personaSiguiente(p: Persona, historial: { de: 'persona' | 'agente'; texto: string }[]): Promise<string> {
  const clave = process.env.api_openai || process.env.OPENAI_API_KEY || '';
  const sistema = `Sos una persona real que le escribe por WhatsApp al Centro Jurídico NOA (un estudio jurídico previsional de Jujuy). ${p.perfil} Escribís como en WhatsApp: mensajes cortos de una sola línea, sin saludos largos, a veces con minúsculas o algún error de tipeo. Contestás SOLO lo que te preguntan, con tus datos reales. ${p.guia} Si te ofrecen dos horarios, elegís uno ("el primero", "el segundo"). Si te piden tu nombre, decís "${p.nombre}". Cuando la conversación terminó (te confirmaron un turno, te derivaron a una persona, te despidieron o no tenés nada más que decir) respondé exactamente [FIN]. Respondé solo el mensaje, sin comillas.`;
  const mensajes = [{ role: 'system', content: sistema }, ...historial.map(h => ({ role: h.de === 'persona' ? 'assistant' : 'user', content: h.texto }))];
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${clave}` }, body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.4, max_tokens: 80, messages: mensajes }) });
  if (!r.ok) throw new Error(`persona ${r.status}`);
  const j: any = await r.json();
  usdPersonas += costoUsd('gpt-4o-mini', j?.usage?.prompt_tokens ?? 0, j?.usage?.completion_tokens ?? 0);
  await registrarUso('gpt-4o-mini', j?.usage, `${process.env.V2_ETIQUETA ?? 'verificacion_v2'}_persona`); // la persona simulada también gasta: queda anotada en el ERP
  return String(j?.choices?.[0]?.message?.content ?? '[FIN]').trim().replace(/^"|"$/g, '');
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const real = url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : undefined;
  fijarOrigenUso(process.env.V2_ETIQUETA ?? 'verificacion_v2');
  if (real) fijarDbUso(real as any);
  const tope = Number(process.env.V2_MAX_USD ?? 0.3);
  const cuales = (process.env.V2_CONVERSACIONES ?? 'C1,C2,C3,C4').split(',').map(x => x.trim()).filter(x => x in CONVERSACIONES || x in PERSONAS);
  log(`inicio · conversaciones=${cuales.join(',')} · modelo=gpt-4o-mini · clave OpenAI: ${process.env.api_openai || process.env.OPENAI_API_KEY ? 'presente' : 'AUSENTE'} · agenda real (solo lectura): ${real ? 'sí' : 'no'} · tope ${tope} USD`);
  const sinV1 = (async () => { throw new Error('la v1 no debe llamarse'); }) as any;
  const f = funcionesV2('gpt-4o-mini');

  for (const id of cuales) {
    const fija = CONVERSACIONES[id];
    const pers = PERSONAS[id];
    log(`==== ${id} · ${fija?.titulo ?? pers.titulo} ====`);
    let estado: any;
    const historial: { de: 'persona' | 'agente'; texto: string }[] = [];
    const maxTurnos = fija ? fija.mensajes.length : 16;
    let extra = 0;
    for (let i = 0; i < maxTurnos; i++) {
      if (usoOpenAI.usd >= tope) { log('CORTADO por tope de gasto'); return; }
      let persona: string;
      if (fija) persona = fija.mensajes[i];
      else if (i === 0) persona = pers.semilla;
      else {
        try { persona = await personaSiguiente(pers, historial); } catch (e) { log(`${id} error de la persona simulada: ${e instanceof Error ? e.message : e}`); break; }
        if (/^\[?FIN\]?\.?$/i.test(persona)) { log(`${id} T${i + 1} PERSONA: [FIN — la persona da por terminada la charla]`); break; }
      }
      let r: any;
      try { r = await chatAgentePaso(persona, estado, sinV1, real as any, f); }
      catch (e) { log(JSON.stringify({ id, turno: i + 1, persona, error: e instanceof Error ? e.message.slice(0, 200) : String(e) })); break; }
      if (r.code !== 200) { log(JSON.stringify({ id, turno: i + 1, persona, error: JSON.stringify(r.body).slice(0, 200) })); break; }
      estado = r.body.estado;
      const v2 = r.body.v2 ?? {};
      const e = leerEstadoV2(estado.tablas.leads?.[0]?.datos);
      const agente = (r.body.respuestas as string[]).join('\n');
      historial.push({ de: 'persona', texto: persona }, { de: 'agente', texto: agente });
      log(`${id} T${i + 1} PERSONA: ${persona}`);
      log(`${id} T${i + 1} AGENTE : ${agente.replace(/\n/g, ' ⏎ ')}`);
      log(`${id} T${i + 1} OBJETIVO: ${(v2.objetivos ?? []).map((o: any) => `${o.tipo}${typeof o.detalle === 'string' ? ':' + o.detalle : ''}`).join(' + ')} | etapa=${e.etapa}${e.gestion ? ' gestion=' + e.gestion : ''}`);
      log(`${id} T${i + 1} ESTADO : oferta=${e.oferta} filtros=${JSON.stringify(Object.fromEntries(Object.entries(e.filtros).map(([k, v]) => [k, v.valor])))} casilleros=${JSON.stringify(Object.fromEntries(Object.entries(e.casilleros).filter(([, v]) => v).map(([k, v]) => [k, (v as any).texto])))} emociones=${JSON.stringify(e.emociones_trabajadas)} pendiente=${JSON.stringify(e.dato_pendiente ?? null)}`);
      log(`${id} T${i + 1} EXTRACTOR: ${JSON.stringify(v2.extractor)}`);
      log(`${id} T${i + 1} EXTRACTOR CRUDO (antes de validar): ${JSON.stringify(v2.extractor_crudo ?? null)}`);
      log(`${id} T${i + 1} HERRAMIENTAS(código): ${(r.body.trazas as any[]).map(h => `${h.nombre}(${JSON.stringify(h.input).slice(0, 120)})→${JSON.stringify(h.resultado).slice(0, 220)}`).join(' ; ') || '—'}`);
      log(`${id} T${i + 1} REDACTOR: intentos=${(v2.redactor ?? []).length}${(v2.redactor ?? []).length > 1 ? ' | primero: ' + JSON.stringify((v2.redactor as any[])[0]).slice(0, 300) : ''}`);
      log(`${id} T${i + 1} VERIFICADOR: rechazos=${((v2.verificador ?? []) as any[]).filter(x => !x.ok).length} ${JSON.stringify(v2.verificador ?? [])}${v2.mensaje_seguro ? ' | MENSAJE SEGURO del director' : ''}`);
      log(`${id} T${i + 1} CONTROLES: ${JSON.stringify(marcas(agente))}`);
      if (!fija) {
        if (['derivado', 'cerrado'].includes(e.etapa)) { log(`${id} fin: etapa=${e.etapa}`); break; }
        if (e.etapa === 'agendado' || e.cancelacion_solicitada) { if (++extra > 1) break; }
      }
    }
    const agendas = (estado?.tablas?.consultas_agendadas ?? []).filter((x: any) => x.origen === 'agente');
    log(`${id} FIN · turnos en la base simulada: ${JSON.stringify(agendas.map((x: any) => ({ fecha: x.fecha_consulta, hora: x.hora_consulta, abogado: x.abogado_asignado, nombre: x.cliente_nombre, obs: String(x.observaciones ?? '').slice(0, 200) })))}`);
  }
  // Conciliación: lo que el ERP tiene anotado en uso_openai con esta etiqueta (la del agente y la de las personas) contra lo medido en esta corrida.
  const etiqueta = process.env.V2_ETIQUETA ?? 'verificacion_v2';
  // Gasto de corridas anteriores que no quedó anotado (V2_AJUSTES = JSON [{origen, entrada, salida, usd}]). Solo inserta filas nuevas.
  if (process.env.V2_AJUSTES && real) {
    try {
      const filas = (JSON.parse(process.env.V2_AJUSTES) as any[]).map(f => ({ origen: String(f.origen), modelo: 'gpt-4o-mini', entrada: Number(f.entrada) || 0, salida: Number(f.salida) || 0, usd: Number(f.usd) })).filter(f => f.origen && Number.isFinite(f.usd) && f.usd > 0 && f.usd < 1);
      const { error } = await real.from('uso_openai').insert(filas);
      log(`AJUSTE anotado en uso_openai: ${JSON.stringify(filas)} ${error ? 'ERROR: ' + error.message : 'ok'}`);
    } catch (e) { log(`AJUSTE inválido: ${e instanceof Error ? e.message : e}`); }
  }
  if (real) {
    const { data, error } = await real.from('uso_openai').select('origen, usd').in('origen', [etiqueta, `${etiqueta}_persona`]);
    if (error) log(`CONCILIACIÓN: no se pudo leer uso_openai: ${error.message}`);
    else { const por: Record<string, { filas: number; usd: number }> = {}; for (const f of data ?? []) { const o = por[(f as any).origen] ??= { filas: 0, usd: 0 }; o.filas++; o.usd += Number((f as any).usd); } log(`CONCILIACIÓN uso_openai (todo lo anotado con la etiqueta ${etiqueta}): ${JSON.stringify(Object.fromEntries(Object.entries(por).map(([k, v]) => [k, { filas: v.filas, usd: Number(v.usd.toFixed(4)) }])))}`); }
  } else log('CONCILIACIÓN: sin acceso a la base en esta corrida');
  if (real) {
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await real.from('uso_openai').select('origen, entrada, salida, usd, at').gte('at', desde).order('at', { ascending: true }).limit(5000);
    if (error) log(`ÚLTIMAS 24 H: no se pudo leer uso_openai: ${error.message}`);
    else { const por: Record<string, { filas: number; entrada: number; salida: number; usd: number; desde: string; hasta: string }> = {}; for (const f of (data ?? []) as any[]) { const o = por[f.origen] ??= { filas: 0, entrada: 0, salida: 0, usd: 0, desde: f.at, hasta: f.at }; o.filas++; o.entrada += f.entrada; o.salida += f.salida; o.usd += Number(f.usd); o.hasta = f.at; } log(`ÚLTIMAS 24 H por origen en uso_openai: ${JSON.stringify(Object.fromEntries(Object.entries(por).map(([k, v]) => [k, { ...v, usd: Number(v.usd.toFixed(4)) }])))}`); }
  }
  log(`FALLOS al anotar en uso_openai en esta corrida: ${usoOpenAI.fallos_de_registro}`);
  log(`GASTO medido: agente ${usoOpenAI.llamadas} llamadas, ${usoOpenAI.entrada} tokens de entrada, ${usoOpenAI.salida} de salida = ${usoOpenAI.usd.toFixed(4)} USD · personas simuladas ${usdPersonas.toFixed(4)} USD · TOTAL ${(usoOpenAI.usd + usdPersonas).toFixed(4)} USD`);
}
main().catch(e => { console.log('[V2] error general', e instanceof Error ? e.message : e); }).finally(() => { console.error = silencio; });
