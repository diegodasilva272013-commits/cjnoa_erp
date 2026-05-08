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
    const systemPrompt = `Sos NOA, un asistente de voz para un estudio jurídico argentino. El usuario te habla en español.

Tu trabajo:
1. Entender qué quiere hacer el usuario.
2. Devolver un PLAN en JSON con la(s) acción(es) a ejecutar usando las "tools" disponibles.
3. NO ejecutás nada vos: el cliente lo hace tras confirmar.

Reglas:
- Si el pedido es ambiguo o falta info clave, devolvé tool "consultar" con una pregunta o respuesta corta.
- Para acciones destructivas (crear tarea/nota/evento, marcar escrito), siempre incluí un campo "explicacion_humana" en el plan describiendo qué se va a hacer (ej: "Voy a crear una tarea 'Llamar a Pérez' asignada a Karina con prioridad alta").
- Cuando el usuario menciona a una persona del equipo por nombre, mapealo al UUID de la lista equipo. Si no existe, devolvé tool "consultar" pidiendo aclaración.
- Cuando menciona un caso/cliente, mapealo al UUID de casos_recientes. Si no lo encontrás, decílo.
- Si el usuario hace una pregunta de solo lectura ("¿qué tengo hoy?", "¿cuántas tareas pendientes?"), respondé con tool "consultar" basándote en lo que ves en el contexto.
- Sé breve, hablá en español argentino natural.

CONTEXTO ACTUAL:
- Usuario: ${contexto.usuario.nombre} (rol: ${contexto.usuario.rol}, id: ${contexto.usuario.id})
- Fecha hoy: ${contexto.fecha_actual}
- Equipo: ${JSON.stringify(contexto.equipo)}
- Casos recientes (últimos 50): ${JSON.stringify(contexto.casos_recientes.slice(0, 50))}

TOOLS DISPONIBLES (devolvé el plan respetando estos schemas):
${TOOLS.map(t => `- ${t.name}: ${t.description}\n  schema: ${JSON.stringify(t.parameters)}`).join('\n')}

FORMATO DE RESPUESTA (JSON estricto):
{
  "tool": "<nombre de la tool>",
  "args": { ... según schema ... },
  "explicacion_humana": "Qué vas a hacer en una oración",
  "respuesta_voz": "Lo que el agente le va a leer al usuario al terminar (corto, máximo 1-2 oraciones)"
}`;

    const llmRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcripcion },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 600,
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
