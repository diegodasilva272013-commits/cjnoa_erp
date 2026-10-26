// Verifica que la función /api/turnos/[accion] CARGA con Node real, empaquetada por el MISMO builder que usa Vercel (@vercel/node):
// compila el TypeScript, traza los archivos que importa y arma la carpeta de la función; después la importa con el cargador ESM de Node.
// Existe porque vitest/esbuild/tsc aceptan imports que el cargador ESM de Node rechaza (por ejemplo un .json sin atributo de tipo),
// y eso solo se veía en el deploy: tiraba FUNCTION_INVOCATION_FAILED en todo /api/turnos/*.
// Uso: node scripts/verificar-api-esm.mjs   (sale con código 0 si carga; imprime una línea JSON con el resultado)
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { build } = require('@vercel/node');
const { glob } = require('@vercel/build-utils');

const entrada = 'api/turnos/[accion].ts';
// Dentro de node_modules/.cache: ignorado por git y con node_modules de la raíz a la vista (sin enlaces que borrar).
const base = join(raiz, 'node_modules', '.cache', `verificar-api-esm-${process.pid}`);
const trabajo = join(base, 'proyecto');
const salida = join(base, 'funcion');
const resultado = { ok: false, etapa: 'inicio' };
try {
  // 1. una copia del proyecto como lo ve Vercel: api/ y package.json ("type": "module")
  mkdirSync(trabajo, { recursive: true });
  // --api=<carpeta> permite probar otra carpeta api/ (los tests la usan para comprobar que este chequeo detecta lo que rompió producción).
  const apiOrigen = process.argv.find(a => a.startsWith('--api='))?.slice('--api='.length) ?? join(raiz, 'api');
  cpSync(apiOrigen, join(trabajo, 'api'), { recursive: true });
  for (const f of ['package.json', 'tsconfig.json', 'tsconfig.node.json']) if (existsSync(join(raiz, f))) cpSync(join(raiz, f), join(trabajo, f));

  // 2. el builder de Vercel
  resultado.etapa = 'build';
  const files = await glob('**', { cwd: trabajo });
  const r = await build({ files, entrypoint: entrada, workPath: trabajo, repoRootPath: raiz, config: {}, meta: { isDev: true, skipDownload: true } });
  const lambda = r.output;
  // Las rutas de la función vienen relativas a la raíz del repo y, en Windows, con "\\": se normalizan y se les saca el prefijo de la carpeta de trabajo.
  const prefijo = `node_modules/.cache/verificar-api-esm-${process.pid}/proyecto/`;
  const propios = Object.entries(lambda.files)
    .map(([ruta, archivo]) => [ruta.replaceAll('\\', '/'), archivo])
    .filter(([ruta]) => ruta.startsWith(prefijo))
    .map(([ruta, archivo]) => [ruta.slice(prefijo.length), archivo]);
  resultado.archivos_de_la_funcion = propios.map(([ruta]) => ruta).sort();
  resultado.handler = lambda.handler;

  // 3. la carpeta de la función (los node_modules se resuelven desde la raíz del repo, que es un ancestro)
  resultado.etapa = 'armado';
  mkdirSync(salida, { recursive: true });
  for (const [ruta, archivo] of propios) {
    const destino = join(salida, ruta);
    mkdirSync(dirname(destino), { recursive: true });
    if (archivo.type === 'FileBlob') writeFileSync(destino, archivo.data);
    else if (archivo.fsPath) cpSync(archivo.fsPath, destino);
  }
  writeFileSync(join(salida, 'package.json'), readFileSync(join(trabajo, 'package.json')));

  // 4. se importa con Node real (ESM nativo)
  resultado.etapa = 'import';
  const candidatos = ['api/turnos/[accion].js', 'api/turnos/[accion].mjs', 'api/turnos/[accion].ts'];
  const principal = candidatos.find(c => existsSync(join(salida, c)));
  if (!principal) throw new Error(`la función compilada no trae el módulo principal; archivos: ${resultado.archivos_de_la_funcion.join(', ')}`);
  resultado.modulo = principal;
  const url = pathToFileURL(join(salida, principal)).href;
  const codigo = `
    const m = await import(${JSON.stringify(url)});
    const cfg = m.CONFIG_CLIENTE;
    console.log(JSON.stringify({
      handler: typeof m.default,
      ofertas: Object.keys(cfg?.ofertas ?? {}),
      profesional_art9: cfg?.ofertas?.art9_ganancias?.profesional ?? null,
      prompt_redactor: typeof m.PROMPT_REDACTOR === 'string',
    }));`;
  const p = spawnSync(process.execPath, ['--input-type=module', '-e', codigo], { cwd: salida, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  if (p.status !== 0) { resultado.error = (p.stderr || p.stdout || '').split('\n').filter(Boolean).slice(0, 6).join(' | '); throw new Error(resultado.error); }
  const carga = JSON.parse(p.stdout.trim().split('\n').pop());
  Object.assign(resultado, carga);
  resultado.ok = carga.handler === 'function' && carga.ofertas.length === 2 && carga.profesional_art9 === 'alejandro' && carga.prompt_redactor === true;
  resultado.etapa = 'listo';
} catch (e) {
  resultado.ok = false;
  resultado.error = resultado.error ?? (e instanceof Error ? e.message : String(e));
} finally {
  try { rmSync(base, { recursive: true, force: true }); } catch { /* si no se puede borrar, queda en node_modules/.cache (ignorado por git) */ }
}
console.log(JSON.stringify(resultado));
process.exit(resultado.ok ? 0 : 1);
