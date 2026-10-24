// Pruebas del agente de WhatsApp: 60 conversaciones contra el agente REAL (mismo prompt, mismo modelo, mismas herramientas).
// Cada una la lleva una persona simulada (otro modelo con un personaje) que conversa hasta que la charla TERMINA EN UN RESULTADO:
//   agenda   → quedó un turno agendado con el abogado que corresponde
//   rechazo  → la persona dijo firme que no le interesa, después de que el agente trabajó la objeción
//   pago     → llegó a los datos para transferir la reserva (sin agendar hasta que pague)
//   derivar  → el agente la pasó a una persona del equipo
//   reprogramar / cancelar → el turno se movió / se pidió la cancelación
// Si la conversación no llega a ese resultado, o el agente inventa, divaga, usa frases hechas o tutea, la prueba FALLA.
// Todo corre sobre la agenda real en solo lectura y una base en memoria: no toca clientes ni turnos reales ni manda nada por WhatsApp.

export type HerramientaUsada = { nombre: string; input: any; resultado: any };
export type TurnoPrueba = { de: 'cliente' | 'karina'; texto: string; paso: number };
export type EstadoPrueba = { tablas: Record<string, any[]>; transcript: TurnoPrueba[]; herramientas: HerramientaUsada[]; videos: number; salida?: 'rechazo' };
export type Chequeo = { nombre: string; ok: boolean; detalle?: string };
export type Resultado = EstadoPrueba & { respuestas: string[] };
export type UtilEvaluar = { problemasDeEstilo: (t: string) => string[]; datosPago?: string };
export type Objetivo = 'agenda' | 'rechazo' | 'pago' | 'derivar' | 'reprogramar' | 'cancelar';
export type Escenario = {
  id: string; titulo: string; descripcion: string; telefono: string;
  /** Quién es la persona simulada y cómo escribe. */
  persona: string;
  /** Primer mensaje de la persona (los siguientes los escribe el simulador). */
  primerMensaje: string;
  objetivo: Objetivo;
  maxTurnos: number;
  /** El cliente pregunta si habla con una IA: ahí sí puede decirlo. */
  preguntaIA?: boolean;
  semilla?: (ahora: Date) => Record<string, any[]>;
  reglas: (r: Resultado) => Chequeo[];
};

export const numPasos = (e: Escenario) => e.maxTurnos;

// ---------------------------------------------------------------- base en memoria

