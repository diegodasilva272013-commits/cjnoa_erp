import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================
// Agente de voz: recibe audio (base64), transcribe con Whisper,
// y arma un plan de "tool calls" con GPT-4o-mini.
// La ejecución la hace el cliente (con su sesión de Supabase, así
// las RLS controlan quién puede hacer qué) tras confirmar.
// ============================================================

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  destructiva: boolean; // true => modifica datos => requiere confirmación
}

const TOOLS: ToolDef[] = [
  {
    name: 'crear_tarea',
    description: 'Crear una tarea nueva. Si el usuario menciona un cliente o caso, usar el caso_id de la lista de contexto. Si menciona a otro usuario como responsable, usar el responsable_id de la lista de equipo.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título corto y claro de la tarea' },
        descripcion: { type: 'string', description: 'Detalle, opcional' },
        responsable_id: { type: 'string', description: 'UUID del usuario responsable (de la lista de equipo). Si no se especifica, usar el del usuario actual.' },
        caso_id: { type: 'string', description: 'UUID del caso al que pertenece, opcional' },
        prioridad: { type: 'string', enum: ['alta', 'media', 'baja'], description: 'Prioridad' },
        fecha_limite: { type: 'string', description: 'Fecha límite ISO (YYYY-MM-DD), opcional' },
      },
      required: ['titulo'],
    },
    destructiva: true,
  },
  {
    name: 'crear_nota_caso',
    description: 'Agregar una nota al seguimiento de un caso (caso_general_notas). El caso_id debe venir de la lista de casos del contexto.',
    parameters: {
      type: 'object',
      properties: {
        caso_id: { type: 'string', description: 'UUID del caso' },
        contenido: { type: 'string', description: 'Texto de la nota' },
      },
      required: ['caso_id', 'contenido'],
    },
    destructiva: true,
  },
  {
    name: 'marcar_escrito_subido',
    description: 'Marcar el escrito de un caso como SUBIDO o destildarlo. Inicia el contador de 7 días para verificar.',
    parameters: {
      type: 'object',
      properties: {
        caso_id: { type: 'string', description: 'UUID del caso' },
        subido: { type: 'boolean', description: 'true para marcar subido, false para destildar' },
      },
      required: ['caso_id', 'subido'],
    },
    destructiva: true,
  },
  {
    name: 'crear_evento_agenda',
    description: 'Crear una audiencia o evento en agenda. Usar tabla audiencias_general.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        fecha: { type: 'string', description: 'Fecha ISO YYYY-MM-DD' },
        hora: { type: 'string', description: 'Hora HH:MM, opcional' },
        observaciones: { type: 'string', description: 'Notas, opcional' },
        caso_general_id: { type: 'string', description: 'UUID del caso, opcional' },
      },
      required: ['titulo', 'fecha'],
    },
    destructiva: true,
  },
  {
    name: 'consultar',
    description: 'Acción de SOLO LECTURA. Usar cuando el usuario pregunta cosas tipo "qué tengo hoy", "cuántas tareas pendientes tengo", "buscame el caso de Pérez". El cliente ya tiene la info en el contexto, así que sólo hay que devolver una respuesta en lenguaje natural.',
    parameters: {
      type: 'object',
      properties: {
        respuesta: { type: 'string', description: 'Respuesta en español argentino, breve y clara, basada en el contexto.' },
      },
      required: ['respuesta'],
    },
    destructiva: false,
  },
  {
    name: 'registrar_ingreso',
    description: 'Registrar un ingreso/cobro. monto_total es el bruto, socio_cobro es quien cobró (Rodrigo/Noelia/Alejandro/Marianela/Fabricio). Si no se aclara modalidad asumir Efectivo.',
    parameters: {
      type: 'object',
      properties: {
        cliente_nombre: { type: 'string' },
        concepto: { type: 'string' },
        monto_total: { type: 'number', description: 'Monto bruto en pesos' },
        socio_cobro: { type: 'string', description: 'Nombre del socio que cobró' },
        modalidad: { type: 'string', enum: ['Efectivo', 'Transferencia'] },
        materia: { type: 'string' },
        fecha: { type: 'string', description: 'YYYY-MM-DD, default hoy' },
        notas: { type: 'string' },
      },
      required: ['monto_total', 'socio_cobro'],
    },
    destructiva: true,
  },
  {
    name: 'registrar_egreso',
    description: 'Registrar un egreso/gasto. Categorías típicas: Sueldos, Servicios, Gastos Judiciales, Insumos, Otro.',
    parameters: {
      type: 'object',
      properties: {
        concepto: { type: 'string', description: 'Descripción del gasto' },
        monto: { type: 'number' },
        modalidad: { type: 'string', enum: ['Efectivo', 'Transferencia'] },
        responsable: { type: 'string', description: 'Quién pagó (nombre del socio)' },
        fecha: { type: 'string', description: 'YYYY-MM-DD, default hoy' },
        observaciones: { type: 'string' },
      },
      required: ['concepto', 'monto'],
    },
    destructiva: true,
  },
  {
    name: 'agregar_avance_previsional',
    description: 'Agregar un avance/historial a una ficha de cliente previsional. cliente_id es UUID de la lista clientes_previsional_recientes del contexto.',
    parameters: {
      type: 'object',
      properties: {
        cliente_id: { type: 'string', description: 'UUID del cliente previsional' },
        descripcion: { type: 'string', description: 'Texto del avance' },
      },
      required: ['cliente_id', 'descripcion'],
    },
    destructiva: true,
  },
  {
    name: 'cambiar_pipeline_previsional',
    description: 'Mover una ficha previsional a otro pipeline. Pipelines validos: seguimiento, jubi_especiales, ucap, jubi_ordinarias, finalizado, descartado.',
    parameters: {
      type: 'object',
      properties: {
        cliente_id: { type: 'string' },
        pipeline: { type: 'string', enum: ['seguimiento','jubi_especiales','ucap','jubi_ordinarias','finalizado','descartado'] },
      },
      required: ['cliente_id', 'pipeline'],
    },
    destructiva: true,
  },
  {
    name: 'iniciar_cronometro_tarea',
    description: 'Iniciar el cronómetro de una tarea (estado_dia=en_progreso). El usuario debe ser responsable o tener un paso asignado. Usar el id de la lista de tareas del contexto.',
    parameters: {
      type: 'object',
      properties: {
        tarea_id: { type: 'string', description: 'UUID de la tarea' },
      },
      required: ['tarea_id'],
    },
    destructiva: true,
  },
  {
    name: 'pausar_cronometro_tarea',
    description: 'Pausar el cronómetro de una tarea en curso.',
    parameters: {
      type: 'object',
      properties: {
        tarea_id: { type: 'string' },
      },
      required: ['tarea_id'],
    },
    destructiva: true,
  },
  {
    name: 'completar_tarea',
    description: 'Marcar una tarea como completada. culminacion es opcional (resumen de cómo cerró).',
    parameters: {
      type: 'object',
      properties: {
        tarea_id: { type: 'string' },
        culminacion: { type: 'string' },
      },
      required: ['tarea_id'],
    },
    destructiva: true,
  },
  {
    name: 'verificar_escrito',
    description: 'Marcar que se verifico el escrito de un caso (reinicia el contador de 7 dias).',
    parameters: {
      type: 'object',
      properties: {
        caso_id: { type: 'string' },
      },
      required: ['caso_id'],
    },
    destructiva: true,
  },
  {
    name: 'obtener_datos_caso',
    description: 'Devolver al usuario los datos completos de un caso: titulo, expediente, fuero, juzgado, parte actora/demandada, estado del escrito, ultimas notas y tareas pendientes. Usar cuando el usuario pregunta cosas como "contame del caso de Perez", "como va el expediente Garcia", "datos del caso". El cliente hace la query a Supabase y lee la respuesta. NO requiere confirmacion.',
    parameters: {
      type: 'object',
      properties: {
        caso_id: { type: 'string', description: 'UUID del caso (de la lista casos_recientes)' },
      },
      required: ['caso_id'],
    },
    destructiva: false,
  },
  {
    name: 'obtener_datos_ficha_previsional',
    description: 'Devolver datos completos de una ficha previsional: apellido_nombre, dni, cuil, pipeline, edad, telefono, ultimos avances. Usar cuando preguntan por un cliente previsional. NO requiere confirmacion.',
    parameters: {
      type: 'object',
      properties: {
        cliente_id: { type: 'string', description: 'UUID del cliente previsional' },
      },
      required: ['cliente_id'],
    },
    destructiva: false,
  },
  {
    name: 'obtener_datos_tarea',
    description: 'Devolver datos de una tarea: titulo, descripcion, estado, prioridad, fecha limite, responsable, pasos. Usar para "como va la tarea X".',
    parameters: {
      type: 'object',
      properties: {
        tarea_id: { type: 'string' },
      },
      required: ['tarea_id'],
    },
    destructiva: false,
  },
  {
    name: 'listar_tareas_pendientes',
    description: 'Listar tareas pendientes del usuario actual (o de un responsable_id especifico si lo aclaran). NO requiere confirmacion.',
    parameters: {
      type: 'object',
      properties: {
        responsable_id: { type: 'string', description: 'UUID del responsable, opcional. Si no se pasa, usa el del usuario actual.' },
        solo_hoy: { type: 'boolean', description: 'true si quiere solo las de hoy/atrasadas' },
      },
    },
    destructiva: false,
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.api_openai || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'api_openai no configurada' });

  try {
    const { audio_base64, audio_mime, contexto, transcripcion_directa } = req.body as {
      audio_base64?: string;
      audio_mime?: string;
      contexto: {
        usuario: { id: string; nombre: string; rol: string };
        fecha_actual: string;
        equipo: Array<{ id: string; nombre: string; rol: string }>;
        casos_recientes: Array<{ id: string; titulo: string; cliente_nombre?: string; expediente?: string }>;
        clientes_recientes?: Array<{ id: string; nombre: string }>;
        clientes_previsional_recientes?: Array<{ id: string; apellido_nombre: string; pipeline?: string }>;
        tareas_recientes?: Array<{ id: string; titulo: string; estado?: string; estado_dia?: string }>;
      };
      transcripcion_directa?: string;
    };

    if (!contexto?.usuario?.id) return res.status(400).json({ error: 'Falta contexto del usuario' });

    // ---- 1) Transcribir audio (o usar transcripción directa) ----
    let transcripcion = transcripcion_directa || '';
    if (!transcripcion && audio_base64) {
      const buf = Buffer.from(audio_base64, 'base64');
      const blob = new Blob([buf], { type: audio_mime || 'audio/webm' });
      const fd = new FormData();
      fd.append('file', blob, 'audio.webm');
      fd.append('model', 'whisper-1');
      fd.append('language', 'es');

      const sttRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd as any,
      });
      if (!sttRes.ok) {
        const err = await sttRes.text();
        return res.status(500).json({ error: `Whisper error: ${err}` });
      }
      const sttJson = await sttRes.json();
      transcripcion = sttJson.text || '';
    }

    if (!transcripcion.trim()) {
      return res.status(200).json({ transcripcion: '', plan: null, error: 'No se entendió el audio' });
    }

    // ---- 2) LLM con tools ----
    const systemPrompt = `Sos NOA (te llaman "CJ"), el asistente de voz inteligente del estudio juridico Caceres Jure y Asociados (Argentina). El usuario te habla en español argentino, en lenguaje informal y a veces con muletillas.

Tu trabajo:
1. Entender con precision QUE quiere hacer o saber el usuario, aunque hable rapido o no estructurado.
2. Si pide INFORMACION sobre algo (caso, cliente, tarea), elegi la tool de lectura correspondiente (obtener_datos_caso, obtener_datos_ficha_previsional, obtener_datos_tarea, listar_tareas_pendientes). El cliente buscara los datos en la base.
3. Si pide hacer una accion (crear/modificar/registrar), usa la tool destructiva correspondiente.
4. Si la pregunta es general ("que tengo hoy", "como vamos"), usa "consultar" con respuesta breve basada en el contexto.

Reglas clave:
- Cuando menciona personas o casos por nombre parcial ("el caso de Perez", "Karina", "Mendez"), HACE FUZZY MATCH contra la lista del contexto y elegi el id mas probable. NO inventes UUIDs.
- Si hay AMBIGUEDAD real (ej: dos casos con el mismo apellido), usa "consultar" preguntando cual de ellos.
- Si el usuario dice "el caso" o "esa tarea" sin nombre, asumi que se refiere al ultimo mencionado o al mas reciente del contexto.
- Para acciones destructivas, en "explicacion_humana" describi exactamente que va a pasar (ej: "Voy a crear la tarea 'Llamar a Perez' asignada a Karina con prioridad alta para el viernes").
- En "respuesta_voz" hablale natural: "Listo Diego, agendado" / "Ahí te paso los datos de Perez" / "Tenes 5 tareas pendientes hoy". Maximo 1-2 oraciones.
- NO uses tecnicismos en respuesta_voz, hablale como una secretaria copada.
- Para tools de lectura (no destructivas), respuesta_voz puede ser un "Dale, lo busco" porque luego el cliente lee los datos en voz alta.

CONTEXTO ACTUAL:
- Usuario: ${contexto.usuario.nombre} (rol: ${contexto.usuario.rol}, id: ${contexto.usuario.id})
- Fecha hoy: ${contexto.fecha_actual}
- Equipo: ${JSON.stringify(contexto.equipo)}
- Casos recientes (ultimos 50): ${JSON.stringify(contexto.casos_recientes.slice(0, 50))}
- Clientes previsionales recientes: ${JSON.stringify((contexto.clientes_previsional_recientes || []).slice(0, 30))}
- Tareas recientes (mias o donde participo): ${JSON.stringify((contexto.tareas_recientes || []).slice(0, 30))}

TOOLS DISPONIBLES (devolve el plan respetando estos schemas):
${TOOLS.map(t => `- ${t.name}: ${t.description}\n  schema: ${JSON.stringify(t.parameters)}`).join('\n')}

FORMATO DE RESPUESTA (JSON estricto, sin markdown, sin texto extra):
{
  "tool": "<nombre>",
  "args": { ... segun schema ... },
  "explicacion_humana": "Que vas a hacer en una oracion",
  "respuesta_voz": "Lo que el agente le lee al usuario"
}`;

    const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcripcion },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!llmRes.ok) {
      const err = await llmRes.text();
      return res.status(500).json({ transcripcion, error: `LLM error: ${err}` });
    }

    const llmJson = await llmRes.json();
    const content = llmJson.choices?.[0]?.message?.content;
    let plan: any = null;
    try { plan = JSON.parse(content); } catch { /* noop */ }

    if (!plan?.tool) {
      return res.status(200).json({
        transcripcion,
        plan: null,
        error: 'No pude armar un plan con esa instrucción. Probá ser más específico.',
      });
    }

    const def = TOOLS.find(t => t.name === plan.tool);
    if (!def) {
      return res.status(200).json({ transcripcion, plan: null, error: `Tool desconocida: ${plan.tool}` });
    }

    return res.status(200).json({
      transcripcion,
      plan: {
        tool: plan.tool,
        args: plan.args || {},
        explicacion_humana: plan.explicacion_humana || '',
        respuesta_voz: plan.respuesta_voz || '',
        destructiva: def.destructiva,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error desconocido' });
  }
}
