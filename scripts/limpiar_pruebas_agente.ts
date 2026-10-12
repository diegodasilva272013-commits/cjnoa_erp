/**
 * Limpieza de datos de prueba del agente CJ NOA.
 *
 *   Simulación (por defecto, no borra nada):
 *     npx tsx scripts/limpiar_pruebas_agente.ts --telefonos "+5493454100816,+5493884867965"
 *   Borrado real:
 *     npx tsx scripts/limpiar_pruebas_agente.ts --telefonos "..." --ejecutar
 *
 * Credenciales por variables de entorno (NO se leen de archivos ni se imprimen):
 *   SUPABASE_URL                 (o VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TURNOS_AGENTE_SECRET         (opcional: solo para la verificación contra /api/turnos/*)
 *
 * Qué toca (solo filas de los teléfonos indicados):
 *   conversaciones_whatsapp, leads, consultas_agendadas (origen 'agente') y los audios de esas conversaciones.
 * Qué NUNCA borra y solo reporta:
 *   - turnos manuales, con reserva pagada o con ingreso vinculado (un trigger de la base borra el ingreso al borrar el turno)
 *   - leads en etapas que movió el equipo a mano (consulta_realizada, cliente)
 * Sin DROP / TRUNCATE / ALTER. El borrado verifica la cantidad de filas de cada DELETE contra el inventario y, si no
 * coincide, restaura desde el respaldo y se detiene. (supabase-js no tiene transacciones; el respaldo es la red de seguridad.)
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE_ESPERADA = 'yvuxcpqlbybmtkrnmnsj'; // proyecto de producción del ERP; otra base => se aborta
const ETAPAS_MANUALES = ['consulta_realizada', 'cliente'];

// ------------------------------------------------------------------ argumentos
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const valor = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const ejecutar = flag('ejecutar');
const telefonos = (valor('telefonos') ?? '').split(',').map(t => t.trim()).filter(Boolean);
const baseUrl = (valor('base-url') ?? 'https://cjnoa-erp.vercel.app').replace(/\/$/, '');

/** Últimos 10 dígitos: así '+54 9 345 410-0816', '5493454100816' y '3454100816' son la misma persona. */
const clave = (t: string) => { const d = t.replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
const claves = [...new Set(telefonos.map(clave))];

function salir(msg: string): never { console.error(`\n✖ ${msg}\n`); process.exit(1); }

if (!claves.length || claves.includes('')) salir('Pasá --telefonos "+549...,+549..." (cada uno con al menos 10 dígitos).');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) salir('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.');
if (!url.includes(valor('base') ?? BASE_ESPERADA)) salir(`SUPABASE_URL no es la base de producción esperada (${BASE_ESPERADA}). No se hace nada.`);

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
type Fila = Record<string, any>;

async function leer(tabla: string, columna: string, valores: string[]): Promise<Fila[]> {
  if (!valores.length) return [];
  const { data, error } = await db.from(tabla).select('*').in(columna, valores);
  if (error) salir(`No se pudo leer ${tabla}: ${error.message}`);
  return (data ?? []) as Fila[];
}
async function total(tabla: string): Promise<number> {
  const { count, error } = await db.from(tabla).select('*', { count: 'exact', head: true });
  if (error) salir(`No se pudo contar ${tabla}: ${error.message}`);
  return count ?? 0;
}
const muestra = (f: Fila[]) => f.slice(0, 3).map(r => ({ id: r.id, telefono: r.telefono, nombre: r.nombre ?? r.cliente_nombre, creado: r.created_at }));

// ------------------------------------------------------------------ Paso 2: inventario (solo lectura)
async function inventario() {
  const conversaciones = await leer('conversaciones_whatsapp', 'telefono_clave', claves);
  const leadsTodos = await leer('leads', 'telefono_clave', claves);
  const turnosTodos = await leer('consultas_agendadas', 'telefono_clave', claves);

  const leads = leadsTodos.filter(l => !ETAPAS_MANUALES.includes(l.etapa));
  const leadsExcluidos = leadsTodos.filter(l => ETAPAS_MANUALES.includes(l.etapa));
  const esSeguro = (t: Fila) => t.origen === 'agente' && !t.ingreso_reserva_id && !t.reserva_pagada;
  const turnos = turnosTodos.filter(esSeguro);
  const turnosExcluidos = turnosTodos.filter(t => !esSeguro(t));

  const ingresosVinculados = turnosTodos.filter(t => t.ingreso_reserva_id).map(t => t.ingreso_reserva_id);
  const eventosGoogle = turnosTodos.flatMap(t => Object.entries(t).filter(([k, v]) => /google|event/i.test(k) && v).map(([k, v]) => ({ turno: t.id, campo: k, valor: v })));
  const audios = [...new Set(conversaciones.flatMap(c => [c.audio_path, ...((Array.isArray(c.audios) ? c.audios : []).map((a: Fila) => a.path))]).filter(Boolean))] as string[];

  return { conversaciones, leads, leadsExcluidos, turnos, turnosExcluidos, ingresosVinculados, eventosGoogle, audios };
}

