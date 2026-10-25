// Solo corre cuando el deploy se pide con --build-env RUN_AGENT_TESTS=1: ejecuta las pruebas del agente DENTRO de Vercel
// (con la clave de OpenAI de Vercel) e imprime el informe en el log del build. Nunca hace fallar el build.
import { spawnSync } from 'node:child_process';
if (process.env.RUN_AGENT_TESTS === '1') {
  const r = spawnSync('npx', ['vite-node', 'scripts/pruebas-agente.ts'], { stdio: 'inherit', shell: true, env: process.env });
  console.log(`[PRUEBAS] terminó con código ${r.status}`);
}
if (process.env.RUN_VIDEO_TRANSCRIBE === '1') spawnSync('node', ['scripts/transcribir-video.mjs'], { stdio: 'inherit', shell: true, env: process.env });
if (process.env.RUN_PING_OPENAI === '1') spawnSync('node', ['scripts/ping-openai.mjs'], { stdio: 'inherit', shell: true, env: process.env });
process.exit(0);
