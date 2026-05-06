import { useState, useMemo, useEffect } from 'react';
import {
  Search, Plus, Upload, Trash2, Filter, AlertCircle, CheckCircle2,
  Loader2, X, Scale, Calendar, Gavel, Clock, Star, RefreshCw,
  Columns3, Table2, ChevronRight, ExternalLink, AlertTriangle,
} from 'lucide-react';
import {
  DndContext, DragEndEvent, DragOverlay, PointerSensor,
  useSensor, useSensors, rectIntersection, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useCasosGenerales, CasoGeneral, TIPOS_CASO, ABOGADOS } from '../hooks/useCasosGenerales';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';

// ─── Estado meta ──────────────────────────────────────────────────────────────
const ESTADO_META: Record<string, { label: string; color: string; dot: string; bg: string; border: string }> = {
  activos:                              { label: 'Activo',          color: 'text-emerald-300', dot: 'bg-emerald-400', bg: 'bg-emerald-400/10', border: 'border-l-emerald-500' },
  federales:                            { label: 'Federal',         color: 'text-blue-300',    dot: 'bg-blue-400',    bg: 'bg-blue-400/10',    border: 'border-l-blue-500' },
  'esperando sentencias':               { label: 'En espera',       color: 'text-amber-300',   dot: 'bg-amber-400',   bg: 'bg-amber-400/10',   border: 'border-l-amber-500' },
  'complicacion judicial/analisis':     { label: 'En análisis',     color: 'text-orange-300',  dot: 'bg-orange-400',  bg: 'bg-orange-400/10',  border: 'border-l-orange-500' },
  'suspendido por falta de directivas': { label: 'Sin directivas',  color: 'text-gray-400',    dot: 'bg-gray-500',    bg: 'bg-gray-500/10',    border: 'border-l-gray-500' },
  'suspendido por falta de pago':       { label: 'Sin pago',        color: 'text-red-300',     dot: 'bg-red-400',     bg: 'bg-red-400/10',     border: 'border-l-red-500' },
};
const FALLBACK_META = { label: 'Sin estado', color: 'text-gray-400', dot: 'bg-gray-600', bg: 'bg-white/5', border: 'border-l-white/10' };
const getEstado = (e: string | null) => ESTADO_META[(e ?? '').toLowerCase()] ?? FALLBACK_META;

const ABOGADO_COLORS: Record<string, string> = {
  'RODRIGO':    'from-violet-600 to-violet-800',
  'NOELIA':     'from-pink-600 to-pink-800',
  'ALEJANDRO':  'from-blue-600 to-blue-800',
  'MARIANELA':  'from-teal-600 to-teal-800',
  'FABRICIO':   'from-amber-600 to-amber-800',
};
function getAbogadoColor(a: string | null) {
  if (!a) return 'from-gray-600 to-gray-800';
  for (const [k, v] of Object.entries(ABOGADO_COLORS)) {
    if (a.toUpperCase().includes(k)) return v;
  }
  return 'from-gray-600 to-gray-800';
}
function abogadoInitials(s: string | null) {
  if (!s) return '?';
  const m = s.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/g);
  return m ? m.slice(-1)[0].slice(0, 2).toUpperCase() : s.slice(0, 2).toUpperCase();
}
function formatDate(d: string | null) {
  if (!d) return null;
  const [y, m, day] = d.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}
function isOverdue(d: string | null) {
  if (!d) return false;
  return new Date(d) < new Date();
}

