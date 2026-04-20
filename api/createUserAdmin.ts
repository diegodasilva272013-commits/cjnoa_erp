import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Faltan variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { email, password, nombre } = req.body;
  if (!email || !password || !nombre) {
    return res.status(400).json({ error: 'Faltan datos obligatorios (email, password, nombre)' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirma el email automáticamente sin enviar correo
      user_metadata: { nombre },
    });
    if (error) throw error;
    return res.status(200).json({ user: data.user });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
