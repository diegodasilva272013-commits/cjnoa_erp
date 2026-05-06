// Read Notion _all.csv → emit a single SQL file with INSERTs ready to paste in Supabase SQL Editor.
// Usage: node scripts/import_casos_to_sql.cjs
const fs = require('fs');
const path = require('path');

const CSV_PATH = 'C:/Users/diego/Downloads/CLIENTES GENERALES 26a91b02784080f29b9feade951c658a_all.csv';
const OUT_PATH = path.join(__dirname, '..', 'supabase', 'import_casos_generales.sql');

// ── CSV parser (RFC 4180, BOM-safe) ────────────────────────────────────────────
function parseCSV(text) {
  const raw = text.replace(/^\uFEFF/, '');
  const lines = []; let cur = '', inQ = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') { if (inQ && raw[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && raw[i+1] === '\n') i++;
      lines.push(cur); cur = '';
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  const fields = (line) => {
    const out = []; let f = '', q = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') { if (q && line[j+1] === '"') { f += '"'; j++; } else q = !q; }
      else if (c === ',' && !q) { out.push(f); f = ''; }
      else f += c;
    }
    out.push(f); return out;
  };
  if (!lines[0]) return [];
  const headers = fields(lines[0]).map(h => h.trim().replace(/^\uFEFF/, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i]; if (!ln.trim()) continue;
    const vs = fields(ln);
    const row = {};
    headers.forEach((h, k) => { row[h] = (vs[k] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
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

const ESTADOS = ['activos','federales','esperando sentencias','complicacion judicial/analisis','suspendido por falta de directivas','suspendido por falta de pago'];
function normEstado(v) {
  const raw = (v ?? '').trim();
  if (!raw) return 'activos';
  const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const exact = ESTADOS.find(k => k.normalize('NFD').replace(/[\u0300-\u036f]/g,'') === s);
  if (exact) return exact;
  if (s.includes('federal')) return 'federales';
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
  return `(${sqlStr(r['NOMBRE'])}, ${sqlStr(r['Expediente'] || null)}, ${sqlStr(normEstado(r['Estado']))}, ${sqlStr(normTipo(r['tipo de caso']))}, ${sqlStr(r['SISTEMA'] || null)}, ${sqlStr(r['PERSONERIA'] || null)}, ${sqlStr(r['Radicado'] || null)}, ${sqlStr(r['URL del DRIVE'] || null)}, ${sqlStr(r['actualizacion'] || null)}, ${sqlDate(parseDate(r['Audiencias']))}, ${sqlDate(parseDate(r['vencimiento']))}, ${sqlBool(parseBool(r['Prioridad']))}, ${sqlBool(parseBool(r['Archivar']))}, ${sqlStr(r['Estadisticas (NO TOCAR)'] || 'al día')})`;
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