// ─── CSV parser RFC 4180 ──────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines.push(cur); cur = '';
    } else cur += ch;
  }
  if (cur) lines.push(cur);

  const parseFields = (line: string): string[] => {
    const vals: string[] = [];
    let field = '', q = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        if (q && line[j + 1] === '"') { field += '"'; j++; }
        else q = !q;
      } else if (c === ',' && !q) { vals.push(field); field = ''; }
      else field += c;
    }
    vals.push(field);
    return vals;
  };

  const headers = parseFields(lines[0]).map(h => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseFields(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

// ─── Notion helpers ───────────────────────────────────────────────────────────
const MESES: Record<string, string> = {
  enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',
  julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12',
};
function parseNotionDate(v: string): string | null {
  if (!v?.trim()) return null;
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2,'0')}-${slash[1].padStart(2,'0')}`;
  const sp = v.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (sp) { const m = MESES[sp[2].toLowerCase()]; if (m) return `${sp[3]}-${m}-${sp[1].padStart(2,'0')}`; }
  return null;
}
function parseNotionBool(v: string) { return ['yes','sí','si'].includes((v ?? '').trim().toLowerCase()); }
function normEstado(v: string) {
  const s = (v ?? '').toLowerCase().trim();
  if (s.includes('federal')) return 'federales';
  if (s.includes('espera') || s.includes('sentencia')) return 'esperando sentencias';
  if (s.includes('complic') || s.includes('analisis') || s.includes('análisis')) return 'complicacion judicial/analisis';
  if (s.includes('directiva')) return 'suspendido por falta de directivas';
  if (s.includes('pago')) return 'suspendido por falta de pago';
  return 'activos';
}
function normTipo(v: string) {
  const s = (v ?? '').toLowerCase().trim();
  if (!s) return null;
  for (const t of TIPOS_CASO) { if (s.includes(t.toLowerCase())) return t; }
  if (s.includes('sucesorio') || s.includes('suces')) return 'sucesorio';
  if (s.includes('laboral') || s.includes('despido')) return 'laboral';
  if (s.includes('ejecutivo')) return 'ejecutivo';
  if (s.includes('familia') || s.includes('alimento')) return 'familia';
  if (s.includes('previsional')) return 'previsional';
  return s.slice(0, 40);
}

// ─── CaseDetailModal ───────────────────────────────────────────────────────────
function CaseDetailModal({ caso: initial, onClose, onSaved }: {
  caso: CasoGeneral | null; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const { saveCaso } = useCasosGenerales();
  const [editing, setEditing] = useState<Partial<CasoGeneral>>(initial ?? {});
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(!initial);
  const isNew = !initial;
  const meta = getEstado(editing.estado ?? null);

  const set = (key: keyof CasoGeneral, val: unknown) => setEditing(p => ({ ...p, [key]: val }));

  async function handleSave() {
    if (!editing.titulo?.trim()) { showToast('El título es obligatorio', 'error'); return; }
    setSaving(true);
    const r = await saveCaso(editing as Partial<CasoGeneral>, initial?.id);
    setSaving(false);
    if (r.ok) { showToast(isNew ? 'Caso creado' : 'Guardado', 'success'); onSaved(); onClose(); }
    else showToast(r.error || 'Error al guardar', 'error');
  }

  const inp = 'bg-[#1a1a20] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/60 w-full';
  const sel = `${inp} [&>option]:bg-[#141418] [&>option]:text-white`;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content sm:max-w-2xl sm:rounded-2xl">
        {/* Header */}
        <div className={`flex items-start justify-between px-6 pt-6 pb-4 border-b border-white/[0.06] border-l-4 ${meta.border} rounded-tl-2xl`}>
          <div className="flex-1 pr-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}/>{meta.label}
              </span>
              {editing.prioridad && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 text-[10px] font-semibold"><Star className="w-3 h-3 fill-amber-400"/>Alta prioridad</span>}
              {editing.estadisticas_estado === 'atrasado' && <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 text-[10px] font-semibold">Atrasado</span>}
            </div>
            <h2 className="text-base font-bold text-white leading-tight">{isNew ? (editing.titulo || 'Nuevo caso') : editing.titulo}</h2>
            {editing.expediente && <p className="text-xs text-gray-500 font-mono mt-0.5">{editing.expediente}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isNew && (
              <button onClick={() => setEditMode(m => !m)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${editMode ? 'bg-violet-500/20 text-violet-300' : 'bg-white/5 text-gray-400 hover:text-white'}`}>
                {editMode ? 'Ver' : 'Editar'}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4"/>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {editMode ? (
            <>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Título *</label>
                <input className={inp} value={editing.titulo ?? ''} onChange={e => set('titulo', e.target.value)} placeholder="Ej: FLORES ALMAZAN JOSE LUIS"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['Estado', 'estado', 'select', Object.keys(ESTADO_META)],
                  ['Tipo de caso', 'tipo_caso', 'select', [...TIPOS_CASO]],
                  ['Abogado', 'abogado', 'select', [...ABOGADOS]],
                  ['Personería', 'personeria', 'select', ['APODERADO','Patrocinante','Personería de urgencia']],
                  ['Estadísticas', 'estadisticas_estado', 'select', ['al día','atrasado']],
                  ['Expediente', 'expediente', 'text', []],
                  ['Próx. audiencia', 'audiencias', 'date', []],
                  ['Vencimiento', 'vencimiento', 'date', []],
                ] as [string, keyof CasoGeneral, string, string[]][]).map(([label, key, type, opts]) => (
                  <div key={key as string}>
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">{label}</label>
                    {type === 'select' ? (
                      <select className={sel} value={(editing as Record<string, unknown>)[key as string] as string ?? ''} onChange={e => set(key, e.target.value || null)}>
                        <option value="">—</option>
                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={type} className={inp} value={(editing as Record<string, unknown>)[key as string] as string ?? ''} onChange={e => set(key, e.target.value || null)}/>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Radicado / Tribunal</label>
                <input className={inp} value={editing.radicado ?? ''} onChange={e => set('radicado', e.target.value || null)}/>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">URL Drive</label>
                <input className={inp} value={editing.url_drive ?? ''} onChange={e => set('url_drive', e.target.value || null)} placeholder="https://drive.google.com/..."/>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Notas / Actualización</label>
                <textarea className={`${inp} resize-none`} rows={3} value={editing.actualizacion ?? ''} onChange={e => set('actualizacion', e.target.value || null)}/>
              </div>
              <div className="flex gap-6">
                {(['prioridad', 'archivado'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => set(k, !editing[k])} className={`w-9 h-5 rounded-full relative transition-colors ${editing[k] ? 'bg-violet-500' : 'bg-white/10'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${editing[k] ? 'translate-x-4' : ''}`}/>
                    </div>
                    <span className="text-sm text-gray-300 capitalize">{k}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {editing.abogado && (
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.025] border border-white/[0.05]">
                  <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${getAbogadoColor(editing.abogado)} flex items-center justify-center text-sm font-bold text-white shadow-lg`}>
                    {abogadoInitials(editing.abogado)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{editing.abogado}</p>
                    {editing.personeria && <p className="text-xs text-gray-500">{editing.personeria}</p>}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: 'Expediente', val: editing.expediente, mono: true },
                  { label: 'Tipo de caso', val: editing.tipo_caso },
                  { label: 'Estado', val: meta.label },
                  { label: 'Estadísticas', val: editing.estadisticas_estado },
                  { label: 'Próx. audiencia', val: formatDate(editing.audiencias ?? null) },
                  { label: 'Vencimiento', val: formatDate(editing.vencimiento ?? null) },
                ] as { label: string; val: string | null | undefined; mono?: boolean }[]).filter(item => item.val).map(item => (
                  <div key={item.label} className="bg-white/[0.025] rounded-2xl p-3 border border-white/[0.05]">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{item.label}</p>
                    <p className={`text-sm text-white font-medium capitalize ${item.mono ? 'font-mono' : ''}`}>{item.val}</p>
                  </div>
                ))}
              </div>
              {editing.radicado && (
                <div className="bg-white/[0.025] rounded-2xl p-3 border border-white/[0.05]">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1"><Gavel className="w-3 h-3"/>Tribunal / Radicado</p>
                  <p className="text-sm text-white">{editing.radicado}</p>
                </div>
              )}
              {editing.url_drive && (
                <a href={editing.url_drive} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm hover:bg-blue-500/20 transition-colors">
                  <ExternalLink className="w-4 h-4 shrink-0"/>Abrir carpeta en Drive
                </a>
              )}
              {editing.actualizacion && (
                <div className="bg-white/[0.025] rounded-2xl p-3 border border-white/[0.05]">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Notas</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{editing.actualizacion}</p>
                </div>
              )}
              {!editing.abogado && !editing.expediente && !editing.radicado && !editing.tipo_caso && !editing.actualizacion && !editing.url_drive && (
                <div className="text-center py-6 text-gray-600">
                  <p className="text-sm">Sin datos adicionales.</p>
                  <button onClick={() => setEditMode(true)} className="mt-2 text-violet-400 hover:text-violet-300 text-xs underline">Completar ficha</button>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.06]">
            <button onClick={onClose} className="btn-secondary text-sm px-4">Cerrar</button>
            {editMode && (
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm px-4 flex items-center gap-2 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin"/>}
                {isNew ? 'Crear caso' : 'Guardar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── NotionImportModal ─────────────────────────────────────────────────────────
interface ImportRow { titulo: string; ok: boolean; error?: string }

function NotionImportModal({ onClose, onImported, totalExistentes }: {
  onClose: () => void; onImported: () => void; totalExistentes: number;
}) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [skipArchived, setSkipArchived] = useState(true);
  const [borrarPrimero, setBorrarPrimero] = useState(totalExistentes > 0);

  async function handleImport() {
    if (!file) return;
    setImporting(true); setResults([]);
    try {
      let rows: Record<string, string>[] = [];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, string>[];
      } else {
        rows = parseCSV(await file.text());
      }

      rows = rows.filter(r => (r['NOMBRE'] || r['titulo'] || r['Title'] || '').trim());
      if (skipArchived) rows = rows.filter(r => !parseNotionBool(r['Archivar'] || r['archivado'] || ''));

      setProgress({ done: 0, total: rows.length });
      if (!rows.length) { showToast('No hay filas para importar', 'error'); setImporting(false); return; }

      // Borrar todos primero si se indicó
      if (borrarPrimero) {
        await supabase.from('casos_generales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const { data: ud } = await supabase.auth.getUser();
      const userId = ud?.user?.id ?? null;

      const batch = rows.map(r => ({
        titulo: (r['NOMBRE'] || r['titulo'] || r['Title'] || '').trim(),
        expediente: (r['Expediente'] || r['expediente'] || '').trim() || null,
        estado: normEstado(r['Estado'] || r['estado'] || ''),
        tipo_caso: normTipo(r['tipo de caso'] || r['tipo_caso'] || r['Tipo'] || ''),
        abogado: (r['SISTEMA'] || r['abogado'] || r['Abogado'] || '').trim() || null,
        personeria: (r['PERSONERIA'] || r['Personería'] || r['personeria'] || '').trim() || null,
        radicado: (r['Radicado'] || r['radicado'] || '').trim() || null,
        url_drive: (r['URL del DRIVE'] || r['url_drive'] || '').trim() || null,
        actualizacion: (r['actualizacion'] || r['Actualización'] || '').trim() || null,
        audiencias: parseNotionDate(r['Audiencias'] || r['audiencias'] || ''),
        vencimiento: parseNotionDate(r['vencimiento'] || r['Vencimiento'] || ''),
        prioridad: parseNotionBool(r['Prioridad'] || r['prioridad'] || ''),
        archivado: parseNotionBool(r['Archivar'] || r['archivado'] || ''),
        estadisticas_estado: (r['Estadisticas (NO TOCAR)'] || r['estadisticas_estado'] || 'al día').trim().toLowerCase() || 'al día',
        created_by: userId,
      }));

      const CHUNK = 50;
      let ok = 0, fail = 0;
      const localResults: ImportRow[] = [];
      for (let i = 0; i < batch.length; i += CHUNK) {
        const chunk = batch.slice(i, i + CHUNK);
        const { data, error } = await supabase.from('casos_generales').insert(chunk).select('id');
        if (error) {
          fail += chunk.length;
          chunk.forEach(c => localResults.push({ titulo: c.titulo, ok: false, error: error.message }));
        } else {
          ok += data?.length ?? 0;
          chunk.forEach(c => localResults.push({ titulo: c.titulo, ok: true }));
        }
        setProgress({ done: Math.min(i + CHUNK, batch.length), total: batch.length });
        setResults([...localResults]);
      }
      showToast(`${ok} importado(s)${fail ? `, ${fail} con error` : ''}`, fail ? 'error' : 'success');
      onImported();
    } catch (e: unknown) {
      showToast(`Error: ${(e as Error)?.message ?? e}`, 'error');
    } finally { setImporting(false); }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content sm:max-w-lg">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><Upload className="w-4 h-4 text-violet-400"/>Importar desde Notion / Excel</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Alerta si hay datos existentes */}
          {totalExistentes > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0"/>
                <div>
                  <p className="text-sm font-semibold text-amber-200">Hay {totalExistentes} registros existentes</p>
                  <p className="text-xs text-amber-200/60 mt-0.5">Los registros anteriores pueden estar vacíos (importados con formato incorrecto).</p>
                </div>
              </div>
              <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                <div onClick={() => setBorrarPrimero(!borrarPrimero)} className={`w-9 h-5 rounded-full relative transition-colors ${borrarPrimero ? 'bg-amber-500' : 'bg-white/10'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${borrarPrimero ? 'translate-x-4' : ''}`}/>
                </div>
                <span className="text-sm text-amber-200 font-medium">Borrar todos los registros antes de importar</span>
              </label>
            </div>
          )}

          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-blue-200/70">
            <p className="font-semibold text-blue-200 mb-1">Columnas del CSV de Notion:</p>
            <p className="font-mono text-violet-300 text-[10px] leading-relaxed">NOMBRE · Estado · SISTEMA · PERSONERIA · Expediente · Radicado · tipo de caso · Audiencias · vencimiento · Prioridad · Archivar · URL del DRIVE · Estadisticas (NO TOCAR)</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div onClick={() => setSkipArchived(!skipArchived)} className={`w-9 h-5 rounded-full relative transition-colors ${skipArchived ? 'bg-violet-500' : 'bg-white/10'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${skipArchived ? 'translate-x-4' : ''}`}/>
            </div>
            <span className="text-sm text-gray-300">Omitir archivados (Archivar = Yes)</span>
          </label>

          <label className="cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 text-violet-200 hover:bg-violet-500/10 text-sm transition-colors">
              <Upload className="w-4 h-4 shrink-0"/>
              <span className="truncate">{file ? file.name : 'Elegir archivo CSV / XLSX'}</span>
            </div>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { setFile(e.target.files?.[0] || null); setResults([]); }}/>
          </label>

          {file && !importing && !results.length && (
            <button onClick={handleImport} className="btn-primary text-sm w-full">
              {borrarPrimero ? `Borrar ${totalExistentes} registros e importar` : `Importar${skipArchived ? ' activos' : ' todos'}`}
            </button>
          )}
          {importing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-violet-300 text-sm"><Loader2 className="w-4 h-4 animate-spin"/>Procesando {progress.done}/{progress.total}…</div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${progress.total ? (progress.done/progress.total)*100 : 0}%` }}/>
              </div>
            </div>
          )}
          {results.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="w-4 h-4"/>{results.filter(r => r.ok).length} importados</span>
                {results.some(r => !r.ok) && <span className="flex items-center gap-1 text-red-300"><AlertCircle className="w-4 h-4"/>{results.filter(r => !r.ok).length} errores</span>}
              </div>
              {results.find(r => !r.ok)?.error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">{results.find(r => !r.ok)?.error}</div>
              )}
              <button onClick={onClose} className="btn-secondary text-sm">Cerrar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tabla view ──────────────────────────────────────────────────────────────
function CasosTabla({ casos, onSelect, onDelete, deletingId }: {
  casos: CasoGeneral[]; onSelect: (c: CasoGeneral) => void;
  onDelete: (id: string) => void; deletingId: string | null;
}) {
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const askDel = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmDel === id) { onDelete(id); setConfirmDel(null); }
    else { setConfirmDel(id); setTimeout(() => setConfirmDel(p => p === id ? null : p), 3000); }
  };

  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            {['Cliente / Tipo', 'Estado', 'Abogado', 'Expediente', 'Tribunal', 'Fechas', ''].map(h => (
              <th key={h} className="sticky top-14 z-20 bg-[#0d0d10]/95 backdrop-blur-md border-b border-white/[0.06] px-4 py-3 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-widest whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {casos.map((c, i) => {
            const meta = getEstado(c.estado);
            return (
              <tr key={c.id} onClick={() => onSelect(c)}
                className="table-row animate-fade-in group"
                style={{ animationDelay: `${Math.min(i, 20) * 15}ms` }}>
                {/* Título */}
                <td className="px-4 py-2.5">
                  <div className="flex items-start gap-1.5">
                    {c.prioridad && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0 mt-0.5"/>}
                    <div className="min-w-0">
                      <p className="font-medium text-white text-[13px] leading-tight line-clamp-1">{c.titulo}</p>
                      {c.tipo_caso && <span className="text-[10px] text-gray-500 capitalize">{c.tipo_caso}</span>}
                    </div>
                  </div>
                </td>
                {/* Estado */}
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.bg} ${meta.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`}/>{meta.label}
                  </span>
                  {c.estadisticas_estado === 'atrasado' && (
                    <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/15 text-red-400">Atrasado</span>
                  )}
                </td>
                {/* Abogado */}
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {c.abogado ? (
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAbogadoColor(c.abogado)} flex items-center justify-center text-[9px] font-bold text-white shrink-0`}>
                        {abogadoInitials(c.abogado)}
                      </div>
                      <span className="text-xs text-gray-300">{c.abogado}</span>
                    </div>
                  ) : <span className="text-xs text-gray-600">—</span>}
                </td>
                {/* Expediente */}
                <td className="px-4 py-2.5">
                  <span className="text-xs text-gray-400 font-mono">{c.expediente || '—'}</span>
                </td>
                {/* Radicado */}
                <td className="px-4 py-2.5 max-w-[200px]">
                  <span className="text-xs text-gray-500 truncate block" title={c.radicado ?? ''}>{c.radicado || '—'}</span>
                </td>
                {/* Fechas */}
                <td className="px-4 py-2.5 whitespace-nowrap">
                  <div className="flex flex-col gap-0.5">
                    {c.audiencias && <span className={`text-[10px] flex items-center gap-1 ${isOverdue(c.audiencias) ? 'text-red-400' : 'text-blue-400'}`}><Calendar className="w-3 h-3 shrink-0"/>{formatDate(c.audiencias)}</span>}
                    {c.vencimiento && <span className={`text-[10px] flex items-center gap-1 ${isOverdue(c.vencimiento) ? 'text-red-400' : 'text-amber-400'}`}><Clock className="w-3 h-3 shrink-0"/>{formatDate(c.vencimiento)}</span>}
                    {!c.audiencias && !c.vencimiento && <span className="text-[10px] text-gray-600">—</span>}
                  </div>
                </td>
                {/* Actions */}
                <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={e => { e.stopPropagation(); onSelect(c); }} className="p-1.5 rounded-lg text-gray-600 hover:text-violet-400 hover:bg-violet-500/10 transition-colors opacity-0 group-hover:opacity-100">
                      <ChevronRight className="w-3.5 h-3.5"/>
                    </button>
                    <button
                      onClick={e => askDel(e, c.id)}
                      disabled={deletingId === c.id}
                      className={`p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ${confirmDel === c.id ? 'bg-red-500/20 text-red-300 opacity-100' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'}`}>
                      {deletingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Trash2 className="w-3.5 h-3.5"/>}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Kanban ───────────────────────────────────────────────────────────────────
const KANBAN_COLS = [
  { key: 'activos',                              label: 'Activos',        borderTop: 'border-t-emerald-500', badge: 'bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  { key: 'federales',                            label: 'Federales',      borderTop: 'border-t-blue-500',    badge: 'bg-blue-500/10 text-blue-300',       dot: 'bg-blue-400' },
  { key: 'esperando sentencias',                 label: 'En espera',      borderTop: 'border-t-amber-500',   badge: 'bg-amber-500/10 text-amber-300',     dot: 'bg-amber-400' },
  { key: 'complicacion judicial/analisis',       label: 'En análisis',    borderTop: 'border-t-orange-500',  badge: 'bg-orange-500/10 text-orange-300',   dot: 'bg-orange-400' },
  { key: 'suspendido por falta de directivas',   label: 'Sin directivas', borderTop: 'border-t-gray-500',    badge: 'bg-gray-500/10 text-gray-400',       dot: 'bg-gray-500' },
  { key: 'suspendido por falta de pago',         label: 'Sin pago',       borderTop: 'border-t-red-500',     badge: 'bg-red-500/10 text-red-300',         dot: 'bg-red-400' },
];

function KCard({ caso, onSelect, askDel, confirmDel }: {
  caso: CasoGeneral; onSelect: (c: CasoGeneral) => void; askDel: (id: string) => void; confirmDel: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: caso.id });
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.2 : 1, touchAction: 'none' }}
      {...attributes} {...listeners}
      className="relative group rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/10 transition-all cursor-grab active:cursor-grabbing select-none">
      <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); askDel(caso.id); }}
        className={`absolute z-10 top-1.5 right-1.5 p-1 rounded-md transition-colors
          ${confirmDel === caso.id ? 'bg-red-500/20 text-red-400 opacity-100' : 'opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 hover:bg-red-500/10'}`}>
        <Trash2 className="w-3 h-3"/>
      </button>
      <button onPointerDown={e => e.stopPropagation()} onClick={() => onSelect(caso)} className="w-full text-left p-3">
        <div className="flex items-start gap-1.5 pr-5">
          {caso.prioridad && <Star className="w-3 h-3 fill-amber-400 text-amber-400 mt-0.5 shrink-0"/>}
          <p className="text-[11px] font-semibold text-white leading-tight">{caso.titulo}</p>
        </div>
        {caso.tipo_caso && <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded-full bg-white/5 text-[10px] text-gray-400 capitalize">{caso.tipo_caso}</span>}
        {caso.abogado && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${getAbogadoColor(caso.abogado)} flex items-center justify-center text-[8px] font-bold text-white shrink-0`}>
              {abogadoInitials(caso.abogado)}
            </div>
            <span className="text-[10px] text-gray-500 truncate">{caso.abogado}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {caso.audiencias && <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue(caso.audiencias) ? 'text-red-400' : 'text-blue-400'}`}><Calendar className="w-2.5 h-2.5"/>{formatDate(caso.audiencias)}</span>}
          {caso.vencimiento && <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue(caso.vencimiento) ? 'text-red-400' : 'text-amber-400'}`}><Clock className="w-2.5 h-2.5"/>{formatDate(caso.vencimiento)}</span>}
        </div>
      </button>
    </div>
  );
}

function KCol({ col, count, isOver, children }: { col: typeof KANBAN_COLS[0]; count: number; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: col.key });
  return (
    <div ref={setNodeRef} className={`glass-card p-0 overflow-hidden border-t-2 ${col.borderTop} transition-all min-w-0 ${isOver ? 'ring-2 ring-white/20 scale-[1.005]' : ''}`}>
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${col.dot}`}/>
          <h3 className="text-xs font-semibold text-white truncate">{col.label}</h3>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ml-1 ${col.badge}`}>{count}</span>
      </div>
      <div className="p-2 space-y-2 min-h-[80px] max-h-[65vh] overflow-y-auto">{children}</div>
    </div>
  );
}

function CasosKanban({ casos, onSelect, onDelete, saveCaso }: {
  casos: CasoGeneral[]; onSelect: (c: CasoGeneral) => void; onDelete: (id: string) => void;
  saveCaso: (data: Partial<CasoGeneral>, id?: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [items, setItems] = useState(casos);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const { showToast } = useToast();
  useEffect(() => { setItems(casos); }, [casos]);

  const colKeys = KANBAN_COLS.map(c => c.key);
  const askDel = (id: string) => {
    if (confirmDel === id) { onDelete(id); setConfirmDel(null); }
    else { setConfirmDel(id); setTimeout(() => setConfirmDel(p => p === id ? null : p), 3000); }
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const activeCaso = items.find(c => c.id === activeId) ?? null;
  const grouped = KANBAN_COLS.reduce<Record<string, CasoGeneral[]>>((acc, col) => {
    acc[col.key] = items.filter(c => (c.estado ?? '').toLowerCase() === col.key); return acc;
  }, {});
  items.filter(c => !colKeys.includes((c.estado ?? '').toLowerCase())).forEach(c => grouped['activos'].push(c));

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e; setActiveId(null); setOverCol(null);
    if (!over) return;
    const newEstado = colKeys.includes(over.id as string) ? over.id as string : items.find(c => c.id === over.id)?.estado ?? null;
    if (!newEstado) return;
    const card = items.find(c => c.id === active.id);
    if (!card || card.estado === newEstado) return;
    setItems(prev => prev.map(c => c.id === active.id ? { ...c, estado: newEstado } : c));
    const r = await saveCaso({ estado: newEstado }, active.id as string);
    if (!r.ok) {
      showToast('No se pudo mover', 'error');
      setItems(prev => prev.map(c => c.id === active.id ? { ...c, estado: card.estado } : c));
    } else {
      showToast(`→ ${KANBAN_COLS.find(c => c.key === newEstado)?.label ?? newEstado}`, 'success');
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection}
      onDragStart={e => setActiveId(e.active.id as string)}
      onDragOver={e => setOverCol(e.over?.id as string ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); setOverCol(null); }}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {KANBAN_COLS.map(col => (
          <KCol key={col.key} col={col} count={grouped[col.key]?.length ?? 0} isOver={overCol === col.key}>
            {!grouped[col.key]?.length
              ? <p className="text-[10px] text-gray-600 text-center py-8">Sin casos</p>
              : grouped[col.key].map(c => <KCard key={c.id} caso={c} onSelect={onSelect} askDel={askDel} confirmDel={confirmDel}/>)
            }
          </KCol>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeCaso && (
          <div className="p-3 rounded-xl shadow-2xl w-48 select-none rotate-2" style={{ background: '#1a1a2e', border: '1px solid rgba(139,92,246,0.5)' }}>
            <p className="text-[11px] font-semibold text-white line-clamp-2">{activeCaso.titulo}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function CasosGenerales() {
  const { casos, loading, refetch, saveCaso, deleteCaso, deleteMany } = useCasosGenerales();
  const { showToast } = useToast();
  const [view, setView] = useState<'tabla' | 'kanban'>('tabla');
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroAbogado, setFiltroAbogado] = useState('');
  const [detailCaso, setDetailCaso] = useState<CasoGeneral | null | 'new'>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const filtered = useMemo(() => casos.filter(c => {
    if (c.archivado) return false;
    if (filtroEstado && (c.estado ?? '').toLowerCase() !== filtroEstado) return false;
    if (filtroAbogado && !(c.abogado ?? '').toUpperCase().includes(filtroAbogado.toUpperCase())) return false;
    if (search) {
      const q = search.toLowerCase();
      return [c.titulo, c.expediente, c.radicado, c.abogado, c.tipo_caso].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  }), [casos, search, filtroEstado, filtroAbogado]);

  const stats = useMemo(() => {
    const a = casos.filter(c => !c.archivado);
    return {
      total: a.length,
      activos: a.filter(c => c.estado === 'activos').length,
      federales: a.filter(c => c.estado === 'federales').length,
      atrasados: a.filter(c => c.estadisticas_estado === 'atrasado').length,
      prioridad: a.filter(c => c.prioridad).length,
    };
  }, [casos]);

  // Pills de estado
  const estadoPills = [
    { key: '', label: `Todos (${casos.filter(c=>!c.archivado).length})` },
    ...Object.entries(ESTADO_META).map(([key, m]) => ({
      key, label: `${m.label} (${casos.filter(c => c.estado === key && !c.archivado).length})`,
    })).filter(p => casos.some(c => c.estado === p.key)),
  ];

  async function handleDelete(id: string) {
    setDeletingId(id);
    const ok = await deleteCaso(id);
    setDeletingId(null);
    if (ok) showToast('Caso eliminado', 'success');
    else showToast('No se pudo eliminar', 'error');
  }
  async function handleDeleteAll() {
    const n = filtered.length; if (!n) return;
    if (!window.confirm(`¿Eliminás los ${n} casos del listado actual?`)) return;
    if (window.prompt(`Confirmá escribiendo: BORRAR ${n}`) !== `BORRAR ${n}`) { showToast('Cancelado', 'info'); return; }
    setBulkLoading(true);
    const r = await deleteMany(filtered.map(c => c.id));
    setBulkLoading(false); refetch();
    showToast(`${r.ok} eliminado(s)${r.fail ? `, ${r.fail} con error` : ''}`, r.fail ? 'error' : 'success');
  }

  const sel = 'bg-[#141418] border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500/50 [&>option]:bg-[#141418] [&>option]:text-white';

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Scale className="w-4.5 h-4.5 text-white"/>
            </div>
            Casos Generales
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 ml-12">{filtered.length} caso{filtered.length !== 1 ? 's' : ''} · solo activos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={refetch} className="btn-secondary p-2.5" title="Actualizar"><RefreshCw className="w-4 h-4"/></button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-2 text-sm"><Upload className="w-4 h-4"/>Importar</button>
          <button onClick={handleDeleteAll} disabled={!filtered.length || bulkLoading}
            className="btn-danger flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4"/>}
            <span className="hidden sm:inline">Eliminar visibles</span>
          </button>
          <button onClick={() => setDetailCaso('new')} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4"/>Nuevo caso</button>
        </div>
      </div>

      {/* Stats chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Total',     val: stats.total,     color: 'text-white',       bg: 'bg-white/5 border-white/10' },
          { label: 'Activos',   val: stats.activos,   color: 'text-emerald-300', bg: 'bg-emerald-500/5 border-emerald-500/20' },
          { label: 'Federales', val: stats.federales, color: 'text-blue-300',    bg: 'bg-blue-500/5 border-blue-500/20' },
          { label: 'Atrasados', val: stats.atrasados, color: 'text-red-300',     bg: 'bg-red-500/5 border-red-500/20' },
          { label: 'Prioridad', val: stats.prioridad, color: 'text-amber-300',   bg: 'bg-amber-500/5 border-amber-500/20' },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${s.bg}`}>
            <span className={`text-lg font-bold ${s.color}`}>{s.val}</span>
            <span className="text-[10px] text-gray-500">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
          <input type="text" placeholder="Buscar por título, expediente, tribunal…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark pl-10 text-sm"/>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilterOpen(!filterOpen)}
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl border transition-colors ${filterOpen || filtroEstado || filtroAbogado ? 'border-violet-500/40 bg-violet-500/10 text-violet-300' : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'}`}>
            <Filter className="w-4 h-4"/>Filtros
            {(filtroEstado || filtroAbogado) && <span className="rounded-full bg-violet-500 text-white text-[10px] px-1.5">{[filtroEstado,filtroAbogado].filter(Boolean).length}</span>}
          </button>
          <div className="flex bg-white/5 rounded-xl p-0.5 border border-white/10">
            <button onClick={() => setView('tabla')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${view === 'tabla' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}><Table2 className="w-3.5 h-3.5"/>Tabla</button>
            <button onClick={() => setView('kanban')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${view === 'kanban' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}><Columns3 className="w-3.5 h-3.5"/>Pipeline</button>
          </div>
        </div>
      </div>

      {/* Estado pills (multi-filter bar — like Previsional) */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {estadoPills.map(p => {
          const meta = p.key ? getEstado(p.key) : null;
          const active = filtroEstado === p.key;
          return (
            <button key={p.key} onClick={() => setFiltroEstado(p.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap flex items-center gap-1.5
                ${active ? (meta ? `${meta.bg} ${meta.color} border-current/30` : 'bg-white/10 text-white border-white/20') : 'bg-white/5 text-gray-500 border-white/5 hover:text-white'}`}>
              {meta && <span className={`w-2 h-2 rounded-full ${meta.dot}`}/>}
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="flex flex-wrap gap-3 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className="text-[10px] text-gray-500 uppercase tracking-widest">Abogado</label>
            <select className={sel} value={filtroAbogado} onChange={e => setFiltroAbogado(e.target.value)}>
              <option value="">Todos</option>
              {ABOGADOS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {(filtroEstado || filtroAbogado) && (
            <button onClick={() => { setFiltroEstado(''); setFiltroAbogado(''); }}
              className="self-end text-xs text-gray-500 hover:text-white flex items-center gap-1">
              <X className="w-3 h-3"/>Limpiar
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500">
          <Scale className="w-14 h-14 mb-4 opacity-10"/>
          <p className="text-lg font-medium">Sin casos</p>
          <p className="text-sm mt-1">Importá desde Notion o creá el primero</p>
          <div className="flex gap-2 mt-5">
            <button onClick={() => setImportOpen(true)} className="btn-secondary text-sm flex items-center gap-2"><Upload className="w-4 h-4"/>Importar</button>
            <button onClick={() => setDetailCaso('new')} className="btn-primary text-sm flex items-center gap-2"><Plus className="w-4 h-4"/>Nuevo caso</button>
          </div>
        </div>
      ) : view === 'kanban' ? (
        <CasosKanban casos={filtered} onSelect={c => setDetailCaso(c)} onDelete={handleDelete} saveCaso={saveCaso}/>
      ) : (
        <CasosTabla casos={filtered} onSelect={c => setDetailCaso(c)} onDelete={handleDelete} deletingId={deletingId}/>
      )}

      {/* Modals */}
      {detailCaso !== null && (
        <CaseDetailModal
          caso={detailCaso === 'new' ? null : detailCaso}
          onClose={() => setDetailCaso(null)}
          onSaved={refetch}
        />
      )}
      {importOpen && <NotionImportModal onClose={() => setImportOpen(false)} onImported={refetch} totalExistentes={casos.length}/>}
    </div>
  );
}
