import { createClient } from '@supabase/supabase-js';
import { probarAgentePaso } from '../api/turnos/[accion]';
import { ESCENARIOS } from '../src/server/agentePruebas';

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const real = url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : undefined;
  console.log(`[PRUEBAS] clave OpenAI: ${process.env.api_openai || process.env.OPENAI_API_KEY ? 'presente' : 'AUSENTE'} · agenda real: ${real ? 'sí' : 'no'}`);
  const solo = (process.env.AGENT_TESTS_IDS ?? '').split(',').map(x => x.trim()).filter(Boolean);
  const lista = ESCENARIOS.filter(e => !solo.length || solo.includes(e.id));
  const correr = async (id: string, pasos: number) => {
    let estado: any; let ultimo: any;
    try {
      for (let n = 0; n < pasos; n++) {
        const r: any = await probarAgentePaso(id, n, estado, undefined, real as any);
        if (r.code !== 200) return { id, error: JSON.stringify(r.body).slice(0, 300) };
        estado = r.body.estado; ultimo = r.body;
      }
      return { id, ok: ultimo.ok, chequeos: ultimo.chequeos, transcript: estado.transcript };
    } catch (e) { return { id, error: e instanceof Error ? e.message.slice(0, 300) : String(e) }; }
  };
  const resultados: any[] = [];
  for (let i = 0; i < lista.length; i += 3) {
    const lote = lista.slice(i, i + 3);
    resultados.push(...await Promise.all(lote.map(e => correr(e.id, e.pasos.length))));
  }
  let ok = 0;
  for (const r of resultados) {
    if (r.ok) { ok++; console.log(`[PRUEBAS] OK     ${r.id}`); continue; }
    console.log(`[PRUEBAS] FALLO  ${r.id}${r.error ? ' ERROR: ' + r.error : ''}`);
    for (const c of (r.chequeos ?? []).filter((x: any) => !x.ok)) console.log(`[PRUEBAS]    ✗ ${c.nombre}${c.detalle ? ' → ' + c.detalle : ''}`);
    for (const t of r.transcript ?? []) console.log(`[PRUEBAS]    ${t.de === 'cliente' ? 'Cliente' : 'Karina '}: ${String(t.texto).replace(/\n/g, ' / ')}`);
  }
  console.log(`[PRUEBAS] RESUMEN ${ok}/${resultados.length} aprobadas`);
}
main().catch(e => console.log('[PRUEBAS] error general', e instanceof Error ? e.message : e));
