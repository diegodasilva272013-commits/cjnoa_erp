// Importa al ERP los chats de WhatsApp atendidos a mano (scripts/data/cjnoa_chats_whatsapp_manual.json).
// Por defecto es DRY-RUN: solo lee y muestra el plan. Escribe solo con --ejecutar Y IMPORT_CONFIRMO="APROBADO IMPORTAR".
// Toca únicamente conversaciones_whatsapp y leads; no borra ni modifica mensajes existentes; no manda nada por WhatsApp.
// Corre dentro de Vercel (con la clave de la base de Vercel) desde postbuild-pruebas.mjs con --build-env RUN_IMPORT_MANUAL=1.
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { planificar, planChat, frena, TOPE_MENSAJES, type ChatExport, type FilaConv, type LeadMin, type ItemPlan } from '../src/lib/importarChats';

const ejecutar = process.argv.includes('--ejecutar');
const log = (s: string) => console.log(`[IMP] ${s}`);
const tapar = (t: unknown) => (t ? '…' + String(t).slice(-4) : '—');
const MAX_REINTENTOS = 5;

// Para correr en una máquina local: IMPORT_ENV_FILE apunta al .env (no se copia ni se imprime nada de él).
if (process.env.IMPORT_ENV_FILE) {
  for (const linea of readFileSync(process.env.IMPORT_ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function leerTodo(db: any) {
  const convs: FilaConv[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from('conversaciones_whatsapp').select('conversation_id, telefono, telefono_clave, nombre, mensajes').order('conversation_id').range(desde, desde + 999);
    if (error) throw new Error(`leer conversaciones: ${error.message}`);
    convs.push(...data);
    if (data.length < 1000) break;
  }
  const { data: leads, error } = await db.from('leads').select('telefono_clave, nombre, apellido').limit(10000);
  if (error) throw new Error(`leer leads: ${error.message}`);
  return { convs, leads: leads as LeadMin[] };
}

function reporte(plan: ItemPlan[]) {
  const de = (a: string) => plan.filter(p => p.accion === a);
  const suma = (xs: ItemPlan[], f: (p: ItemPlan) => number) => xs.reduce((s, p) => s + f(p), 0);
  const validos = plan.filter(p => p.accion === 'agregar' || p.accion === 'crear');
  log(`chats en el export: ${plan.length}`);
  log(`ya existían (se agregan a su fila): ${de('agregar').length} | se crearían: ${de('crear').length} | leads nuevos: ${validos.filter(p => p.crearLead).length}`);
  log(`mensajes a agregar: ${suma(validos, p => p.nuevos.length)} | descartados por ya existentes: ${suma(validos, p => p.yaEstaban)} (de esos, adjuntos del cliente reconocidos: ${suma(validos, p => p.porMedia)})`);
  log(`FRENA — teléfono con más de una fila: ${de('frenar_varias_filas').length} | supera el tope de 400: ${de('frenar_tope').length}`);
  for (const p of frena(plan)) log(`  FRENA ${p.accion} ${tapar(p.clave)} ${p.detalle ?? ''} total=${p.totalFinal}`);
  for (const p of de('sin_resolver')) log(`  SIN RESOLVER "${p.contacto}": ${p.detalle}`);
  for (const p of plan.filter(p => p.detalle && p.accion === 'agregar' && p.detalle.includes('nombre'))) log(`  "${p.contacto}" ${p.detalle} → ${tapar(p.clave)}`);
  log('por chat (clave | acción | nuevos | ya estaban | total final):');
  for (const p of validos) log(`  ${tapar(p.clave)} | ${p.accion}${p.crearLead ? '+lead' : ''} | +${p.nuevos.length} | ${p.yaEstaban} | ${p.totalFinal}`);
  const ejemplos = [
    validos.filter(p => p.accion === 'agregar' && p.nuevos.length && p.yaEstaban).sort((a, b) => b.nuevos.length - a.nuevos.length)[0],
    validos.find(p => p.accion === 'crear'),
    validos.filter(p => p.accion === 'agregar' && p.nuevos.length).sort((a, b) => a.nuevos.length - b.nuevos.length)[0],
  ].filter(Boolean) as ItemPlan[];
  for (const p of ejemplos) {
    log(`EJEMPLO ${tapar(p.clave)} (${p.accion}, +${p.nuevos.length}, ya estaban ${p.yaEstaban}):`);
    for (const m of p.nuevos.slice(0, 12)) log(`    + ${new Date(m.at as number).toISOString().slice(0, 16)}Z ${m.from}: ${m.texto.replace(/\s+/g, ' ').slice(0, 90)}`);
    if (p.nuevos.length > 12) log(`    … y ${p.nuevos.length - 12} más`);
  }
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { log('falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); return; }
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const data = JSON.parse(readFileSync('scripts/data/cjnoa_chats_whatsapp_manual.json', 'utf8'));
  const chats: ChatExport[] = data.chats;
  log(`modo: ${ejecutar ? 'EJECUTAR' : 'DRY-RUN (no escribe nada)'}`);

  const antes = await leerTodo(db);
  log(`antes: conversaciones=${antes.convs.length} leads=${antes.leads.length} mensajes=${antes.convs.reduce((s, c) => s + (c.mensajes?.length ?? 0), 0)}`);
  const plan = planificar(chats, antes.convs, antes.leads);
  reporte(plan);

  // Segunda corrida simulada en memoria sobre el resultado del plan: tiene que dar 0 nuevos.
  const simConvs = new Map(antes.convs.map(c => [c.conversation_id, c]));
  for (const p of plan) if ((p.accion === 'agregar' || p.accion === 'crear') && p.conversation_id)
    simConvs.set(p.conversation_id, { conversation_id: p.conversation_id, telefono: p.telefono, telefono_clave: p.clave, nombre: simConvs.get(p.conversation_id)?.nombre ?? null, mensajes: p.final });
  const simLeads = [...antes.leads, ...plan.filter(p => p.crearLead && (p.accion === 'agregar' || p.accion === 'crear')).map(p => ({ telefono_clave: p.clave, nombre: null, apellido: null }))];
  const segunda = planificar(chats, [...simConvs.values()], simLeads);
  log(`segunda corrida simulada: ${segunda.reduce((s, p) => s + p.nuevos.length, 0)} mensajes nuevos, ${segunda.filter(p => p.accion === 'crear').length} chats a crear, ${segunda.filter(p => p.crearLead).length} leads a crear`);

  if (!ejecutar) { log('DRY-RUN terminado: no se escribió nada.'); return; }
  if (process.env.IMPORT_CONFIRMO !== 'APROBADO IMPORTAR') { log('falta IMPORT_CONFIRMO="APROBADO IMPORTAR": no se escribe nada.'); return; }
  if (frena(plan).length) { log('hay chats que frenan: no se escribe nada.'); return; }
  // Lo aprobado fue el dry-run: si el plan de hoy no da lo mismo (chats a crear, mensajes a agregar), no se escribe.
  if (process.env.IMPORT_ESPERADO) {
    const real = `${plan.filter(p => p.accion === 'crear').length},${plan.filter(p => p.accion === 'agregar' || p.accion === 'crear').reduce((s, p) => s + p.nuevos.length, 0)}`;
    if (real !== process.env.IMPORT_ESPERADO) { log(`el plan cambió desde el dry-run aprobado (esperado ${process.env.IMPORT_ESPERADO}, hoy ${real}): no se escribe nada.`); return; }
  }

  const validos = plan.map((p, i) => ({ p, chat: chats[i] })).filter(({ p }) => p.accion === 'agregar' || p.accion === 'crear');
  const aEscribir = validos.filter(({ p }) => p.nuevos.length);

  // 1) Backup de las filas que se van a actualizar, leídas recién (y la lista de lo que se va a crear).
  const ids = aEscribir.filter(({ p }) => p.accion === 'agregar').map(({ p }) => p.conversation_id as string);
  const { data: afectadas, error: eBk } = await db.from('conversaciones_whatsapp').select('*').in('conversation_id', ids);
  if (eBk) throw new Error(`backup: ${eBk.message}`);
  if ((afectadas ?? []).length !== ids.length) throw new Error(`backup: se esperaban ${ids.length} filas y se leyeron ${(afectadas ?? []).length}`);
  const clavesAfectadas = (afectadas ?? []).map((c: any) => c.telefono_clave).filter(Boolean);
  const { data: leadsAfectados, error: eBkL } = await db.from('leads').select('*').in('telefono_clave', clavesAfectadas);
  if (eBkL) throw new Error(`backup leads: ${eBkL.message}`);
  const contenido = JSON.stringify({
    creado: new Date().toISOString(), conversaciones_a_actualizar: afectadas, leads_de_esas_conversaciones: leadsAfectados,
    conversaciones_a_crear: aEscribir.filter(({ p }) => p.accion === 'crear').map(({ p }) => p.conversation_id),
    leads_a_crear: validos.filter(({ p }) => p.crearLead).map(({ p }) => p.telefono),
  }, null, 1);
  const archivoBackup = `backup_pre_import_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  if (process.env.IMPORT_BACKUP === 'storage') {
    // Bucket privado "backups": si no existe se crea privado; si existe y es público, no se sube nada ahí.
    const { data: bucket } = await db.storage.getBucket('backups');
    if (!bucket) {
      const { error } = await db.storage.createBucket('backups', { public: false });
      if (error) throw new Error(`crear bucket backups: ${error.message}`);
      log('bucket "backups" creado (privado)');
    } else if (bucket.public) throw new Error('el bucket "backups" es público: no se sube el backup ahí');
    const { error: eUp } = await db.storage.from('backups').upload(archivoBackup, new Blob([contenido], { type: 'application/json' }), { contentType: 'application/json', upsert: false });
    if (eUp) throw new Error(`subir backup: ${eUp.message}`);
    const { data: bajado, error: eDown } = await db.storage.from('backups').download(archivoBackup);
    if (eDown || !bajado) throw new Error(`verificar backup: ${eDown?.message ?? 'no se pudo bajar'}`);
    if ((await bajado.text()) !== contenido) throw new Error('verificar backup: el archivo subido no coincide');
    log(`backup verificado en Storage: backups/${archivoBackup} (${(afectadas ?? []).length} conversaciones, ${(leadsAfectados ?? []).length} leads, ${contenido.length} bytes)`);
  } else {
    writeFileSync(`scripts/data/${archivoBackup}`, contenido);
    log(`backup: scripts/data/${archivoBackup} (${(afectadas ?? []).length} conversaciones, ${(leadsAfectados ?? []).length} leads)`);
  }

  // 2) Escritura segura por fila: se relee justo antes y se actualiza solo si updated_at no cambió; si cambió, se recalcula y se reintenta.
  let filas = 0, mensajesAgregados = 0, reintentos = 0;
  for (const { p, chat } of aEscribir) {
    for (let intento = 0; ; intento++) {
      if (intento > MAX_REINTENTOS) throw new Error(`${tapar(p.clave)}: más de ${MAX_REINTENTOS} reintentos por updated_at`);
      const { data: actual, error: eL } = await db.from('conversaciones_whatsapp').select('conversation_id, mensajes, updated_at').eq('telefono_clave', p.clave);
      if (eL) throw new Error(`releer ${tapar(p.clave)}: ${eL.message}`);
      if (actual.length > 1) throw new Error(`${tapar(p.clave)}: apareció una segunda fila; se frena`);
      const fila = actual[0];
      const pc = planChat(chat, fila && Array.isArray(fila.mensajes) ? fila.mensajes : []);
      if (!pc.nuevos.length) break;
      if (pc.final.length > TOPE_MENSAJES) throw new Error(`${tapar(p.clave)}: superaría el tope de ${TOPE_MENSAJES}`);
      const ahora = new Date().toISOString();
      if (fila) {
        const { data: upd, error } = await db.from('conversaciones_whatsapp').update({ mensajes: pc.final, updated_at: ahora })
          .eq('conversation_id', fila.conversation_id).eq('updated_at', fila.updated_at).select('conversation_id');
        if (error) throw new Error(`actualizar ${tapar(p.clave)}: ${error.message}`);
        if (!upd?.length) { reintentos++; log(`  reintento ${tapar(p.clave)}: cambió updated_at`); continue; }
      } else {
        const { error } = await db.from('conversaciones_whatsapp').insert({ conversation_id: p.conversation_id, telefono: p.telefono, mensajes: pc.final, updated_at: ahora });
        if (error?.code === '23505') { reintentos++; log(`  reintento ${tapar(p.clave)}: la fila apareció mientras tanto`); continue; }
        if (error) throw new Error(`crear ${tapar(p.clave)}: ${error.message}`);
      }
      filas++; mensajesAgregados += pc.nuevos.length;
      break;
    }
  }
  let leadsNuevos = 0, leadsYaEstaban = 0;
  for (const { p } of validos.filter(({ p }) => p.crearLead && p.telefono)) {
    const { data: hay } = await db.from('leads').select('id').eq('telefono_clave', p.clave).limit(1);
    if (hay?.length) { leadsYaEstaban++; continue; }
    const fechas = p.final.map(m => m.at).filter((x): x is number => typeof x === 'number');
    const { error } = await db.from('leads').insert({
      telefono: p.telefono, canal: 'whatsapp', etapa: 'nuevo', datos: { origen: 'whatsapp_manual' },
      ...(fechas.length ? { primer_contacto_at: new Date(Math.min(...fechas)).toISOString(), ultimo_contacto_at: new Date(Math.max(...fechas)).toISOString() } : {}),
    });
    if (error?.code === '23505') { leadsYaEstaban++; continue; }
    if (error) throw new Error(`crear lead ${tapar(p.clave)}: ${error.message}`);
    leadsNuevos++;
  }
  const despues = await leerTodo(db);
  log('--- segunda corrida en dry-run, mismo build ---');
  log(`escrito: ${filas} conversaciones, ${mensajesAgregados} mensajes, ${leadsNuevos} leads (ya existían al crear: ${leadsYaEstaban}) | reintentos por updated_at: ${reintentos}`);
  log(`después: conversaciones=${despues.convs.length} leads=${despues.leads.length} mensajes=${despues.convs.reduce((s, c) => s + (c.mensajes?.length ?? 0), 0)}`);
  const otra = planificar(chats, despues.convs, despues.leads);
  log(`segunda corrida real (dry): ${otra.reduce((s, p) => s + p.nuevos.length, 0)} mensajes nuevos, ${otra.filter(p => p.accion === 'crear').length} chats a crear, ${otra.filter(p => p.crearLead).length} leads a crear`);
}

main().catch(e => { log(`ERROR ${e?.message ?? e}`); process.exitCode = 0; });