function imprimirInventario(inv: Awaited<ReturnType<typeof inventario>>) {
  const bloque = (t: string, f: Fila[]) => { console.log(`\n• ${t}: ${f.length} fila(s)`); if (f.length) console.table(muestra(f)); };
  console.log(`\nTeléfonos (clave de 10 dígitos): ${claves.join(', ')}`);
  bloque('conversaciones_whatsapp → SE BORRAN', inv.conversaciones);
  bloque('leads → SE BORRAN', inv.leads);
  bloque('consultas_agendadas (origen agente, sin pago ni ingreso) → SE BORRAN', inv.turnos);
  console.log(`\n• audios en el bucket conversaciones-audio → SE BORRAN: ${inv.audios.length}`);
  if (inv.leadsExcluidos.length) { console.log(`\n⚠ leads EXCLUIDOS (los movió el equipo a mano): ${inv.leadsExcluidos.length}`); console.table(muestra(inv.leadsExcluidos)); }
  if (inv.turnosExcluidos.length) {
    console.log(`\n⚠ turnos EXCLUIDOS (manuales, con pago o con ingreso vinculado; borrarlos también borraría el ingreso): ${inv.turnosExcluidos.length}`);
    console.table(inv.turnosExcluidos.map(t => ({ id: t.id, nombre: t.cliente_nombre, fecha: t.fecha_consulta, origen: t.origen, pagada: t.reserva_pagada, ingreso: t.ingreso_reserva_id })));
  }
  if (inv.ingresosVinculados.length) console.log(`\n⚠ ingresos vinculados a turnos de estos teléfonos (NO se tocan): ${inv.ingresosVinculados.join(', ')}`);
  console.log(inv.eventosGoogle.length ? `\n⚠ eventos de Google Calendar a borrar a mano: ${JSON.stringify(inv.eventosGoogle)}` : '\n• Eventos de Google Calendar: ninguno guardado en los turnos de estos teléfonos.');
}

