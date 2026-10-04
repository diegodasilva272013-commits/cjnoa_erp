import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/consultas-whatsapp
 *
 * Trae las consultas que llegan por WhatsApp al agente de IA (ElevenLabs)
 * desde la plataforma Areté (repo aparte: "Camino al Closing"), que es
 * donde vive la tabla cjnoa_consultas. Nunca exponemos acá esa base ni
 * su service role key — este endpoint solo reenvía con un secret propio.
 *
 * Son datos de clientes (nombre, teléfono, caso), así que exige una
 * sesión válida de este ERP (Authorization: Bearer <access_token>) antes
 * de reenviar nada — si no, cualquiera que encontrara esta URL podía ver
 * las consultas sin loguearse.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Faltan variables de entorno de Supabase' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });

  const supabase = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Sesión inválida' });

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
