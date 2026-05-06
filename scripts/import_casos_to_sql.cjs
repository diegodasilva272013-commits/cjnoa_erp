// Read Notion _all.csv + per-case .md files → emit a single SQL with INSERTs.
// Usage: node scripts/import_casos_to_sql.cjs
const fs = require('fs');
const path = require('path');

const CSV_PATH = 'C:/Users/diego/Downloads/CLIENTES GENERALES 26a91b02784080f29b9feade951c658a_all.csv';
const MD_DIR   = 'C:/Users/diego/Downloads/notion_export_casos/unzipped';
const OUT_PATH = path.join(__dirname, '..', 'supabase', 'import_casos_generales.sql');

// ── Build a map: normalized-title → markdown body ──
function normTitle(s) {
  return (s ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, ' ')
    .trim();
}
function readAllMd(dir) {
  const out = [];
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.md')) out.push(full);
    }
  }
  if (!fs.existsSync(dir)) { console.warn('MD_DIR not found:', dir); return []; }
  walk(dir); return out;
}
function extractBody(mdContent) {
  const lines = mdContent.split(/\r?\n/);
  // skip H1
  let i = 0;
  if (lines[i]?.startsWith('# ')) i++;
  // skip property lines (key: value) and blank lines until first non-property
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    // property line: "Word words: rest"  (no leading bullet/heading char)
    if (/^[A-Za-zÁÉÍÓÚáéíóúÑñ][\w \(\)/áéíóúÁÉÍÓÚñÑ]*:\s/.test(ln)) { i++; continue; }
    break;
  }
  return lines.slice(i).join('\n').trim();
}
const mdMap = new Map(); // normTitle → body
const mdEntries = []; // [{ norm, body }] for fuzzy fallback
for (const f of readAllMd(MD_DIR)) {
  const txt = fs.readFileSync(f, 'utf8');
  const m = txt.match(/^#\s+(.+?)\s*$/m);
  if (!m) continue;
  const title = m[1].trim();
  const body = extractBody(txt);
  if (body.length > 0) {
    const norm = normTitle(title);
    mdMap.set(norm, body);
    mdEntries.push({ norm, body });
  }
}
function findBody(csvTitle) {
  const n = normTitle(csvTitle);
  if (mdMap.has(n)) return mdMap.get(n);
  // prefix match: find a md title where one is a prefix of the other (≥ 20 chars)
  if (n.length >= 20) {
    for (const e of mdEntries) {
      if (e.norm.startsWith(n) || n.startsWith(e.norm)) return e.body;
    }
    // first 30-char fragment match (handles long titles where filesystem truncated the MD)
    const frag = n.slice(0, 30);
    for (const e of mdEntries) {
      if (e.norm.startsWith(frag)) return e.body;
    }
  }
  return null;
}
console.log(`Loaded ${mdMap.size} markdown bodies from ${MD_DIR}`);

// ── CSV parser (RFC 4180, BOM-safe, single-pass) ───────────────────────────
function parseCSV(text) {
  const raw = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let f = '';
  let inQ = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQ) {
      if (ch === '"') {
        if (raw[i+1] === '"') { f += '"'; i++; }
        else inQ = false;
      } else {
        f += ch;
      }
    } else {
      if (ch === '"') {
        inQ = true;
      } else if (ch === ',') {
        row.push(f); f = '';
      } else if (ch === '\r') {
        // ignore, handled by \n
      } else if (ch === '\n') {
        row.push(f); f = '';
        rows.push(row); row = [];
      } else {
        f += ch;
      }
    }
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).filter(r => r.some(c => c && c.trim().length))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// ── Notion normalizers ────────────────────────────────────────────────────────
const MESES = { enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12' };
function parseDate(v) {
  if (!v) return null;
  const s = v.trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if ((m = s.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i))) {
    const mm = MESES[m[2].toLowerCase()]; if (mm) return `${m[3]}-${mm}-${m[1].padStart(2,'0')}`;
  }
  return null;
}
function parseBool(v) { return ['yes','sí','si','true','1','✓'].includes((v ?? '').trim().toLowerCase()); }

