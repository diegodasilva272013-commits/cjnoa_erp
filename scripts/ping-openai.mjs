// Solo con --build-env RUN_PING_OPENAI=1: una llamada mínima a OpenAI para ver si la cuenta contesta (imprime estado y tipo de error, nunca la clave).
const key = (process.env.api_openai || process.env.OPENAI_API_KEY || '').trim();
if (!key) { console.log('[PING] sin clave'); process.exit(0); }
for (const modelo of ['gpt-4o', 'gpt-4o-mini']) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model: modelo, max_tokens: 5, messages: [{ role: 'user', content: 'hola' }] }) });
  const j = await r.json().catch(() => ({}));
  console.log(`[PING] ${modelo}: ${r.status} ${j?.error?.type ?? ''} ${j?.error?.code ?? ''} ${String(j?.error?.message ?? 'ok').slice(0, 200)}`);
}
process.exit(0);
