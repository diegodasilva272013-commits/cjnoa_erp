import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });

  const { tipo, datos } = req.body as { tipo: 'analizar_caso' | 'analizar_previsional' | 'calcular_score' | 'resumen_caso'; datos: Record<string, unknown> };

  let prompt = '';

  if (tipo === 'analizar_caso') {
    prompt = `Sos un asistente legal argentino para un estudio jurídico. Analizá el siguiente caso y brindá:
1. Un resumen ejecutivo del estado actual (2-3 oraciones)
2. Los próximos pasos recomendados (lista numerada, máximo 5)
3. Riesgos o puntos de atención (si hay)

Caso:
- Cliente: ${datos.nombre_apellido}
- Materia: ${datos.materia}
- Estado: ${datos.estado}
- Honorarios acordados: $${datos.honorarios_monto}
- Saldo pendiente: $${datos.saldo_pendiente}
- Observaciones: ${datos.observaciones || 'Sin observaciones'}
- Movimientos recientes: ${JSON.stringify(datos.movimientos || [])}

Respondé en español argentino, de forma concisa y profesional. Formato JSON con claves: resumen, proximos_pasos (array), riesgos (array, puede estar vacío).`;

  } else if (tipo === 'analizar_previsional') {
    prompt = `Sos un especialista en jubilaciones y previsión social argentina. Analizá el perfil del cliente y brindá:
1. Diagnóstico del estado de su trámite jubilatorio
2. Próximos pasos recomendados
3. Puntos de atención o riesgos

Cliente:
- Nombre: ${datos.apellido_nombre}
- CUIL: ${datos.cuil}
- Fecha de nacimiento: ${datos.fecha_nacimiento}
- Sexo: ${datos.sexo}
- Pipeline: ${datos.pipeline}
- Meses laborados con aportes: ${datos.meses_laborados}
- Meses moratoria (Ley 24476): ${datos.meses_moratoria_24476 || 0}
- Meses moratoria (Ley 27705): ${datos.meses_moratoria_27705 || 0}
- Total meses consolidados: ${datos.total_consolidado}
- Resumen informe: ${datos.resumen_informe || 'Sin datos'}
- Historial de avances: ${JSON.stringify(datos.historial || [])}

Respondé en español argentino. Formato JSON con claves: resumen, proximos_pasos (array), riesgos (array).`;

  } else if (tipo === 'calcular_score') {
    prompt = `Calculá un score de 0 a 100 sobre la probabilidad de éxito del trámite jubilatorio de este cliente.

Criterios a evaluar:
- Meses totales consolidados vs 360 necesarios: ${datos.total_consolidado}/360
- Edad actual vs edad jubilatoria: ${datos.edad}/${datos.sexo === 'MUJER' ? 60 : 65}
- Documentación completa: ${datos.tiene_documentacion ? 'Sí' : 'No'}
- Coherencia de aportes: ${datos.coherencia_aportes || 'No evaluada'}
- Pipeline actual: ${datos.pipeline}

Respondé SOLO un JSON con: { "score": número_entre_0_y_100, "justificacion": "texto breve de 1-2 oraciones" }`;
  } else if (tipo === 'resumen_caso') {
    prompt = `Sos un asistente legal argentino. Generá un resumen ejecutivo del caso para que cualquier abogado del estudio se ponga al día sin consultar al procurador.

Datos generales del caso:
- Cliente: ${datos.cliente_nombre}
- Expediente: ${datos.expediente || 'sin número'}
- Radicado: ${datos.radicado || 'no informado'}
- Materia: ${datos.materia}
- Sistema: ${datos.sistema || 'no informado'}
- Personería: ${datos.personeria || 'no informado'}
- Estado: ${datos.estado}
- Prioridad: ${datos.prioridad}
- Archivado: ${datos.archivado ? 'sí' : 'no'}

Historial cronológico de avances (más reciente primero):
${JSON.stringify(datos.historial || [], null, 2)}

Tareas activas vinculadas:
${JSON.stringify(datos.tareas || [], null, 2)}

Próximas audiencias:
${JSON.stringify(datos.audiencias || [], null, 2)}

Respondé en español argentino, formato JSON con claves:
{
  "resumen": "2-4 oraciones del estado actual",
  "ultimos_avances": ["punto 1", "punto 2", "punto 3"],
  "proximos_pasos": ["acción 1", "acción 2"],
  "alertas": ["alerta 1 si la hay", ...]
}`;
  }

  if (!prompt) return res.status(400).json({ error: 'Tipo no válido' });

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      return res.status(500).json({ error: `OpenAI error: ${err}` });
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return res.status(200).json(parsed);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error desconocido' });
  }
}