// ------------------------------------------------------------------ Paso 3: respaldo
async function respaldar(inv: Awaited<ReturnType<typeof inventario>>) {
  const dir = join('backups', `limpieza_pruebas_${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const guardar = (tabla: string, filas: Fila[]) => { mkdirSync(join(dir, tabla), { recursive: true }); writeFileSync(join(dir, tabla, 'filas.json'), JSON.stringify(filas, null, 2)); };
  guardar('conversaciones_whatsapp', inv.conversaciones);
  guardar('leads', inv.leads);
  guardar('consultas_agendadas', inv.turnos);
  mkdirSync(join(dir, 'audios'), { recursive: true });
  for (const p of inv.audios) {
    const { data, error } = await db.storage.from('conversaciones-audio').download(p);
    if (error || !data) salir(`No se pudo respaldar el audio ${p}: ${error?.message}. Sin respaldo completo no se borra nada.`);
    writeFileSync(join(dir, 'audios', p.replace(/[\\/]/g, '_')), Buffer.from(await data.arrayBuffer()));
  }
  console.log(`\n✔ Respaldo completo en ${dir}`);
  return dir;
}

// ------------------------------------------------------------------ Paso 4: borrado con verificación
const GENERADAS = ['telefono_clave']; // columnas calculadas: no se pueden reinsertar

async function restaurar(tabla: string, filas: Fila[]) {
  const limpias = filas.map(f => Object.fromEntries(Object.entries(f).filter(([k]) => !GENERADAS.includes(k))));
  if (limpias.length) { const { error } = await db.from(tabla).insert(limpias); if (error) console.error(`  ⚠ no se pudo restaurar ${tabla}: ${error.message}`); }
}

async function borrar(inv: Awaited<ReturnType<typeof inventario>>) {
  const pasos: { tabla: string; filas: Fila[] }[] = [
    { tabla: 'consultas_agendadas', filas: inv.turnos },
    { tabla: 'conversaciones_whatsapp', filas: inv.conversaciones },
    { tabla: 'leads', filas: inv.leads },
  ];
  const hechos: typeof pasos = [];
  for (const { tabla, filas } of pasos) {
    if (!filas.length) continue;
    const ids = filas.map(f => f.id);
    const { data, error } = await db.from(tabla).delete().in('id', ids).select('id');
    const n = data?.length ?? 0;
    if (error || n !== ids.length) {
      console.error(`\n✖ ${tabla}: se esperaba borrar ${ids.length} y se borraron ${n}${error ? ` (${error.message})` : ''}. Restaurando desde el respaldo…`);
      for (const h of [{ tabla, filas: filas.filter(f => !(data ?? []).some(d => d.id === f.id)) }, ...hechos.reverse()]) await restaurar(h.tabla, h.filas);
      salir('Se canceló y se restauró lo borrado. Revisá el respaldo en backups/.');
    }
    console.log(`✔ ${tabla}: ${n} fila(s) borradas`);
    hechos.push({ tabla, filas });
  }
  if (inv.audios.length) {
    const { data, error } = await db.storage.from('conversaciones-audio').remove(inv.audios);
    if (error) console.error(`⚠ audios: ${error.message} (el respaldo los conserva)`);
    else console.log(`✔ audios: ${data?.length ?? 0} archivo(s) borrados`);
  }
}

// ------------------------------------------------------------------ Paso 5: verificación
async function verificar(antes: Record<string, number>, inv: Awaited<ReturnType<typeof inventario>>) {
  const despues = await inventario();
  console.log('\n— Evidencia 1: conteos de lo vinculado a los teléfonos (deben ser 0 salvo lo excluido) —');
  console.table({ conversaciones: despues.conversaciones.length, leads: despues.leads.length, turnos_borrables: despues.turnos.length, audios: despues.audios.length });

  console.log('\n— Evidencia 4: totales por tabla, antes y después —');
  const filas: Fila = {};
  const esperado: Record<string, number> = { conversaciones_whatsapp: inv.conversaciones.length, leads: inv.leads.length, consultas_agendadas: inv.turnos.length };
  for (const t of Object.keys(antes)) { const d = await total(t); filas[t] = { antes: antes[t], despues: d, diferencia: antes[t] - d, esperado: esperado[t] }; }
  console.table(filas);

  const secreto = process.env.TURNOS_AGENTE_SECRET;
  if (!secreto) { console.log('\n(Evidencias 2 y 3 omitidas: falta TURNOS_AGENTE_SECRET en el entorno.)'); return; }
  const h = { Authorization: `Bearer ${secreto}` };
  console.log('\n— Evidencia 2: /api/turnos/historial de cada teléfono —');
  for (const t of telefonos) { const r = await fetch(`${baseUrl}/api/turnos/historial?telefono=${encodeURIComponent(t)}`, { headers: h }); console.log(t, r.status, await r.text()); }
  console.log('\n— Evidencia 3: /api/turnos/disponibles en las fechas de los turnos borrados —');
  for (const t of inv.turnos) {
    const r = await fetch(`${baseUrl}/api/turnos/disponibles?profesional=${encodeURIComponent(t.abogado_asignado)}&fecha=${t.fecha_consulta}`, { headers: h });
    console.log(t.abogado_asignado, t.fecha_consulta, 'turno borrado a las', String(t.hora_consulta).slice(0, 5), '→', await r.text());
  }
}

// ------------------------------------------------------------------ main
(async () => {
  console.log(ejecutar ? '*** MODO EJECUCIÓN ***' : '(Simulación: no se borra nada. Agregá --ejecutar para borrar.)');
  const inv = await inventario();
  imprimirInventario(inv);
  if (!ejecutar) { console.log('\nSimulación terminada.'); return; }

  const antes: Record<string, number> = {};
  for (const t of ['conversaciones_whatsapp', 'leads', 'consultas_agendadas']) antes[t] = await total(t);
  await respaldar(inv);
  await borrar(inv);
  await verificar(antes, inv);
})().catch(e => salir(String(e?.message ?? e)));
