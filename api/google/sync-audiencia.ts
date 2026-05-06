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
    const { audiencia_id, source } = (req.body || {}) as { audiencia_id?: string; source?: string };
    if (!audiencia_id) return res.status(400).json({ error: 'audiencia_id requerido' });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
      return res.status(500).json({ error: 'Faltan variables de entorno' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tabla = source === 'consulta' ? 'consultas_agendadas' : 'audiencias_general';
    const { data: ev, error: evErr } = await supabase.from(tabla).select('*').eq('id', audiencia_id).maybeSingle();
    if (evErr || !ev) return res.status(404).json({ error: 'Evento no encontrado' });

    let ownerId: string | null = ev.abogado_id || ev.abogado_asignado || null;
    if (!ownerId) {
      const { data: admins } = await supabase.from('perfiles').select('id, rol').eq('rol', 'admin').limit(1);
      ownerId = admins?.[0]?.id || null;
    }
    if (!ownerId) return res.status(400).json({ error: 'No se pudo determinar dueño del evento' });

    const { data: tokenRow, error: tokErr } = await supabase
      .from('google_oauth_tokens')
      .select('*')
      .eq('user_id', ownerId)
      .maybeSingle();

    if (tokErr) return res.status(500).json({ error: tokErr.message });
    if (!tokenRow) return res.status(200).json({ skipped: true, reason: 'usuario sin Google conectado' });

    const accessToken = await refreshAccessTokenIfNeeded(supabase, tokenRow, clientId, clientSecret);

    let startISO: string;
    let endISO: string;
    let summary: string;
    let description = '';
    let location = '';

    if (source === 'consulta') {
      const fecha = ev.fecha_consulta;
      const hora = ev.hora_consulta || '10:00';
      const start = new Date(`${fecha}T${hora}:00-03:00`);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      startISO = start.toISOString();
      endISO = end.toISOString();
      summary = `Consulta: ${ev.cliente_nombre || 'Cliente'}`;
      description = [
        ev.detalle_consulta ? `Detalle: ${ev.detalle_consulta}` : '',
        ev.telefono ? `Tel: ${ev.telefono}` : '',
        ev.monto_reserva ? `Reserva: $${ev.monto_reserva}` : '',
        ev.observaciones ? `Obs: ${ev.observaciones}` : '',
      ].filter(Boolean).join('\n');
    } else {
      const start = new Date(ev.fecha);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      startISO = start.toISOString();
      endISO = end.toISOString();
      summary = `Audiencia${ev.tipo ? ' ' + ev.tipo : ''}`;
      try {
        if (ev.caso_general_id) {
          const { data: cg } = await supabase
            .from('casos_generales')
            .select('caratula, expediente, juzgado')
            .eq('id', ev.caso_general_id)
            .maybeSingle();
          if (cg) {
            summary += ` - ${cg.caratula || ''}`;
            description = [
              cg.expediente ? `Expte: ${cg.expediente}` : '',
              cg.juzgado || ev.juzgado ? `Juzgado: ${cg.juzgado || ev.juzgado}` : '',
              ev.notas ? `Notas: ${ev.notas}` : '',
            ].filter(Boolean).join('\n');
            location = cg.juzgado || ev.juzgado || '';
          }
        }
      } catch {}
      if (!description) {
        description = [
          ev.juzgado ? `Juzgado: ${ev.juzgado}` : '',
          ev.notas ? `Notas: ${ev.notas}` : '',
        ].filter(Boolean).join('\n');
        location = ev.juzgado || '';
      }
    }

    const eventBody = {
      summary,
      description,
      location,
      start: { dateTime: startISO, timeZone: 'America/Argentina/Jujuy' },
      end: { dateTime: endISO, timeZone: 'America/Argentina/Jujuy' },
      reminders: { useDefault: true },
    };

    const calendarId = encodeURIComponent(tokenRow.calendar_id || 'primary');
    let googleEventId: string | null = ev.google_event_id || null;
    let resp: Response | null = null;
    if (googleEventId) {
      resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${googleEventId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody),
      });
      if (resp.status === 404) {
        googleEventId = null;
      }
    }
    if (!googleEventId) {
      resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(eventBody),
      });
    }
    if (!resp || !resp.ok) {
      const t = resp ? await resp.text() : 'no_response';
      return res.status(500).json({ error: 'google:' + t });
    }
    const created = await resp.json();

    if (tabla === 'audiencias_general') {
      await supabase.from('audiencias_general').update({
        google_event_id: created.id,
        google_synced_at: new Date().toISOString(),
      }).eq('id', audiencia_id);
    }

    return res.status(200).json({ ok: true, google_event_id: created.id, html_link: created.htmlLink });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'sync_failed' });
  }
}