const ESTADOS = ['activos','federales','esperando audiencia','esperando sentencias','complicacion judicial/analisis','suspendido por falta de directivas','suspendido por falta de pago'];
function normEstado(v) {
  const raw = (v ?? '').trim();
  if (!raw) return 'activos';
  const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const exact = ESTADOS.find(k => k.normalize('NFD').replace(/[\u0300-\u036f]/g,'') === s);
  if (exact) return exact;
  if (s.includes('federal')) return 'federales';
  if (s.includes('audiencia')) return 'esperando audiencia';
  if (s.includes('espera') || s.includes('sentencia')) return 'esperando sentencias';
  if (s.includes('complic') || s.includes('judicial') || s.includes('analisis')) return 'complicacion judicial/analisis';
  if (s.includes('directiva')) return 'suspendido por falta de directivas';
  if (s.includes('pago')) return 'suspendido por falta de pago';
  if (s.includes('activo')) return 'activos';
  return 'activos';
}
const TIPOS = ['sucesorio','laboral','civil','ejecutivo','familia','reales','previsional','prescripciones'];
function normTipo(v) {
  const s = (v ?? '').toLowerCase().trim();
  if (!s) return null;
  for (const t of TIPOS) if (s.includes(t)) return t;
  if (s.includes('despido')) return 'laboral';
  if (s.includes('alimento')) return 'familia';
  if (s.includes('anses')) return 'previsional';
  if (s.includes('prescripci')) return 'prescripciones';
  return s.slice(0, 40) || null;
}

function sqlStr(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlBool(v) { return v ? 'true' : 'false'; }
function sqlDate(v) { return v ? `'${v}'::date` : 'NULL'; }

// ── Run ──
if (!fs.existsSync(CSV_PATH)) { console.error('CSV not found at', CSV_PATH); process.exit(1); }
const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'));
console.log(`Parsed ${rows.length} rows`);
console.log('Headers:', Object.keys(rows[0] ?? {}).join(' | '));

const valid = rows.filter(r => (r['NOMBRE'] || '').trim().length > 0);
console.log(`${valid.length} rows have NOMBRE`);

const sqlLines = [
  '-- Auto-generated import for casos_generales',
  '-- Run this in Supabase SQL Editor. It WILL DELETE existing rows first.',
  'BEGIN;',
  'DELETE FROM public.casos_generales;',
  '',
  `INSERT INTO public.casos_generales (titulo, expediente, estado, tipo_caso, abogado, personeria, radicado, url_drive, actualizacion, audiencias, vencimiento, prioridad, archivado, estadisticas_estado) VALUES`,
];

const valueLines = valid.map(r => {
  const titulo = r['NOMBRE'];
  const csvNotes = (r['actualizacion'] || '').trim();
  const mdBody = findBody(titulo) || '';
  const combined = [csvNotes, mdBody].filter(Boolean).join('\n\n---\n\n') || null;
  return `(${sqlStr(titulo)}, ${sqlStr(r['Expediente'] || null)}, ${sqlStr(normEstado(r['Estado']))}, ${sqlStr(normTipo(r['tipo de caso']))}, ${sqlStr(r['SISTEMA'] || null)}, ${sqlStr(r['PERSONERIA'] || null)}, ${sqlStr(r['Radicado'] || null)}, ${sqlStr(r['URL del DRIVE'] || null)}, ${sqlStr(combined)}, ${sqlDate(parseDate(r['Audiencias']))}, ${sqlDate(parseDate(r['vencimiento']))}, ${sqlBool(parseBool(r['Prioridad']))}, ${sqlBool(parseBool(r['Archivar']))}, ${sqlStr(r['Estadisticas (NO TOCAR)'] || 'al día')})`;
});

sqlLines.push(valueLines.join(',\n'));
sqlLines.push(';');
sqlLines.push('COMMIT;');
sqlLines.push(`-- Inserted ${valueLines.length} rows`);

fs.writeFileSync(OUT_PATH, sqlLines.join('\n'), 'utf8');
console.log(`\n✔ SQL file written: ${OUT_PATH}`);
console.log(`✔ ${valueLines.length} INSERTs ready`);

// Also print stats
const byEstado = {};
valid.forEach(r => { const e = normEstado(r['Estado']); byEstado[e] = (byEstado[e] || 0) + 1; });
console.log('\nBy estado:'); Object.entries(byEstado).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
const withDrive = valid.filter(r => r['URL del DRIVE']).length;
const withAud = valid.filter(r => parseDate(r['Audiencias'])).length;
const withVenc = valid.filter(r => parseDate(r['vencimiento'])).length;
const withAbog = valid.filter(r => r['SISTEMA']).length;
const withExp = valid.filter(r => r['Expediente']).length;
console.log(`\nField completeness:\n  Drive URL: ${withDrive}\n  Audiencia: ${withAud}\n  Vencimiento: ${withVenc}\n  Abogado:   ${withAbog}\n  Expediente:${withExp}`);

const matched = valid.filter(r => findBody(r['NOMBRE'])).length;
console.log(`\nMD body matched: ${matched}/${valid.length} (${valid.length - matched} casos sin notas en .md)`);
const unmatched = valid.filter(r => !findBody(r['NOMBRE'])).slice(0, 10);
if (unmatched.length) console.log('Sample unmatched:\n  ' + unmatched.map(u => u['NOMBRE']).join('\n  '));
