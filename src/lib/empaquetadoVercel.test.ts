import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * La función /api/turnos/[accion] tiene que CARGAR en Vercel. Estos tests la arman con el mismo builder que Vercel (@vercel/node) y la importan con Node real
 * (ESM nativo): vitest, esbuild y tsc aceptan cosas que ese cargador rechaza, y un import roto tira FUNCTION_INVOCATION_FAILED en todo /api/turnos/*.
 */
const raiz = resolve(__dirname, '..', '..');
const script = join(raiz, 'scripts', 'verificar-api-esm.mjs');

function verificar(apiDir?: string) {
  const r = spawnSync(process.execPath, [script, ...(apiDir ? [`--api=${apiDir}`] : [])], { cwd: raiz, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  const linea = (r.stdout ?? '').trim().split('\n').filter(l => l.startsWith('{')).pop() ?? '{}';
  return JSON.parse(linea) as { ok: boolean; etapa: string; error?: string; ofertas?: string[]; archivos_de_la_funcion?: string[] };
}

/** Una api/ mínima con un defecto conocido, para comprobar que el chequeo lo detecta. */
function apiConDefecto(nombre: string, archivos: Record<string, string>) {
  const dir = join(raiz, 'node_modules', '.cache', `api-defectuosa-${nombre}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  for (const [ruta, contenido] of Object.entries(archivos)) {
    mkdirSync(join(dir, ruta, '..'), { recursive: true });
    writeFileSync(join(dir, ruta), contenido);
  }
  return dir;
}

describe('empaquetado de Vercel · la API carga con Node real', () => {
  it('la función /api/turnos/[accion], compilada por el builder de Vercel, carga con el cargador ESM de Node y trae la config de ofertas', () => {
    const r = verificar();
    expect(r.error ?? '').toBe('');
    expect(r.ok).toBe(true);
    expect(r.etapa).toBe('listo');
    expect(r.ofertas).toEqual(['art9_ganancias', 'jubilacion']);
    // la config es un módulo compilado (.js), no un .json suelto
    expect(r.archivos_de_la_funcion).toContain('api/turnos/_config-cjnoa.js');
    expect(r.archivos_de_la_funcion?.some(f => f.endsWith('.json') && f !== 'package.json')).toBe(false);
  }, 180000);

  it('el chequeo DETECTA lo que rompió producción: un .json importado sin atributo de tipo', () => {
    const dir = apiConDefecto('json', {
      'turnos/[accion].ts': "import cfg from './datos.json';\nexport const CONFIG_CLIENTE = cfg;\nexport default function handler() { return cfg; }\n",
      'turnos/datos.json': '{"ofertas":{}}\n',
    });
    try {
      const r = verificar(dir);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('ERR_IMPORT_ATTRIBUTE_MISSING');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 180000);

  it('el chequeo DETECTA un import relativo sin la extensión .js', () => {
    const dir = apiConDefecto('sinext', {
      'turnos/[accion].ts': "import { DATOS } from './datos';\nexport const CONFIG_CLIENTE = DATOS;\nexport default function handler() { return DATOS; }\n",
      'turnos/datos.ts': 'export const DATOS = { ofertas: {} };\n',
    });
    try {
      const r = verificar(dir);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('ERR_MODULE_NOT_FOUND');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 180000);

  it('el import de la config en la API lleva la extensión .js y no hay ningún .json de datos en api/', () => {
    const api = readFileSync(join(raiz, 'api', 'turnos', '[accion].ts'), 'utf8');
    expect(api).toContain("import { CONFIG_CJNOA } from './_config-cjnoa.js';");
    expect(api).not.toMatch(/from '\.[^']*\.json'/);
  });
});
