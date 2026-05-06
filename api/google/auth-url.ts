import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = (req.query.user_id as string) || '';
    if (!userId) return res.status(400).json({ error: 'user_id requerido' });

    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.id_cliente_calendar;
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
    const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || (host ? `${proto}://${host}/api/google/callback` : '');
    if (!clientId || !redirectUri) {
      // Diagnostico: lista nombres de env vars que matchean (sin exponer valores)
      const envKeys = Object.keys(process.env).filter(k =>
        /google|calendar|cliente|secret/i.test(k)
      );
      return res.status(500).json({
        error: 'Faltan id_cliente_calendar / secret_calendar / redirect_uri',
        diagnostico: {
          tiene_clientId: !!clientId,
          tiene_redirectUri: !!redirectUri,
          host,
          env_vars_relacionadas_detectadas: envKeys,
        },
      });
    }

    const scope = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'openid',
      'email',
      'profile',
    ].join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state: userId,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.status(200).json({ url });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Error generando URL' });
  }
}
