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
  try {
    const userId = (req.query.user_id as string) || '';
    const timeMin = (req.query.timeMin as string) || new Date(Date.now() - 7 * 86400000).toISOString();
    const timeMax = (req.query.timeMax as string) || new Date(Date.now() + 60 * 86400000).toISOString();
    if (!userId) return res.status(400).json({ error: 'user_id requerido' });

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

    const { data: tokenRow, error: tokErr } = await supabase
      .from('google_oauth_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (tokErr) return res.status(500).json({ error: tokErr.message });
    if (!tokenRow) return res.status(200).json({ events: [], skipped: true, reason: 'sin_google' });

    const accessToken = await refreshAccessTokenIfNeeded(supabase, tokenRow, clientId, clientSecret);

    const calendarId = encodeURIComponent(tokenRow.calendar_id || 'primary');
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '500',
    });
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params.toString()}`;

    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: 'google:' + t });
    }
    const j = await r.json() as { items?: any[] };
    const events = (j.items || []).map(it => ({
      id: it.id,
      summary: it.summary || '(sin título)',
      description: it.description || '',
      location: it.location || '',
      start: it.start?.dateTime || it.start?.date || null,
      end: it.end?.dateTime || it.end?.date || null,
      allDay: !it.start?.dateTime,
      htmlLink: it.htmlLink,
      organizer: it.organizer?.email || null,
      status: it.status,
    }));

    return res.status(200).json({ events });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'list_failed' });
  }
}
