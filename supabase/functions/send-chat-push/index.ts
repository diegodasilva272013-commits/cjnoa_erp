// ============================================================================
// Supabase Edge Function: send-chat-push
// ============================================================================
// Envía Web Push a todos los participantes (excepto emisor) cuando llega un
// mensaje nuevo de chat. Es invocada por trigger AFTER INSERT en chat_mensajes
// vía pg_net (ver migration_push_subscriptions.sql).
//
// Setup:
//   supabase functions deploy send-chat-push --no-verify-jwt
//   supabase secrets set VAPID_PUBLIC_KEY=...
//   supabase secrets set VAPID_PRIVATE_KEY=...
//   supabase secrets set VAPID_SUBJECT=mailto:admin@cjnoa.com
// ============================================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@cjnoa.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function preview(tipo: string, contenido: string | null) {
  if (tipo === 'texto') return (contenido || '').slice(0, 120);
  if (tipo === 'audio') return '🎤 Nota de voz';
  if (tipo === 'imagen') return '📷 Imagen';
  if (tipo === 'gif') return '🎬 GIF';
  if (tipo === 'archivo') return '📎 Archivo';
  return 'Nuevo mensaje';
}

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const mensaje_id: string | undefined = body?.mensaje_id;
    if (!mensaje_id) return new Response('mensaje_id requerido', { status: 400 });

    // 1) Cargar mensaje
    const { data: msg, error: e1 } = await supabase
      .from('chat_mensajes')
      .select('id, conversacion_id, emisor_id, tipo, contenido')
      .eq('id', mensaje_id)
      .single();
    if (e1 || !msg) return new Response('msg not found', { status: 404 });

    // 2) Emisor (nombre)
    const { data: emisor } = await supabase
      .from('perfiles').select('nombre').eq('id', msg.emisor_id).maybeSingle();
    const nombreEmisor = emisor?.nombre || 'Alguien';

    // 3) Participantes (excluyendo emisor)
    const { data: parts } = await supabase
      .from('chat_participantes')
      .select('usuario_id')
      .eq('conversacion_id', msg.conversacion_id);
    const destinatarios = (parts || []).map(p => p.usuario_id).filter(id => id !== msg.emisor_id);
    if (destinatarios.length === 0) return new Response('no destinatarios', { status: 200 });

    // 4) Suscripciones de los destinatarios
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, usuario_id')
      .in('usuario_id', destinatarios);
    if (!subs || subs.length === 0) return new Response('no subs', { status: 200 });

    const payload = JSON.stringify({
      title: `💬 ${nombreEmisor}`,
      body: preview(msg.tipo, msg.contenido),
      url: '/chat',
      tag: `conv-${msg.conversacion_id}`,
    });

    // 5) Enviar a cada subscription
    const results = await Promise.allSettled(subs.map(async (s) => {
      try {
        await webpush.sendNotification({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        }, payload);
        return { ok: true, id: s.id };
      } catch (err: any) {
        const code = err?.statusCode;
        // 404/410 = subscription expirada → borrar
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        }
        return { ok: false, id: s.id, code, msg: err?.message };
      }
    }));

    const ok = results.filter(r => r.status === 'fulfilled' && (r.value as any).ok).length;
    return new Response(JSON.stringify({ enviados: ok, total: subs.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(`error: ${e?.message || e}`, { status: 500 });
  }
});