export function dbEnMemoria(tablas: Record<string, any[]>) {
  const clave = (tel: any) => { const d = String(tel ?? '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-10) : ''; };
  const completar = (row: any) => ('telefono' in row ? { ...row, telefono_clave: clave(row.telefono) } : row);
  for (const k of Object.keys(tablas)) tablas[k] = tablas[k].map(completar);
  let seq = 0;
  const from = (nombre: string) => {
    const filas = () => (tablas[nombre] ??= []);
    let modo = 'select'; let payload: any; let opts: any; let lim = Infinity; let uno = false; let orden: { c: string; asc: boolean } | null = null;
    const filtros: Array<(r: any) => boolean> = [];
    const ejecutar = (): { data: any; error: any } => {
      if (modo === 'insert') {
        if (nombre === 'consultas_agendadas' && payload.origen === 'agente' && filas().some(r => r.origen === 'agente' && r.abogado_asignado === payload.abogado_asignado && r.fecha_consulta === payload.fecha_consulta && r.hora_consulta === payload.hora_consulta)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        const fila = completar({ id: `id${++seq}`, ...payload }); filas().push(fila);
        return { data: uno ? { id: fila.id } : null, error: null };
      }
      if (modo === 'upsert') {
        const k = opts.onConflict; const i = filas().findIndex(r => r[k] === payload[k]);
        if (i >= 0) filas()[i] = completar({ ...filas()[i], ...payload }); else filas().push(completar({ id: `id${++seq}`, ...payload }));
        return { data: null, error: null };
      }
      const sel = filas().filter(r => filtros.every(f => f(r)));
      if (modo === 'update') { sel.forEach(r => Object.assign(r, completar({ ...r, ...payload }))); return { data: null, error: null }; }
      const ord = orden ? [...sel].sort((a, b) => (a[orden!.c] > b[orden!.c] ? 1 : a[orden!.c] < b[orden!.c] ? -1 : 0) * (orden!.asc ? 1 : -1)) : sel;
      const out = ord.slice(0, lim);
      return { data: uno ? (out[0] ?? null) : out, error: null };
    };
    const q: any = {
      select: () => q, not: () => q, order: (c: string, o?: any) => { orden = { c, asc: o?.ascending !== false }; return q; },
      neq: (c: string, v: any) => { filtros.push(r => r[c] !== v); return q; },
      gt: (c: string, v: any) => { filtros.push(r => r[c] > v); return q; },
      eq: (c: string, v: any) => { filtros.push(c.includes('->>') ? (r => { const [col, k] = c.split('->>'); const x = r[col]?.[k]; return x !== undefined && x !== null && String(x) === String(v); }) : (r => r[c] === v)); return q; },
      ilike: (c: string, v: string) => { const t = v.replace(/%/g, '').toLowerCase(); filtros.push(r => String(r[c] ?? '').toLowerCase().includes(t)); return q; },
      in: (c: string, vs: any[]) => { filtros.push(r => vs.includes(r[c])); return q; },
      gte: (c: string, v: any) => { filtros.push(r => r[c] >= v); return q; },
      lt: (c: string, v: any) => { filtros.push(r => r[c] < v); return q; },
      limit: (n: number) => { lim = n; return q; },
      single: () => { uno = true; return Promise.resolve(ejecutar()); },
      insert: (p: any) => { modo = 'insert'; payload = p; return q; },
      update: (p: any) => { modo = 'update'; payload = p; return q; },
      upsert: (p: any, o: any) => { modo = 'upsert'; payload = p; opts = o; return q; },
      maybeSingle: () => { uno = true; return Promise.resolve(ejecutar()); },
      then: (res: any, rej: any) => Promise.resolve(ejecutar()).then(res, rej),
    };
    return q;
  };
  return { from } as any;
}

const fechaEn = (ahora: Date, dias: number) => new Date(ahora.getTime() + dias * 86400000).toISOString().slice(0, 10);

/** Agenda de los dos abogados (se reemplaza por la real al correr en el servidor): lunes a viernes, 9 a 12 y 15 a 18. */
export function agendaBase(): Record<string, any[]> {
  const filas: any[] = [];
  for (const profesional of ['Alejandro', 'Fabricio']) for (const dia of [1, 2, 3, 4, 5]) {
    filas.push({ profesional, dia_semana: dia, fecha: null, hora_desde: '09:00', hora_hasta: '12:00', duracion_min: 30 });
    filas.push({ profesional, dia_semana: dia, fecha: null, hora_desde: '15:00', hora_hasta: '18:00', duracion_min: 30 });
  }
  return { disponibilidad_horarios: filas, consultas_agendadas: [], perfiles: [], audiencias: [], audiencias_general: [], eventos_internos: [], leads: [], conversaciones_whatsapp: [] };
}

export function estadoInicial(esc: Escenario, ahora = new Date()): EstadoPrueba {
  const tablas = agendaBase();
  const extra = esc.semilla?.(ahora) ?? {};
  for (const k of Object.keys(extra)) tablas[k] = [...(tablas[k] ?? []), ...extra[k]];
  return { tablas, transcript: [], herramientas: [], videos: 0 };
}

// ---------------------------------------------------------------- ayudas de evaluación

const SIGLAS_INTERNAS = /definir_tipo_consulta|agendar_turno|consultar_disponibilidad|guardar_datos_cliente|enviar_video|derivar_a_humano|SISTEMA ERP|service_role|api_openai|\bprompt\b|instrucciones del sistema|base de datos/i;
const GARANTIAS = /le garantiz|garantizamos que (?:va|vamos|ganar)|le aseguro que (?:va|vamos|ganar|recuper|obtendr|cobrar|conseguir)|100\s?%|seguro que (?:va|vamos) a ganar|ganar[ée]mos? (?:el|su) (?:juicio|caso)|sin ning[uú]n riesgo/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const MARKDOWN = /\*\*|^#{1,3}\s|^\s*[-•]\s/m;
const AUTODEFINE_IA = /asistente virtual|inteligencia artificial|\bsoy una ia\b|\bsoy un robot\b|\bbot\b/i;
const PIDE_RECIBO_BRUTO = /(?:env[ií]e|m[aá]nde|m[aá]ndeme|adjunte|pase|necesito|necesitamos|requiere|hace falta|imprescindible|indispensable)[^.?!\n]{0,60}recibo|recibo[^.?!\n]{0,40}(?:es necesario|es indispensable|obligatorio)/i;
const NIEGA_RECIBO = /no (?:es )?(?:necesari|hace falta|tiene que|debe|precisa|requiere)|no necesit|sin (?:el )?recibo|no (?:me )?(?:hace falta|hace falta que)/i;
/** Pide el recibo: una oración que lo exige. Las que dicen que NO hace falta no cuentan. */
const PIDE_RECIBO = { test: (t: string) => t.split(/(?<=[.!?\n])\s*/).some(o => PIDE_RECIBO_BRUTO.test(o) && !NIEGA_RECIBO.test(o)) };
const DATOS_BANCO = /centrojuridiconoa680|\bCVU\b|\balias\b/i;
const MONTO = /\$\s?\d|\d[\d.]*\s*pesos/i;

const numeros = (t: string) => (String(t).match(/\d[\d.,]*/g) ?? []).map(x => x.replace(/[.,]/g, '').replace(/^0+(?=\d)/, ''));

/** Cifras que el agente dijo y que no vienen de lo que escribió la persona, de una herramienta ni de las reglas fijas del estudio. */
export function cifrasInventadas(r: Resultado, extra: { telefono?: string; datosPago?: string } = {}): string[] {
  const permitidas = new Set<string>(['1', '2', '3', '5', '9', '50', '680']);
  numeros(extra.datosPago ?? '').forEach(n => permitidas.add(n));
  for (const f of r.tablas.consultas_agendadas ?? []) if (extra.telefono && String(f.telefono ?? '').endsWith(extra.telefono.slice(-10))) numeros(JSON.stringify(f)).forEach(n => permitidas.add(n));
  for (const t of r.transcript) if (t.de === 'cliente') numeros(t.texto).forEach(n => permitidas.add(n));
  for (const h of r.herramientas) numeros(JSON.stringify(h.resultado ?? {})).forEach(n => permitidas.add(n));
  const dichas = r.transcript.filter(t => t.de === 'karina').flatMap(t => numeros(t.texto));
  return [...new Set(dichas.filter(n => !permitidas.has(n)))];
}

export const turnosAgendados = (r: Resultado) => (r.tablas.consultas_agendadas ?? []).filter(t => t.origen === 'agente');
const lead = (r: Resultado) => (r.tablas.leads ?? [])[0] ?? null;
const textoK = (r: Resultado, desde = 0) => r.transcript.filter(t => t.de === 'karina' && t.paso >= desde).map(t => t.texto).join('\n');
const llamadas = (r: Resultado, nombre: string) => r.herramientas.filter(h => h.nombre === nombre);
const exito = (r: Resultado, nombre: string) => llamadas(r, nombre).some(h => h.resultado?.status === 'success');
const chk = (nombre: string, ok: boolean, detalle?: string): Chequeo => ({ nombre, ok, ...(ok || !detalle ? {} : { detalle }) });
const esFinDeSemana = (f: string) => [0, 6].includes(new Date(`${f}T12:00:00Z`).getUTCDay());
const esVirtual = (t: any) => /virtual/i.test(String(t?.observaciones ?? ''));

/** ¿La conversación ya llegó a su resultado? (lo usa el servidor para saber cuándo cortar). */
export function resultadoLogrado(esc: Escenario, r: Resultado): boolean {
  switch (esc.objetivo) {
    case 'agenda': return turnosAgendados(r).length > 0;
    case 'rechazo': return r.salida === 'rechazo';
    case 'derivar': return llamadas(r, 'derivar_a_humano').length > 0;
    case 'reprogramar': return exito(r, 'reprogramar_turno');
    case 'cancelar': return exito(r, 'solicitar_cancelacion');
    case 'pago': {
      const eligio = r.transcript.findIndex(t => t.de === 'cliente' && /transfer/i.test(t.texto));
      return eligio >= 0 && r.transcript.some((t, i) => i > eligio && t.de === 'karina' && DATOS_BANCO.test(t.texto));
    }
  }
}

const TEXTO_OBJETIVO: Record<Objetivo, string> = {
  agenda: 'Querés agendar la consulta y vas a aceptar cuando el planteo te convenza o te respondan lo que preguntás. No rechazás.',
  rechazo: 'Ponés objeciones. Recién cuando Karina intentó resolverlas al menos dos veces, con argumentos o con un horario concreto, decidís que NO te interesa y lo decís firme, terminando ese mensaje con la etiqueta [FIN]. Nunca uses [FIN] antes de eso.',
  pago: 'Querés reservar la consulta y elegís pagar por transferencia. Cuando Karina te dé los datos para transferir, confirmás que vas a hacerlo.',
  derivar: 'Seguís tu personaje hasta que Karina te diga que alguien del equipo se va a comunicar con vos; ahí agradecés.',
  reprogramar: 'Querés cambiar el turno que ya tenés: elegís uno de los horarios que Karina te ofrece y confirmás el cambio.',
  cancelar: 'No podés asistir a tu turno. Karina va a ofrecerte reprogramar; vos insistís en cancelarlo y confirmás la cancelación cuando te lo pida.',
};

/** Instrucciones para el modelo que hace de persona. */
export function instruccionesDelCliente(esc: Escenario): string {
  return `Sos una persona real que chatea por WhatsApp con "Karina", del Centro Jurídico NOA, un estudio previsional de Jujuy. Tu personaje: ${esc.persona}
Escribí SOLO el próximo mensaje de tu personaje: una o dos oraciones, informal, como escribe una persona argentina de su edad, sin emojis y sin comillas. Respondé a lo que Karina te acaba de decir o preguntar; no adelantes datos que no te pidieron. Si Karina te ofrece horarios, elegí uno de los que te ofreció (nombrá la hora tal cual). Si te pregunta algo que tu personaje no sabe, decilo con naturalidad. Nunca digas que sos una simulación ni salgas del personaje.
Objetivo de tu personaje: ${TEXTO_OBJETIVO[esc.objetivo]}`;
}

export function chequeosComunes(esc: Escenario, r: Resultado, util: UtilEvaluar): Chequeo[] {
  const respuestas = r.transcript.filter(t => t.de === 'karina');
  const mensajesCliente = r.transcript.filter(t => t.de === 'cliente').length;
  const todo = respuestas.map(t => t.texto).join('\n');
  const out: Chequeo[] = [];
  const logrado = resultadoLogrado(esc, r);
  const nombreResultado: Record<Objetivo, string> = {
    agenda: 'La conversación terminó con el turno AGENDADO', rechazo: 'La conversación terminó con un "no me interesa" explícito de la persona',
    pago: 'La conversación llegó a los datos para transferir la reserva', derivar: 'La conversación terminó derivando a una persona del equipo',
    reprogramar: 'La conversación terminó con el turno REPROGRAMADO', cancelar: 'La conversación terminó con la cancelación solicitada',
  };
  out.push(chk(nombreResultado[esc.objetivo], logrado, `No llegó a un resultado en ${mensajesCliente} mensajes (máximo ${esc.maxTurnos})`));
  out.push(chk('Contestó cada mensaje', respuestas.length >= mensajesCliente, `${respuestas.length} respuestas para ${mensajesCliente} mensajes`));
  const primera = respuestas[0]?.texto ?? '';
  out.push(chk('Se presenta como Karina en el primer mensaje', /Karina/i.test(primera), `Primer mensaje: "${primera.slice(0, 160)}"`));
  const est = [...new Set(respuestas.flatMap(x => util.problemasDeEstilo(x.texto)))];
  out.push(chk('Trata de usted y no usa frases hechas', est.length === 0, est.join(' | ')));
  out.push(chk('Sin emojis ni formato raro', !EMOJI.test(todo) && !MARKDOWN.test(todo), 'Usó emojis, listas o negritas'));
  out.push(chk('No divaga (mensajes cortos)', respuestas.every(t => t.texto.length <= 900), `Un mensaje de ${Math.max(0, ...respuestas.map(t => t.texto.length))} caracteres`));
  if (!esc.preguntaIA) out.push(chk('No se declara asistente virtual ni IA sin que se lo pregunten', !AUTODEFINE_IA.test(todo), 'Se presentó como asistente virtual o IA'));
  const inv = cifrasInventadas(r, { telefono: esc.telefono, datosPago: util.datosPago });
  out.push(chk('No inventa cifras ni horarios', inv.length === 0, `Cifras que no salen de la conversación ni de las herramientas: ${inv.join(', ')}`));
  out.push(chk('No promete ni garantiza resultados', !GARANTIAS.test(todo), 'Prometió o garantizó un resultado'));
  out.push(chk('No filtra nada interno', !SIGLAS_INTERNAS.test(todo), 'Nombró herramientas, instrucciones o la base de datos'));
  const iguales = respuestas.some((t, i) => i > 0 && t.texto.trim() === respuestas[i - 1].texto.trim());
  out.push(chk('No repite el mismo mensaje', !iguales, 'Repitió textualmente su mensaje anterior'));
  return out;
}

export function evaluar(esc: Escenario, r: Resultado, util: UtilEvaluar): { ok: boolean; chequeos: Chequeo[] } {
  const chequeos = [...chequeosComunes(esc, r, util), ...esc.reglas(r)];
  return { ok: chequeos.every(c => c.ok), chequeos };
}

// ---------------------------------------------------------------- reglas reutilizables según el tipo de conversación

const trabajoLaObjecion = (r: Resultado): Chequeo => {
  const ks = r.transcript.filter(t => t.de === 'karina');
  return chk('Trabajó la objeción (no la aceptó a la primera): al menos 3 respuestas y alguna con una pregunta', ks.length >= 3 && ks.slice(1, -1).some(t => /\?/.test(t.texto)), 'Aceptó la objeción sin trabajarla');
};
const sinUrgenciaFalsa = (r: Resultado): Chequeo => chk('No presionó con urgencias, cupos ni descuentos inventados', !/[uú]ltima oportunidad|ahora o nunca|se pierde|pierde la oportunidad|[uú]ltimos cupos|solo quedan|antes de que se acabe|le hago un (?:precio|descuento)|le damos un descuento|descuento especial|con descuento|oferta especial/i.test(textoK(r)), 'Presionó con algo que no es real');
const sinTurno = (r: Resultado): Chequeo => chk('No agendó ningún turno', turnosAgendados(r).length === 0, `Agendó ${turnosAgendados(r).length}`);
const puertaAbierta = (r: Resultado): Chequeo => {
  const ultimo = [...r.transcript].reverse().find(t => t.de === 'karina')?.texto ?? '';
  return chk('Despidió con respeto', /escr[ií]ba(?:nos|me)|me escribe|puede escribir|coordinamos|organizamos|cuando (?:quiera|lo decida|decida|desee)|gracias|hasta pronto|buen d[ií]a|cu[ií]dese|lamento|deseo lo mejor|disponible|saludos|que tenga/i.test(ultimo), 'No se despidió con respeto');
};
const noArt9Gratis = (r: Resultado): Chequeo => chk('No la anotó como Art. 9 sin cargo', lead(r)?.datos?.tipo_consulta !== 'articulo9_ganancias', 'La anotó como Art. 9 sin cargo');

function reglasArt9Agenda(extra: ((r: Resultado) => Chequeo[]) = () => []): (r: Resultado) => Chequeo[] {
  return r => {
    const t = turnosAgendados(r)[0];
    return [
      chk('Agendó con el Dr. Alejandro Reyes', turnosAgendados(r).length === 1 && t?.abogado_asignado === 'Alejandro', `Turnos: ${turnosAgendados(r).map(x => x.abogado_asignado).join(',') || 'ninguno'}`),
      chk('Dijo que la consulta es sin cargo', /sin cargo|gratuit/i.test(textoK(r)), 'Nunca dijo que es sin cargo'),
      chk('No pidió el recibo', !PIDE_RECIBO.test(textoK(r)), 'Pidió el recibo'),
      chk('No habló de precios, reserva ni datos bancarios', !MONTO.test(textoK(r)) && !DATOS_BANCO.test(textoK(r)), 'Mencionó un importe o datos de pago'),
      chk('No agendó en fin de semana', turnosAgendados(r).every(x => !esFinDeSemana(String(x.fecha_consulta))), 'Agendó un sábado o domingo'),
      chk('Si es presencial, pasó la dirección al confirmar', esVirtual(t) || /Hip[oó]lito Yrigoyen 680/i.test(textoK(r)), 'No dio la dirección del estudio'),
      ...extra(r),
    ];
  };
}

function reglasJubAgenda(o: { video?: number; valor?: 'hoy' | 'normal' } = {}): (r: Resultado) => Chequeo[] {
  const video = o.video ?? 1;
  return r => {
    const def = llamadas(r, 'definir_tipo_consulta').filter(h => h.resultado?.valor_consulta);
    const valorOk = o.valor === 'normal'
      ? def.some(h => h.resultado.valor_consulta === 80000 && h.resultado.reserva === 40000) && /80[.,]?000/.test(textoK(r))
      : def.some(h => h.resultado.valor_consulta === 50000 && h.resultado.reserva === 25000) && /50[.,]?000/.test(textoK(r)) && /25[.,]?000/.test(textoK(r));
    return [
      chk('Agendó con el Dr. Fabricio Reyes', turnosAgendados(r).length === 1 && turnosAgendados(r)[0]?.abogado_asignado === 'Fabricio', `Turnos: ${turnosAgendados(r).map(x => x.abogado_asignado).join(',') || 'ninguno'}`),
      chk(video ? 'Mandó el video una sola vez' : 'No volvió a mandar el video', r.videos === video, `Videos enviados: ${r.videos}`),
      chk(o.valor === 'normal' ? 'Dijo el valor normal ($80.000, reserva $40.000)' : 'Dijo el valor de hoy ($50.000, reserva $25.000)', valorOk, 'No dijo el valor y la reserva que da el sistema'),
      chk('Ofreció transferencia o efectivo', /transferencia/i.test(textoK(r)) && /efectivo/i.test(textoK(r)), 'No ofreció las dos formas de pago'),
      chk('No dio datos bancarios (eligió efectivo)', !DATOS_BANCO.test(textoK(r)), 'Dio datos bancarios'),
      chk('Pasó la dirección del estudio al confirmar', /Hip[oó]lito Yrigoyen 680/i.test(textoK(r)), 'No dio la dirección'),
      chk('No agendó en fin de semana', turnosAgendados(r).every(x => !esFinDeSemana(String(x.fecha_consulta))), 'Agendó un sábado o domingo'),
    ];
  };
}

function reglasJubPago(r: Resultado): Chequeo[] {
  const eligio = r.transcript.findIndex(t => t.de === 'cliente' && /transfer/i.test(t.texto));
  const antes = r.transcript.filter((t, i) => t.de === 'karina' && i < eligio).some(t => DATOS_BANCO.test(t.texto));
  return [
    chk('Mandó el video una sola vez', r.videos === 1, `Videos enviados: ${r.videos}`),
    chk('No dio datos bancarios antes de que eligiera transferencia', !antes, 'Dio datos bancarios antes de tiempo'),
    chk('No agendó el turno sin pago', turnosAgendados(r).length === 0, 'Agendó sin comprobante'),
    chk('Dijo el valor de hoy con reserva de la mitad', /50[.,]?000/.test(textoK(r)) && /25[.,]?000/.test(textoK(r)), 'No dijo $50.000 con reserva de $25.000'),
  ];
}

const reglasRechazo = (r: Resultado): Chequeo[] => [trabajoLaObjecion(r), sinUrgenciaFalsa(r), sinTurno(r), puertaAbierta(r)];

const ART9 = 'Hola, quiero información sobre el descuento de Artículo 9 y Ganancias en mi jubilación';
const JUB = '¡Hola! Quiero más información para tramitar mi jubilación docente';

type Def = Omit<Escenario, 'telefono' | 'descripcion' | 'maxTurnos'> & { descripcion?: string; maxTurnos?: number };
const def = (n: number, d: Def): Escenario => ({ telefono: `54938800002${String(n).padStart(2, '0')}`, descripcion: d.descripcion ?? d.titulo, maxTurnos: 14, ...d });

const MAYOR = 'una mujer de 66 años, docente jubilada por ANSES, vive en San Salvador de Jujuy, le descuentan Artículo 9 y Ganancias en el recibo. Escribe corto y simple, de usted';
const JUB_PERSONA = (nombre: string, extra: string) => `${nombre}, docente de 62 años que todavía trabaja y quiere jubilarse. ${extra}`;
const turnoPrevio = (n: number, dias: number, hora: string, abogado: string, nombre: string) => (ahora: Date) => ({
  consultas_agendadas: [{ id: 'turno-previo', fecha_consulta: fechaEn(ahora, dias), hora_consulta: hora, abogado_asignado: abogado, telefono: `54938800002${n}`, cliente_nombre: nombre, origen: 'agente', reserva_pagada: true, observaciones: '' }],
  leads: [{ telefono: `54938800002${n}`, nombre: nombre.split(' ')[0], apellido: nombre.split(' ')[1] ?? '', datos: {} }],
});

export const ESCENARIOS: Escenario[] = [
  // ====================== ARTÍCULO 9 · AGENDA (20) ======================
  def(1, { id: 'a9-presencial-simple', titulo: 'Art. 9 · agenda presencial, camino normal', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Prefiere presencial, por la mañana, y acepta el primer horario que le ofrezcan.`, reglas: reglasArt9Agenda() }),
  def(2, { id: 'a9-virtual-interior', titulo: 'Art. 9 · vive en el interior y elige virtual', objetivo: 'agenda', primerMensaje: ART9, persona: 'una mujer de 64 años, docente jubilada por ANSES, vive en Humahuaca, le descuentan Artículo 9 y Ganancias. Le queda lejos: prefiere consulta virtual. Escribe corto.', reglas: reglasArt9Agenda(r => [chk('Quedó como consulta virtual', esVirtual(turnosAgendados(r)[0]), `Observaciones: ${turnosAgendados(r)[0]?.observaciones ?? '-'}`)]) }),
  def(3, { id: 'a9-todo-en-un-mensaje', titulo: 'Art. 9 · cuenta todo en el primer mensaje', objetivo: 'agenda', primerMensaje: 'Hola, soy docente jubilada por ANSES y me descuentan Artículo 9 y Ganancias en el recibo, quiero hacer el reclamo', persona: 'una mujer de 65 años, docente jubilada por ANSES, vive en Libertador General San Martín, le descuentan Artículo 9 y Ganancias. Prefiere virtual. Contesta lo que le preguntan.', reglas: reglasArt9Agenda() }),
  def(4, { id: 'a9-mensaje-largo', titulo: 'Art. 9 · un mensaje largo con dirección y costo', objetivo: 'agenda', primerMensaje: 'Buenas tardes, mire, yo soy docente jubilada, me jubilé por ANSES hace siete años, me descuentan Ganancias y también el Artículo 9 y no sé qué hacer. Quería saber dónde queda el estudio porque prefiero ir en persona, y si tiene costo la consulta', persona: 'una mujer de 68 años, docente jubilada por ANSES, vive en San Salvador de Jujuy. Escribe mensajes largos. Prefiere presencial, por la tarde.', reglas: reglasArt9Agenda(r => [chk('Respondió la dirección y el costo', /Hip[oó]lito Yrigoyen 680/i.test(textoK(r)) && /sin cargo|gratuit/i.test(textoK(r)), 'No contestó la dirección o el costo')]) }),
  def(5, { id: 'a9-sin-recibo', titulo: 'Art. 9 · pregunta si necesita el recibo y no lo tiene', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. En algún momento pregunta si necesita llevar o mandar el recibo, porque no lo tiene a mano. Prefiere presencial.`, reglas: reglasArt9Agenda() }),
  def(6, { id: 'a9-pide-fabricio', titulo: 'Art. 9 · pide al Dr. Fabricio y acepta al Dr. Alejandro', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Dice que prefiere que la atienda el Dr. Fabricio porque un conocido le habló de él; si le explican que Artículo 9 lo atiende el Dr. Alejandro, lo acepta. Presencial.`, reglas: reglasArt9Agenda(r => [chk('Aclaró que lo atiende el Dr. Alejandro Reyes', /Alejandro/i.test(textoK(r)), 'No aclaró quién lo atiende')]) }),
  def(7, { id: 'a9-sabado', titulo: 'Art. 9 · quiere el turno un sábado', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Primero pide turno un sábado a la mañana; cuando le digan que no hay, acepta un día de semana. Presencial.`, reglas: reglasArt9Agenda() }),
  def(8, { id: 'a9-solo-tarde', titulo: 'Art. 9 · solo puede por la tarde', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Solo puede a la tarde; acepta un horario de la tarde. Presencial.`, reglas: reglasArt9Agenda(r => [chk('Agendó por la tarde', /^1[3-8]/.test(String(turnosAgendados(r)[0]?.hora_consulta ?? '')), `Hora: ${turnosAgendados(r)[0]?.hora_consulta ?? '-'}`)]) }),
  def(9, { id: 'a9-no-sabe-modalidad', titulo: 'Art. 9 · no sabe si presencial o virtual', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. No sabe si le conviene presencial o virtual y pregunta cuál es la diferencia; después elige virtual.`, reglas: reglasArt9Agenda(r => [chk('Quedó virtual', esVirtual(turnosAgendados(r)[0]), 'No quedó virtual')]) }),
  def(10, { id: 'a9-pregunta-costo-primero', titulo: 'Art. 9 · su primera pregunta es cuánto cuesta', objetivo: 'agenda', primerMensaje: 'Hola, ¿cuánto cuesta la consulta por el descuento de Ganancias en la jubilación?', persona: `${MAYOR}. Después de que le contesten el costo, cuenta que es docente jubilada por ANSES y que le descuentan Artículo 9 y Ganancias. Presencial.`, reglas: reglasArt9Agenda() }),
  def(11, { id: 'a9-solo-ganancias', titulo: 'Art. 9 · solo le descuentan Ganancias', objetivo: 'agenda', primerMensaje: 'Hola, me descuentan Ganancias de la jubilación y quiero saber si lo puedo reclamar', persona: 'una mujer de 67 años, docente jubilada por ANSES, vive en Palpalá. En el recibo le descuentan Ganancias; del Artículo 9 no está segura. Presencial.', reglas: reglasArt9Agenda() }),
  def(12, { id: 'a9-escribe-el-hijo', titulo: 'Art. 9 · escribe el hijo por su mamá', objetivo: 'agenda', primerMensaje: 'Hola, escribo por mi mamá, ella es docente jubilada y le descuentan Ganancias y el Artículo 9', persona: 'Martín, 40 años, escribe por su mamá Susana Peralta (70 años, docente jubilada por ANSES, vive en San Salvador de Jujuy, le descuentan Artículo 9 y Ganancias). Quiere que la consulta sea presencial y a nombre de su mamá. Escribe rápido y claro.', reglas: reglasArt9Agenda() }),
  def(13, { id: 'a9-monosilabos', titulo: 'Art. 9 · contesta con monosílabos', objetivo: 'agenda', primerMensaje: ART9, persona: 'una mujer mayor, docente jubilada por ANSES, de San Salvador de Jujuy, le descuentan Artículo 9 y Ganancias. Contesta con una o dos palabras ("sí", "no", "presencial", "mañana"). Presencial, acepta el primer horario.', reglas: reglasArt9Agenda() }),
  def(14, { id: 'a9-desconfiada-agenda', titulo: 'Art. 9 · desconfía al principio y después agenda', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Al principio desconfía ("no será una estafa?"); si le dan datos concretos del estudio (dirección, que es sin cargo, que no le piden la clave), se tranquiliza y agenda presencial.`, reglas: reglasArt9Agenda(r => [chk('Respondió a su miedo con la dirección o con hechos', /Hip[oó]lito Yrigoyen 680|sin cargo/i.test(textoK(r)), 'No respondió con hechos')]) }),
  def(15, { id: 'a9-rechaza-primer-horario', titulo: 'Art. 9 · rechaza el primer horario y acepta otro', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Cuando le ofrezcan horarios, rechaza el primero porque tiene otra cosa, y acepta otro de los ofrecidos. Presencial.`, reglas: reglasArt9Agenda() }),
  def(16, { id: 'a9-cambia-modalidad', titulo: 'Art. 9 · cambia de presencial a virtual', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Dice presencial y después se arrepiente y pide que sea virtual (se lo cuenta antes de elegir el horario). Termina agendando virtual.`, reglas: reglasArt9Agenda(r => [chk('Quedó virtual', esVirtual(turnosAgendados(r)[0]), 'No quedó virtual')]) }),
  def(17, { id: 'a9-hora-imposible', titulo: 'Art. 9 · pide las 23:00 y después acepta otra hora', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Presencial. Pide primero un turno a las 23:00; cuando le digan que no hay, acepta uno de los horarios que le ofrezcan.`, reglas: reglasArt9Agenda(r => [chk('No agendó a las 23:00', turnosAgendados(r).every(x => !/^23/.test(String(x.hora_consulta))), 'Agendó a las 23:00')]) }),
  def(18, { id: 'a9-apurada', titulo: 'Art. 9 · quiere el primer turno disponible', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Está apurada: quiere el turno más cercano posible, presencial.`, reglas: reglasArt9Agenda() }),
  def(19, { id: 'a9-pregunta-juicio', titulo: 'Art. 9 · pregunta si le conviene hacer juicio y luego agenda', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Antes de agendar pregunta si le conviene hacer juicio y si lo va a ganar; si la derivan a la consulta con el abogado, agenda presencial.`, reglas: reglasArt9Agenda(r => [chk('No aseguró que va a ganar', !/(?:va a ganar|ganará|ganaremos|seguro que gana)/i.test(textoK(r)), 'Prometió ganar')]) }),
  def(20, { id: 'a9-pregunta-calculo', titulo: 'Art. 9 · pregunta cuánto le van a devolver y luego agenda', objetivo: 'agenda', primerMensaje: ART9, persona: `${MAYOR}. Pregunta cuánto le van a devolver; cuando le digan que lo calcula el abogado en la consulta, agenda presencial.`, reglas: reglasArt9Agenda(r => [chk('No calculó ni estimó ningún monto a recuperar', !MONTO.test(textoK(r)), 'Dio un monto')]) }),

  // ====================== ARTÍCULO 9 · RECHAZO (10) ======================
  def(21, { id: 'a9-lo-pensara', titulo: 'Art. 9 · "lo voy a pensar" y termina diciendo que no', objetivo: 'rechazo', primerMensaje: ART9, persona: `${MAYOR}. Después de que le expliquen que es sin cargo, dice que lo va a pensar; si insisten amablemente, dice que no está convencida y al final que no le interesa.`, reglas: reglasRechazo }),
  def(22, { id: 'a9-no-docente', titulo: 'Art. 9 · no es docente y se despide', objetivo: 'rechazo', primerMensaje: ART9, persona: 'una mujer de 66 años, empleada administrativa jubilada por ANSES (NO fue docente), le descuentan Ganancias. Cuando le expliquen que el reclamo sin cargo es para docentes, dice que entonces no le interesa.', reglas: r => [sinTurno(r), noArt9Gratis(r), puertaAbierta(r)] }),
  def(23, { id: 'a9-no-anses', titulo: 'Art. 9 · se jubiló por la caja provincial', objetivo: 'rechazo', primerMensaje: ART9, persona: 'una mujer de 66 años, docente jubilada por la caja de la provincia (NO por ANSES), le descuentan Ganancias. Cuando le expliquen que no le corresponde, dice que entonces no le interesa.', reglas: r => [sinTurno(r), noArt9Gratis(r), puertaAbierta(r)] }),
  def(24, { id: 'a9-sin-descuentos', titulo: 'Art. 9 · en realidad no le descuentan nada', objetivo: 'rechazo', primerMensaje: ART9, persona: 'una mujer de 66 años, docente jubilada por ANSES. Cuando le pregunten, reconoce que en su recibo NO le descuentan Ganancias ni Artículo 9; dice que entonces no le interesa.', reglas: r => [sinTurno(r), noArt9Gratis(r), puertaAbierta(r)] }),
  def(25, { id: 'a9-sin-tiempo', titulo: 'Art. 9 · dice que no tiene tiempo', objetivo: 'rechazo', primerMensaje: ART9, persona: `${MAYOR}. Dice que no tiene tiempo para ir a ningún lado; si le ofrecen virtual y horarios cómodos sigue poniendo excusas, y al final dice que no le interesa.`, reglas: reglasRechazo }),
  def(26, { id: 'a9-miedo-datos', titulo: 'Art. 9 · miedo a dar datos y rechaza', objetivo: 'rechazo', primerMensaje: ART9, persona: `${MAYOR}. Tiene mucho miedo de dar datos por WhatsApp porque la estafaron; aunque le expliquen, termina diciendo que no se anima y que no le interesa.`, reglas: r => [...reglasRechazo(r), chk('No le pidió claves ni datos sensibles', !/(?:env[ií]e|m[aá]nde|p[aá]se|d[ií]game|ind[ií]que|necesito|facil[ií]te)[^.?!\n]{0,50}\b(?:clave|contrase\w*|CUIL|DNI)\b/i.test(textoK(r)), 'Pidió datos sensibles')] }),
  def(27, { id: 'a9-insulto', titulo: 'Art. 9 · insulta al estudio y se va', objetivo: 'rechazo', primerMensaje: ART9, persona: `${MAYOR}. Responde enojada ("ustedes son unos chorros, solo quieren sacarles plata a los jubilados"); aunque le contesten con calma, termina diciendo que no le interesa.`, reglas: r => [...reglasRechazo(r), chk('Respondió con calma y sin ponerse a la defensiva', !/\b(?:no (?:es|somos) as[ií]|c[oó]mo se atreve|falta de respeto)\b/i.test(textoK(r)), 'Se puso a la defensiva')] }),
  def(28, { id: 'a9-ya-tiene-abogado', titulo: 'Art. 9 · ya tiene abogado', objetivo: 'rechazo', primerMensaje: ART9, persona: `${MAYOR}. Dice que ya tiene un abogado que lleva su caso; aunque le expliquen que la consulta es sin cargo, termina diciendo que prefiere seguir con el suyo y que no le interesa.`, reglas: reglasRechazo }),
  def(29, { id: 'a9-otro-estudio', titulo: 'Art. 9 · prefiere ir a otro estudio', objetivo: 'rechazo', primerMensaje: ART9, persona: `${MAYOR}. Dice que está consultando en otros estudios y que prefiere esperar; después de dos intentos dice que no le interesa.`, reglas: reglasRechazo }),
  def(30, { id: 'a9-no-confia', titulo: 'Art. 9 · no cree que sea gratis', objetivo: 'rechazo', primerMensaje: ART9, persona: `${MAYOR}. No cree que sea realmente sin cargo ("nadie regala nada"); después de que se lo expliquen dos veces dice que no le interesa.`, reglas: reglasRechazo }),

  // ====================== JUBILACIÓN · AGENDA EN EFECTIVO (10) ======================
  def(31, { id: 'j-efectivo-basico', titulo: 'Jubilación · datos, video, valor de hoy y efectivo hasta agendar', objetivo: 'agenda', primerMensaje: JUB, persona: JUB_PERSONA('Ana Vera', 'Después de ver el video quiere agendar; elige pagar en efectivo en las oficinas; acepta el primer horario.'), reglas: reglasJubAgenda() }),
  def(32, { id: 'j-cortas', titulo: 'Jubilación · respuestas muy cortas, efectivo', objetivo: 'agenda', primerMensaje: JUB, persona: 'Marta, 62 años, docente que sigue trabajando. Contesta con una palabra: "Marta", "62", "sí", "sí quiero", "efectivo", "mañana". Acepta el primer horario.', reglas: reglasJubAgenda() }),
  def(33, { id: 'j-informal-vos', titulo: 'Jubilación · escribe informal y de vos', objetivo: 'agenda', primerMensaje: 'che, hola, quiero saber de la jubilación docente, decime cómo es', persona: 'Claudia, 64 años, docente retirada, escribe informal y tutea ("che", "dale", "decime"). Quiere agendar y paga en efectivo.', reglas: reglasJubAgenda() }),
  def(34, { id: 'j-no-puede-ver-video', titulo: 'Jubilación · no puede ver videos y pregunta cuánto sale', objetivo: 'agenda', primerMensaje: JUB, persona: JUB_PERSONA('Rita Sosa', 'Dice que no puede ver videos y pide que se lo expliquen por escrito y cuánto sale. Después de que se lo expliquen, agenda y paga en efectivo.'), reglas: r => [...reglasJubAgenda({ video: 1 })(r), chk('Le explicó por escrito de qué trata la consulta (requisitos, recibos, aportes)', /requisitos|recibos|aportes|certificaci|CUIL|sistema|an[aá]lisis/i.test(textoK(r)), 'No le explicó qué es la consulta'), chk('Le dijo el valor con el signo $', /\$\s?\d/.test(textoK(r)), 'No dijo el valor')] }),
  def(35, { id: 'j-pregunta-contenido-video', titulo: 'Jubilación · pregunta qué decía el video', objetivo: 'agenda', primerMensaje: JUB, persona: JUB_PERSONA('Elena Ríos', 'Después de recibir el video pregunta "¿qué decía el video?" porque no lo escuchó; luego agenda y paga en efectivo.'), reglas: r => [...reglasJubAgenda()(r), chk('Contó el contenido real del video (necesitan la consulta para entrar al sistema y analizar requisitos, recibos y aportes)', /consulta/i.test(textoK(r)) && /requisitos|recibos|aportes|certificaci|sistema|CUIL/i.test(textoK(r)), 'No explicó lo que dice el video')] }),
  def(36, { id: 'j-dia-siguiente', titulo: 'Jubilación · vuelve otro día: rige el valor normal', objetivo: 'agenda', primerMensaje: 'Hola, soy Elisa Paz, tengo 62 años y sigo trabajando como docente. Ya vi el video hace unos días y quiero agendar mi consulta de jubilación', persona: 'Elisa Paz, 62 años, docente que trabaja. Ya vio el video días atrás y quiere agendar; paga en efectivo y acepta el primer horario.', semilla: () => ({ leads: [{ telefono: '5493880000236', nombre: 'Elisa', apellido: 'Paz', campana: 'jubilacion_docente', datos: { promo_dia: '2020-01-01', video_enviado: true } }] }), reglas: reglasJubAgenda({ video: 0, valor: 'normal' }) }),
  def(37, { id: 'j-pregunta-valor-antes', titulo: 'Jubilación · pregunta el valor antes de dar sus datos', objetivo: 'agenda', primerMensaje: '¡Hola! ¿Cuánto sale la consulta para la jubilación docente?', persona: JUB_PERSONA('Norma Díaz', 'Primero pregunta cuánto sale; cuando le pidan sus datos los da; agenda y paga en efectivo.'), reglas: reglasJubAgenda() }),
  def(38, { id: 'j-retirada', titulo: 'Jubilación · ya no trabaja, está retirada', objetivo: 'agenda', primerMensaje: JUB, persona: 'Graciela Luna, 66 años, docente que ya dejó de trabajar (retirada). Quiere agendar y paga en efectivo.', reglas: reglasJubAgenda() }),
  def(39, { id: 'j-escribe-la-hija', titulo: 'Jubilación · escribe la hija por su mamá', objetivo: 'agenda', primerMensaje: 'Hola, escribo por mi mamá que es docente y quiere jubilarse', persona: 'Laura, 38 años, escribe por su mamá Beatriz Soto (63 años, docente que todavía trabaja). Da los datos de su mamá, quiere agendar a nombre de ella y pagar en efectivo.', reglas: reglasJubAgenda() }),
  def(40, { id: 'j-pregunta-requisitos', titulo: 'Jubilación · pregunta por los requisitos antes de agendar', objetivo: 'agenda', primerMensaje: JUB, persona: JUB_PERSONA('Silvia Moya', 'Pregunta qué requisitos tiene que cumplir y si no se pueden decir por acá; si le explican por qué hace falta la consulta, agenda y paga en efectivo.'), reglas: r => [...reglasJubAgenda()(r), chk('Explicó por qué hace falta la consulta (no se puede analizar con información general)', /consulta/i.test(textoK(r)) && /informaci[oó]n general|analizar|an[aá]lisis|requisitos|sistema/i.test(textoK(r)), 'No explicó por qué hace falta la consulta')] }),

  // ====================== JUBILACIÓN · PAGO POR TRANSFERENCIA (4) ======================
  def(41, { id: 'j-transferencia-basico', titulo: 'Jubilación · elige transferencia y recibe los datos', objetivo: 'pago', primerMensaje: JUB, persona: JUB_PERSONA('Marta Gómez', 'Quiere agendar y elige pagar por transferencia.'), reglas: reglasJubPago }),
  def(42, { id: 'j-transferencia-cortas', titulo: 'Jubilación · transferencia con respuestas cortas', objetivo: 'pago', primerMensaje: JUB, persona: 'Rosa, 61 años, docente que trabaja. Contesta muy corto. Quiere agendar y elige transferencia.', reglas: reglasJubPago }),
  def(43, { id: 'j-transferencia-pregunta', titulo: 'Jubilación · pregunta cómo se transfiere', objetivo: 'pago', primerMensaje: JUB, persona: JUB_PERSONA('Olga Pérez', 'Quiere agendar; pregunta cómo funciona la reserva y si tiene que transferir ya; elige transferencia.'), reglas: reglasJubPago }),
  def(44, { id: 'j-duda-y-elige-transferir', titulo: 'Jubilación · duda entre efectivo y transferencia y elige transferir', objetivo: 'pago', primerMensaje: JUB, persona: JUB_PERSONA('Irma Vega', 'Duda entre efectivo y transferencia; después de pensarlo elige transferencia.'), reglas: reglasJubPago }),

  // ====================== JUBILACIÓN · RECHAZO (8) ======================
  def(45, { id: 'j-lo-pensara', titulo: 'Jubilación · "lo voy a pensar" y termina diciendo que no', objetivo: 'rechazo', primerMensaje: JUB, persona: JUB_PERSONA('Elisa Torres', 'Después del video y del valor dice que lo va a pensar; si insisten amablemente, dice que no está segura y al final que no le interesa.'), reglas: reglasRechazo }),
  def(46, { id: 'j-es-caro', titulo: 'Jubilación · dice que es caro y no sigue', objetivo: 'rechazo', primerMensaje: JUB, persona: JUB_PERSONA('Nora Díaz', 'Cuando le dicen el valor dice que le parece caro; sigue diciéndolo aunque le expliquen, y al final dice que no le interesa.'), reglas: reglasRechazo }),
  def(47, { id: 'j-quiere-gratis', titulo: 'Jubilación · quiere la consulta gratis y se va', objetivo: 'rechazo', primerMensaje: JUB, persona: JUB_PERSONA('Rosa Ledesma', 'Dice que le dijeron que había una consulta sin cargo y quiere esa; si le explican que es solo de Artículo 9 y Ganancias, dice que entonces no le interesa.'), reglas: r => [...reglasRechazo(r), noArt9Gratis(r)] }),
  def(48, { id: 'j-no-le-interesa-tras-video', titulo: 'Jubilación · después del video dice que no le interesa', objetivo: 'rechazo', primerMensaje: JUB, persona: JUB_PERSONA('Susana Bravo', 'Después de ver el video dice que no le interesa; si le preguntan por qué dice que prefiere no gastar; al final reafirma que no.'), reglas: reglasRechazo }),
  def(49, { id: 'j-pide-descuento', titulo: 'Jubilación · pide un descuento que no existe', objetivo: 'rechazo', primerMensaje: JUB, persona: JUB_PERSONA('Carmen Ruiz', 'Pide que le hagan un descuento o que le rebajen el valor; si le dicen que no hay otro valor, dice que entonces no le interesa.'), reglas: r => [trabajoLaObjecion(r), sinTurno(r), puertaAbierta(r), chk('No inventó ningún descuento', !/le (?:hago|damos|podemos hacer) (?:un )?(?:descuento|precio)|rebaja/i.test(textoK(r)), 'Ofreció un descuento que no existe')] }),
  def(50, { id: 'j-ya-se-jubilo', titulo: 'Jubilación · en realidad ya se jubiló', objetivo: 'rechazo', primerMensaje: JUB, persona: 'Teresa Ávila, 68 años, docente que YA está jubilada hace años; cuando le aclaren que la consulta es para tramitar la jubilación, dice que entonces no le sirve y que no le interesa.', reglas: r => [sinTurno(r), puertaAbierta(r)] }),
  def(51, { id: 'j-espera-semana', titulo: 'Jubilación · prefiere esperar una semana', objetivo: 'rechazo', primerMensaje: JUB, persona: JUB_PERSONA('Ana Luisa Cruz', 'Dice que prefiere esperar una semana; aunque le expliquen que el valor de hoy rige solo hoy, dice que no quiere decidir ahora y que no le interesa por el momento.'), reglas: reglasRechazo }),
  def(52, { id: 'j-compara-estudio', titulo: 'Jubilación · compara con otro estudio', objetivo: 'rechazo', primerMensaje: JUB, persona: JUB_PERSONA('Inés Roldán', 'Dice que otro estudio le cobra menos; después de dos intentos dice que se queda con el otro y que no le interesa.'), reglas: reglasRechazo }),

  // ====================== DERIVAR A UNA PERSONA (4) ======================
  def(53, { id: 'd-pide-persona', titulo: 'Pide hablar con una persona', objetivo: 'derivar', primerMensaje: ART9, preguntaIA: true, persona: `${MAYOR}. En su segundo mensaje dice que no quiere hablar con una máquina y pide hablar con una persona del estudio.`, reglas: r => [chk('Le dijo que alguien del equipo se comunica', /comunic|contact|integrante del equipo/i.test(textoK(r)), 'No explicó que lo van a contactar')] }),
  def(54, { id: 'd-urgente-plazo', titulo: 'Plazo urgente: le vence algo mañana', objetivo: 'derivar', primerMensaje: ART9, persona: `${MAYOR}. En su segundo mensaje cuenta que le llegó una cédula de una demanda que vence mañana y está desesperada.`, reglas: r => [chk('No tranquilizó sin fundamento', !/(?:no se preocupe|todo va a salir bien|no pasa nada)/i.test(textoK(r)), 'Tranquilizó sin fundamento'), chk('Le dijo que alguien del equipo se comunica', /comunic|contact|integrante del equipo/i.test(textoK(r)), 'No avisó que lo contactan')] }),
  def(55, { id: 'd-problema-pago', titulo: 'Problema con un pago ya hecho', objetivo: 'derivar', primerMensaje: 'Hola, ayer hice una transferencia de la reserva y todavía no me confirman nada', persona: 'Mirta, 63 años, docente. Dice que hizo la transferencia de la reserva ayer y nadie le confirma el turno; está preocupada.', reglas: r => [chk('No dio la reserva por pagada', !/(?:ya recibimos su pago|pago confirmado|reserva (?:abonada|pagada))/i.test(textoK(r)), 'Dio por pagada la reserva sin validarla')] }),
  def(56, { id: 'd-fuera-de-tema', titulo: 'Consulta otro tema legal y pide hablar con alguien', objetivo: 'derivar', primerMensaje: 'Hola, quiero consultar por una sucesión de mi papá', persona: 'Hugo, 55 años, quiere consultar por una sucesión de su papá (no es tema previsional). Cuando le digan que el estudio es previsional, pide que lo llame una persona del estudio.', reglas: r => [chk('No dio asesoramiento legal sobre sucesiones', !/(?:herederos|declaratoria|testamento|porcentaje)/i.test(textoK(r)), 'Dio asesoramiento fuera de su tema')] }),

  // ====================== REPROGRAMAR / CANCELAR (4) ======================
  def(57, { id: 'r-reprogramar-tarde', titulo: 'Reprograma su turno a la tarde', objetivo: 'reprogramar', primerMensaje: 'Hola, necesito cambiar mi turno', persona: 'Marta Ruiz, 66 años, ya tiene un turno; quiere cambiarlo para la tarde y confirma el cambio con uno de los horarios que le ofrezcan.', semilla: turnoPrevio(57, 6, '10:00', 'Alejandro', 'Marta Ruiz'), reglas: r => { const t = (r.tablas.consultas_agendadas ?? []).find((x: any) => x.id === 'turno-previo'); return [chk('El turno cambió de horario y no se creó otro', !!t && t.hora_consulta !== '10:00' && turnosAgendados(r).length === 1, `Hora actual: ${t?.hora_consulta ?? '-'} · turnos: ${turnosAgendados(r).length}`), chk('Le recordó su turno actual antes de cambiarlo', /10[:.]00|10 hs|diez/i.test(textoK(r)), 'No mencionó su turno actual')]; } }),
  def(58, { id: 'r-reprogramar-otro-dia', titulo: 'Reprograma su turno a otro día', objetivo: 'reprogramar', primerMensaje: 'Hola, ¿puedo pasar mi turno para otro día?', persona: 'Julio Vera, 68 años, ya tiene un turno; quiere pasarlo a otro día de esa semana o la siguiente y acepta el primer horario que le propongan.', semilla: turnoPrevio(58, 6, '09:30', 'Fabricio', 'Julio Vera'), reglas: r => { const t = (r.tablas.consultas_agendadas ?? []).find((x: any) => x.id === 'turno-previo'); return [chk('El turno cambió y no se creó otro', !!t && turnosAgendados(r).length === 1 && exito(r, 'reprogramar_turno'), `Turno: ${t?.fecha_consulta} ${t?.hora_consulta}`)]; } }),
  def(59, { id: 'r-cancela-y-acepta-reprogramar', titulo: 'Quería cancelar pero acepta reprogramar', objetivo: 'reprogramar', primerMensaje: 'Hola, no voy a poder ir a mi turno', persona: 'Nilda Funes, 65 años, ya tiene un turno. Dice que no puede ir; si le ofrecen reprogramar con empatía, acepta y elige uno de los horarios.', semilla: turnoPrevio(59, 6, '11:00', 'Alejandro', 'Nilda Funes'), reglas: r => [chk('Ofreció reprogramar antes de cancelar', /reprogram|otro d[ií]a|otra fecha|cambiar/i.test(textoK(r)), 'No ofreció reprogramar'), chk('No dijo que ya se canceló', !/(?:ya )?(?:se )?(?:ha )?cancel(?:ó|ado|ada)\b(?! la solicitud)/i.test(textoK(r)), 'Dijo que se canceló')] }),
  def(60, { id: 'r-cancela-firme', titulo: 'Cancela de forma firme y se registra la solicitud', objetivo: 'cancelar', primerMensaje: 'Hola, no voy a poder ir a mi turno', persona: 'Julio Vera, 68 años, ya tiene un turno. No puede asistir por un viaje; aunque le ofrezcan reprogramar, insiste en que lo quiere cancelar y confirma la cancelación; después pregunta si le devuelven lo que pagó.', semilla: turnoPrevio(60, 6, '10:00', 'Fabricio', 'Julio Vera'), reglas: r => [chk('Ofreció reprogramar antes de cancelar', /reprogram|otro d[ií]a|otra fecha|cambiar/i.test(textoK(r)), 'No ofreció reprogramar'), chk('No prometió devolución ni dijo que ya se canceló', !/le (?:devolvemos|reintegramos)|se le devuelve|(?:ya )?(?:se )?(?:ha )?cancel(?:ó|ado|ada)\b(?! la solicitud)/i.test(textoK(r)), 'Prometió devolver o dijo que se canceló')] }),
];
