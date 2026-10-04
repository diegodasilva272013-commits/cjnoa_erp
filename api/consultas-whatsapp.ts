import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/consultas-whatsapp
 *
 * Trae las consultas que llegan por WhatsApp al agente de IA (ElevenLabs)
 * desde la plataforma Areté (repo aparte: "Camino al Closing"), que es
 * donde vive la tabla cjnoa_consultas. Nunca exponemos acá esa base ni
 * su service role key — este endpoint solo reenvía con un secret propio.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const secret = process.env.CJNOA_ERP_READ_SECRET;
  if (!secret) return res.status(500).json({ error: 'Falta CJNOA_ERP_READ_SECRET' });

  try {
    const r = await fetch('https://aretesoluciones.space/api/webhooks/cjnoa-consultas-list', {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await r.json();
    if (!r.ok) return res.status(r.status).json(body);
    return res.status(200).json(body);
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : 'Error al conectar con Areté' });
  }
}
