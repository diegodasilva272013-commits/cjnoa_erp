import { createClient } from '@supabase/supabase-js';
import { probarAgentePaso, usoOpenAI, fijarDbUso, fijarOrigenUso } from '../api/turnos/[accion]';
import { ESCENARIOS } from '../src/server/agentePruebas';

// El log del build tiene tope de tamaño: se silencian los errores internos y se imprime cada prueba apenas termina.
const log = (...a: any[]) => console.log('[PRUEBAS]', ...a);
const silencio = console.error;
console.error = () => {};

async function main() {
  const inicio = Date.now();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const real = url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : undefined;
  fijarOrigenUso('pruebas');
  if (real) fijarDbUso(real as any);
  log(`clave OpenAI: ${process.env.api_openai || process.env.OPENAI_API_KEY ? 'presente' : 'AUSENTE'} · agenda real: ${real ? 'sí' : 'no'}`);
  const solo = (process.env.AGENT_TESTS_IDS ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const lista = ESCENARIOS.filter(e => !solo.length || solo.includes(e.id));
  let ok = 0, hechas = 0;
  const correr = async (id: string, pasos: number) => {
    let estado: any; let ultimo: any;
    try {
      for (let n = 0; n < pasos; n++) {
        if (usoOpenAI.usd >= Number(process.env.AGENT_TESTS_MAX_USD ?? 2)) return { id, error: 'cortada por el tope de gasto' };
        let r: any = await probarAgentePaso(id, n, estado, undefined, real as any);
        for (let k = 0; k < 6 && r.code === 503; k++) { await new Promise(res => setTimeout(res, 15000)); r = await probarAgentePaso(id, n, estado, undefined, real as any); }
        if (r.code !== 200) return { id, error: JSON.stringify(r.body).slice(0, 200) };
        estado = r.body.estado; ultimo = r.body;
        if (r.body.fin) break;
      }
      return { id, ok: ultimo.ok, chequeos: ultimo.chequeos, transcript: estado.transcript, herramientas: (estado.herramientas ?? []).map((h: any) => `${h.nombre}:${h.resultado?.status ?? (h.resultado?.error ? 'error' : 'ok')}`) };
    } catch (e) { return { id, error: e instanceof Error ? e.message.slice(0, 200) : String(e) }; }
  };
  const tope = Number(process.env.AGENT_TESTS_MAX_USD ?? 2);
  let cortada = false;
  const cola = [...lista];
  const trabajador = async () => {
    for (let e = cola.shift(); e; e = cola.shift()) {
      if (usoOpenAI.usd >= tope) { cortada = true; cola.length = 0; break; }
      const r: any = await correr(e.id, e.maxTurnos);
      hechas++;
      if (r.ok) { ok++; log(`OK     ${r.id}  (${hechas}/${lista.length})`); continue; }
      log(`FALLO  ${r.id}${r.error ? ' ERROR: ' + r.error : ''}  (${hechas}/${lista.length})`);
      for (const c of (r.chequeos ?? []).filter((x: any) => !x.ok)) log(`   ✗ ${c.nombre}${c.detalle ? ' → ' + String(c.detalle).slice(0, 160) : ''}`);
      if (r.herramientas) log(`   herramientas: ${r.herramientas.join(' · ')}`);
      const tr = r.transcript ?? [];
      for (const t of (tr.length > 22 ? [...tr.slice(0, 6), { de: 'karina', texto: '[…]' }, ...tr.slice(-14)] : tr)) log(`   ${t.de === 'cliente' ? 'Cliente' : 'Karina '}: ${String(t.texto).replace(/\n/g, ' / ').slice(0, 260)}`);
    }
  };
  await Promise.all([trabajador(), trabajador(), trabajador()]);
  log(`GASTO medido: ${usoOpenAI.llamadas} llamadas, ${usoOpenAI.entrada} tokens de entrada, ${usoOpenAI.salida} de salida = ${usoOpenAI.usd.toFixed(3)} USD (tope ${tope} USD${cortada ? ', CORTADA POR EL TOPE' : ''})`);
  log(`RESUMEN ${ok}/${lista.length} aprobadas en ${Math.round((Date.now() - inicio) / 60000)} min`);
}
main().catch(e => { console.log('[PRUEBAS] error general', e instanceof Error ? e.message : e); }).finally(() => { console.error = silencio; });
