import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

async function refreshAccessTokenIfNeeded(supabase: any, row: any, clientId: string, clientSecret: string) {
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 30_000 && row.access_token) {
    return row.access_token as string;
  }
  if (!row.refresh_token) throw new Error('No hay refresh_token; reconectar Google.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: row.refresh_token,
    }),
  });
  if (!r.ok) throw new Error('refresh_failed:' + (await r.text()));
  const j = await r.json() as { access_token: string; expires_in: number };
  const newExp = new Date(Date.now() + (j.expires_in - 60) * 1000).toISOString();
  await supabase.from('google_oauth_tokens').update({
    access_token: j.access_token,
    expires_at: newExp,
    updated_at: new Date().toISOString(),
  }).eq('user_id', row.user_id);
  return j.access_token;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { user_id, event_id } = (req.body || {}) as { user_id?: string; event_id?: string };
    if (!user_id || !event_id) {
      return res.status(400).json({ error: 'user_id y event_id son requeridos' });
    }

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.id_cliente_calendar) as string;
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || process.env.secret_calendar) as string;
    if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
      return res.status(500).json({ error: 'Faltan variables de entorno' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: row, error: rErr } = await supabase
      .from('google_oauth_tokens').select('*').eq('user_id', user_id).maybeSingle();
    if (rErr || !row) return res.status(400).json({ error: 'Usuario sin Google Calendar conectado' });

    const accessToken = await refreshAccessTokenIfNeeded(supabase, row, clientId, clientSecret);

    const gr = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(event_id)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
    );
    // 204 = OK, 410 = already deleted, 404 = not found (consider OK)
    if (!gr.ok && gr.status !== 410 && gr.status !== 404) {
      const txt = await gr.text();
      return res.status(500).json({ error: 'google_error', details: txt });
    }

    // Limpiar referencias locales (audiencias_general, eventos_internos)
    await supabase.from('audiencias_general').update({ google_event_id: null }).eq('google_event_id', event_id);
    await supabase.from('eventos_internos').update({ google_event_id: null }).eq('google_event_id', event_id);

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'error' });
  }
}
