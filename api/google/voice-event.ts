import type { VercelRequest, VercelResponse } from '@vercel/node';

// Body: { audio_base64: string, mime?: string, fechaHoy?: string (YYYY-MM-DD) }
// Devuelve: { transcripcion, evento: { titulo, fecha, hora, duracion_min, ubicacion, descripcion, todoElDia } }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.api_openai || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'api_openai no configurada' });

  try {
    const { audio_base64, mime, fechaHoy } = (req.body || {}) as {
      audio_base64?: string; mime?: string; fechaHoy?: string;
    };
    if (!audio_base64) return res.status(400).json({ error: 'audio_base64 requerido' });

    // 1) Transcribir con Whisper
    const buffer = Buffer.from(audio_base64, 'base64');
    const ext = (mime || 'audio/webm').split('/')[1].split(';')[0] || 'webm';
    const fileName = `nota.${ext}`;

    const form = new FormData();
    const blob = new Blob([buffer], { type: mime || 'audio/webm' });
    form.append('file', blob, fileName);
    form.append('model', 'whisper-1');
    form.append('language', 'es');

    const trR = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form as any,
    });
    const trJ = await trR.json();
    if (!trR.ok) return res.status(500).json({ error: 'whisper_error', details: trJ });
    const transcripcion: string = trJ.text || '';

    if (!transcripcion.trim()) {
      return res.status(200).json({ transcripcion: '', evento: null });
    }

    // 2) Extraer datos estructurados con GPT
    const hoy = fechaHoy || new Date().toISOString().slice(0, 10);
    const sistema = `Sos un asistente que convierte una frase hablada en español argentino en un evento de calendario.
Hoy es ${hoy}. Interpretá referencias temporales relativas ("mañana", "el lunes", "en 2 horas", "pasado mañana a las 10") respecto a esa fecha.
Devolvé SOLO JSON sin markdown, con esta forma:
{
  "titulo": "string corto y claro",
  "fecha": "YYYY-MM-DD",
  "hora": "HH:MM",
  "duracion_min": número (default 60),
  "ubicacion": "string opcional",
  "descripcion": "string opcional, detalles extra",
  "todoElDia": boolean
}
Si la persona no especifica hora, asumí 10:00. Si no especifica duración, asumí 60.
NO inventes ubicación si no fue mencionada (devolvé "").`;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: `Frase: "${transcripcion}"` },
        ],
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'openai_error', details: j, transcripcion });

    let evento: any = {};
    try { evento = JSON.parse(j?.choices?.[0]?.message?.content || '{}'); } catch { evento = {}; }

    return res.status(200).json({ transcripcion, evento });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'error' });
  }
}
