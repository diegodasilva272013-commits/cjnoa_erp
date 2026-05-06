import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string; // user_id
    const error = req.query.error as string;

    if (error) return res.redirect(`/calendario?google_error=${encodeURIComponent(error)}`);
    if (!code || !state) return res.status(400).send('Faltan code o state');

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!clientId || !clientSecret || !redirectUri || !supabaseUrl || !serviceRoleKey) {
      return res.status(500).send('Faltan variables de entorno');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      return res.redirect(`/calendario?google_error=${encodeURIComponent('token_exchange:' + txt)}`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      token_type: string;
      id_token?: string;
    };

    let googleEmail: string | null = null;
    try {
      const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (ui.ok) {
        const j = await ui.json();
        googleEmail = j.email || null;
      }
    } catch {}

    const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const upsertPayload: any = {
      user_id: state,
      google_email: googleEmail,
      access_token: tokens.access_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      calendar_id: 'primary',
      conectado_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (tokens.refresh_token) upsertPayload.refresh_token = tokens.refresh_token;

    const { error: upErr } = await supabase
      .from('google_oauth_tokens')
      .upsert(upsertPayload, { onConflict: 'user_id' });

    if (upErr) {
      return res.redirect(`/calendario?google_error=${encodeURIComponent('db:' + upErr.message)}`);
    }

    return res.redirect('/calendario?connected=1');
  } catch (e: any) {
    return res.redirect(`/calendario?google_error=${encodeURIComponent(e?.message || 'unknown')}`);
  }
}
