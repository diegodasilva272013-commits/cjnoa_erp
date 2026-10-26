// Corre DENTRO de Vercel (con la clave de OpenAI de Vercel) cuando el build se pide con --build-env RUN_V2_REAL=1.
// Verifica la v2 completa (extractor + director + redactor con gpt-4o-mini REAL) con cuatro conversaciones de mensajes fijos y
// las imprime como las vería la persona, con la traza de cada turno. Nunca imprime claves ni variables de entorno.
// Variables opcionales: V2_CONVERSACIONES=C1,C2,... · V2_MAX_USD=0.30 · V2_ETIQUETA=nombre-del-uso
import { createClient } from '@supabase/supabase-js';
import { chatAgentePaso, fijarDbUso, fijarOrigenUso, funcionesV2, usoOpenAI, horasEnTexto, horasSinDia, REGEX_PROMESAS, leerEstadoV2 } from '../api/turnos/[accion]';

const log = (...a: unknown[]) => console.log('[V2]', ...a);
const silencio = console.error;
console.error = () => {};

const CONVERSACIONES: Record<string, { titulo: string; mensajes: string[] }> = {
  C1: {
    titulo: 'Art. 9 completo',
    mensajes: [
      'Hola, soy docente jubilada por ANSES y me descuentan ganancias',
      'Quiero que dejen de sacarme plata, es injusto',
      'Nunca hice nada, no sabía que se podía reclamar',
      'Sí, me interesa',
      'Virtual',
      'Sí',
      'El primero',
      'María López',
    ],
  },
  C2: { titulo: 'No califica', mensajes: ['No soy docente, era administrativa, me jubilé por ANSES y me descuentan ganancias'] },
  C3: { titulo: 'Palabra de compra', mensajes: ['Me preocupa que me sigan sacando plata todos los meses', 'Soy maestra jubilada de ANSES'] },
  C4: { titulo: 'Mensaje largo', mensajes: ['hola mire yo fui maestra 30 años en una escuela de palpala me jubile por anses y ahora me retienen del haber todos los meses y no se que hacer'] },
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

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const real = url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : undefined;
  fijarOrigenUso(process.env.V2_ETIQUETA ?? 'verificacion_v2');
  if (real) fijarDbUso(real as any);
  const tope = Number(process.env.V2_MAX_USD ?? 0.3);
  const cuales = (process.env.V2_CONVERSACIONES ?? 'C1,C2,C3,C4').split(',').map(x => x.trim()).filter(x => x in CONVERSACIONES);
  log(`inicio · conversaciones=${cuales.join(',')} · modelo=gpt-4o-mini · clave OpenAI: ${process.env.api_openai || process.env.OPENAI_API_KEY ? 'presente' : 'AUSENTE'} · agenda real (solo lectura): ${real ? 'sí' : 'no'} · tope ${tope} USD`);
  const sinV1 = (async () => { throw new Error('la v1 no debe llamarse'); }) as any;
  const f = funcionesV2('gpt-4o-mini');

  for (const id of cuales) {
    const c = CONVERSACIONES[id];
    log(`==== ${id} · ${c.titulo} ====`);
    let estado: any;
    for (let i = 0; i < c.mensajes.length; i++) {
      if (usoOpenAI.usd >= tope) { log('CORTADO por tope de gasto'); return; }
      const persona = c.mensajes[i];
      let r: any;
      try { r = await chatAgentePaso(persona, estado, sinV1, real as any, f); }
      catch (e) { log(JSON.stringify({ id, turno: i + 1, persona, error: e instanceof Error ? e.message.slice(0, 200) : String(e) })); break; }
      if (r.code !== 200) { log(JSON.stringify({ id, turno: i + 1, persona, error: JSON.stringify(r.body).slice(0, 200) })); break; }
      estado = r.body.estado;
      const v2 = r.body.v2 ?? {};
      const e = leerEstadoV2(estado.tablas.leads?.[0]?.datos);
      const agente = (r.body.respuestas as string[]).join('\n');
      log(`${id} T${i + 1} PERSONA: ${persona}`);
      log(`${id} T${i + 1} AGENTE : ${agente.replace(/\n/g, ' ⏎ ')}`);
      log(`${id} T${i + 1} OBJETIVO: ${(v2.objetivos ?? []).map((o: any) => `${o.tipo}${typeof o.detalle === 'string' ? ':' + o.detalle : ''}`).join(' + ')} | etapa=${e.etapa}`);
      log(`${id} T${i + 1} ESTADO : oferta=${e.oferta} filtros=${JSON.stringify(Object.fromEntries(Object.entries(e.filtros).map(([k, v]) => [k, v.valor])))} casilleros=${JSON.stringify(Object.fromEntries(Object.entries(e.casilleros).filter(([, v]) => v).map(([k, v]) => [k, (v as any).texto])))} emociones=${JSON.stringify(e.emociones_trabajadas)}`);
      log(`${id} T${i + 1} EXTRACTOR: ${JSON.stringify(v2.extractor)}${v2.extractor_crudo && v2.extractor?.fallo ? ' | CRUDO: ' + JSON.stringify(v2.extractor_crudo).slice(0, 400) : ''}`);
      log(`${id} T${i + 1} HERRAMIENTAS(código): ${(r.body.trazas as any[]).map(h => `${h.nombre}(${JSON.stringify(h.input).slice(0, 120)})→${JSON.stringify(h.resultado).slice(0, 220)}`).join(' ; ') || '—'}`);
      log(`${id} T${i + 1} REDACTOR: intentos=${(v2.redactor ?? []).length}${(v2.redactor ?? []).length > 1 ? ' | primero: ' + JSON.stringify((v2.redactor as any[])[0]).slice(0, 300) : ''}`);
      log(`${id} T${i + 1} CONTROLES: ${JSON.stringify(marcas(agente))}`);
    }
    const agendas = (estado?.tablas?.consultas_agendadas ?? []).filter((x: any) => x.origen === 'agente');
    log(`${id} FIN · turnos agendados en la base simulada: ${JSON.stringify(agendas.map((x: any) => ({ fecha: x.fecha_consulta, hora: x.hora_consulta, abogado: x.abogado_asignado, nombre: x.cliente_nombre })))}`);
  }
  log(`GASTO medido: ${usoOpenAI.llamadas} llamadas, ${usoOpenAI.entrada} tokens de entrada, ${usoOpenAI.salida} de salida = ${usoOpenAI.usd.toFixed(4)} USD`);
}
main().catch(e => { console.log('[V2] error general', e instanceof Error ? e.message : e); }).finally(() => { console.error = silencio; });
