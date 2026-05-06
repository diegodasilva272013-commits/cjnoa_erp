import type { VercelRequest, VercelResponse } from '@vercel/node';

// Body esperado: { images: string[] }  donde cada imagen es un dataURL (data:image/...;base64,...)
// Retorna: { turnos: Array<{ titulo, fecha, hora, ubicacion, descripcion, persona, cuil, oficina, numero_solicitud, raw }> }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.api_openai || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'api_openai no configurada' });

  const { images } = (req.body || {}) as { images?: string[] };
  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'images[] requerido (data URLs)' });
  }

  const sistema = `Sos un asistente que extrae datos de constancias / capturas de turnos (ANSES, juzgados, hospitales, citas, recordatorios, etc.) en español argentino.
Devolvé SOLO JSON válido (sin markdown, sin explicaciones) con esta forma exacta:
{
  "turnos": [
    {
      "titulo": "string corto: ej 'Turno ANSES - Jubilación - MACHACA CELIA ALICIA'",
      "fecha": "YYYY-MM-DD",
      "hora": "HH:MM",
      "ubicacion": "string opcional (oficina/dirección)",
      "descripcion": "string con CUIL, número de solicitud, apoderado, observaciones",
      "persona": "nombre y apellido del titular",
      "cuil": "string opcional",
      "oficina": "string opcional",
      "numero_solicitud": "string opcional"
    }
  ]
}
Reglas:
- Si la fecha está en formato DD/MM/AAAA, convertila a YYYY-MM-DD.
- Si la hora viene como '10:00:00 hs' o '08:00 h.', devolvé solo 'HH:MM'.
- Una imagen puede contener un único turno; devolvé un objeto por imagen, en el mismo orden.
- Si no podés interpretar una imagen, igual devolvé un objeto con campos vacíos para mantener el orden.
- NO inventes datos. Si un campo no aparece en la imagen, devolvelo como string vacío.`;

  // Armar el contenido multimodal
  const userContent: any[] = [
    { type: 'text', text: 'Extraé los datos de los siguientes turnos / constancias. Devolvé solo el JSON.' },
  ];
  for (const img of images) {
    if (typeof img === 'string' && img.startsWith('data:image/')) {
      userContent.push({ type: 'image_url', image_url: { url: img } });
    }
  }

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: userContent },
        ],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'openai_error', details: j });
    const txt: string = j?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(txt); } catch { parsed = { turnos: [] }; }
    const turnos = Array.isArray(parsed.turnos) ? parsed.turnos : [];
    return res.status(200).json({ turnos });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'error' });
  }
}
