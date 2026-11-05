// SOLO LECTURA. Cuenta lo que hay en la base y en Kapso para entender por qué las métricas no coinciden. No escribe nada ni imprime claves.
import { createClient } from '@supabase/supabase-js';

const log = (s: string) => console.log(`[DIAG] ${s}`);
const db = createClient(String(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL), String(process.env.SUPABASE_SERVICE_ROLE_KEY));

async function todo(tabla: string, cols: string) {
  const out: any[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await db.from(tabla).select(cols).range(d, d + 999);
    if (error) { log(`${tabla}: error ${error.message}`); return out; }
    out.push(...(data as any[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  { const r = await db.from('chat_prueba_conversaciones').select('sesion, updated_at, usuario, version, agendo', { count: 'exact' }).order('updated_at', { ascending: false }).limit(5);
    log(`chat_prueba_conversaciones: ${r.error ? 'ERROR ' + r.error.message : `${r.count} filas; últimas: ${JSON.stringify((r.data ?? []).map((x: any) => [x.updated_at, x.version, x.agendo]))}`}`); }
  const convs = await todo('conversaciones_whatsapp', 'conversation_id, telefono, nombre, created_at, updated_at');
  const noa = convs.filter(c => !c.conversation_id || String(c.conversation_id).startsWith('respaldo-'));
  log(`conversaciones: ${convs.length} (de Noa: ${noa.length}, otras: ${convs.length - noa.length})`);
  const ultima = convs.map(c => String(c.updated_at)).sort().pop();
  log(`última actividad guardada: ${ultima}`);

  const turnos = await todo('consultas_agendadas', 'telefono_clave, cliente_nombre, fecha_consulta, origen, created_at, observaciones');
  const porOrigen: Record<string, number> = {};
  for (const t of turnos) porOrigen[String(t.origen ?? '(vacío)')] = (porOrigen[String(t.origen ?? '(vacío)')] ?? 0) + 1;
  log(`consultas agendadas: ${turnos.length} por origen: ${JSON.stringify(porOrigen)}`);
  const claves = new Set(noa.map(c => String(c.telefono ?? '').replace(/\D/g, '').slice(-10)));
  const conChat = turnos.filter(t => claves.has(String(t.telefono_clave ?? '')));
  log(`agendadas con una conversación de Noa en la base: ${conChat.length}; sin conversación: ${turnos.length - conChat.length}`);
  const ejemplo = turnos.slice(-3).map(t => `${String(t.cliente_nombre ?? '').split(' ')[0]} | ${t.fecha_consulta} | origen=${t.origen} | clave=…${String(t.telefono_clave ?? '').slice(-3)}`);
  log(`últimas 3 cargadas: ${ejemplo.join(' ; ')}`);
  const leads = await todo('leads', 'telefono_clave, etapa, campana, created_at');
  const porEtapa: Record<string, number> = {};
  for (const l of leads) porEtapa[String(l.etapa ?? '(vacía)')] = (porEtapa[String(l.etapa ?? '(vacía)')] ?? 0) + 1;
  log(`leads: ${leads.length} por etapa: ${JSON.stringify(porEtapa)}`);

  // Kapso: ¿qué conversaciones hay del lado de Kapso? (solo cuenta y fechas)
  const key = String(process.env.KAPSO_API_KEY ?? '').trim();
  if (!key) { log('Kapso: no hay KAPSO_API_KEY en este entorno'); return; }
  for (const url of ['https://api.kapso.ai/platform/v1/whatsapp/conversations?per_page=100', 'https://api.kapso.ai/platform/v1/whatsapp_conversations?per_page=100']) {
    try {
      const r = await fetch(url, { headers: { 'X-API-Key': key } });
      const t = await r.text();
      let j: any = null; try { j = JSON.parse(t); } catch { /* no es JSON */ }
      const lista: any[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      log(`Kapso ${new URL(url).pathname} → HTTP ${r.status}, ${lista.length} conversaciones en la primera página${j?.meta ? ` meta=${JSON.stringify(j.meta).slice(0, 160)}` : ''}`);
      if (lista.length) {
        const fechas = lista.map(x => String(x.last_active_at ?? x.updated_at ?? x.created_at ?? '')).sort();
        log(`Kapso: más vieja ${fechas[0]} · más nueva ${fechas[fechas.length - 1]}; campos de ejemplo: ${Object.keys(lista[0]).slice(0, 12).join(',')}`);
        break;
      }
    } catch (e) { log(`Kapso ${url}: ${e instanceof Error ? e.message : e}`); }
  }
}
main().catch(e => log(`error: ${e instanceof Error ? e.message : e}`));
