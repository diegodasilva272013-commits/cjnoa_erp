// ============================================================================
// Supabase Edge Function: digest-diario
// ============================================================================
// Envía a cada usuario activo un email con el resumen del día:
//   - Audiencias de hoy y mañana
//   - Tareas vencidas o que vencen hoy
//   - Cargos de hora pendientes de esta semana
//
// Despliegue:
//   supabase functions deploy digest-diario
//   supabase secrets set RESEND_API_KEY=re_xxx
//
// Programación (cron):
//   En Supabase Dashboard → Database → Cron jobs:
//     SELECT cron.schedule(
//       'digest-diario',
//       '0 8 * * *',   -- cada día a las 08:00
//       $$ select net.http_post(
//            url := 'https://<project>.supabase.co/functions/v1/digest-diario',
//            headers := jsonb_build_object('Authorization', 'Bearer <SERVICE_KEY>')
//          ) $$
//     );
// ============================================================================
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY');
const fromEmail = Deno.env.get('DIGEST_FROM_EMAIL') || 'no-reply@centrojuridiconoa.com';

serve(async () => {
  const supa = createClient(supabaseUrl, serviceKey);

  // 1. Usuarios activos con email
  const { data: perfiles, error: errPerfil } = await supa
    .from('perfiles')
    .select('id, email, nombre')
    .eq('activo', true)
    .not('email', 'is', null);
  if (errPerfil) return new Response(JSON.stringify({ error: errPerfil.message }), { status: 500 });

  const hoy = new Date().toISOString().slice(0, 10);
  const en7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  // 2. Datos agregados globales (se pueden filtrar por responsable si se desea)
  const [{ data: audsProx }, { data: tareasPend }, { data: cargos }] = await Promise.all([
    supa.from('audiencias_general_completas').select('*').gte('fecha', hoy).lte('fecha', en7).eq('realizada', false),
    supa.from('tareas_completas').select('*').lte('fecha_limite', hoy).not('estado', 'eq', 'completada'),
    supa.from('cargos_hora_completo').select('*').gte('fecha', hoy).lte('fecha', en7).eq('realizado', false),
  ]);

  let enviados = 0;
  for (const p of perfiles || []) {
    if (!p.email) continue;
    const html = renderDigest({
      nombre: p.nombre || 'Colega',
      audiencias: audsProx || [],
      tareas: (tareasPend || []).filter((t: { responsable_id: string }) => t.responsable_id === p.id),
      cargos: cargos || [],
    });

    if (!resendKey) {
      console.log('RESEND_API_KEY no configurada. HTML para', p.email, '\n', html.slice(0, 500));
      continue;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Centro Jurídico NOA <${fromEmail}>`,
        to: [p.email],
        subject: `Resumen del día — ${new Date().toLocaleDateString('es-AR')}`,
        html,
      }),
    });
    if (res.ok) enviados++;
  }

  return new Response(JSON.stringify({ ok: true, enviados }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

interface DigestInput {
  nombre: string;
  audiencias: Array<Record<string, unknown>>;
  tareas: Array<Record<string, unknown>>;
  cargos: Array<Record<string, unknown>>;
}

function renderDigest({ nombre, audiencias, tareas, cargos }: DigestInput): string {
  const li = (items: Array<Record<string, unknown>>, render: (it: Record<string, unknown>) => string) =>
    items.length ? `<ul style="padding-left:20px;margin:8px 0">${items.map(it => `<li>${render(it)}</li>`).join('')}</ul>` : '<p style="color:#666">— nada por ahora —</p>';

  return `
  <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222">
    <h1 style="color:#1a1a1a;font-size:20px">Hola ${nombre} 👋</h1>
    <p style="color:#555">Este es tu resumen del día.</p>
    <h2 style="font-size:16px;margin-top:24px;color:#b45309">⚖ Audiencias próximas (7 días)</h2>
    ${li(audiencias, (a) => `${a.fecha} · ${a.cliente_nombre || 'Sin cliente'} · ${a.juzgado || ''} ${a.tipo || ''}`)}
    <h2 style="font-size:16px;margin-top:24px;color:#b91c1c">📋 Tus tareas pendientes o vencidas</h2>
    ${li(tareas, (t) => `${t.titulo} ${t.fecha_limite ? '· vence ' + t.fecha_limite : ''}`)}
    <h2 style="font-size:16px;margin-top:24px;color:#0369a1">⏰ Cargos de hora pendientes (7 días)</h2>
    ${li(cargos, (c) => `${c.fecha}${c.hora ? ' ' + c.hora : ''} · ${c.titulo}`)}
    <p style="color:#888;margin-top:32px;font-size:12px">— Centro Jurídico NOA · ERP</p>
  </div>`;
}
