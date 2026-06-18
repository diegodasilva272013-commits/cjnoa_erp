import type { VercelRequest, VercelResponse } from '@vercel/node';

// Body esperado: { pdf_base64: string, nombre?: string }
// Retorna: { turnos: Array<{ titulo, fecha, hora, ubicacion, descripcion, persona, cuil, numero_solicitud }> }
// Usa Anthropic Claude que soporta PDFs nativamente (sin necesidad de convertir a imagen).
// Requiere la variable de entorno ANTHROPIC_API_KEY.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

  const { pdf_base64, nombre } = (req.body || {}) as { pdf_base64?: string; nombre?: string };
  if (!pdf_base64) return res.status(400).json({ error: 'pdf_base64 requerido' });

  const prompt = `Extraé todos los turnos, audiencias, citas o eventos de este documento PDF.
Devolvé SOLO JSON válido (sin markdown, sin explicaciones) con esta forma exacta:
{
  "turnos": [
    {
      "titulo": "string corto: ej 'Turno ANSES - Jubilación - MACHACA CELIA'",
      "fecha": "YYYY-MM-DD",
      "hora": "HH:MM",
      "ubicacion": "string opcional (oficina/dirección)",
      "descripcion": "detalles: CUIL, número de solicitud, apoderado, observaciones",
      "persona": "nombre y apellido del titular",
      "cuil": "string opcional",
      "oficina": "string opcional",
      "numero_solicitud": "string opcional"
    }
  ]
}
Reglas:
- Si la fecha está en formato DD/MM/AAAA, convertila a YYYY-MM-DD.
- Si la hora viene como '10:00:00 hs', devolvé solo 'HH:MM'.
- Si el documento tiene múltiples turnos, devolvelos todos en el array.
- Si no hay eventos o no podés interpretarlo, devolvé {"turnos": []}.
- NO inventes datos. Si un campo no aparece, dejalo como string vacío.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdf_base64,
                },
                ...(nombre ? { title: nombre } : {}),
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    const j = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'anthropic_error', details: j });

    const txt: string = j?.content?.[0]?.text || '{}';
    let parsed: any = {};
    try {
      const match = txt.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { turnos: [] };
    } catch {
      parsed = { turnos: [] };
    }
    const turnos = Array.isArray(parsed.turnos) ? parsed.turnos : [];
    return res.status(200).json({ turnos });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'error desconocido' });
  }
}
