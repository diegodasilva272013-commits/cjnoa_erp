// Se corre solo con --build-env RUN_VIDEO_TRANSCRIBE=1: transcribe el video de jubilación con Whisper (clave de OpenAI de Vercel) y lo imprime en el log del build.
import { readFileSync } from 'node:fs';
const key = (process.env.api_openai || process.env.OPENAI_API_KEY || '').trim();
if (!key) { console.log('[VIDEO] sin clave de OpenAI'); process.exit(0); }
const buf = readFileSync('public/video-jubilacion-docente.mp4');
const fd = new FormData();
fd.append('file', new Blob([buf], { type: 'video/mp4' }), 'video.mp4');
fd.append('model', 'whisper-1');
fd.append('language', 'es');
const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: fd });
const j = await r.json().catch(() => ({}));
console.log(`[VIDEO] estado ${r.status}`);
for (const linea of String(j.text ?? JSON.stringify(j)).split(/(?<=[.?!])\s+/)) console.log(`[VIDEO] ${linea}`);
process.exit(0);
