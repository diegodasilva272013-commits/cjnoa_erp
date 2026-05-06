import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, Plus, Upload, Trash2, AlertCircle, CheckCircle2,
  Loader2, X, Scale, Calendar, Clock, Star, RefreshCw,
  Columns3, Table2, ChevronRight, ExternalLink, AlertTriangle, Eye,
  ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import {
  DndContext, DragEndEvent, DragOverlay, PointerSensor,
  useSensor, useSensors, rectIntersection, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useCasosGenerales, CasoGeneral, TIPOS_CASO, ABOGADOS } from '../hooks/useCasosGenerales';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import NotasFeedPanel from '../components/cases/NotasFeedPanel';
import ArchivosCasoGeneralPanel from '../components/cases/ArchivosCasoGeneralPanel';

// ─── Estado constants (same pattern as PIPELINE_COLORS in previsional) ─────────
const ESTADOS_ORDERED = [
  'activos',
  'federales',
  'esperando audiencia',
  'esperando sentencias',
  'complicacion judicial/analisis',
  'suspendido por falta de directivas',
  'suspendido por falta de pago',
] as const;
type EstadoCaso = typeof ESTADOS_ORDERED[number];

const ESTADO_LABELS: Record<string, string> = {
  'activos':                             'Activo',
  'federales':                           'Federal',
  'esperando audiencia':                 'Esperando audiencia',
  'esperando sentencias':                'Esperando sentencia',
  'complicacion judicial/analisis':      'En análisis',
  'suspendido por falta de directivas':  'Sin directivas',
  'suspendido por falta de pago':        'Sin pago',
};

// "bg-X/10 text-X border-X/20" — matches FichasList PIPELINE_COLORS pattern
const ESTADO_COLORS: Record<string, string> = {
  'activos':                             'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'federales':                           'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'esperando audiencia':                 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'esperando sentencias':                'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'complicacion judicial/analisis':      'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'suspendido por falta de directivas':  'bg-gray-500/10 text-gray-400 border-gray-500/20',
  'suspendido por falta de pago':        'bg-red-500/10 text-red-400 border-red-500/20',
};

const ESTADO_DOT: Record<string, string> = {
  'activos':                             'bg-emerald-500',
  'federales':                           'bg-blue-500',
  'esperando audiencia':                 'bg-cyan-500',
  'esperando sentencias':                'bg-amber-500',
  'complicacion judicial/analisis':      'bg-orange-500',
  'suspendido por falta de directivas':  'bg-gray-500',
  'suspendido por falta de pago':        'bg-red-500',
};

const KANBAN_BORDER: Record<string, string> = {
  'activos':                             'border-t-emerald-500',
  'federales':                           'border-t-blue-500',
  'esperando audiencia':                 'border-t-cyan-500',
  'esperando sentencias':                'border-t-amber-500',
  'complicacion judicial/analisis':      'border-t-orange-500',
  'suspendido por falta de directivas':  'border-t-gray-500',
  'suspendido por falta de pago':        'border-t-red-500',
};

const KANBAN_BADGE: Record<string, string> = {
  'activos':                             'bg-emerald-500/10 text-emerald-400',
  'federales':                           'bg-blue-500/10 text-blue-400',
  'esperando audiencia':                 'bg-cyan-500/10 text-cyan-400',
  'esperando sentencias':                'bg-amber-500/10 text-amber-400',
  'complicacion judicial/analisis':      'bg-orange-500/10 text-orange-400',
  'suspendido por falta de directivas':  'bg-gray-500/10 text-gray-400',
  'suspendido por falta de pago':        'bg-red-500/10 text-red-400',
};

function eColor(e: string | null) {
  return ESTADO_COLORS[(e ?? '').toLowerCase()] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20';
}
function eLabel(e: string | null) {
  return ESTADO_LABELS[(e ?? '').toLowerCase()] ?? (e || '—');
}
function eDot(e: string | null) {
  return ESTADO_DOT[(e ?? '').toLowerCase()] ?? 'bg-gray-600';
}

function abogadoInitials(s: string | null) {
  if (!s) return '?';
  const m = s.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/g);
  return m ? m[m.length - 1].slice(0, 2).toUpperCase() : s.slice(0, 2).toUpperCase();
}
function formatDate(d: string | null) {
  if (!d) return null;
  const [y, mm, day] = d.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(day)} ${months[parseInt(mm)-1]} ${y}`;
}
function isOverdue(d: string | null) { return !!d && new Date(d) < new Date(); }
function daysUntil(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

// ─── CSV RFC 4180 ─────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const raw = text.replace(/^\uFEFF/, '');
  const lines: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      if (inQ && raw[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && raw[i + 1] === '\n') i++;
      lines.push(cur); cur = '';
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  const parseFields = (line: string): string[] => {
    const vals: string[] = []; let field = '', q = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') { if (q && line[j+1] === '"') { field += '"'; j++; } else q = !q; }
      else if (c === ',' && !q) { vals.push(field); field = ''; }
      else field += c;
    }
    vals.push(field); return vals;
  };
  if (!lines[0]) return [];
  const headers = parseFields(lines[0]).map(h => h.trim().replace(/^\uFEFF/, ''));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue;
    const vals = parseFields(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

// ─── Case-insensitive, accent-stripped, space-collapsed row accessor ─────────
function normalizeKey(k: string) {
  return k
    .trim()
    // strip emoji and non-latin symbols (Notion sometimes prepends emojis to column names)
    .replace(/[^\w\s\u00C0-\u024F/\-]/g, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_\-/]+/g, ' ')
    .trim();
}
function makeAccessor(raw: Record<string, string>) {
  const norm: Record<string, string> = {};
  const originalKeys: Record<string, string> = {}; // normalized → original key
  for (const [k, v] of Object.entries(raw)) {
    const nk = normalizeKey(k);
    norm[nk] = v;
    originalKeys[nk] = k;
  }
  function get(...candidates: string[]): string {
    for (const c of candidates) {
      const nk = normalizeKey(c);
      const val = norm[nk];
      if (val !== undefined && val !== '') return val.trim();
    }
    return '';
  }
  get.detectedKey = function(...candidates: string[]): string | null {
    for (const c of candidates) {
      const nk = normalizeKey(c);
      if (norm[nk] !== undefined && norm[nk] !== '') return originalKeys[nk];
    }
    return null;
  };
  return get;
}

// ─── Notion normalizers ───────────────────────────────────────────────────────
const MESES: Record<string, string> = {
  enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',
  julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12',
};
const MESES_EN: Record<string, string> = {
  january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
  july:'07',august:'08',september:'09',october:'10',november:'11',december:'12',
  jan:'01',feb:'02',mar:'03',apr:'04',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};
function parseNotionDate(v: string): string | null {
  if (!v?.trim()) return null;
  const s = v.trim();
  // ISO with optional time: 2026-05-06 or 2026-05-06T...
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // DD/MM/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2,'0')}-${slash[1].padStart(2,'0')}`;
  // X de mes de YYYY (Spanish)
  const sp = s.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (sp) { const m = MESES[sp[2].toLowerCase()]; if (m) return `${sp[3]}-${m}-${sp[1].padStart(2,'0')}`; }
  // Month DD, YYYY (English, from Notion default locale)
  const engLong = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (engLong) { const m = MESES_EN[engLong[1].toLowerCase()]; if (m) return `${engLong[3]}-${m}-${engLong[2].padStart(2,'0')}`; }
  // DD-MM-YYYY
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return `${dash[3]}-${dash[2].padStart(2,'0')}-${dash[1].padStart(2,'0')}`;
  return null;
}
function parseNotionBool(v: string) {
  return ['yes','sí','si','true','1','✓'].includes((v ?? '').trim().toLowerCase());
}
function normEstado(v: string): string {
  const raw = (v ?? '').trim();
  if (!raw) return 'activos';
  // normalize: lowercase, strip accents, strip emoji/symbols, collapse spaces
  const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s/]/g, ' ').replace(/\s+/g, ' ').trim();
  // 1. exact match (handles 'activos', 'federales', etc.)
  const exact = ESTADOS_ORDERED.find(k =>
    k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s/]/g, ' ').replace(/\s+/g, ' ').trim() === s
  );
  if (exact) return exact;
  // 2. singular forms: 'activo' → 'activos', 'federal' → 'federales'
  const withS = ESTADOS_ORDERED.find(k => k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').startsWith(s));
  if (withS) return withS;
  // 3. fuzzy keyword matching
  if (s.includes('federal')) return 'federales';
  if (s.includes('audiencia')) return 'esperando audiencia';
  if (s.includes('espera') || s.includes('sentencia')) return 'esperando sentencias';
  if (s.includes('complic') || s.includes('judicial') || s.includes('analisis')) return 'complicacion judicial/analisis';
  if (s.includes('directiva') || (s.includes('suspendido') && !s.includes('pago'))) return 'suspendido por falta de directivas';
  if (s.includes('pago') || (s.includes('suspendido') && s.includes('pago'))) return 'suspendido por falta de pago';
  if (s.includes('activo') || s.includes('activ') || s.includes('vigente') || s.includes('actua') || s.includes('en curso')) return 'activos';
  // 4. unknown — store raw value so the badge shows the real value instead of silently becoming "Activo"
  return raw.toLowerCase();
}
function normTipo(v: string): string | null {
  const s = (v ?? '').toLowerCase().trim();
  if (!s) return null;
  for (const t of TIPOS_CASO) { if (s.includes(t.toLowerCase())) return t; }
  if (s.includes('sucesorio')) return 'sucesorio';
  if (s.includes('laboral') || s.includes('despido')) return 'laboral';
  if (s.includes('ejecutivo')) return 'ejecutivo';
  if (s.includes('familia') || s.includes('alimento')) return 'familia';
  if (s.includes('previsional') || s.includes('anses')) return 'previsional';
  if (s.includes('prescripci')) return 'prescripciones';
  if (s.includes('real') || s.includes('escritura')) return 'reales';
  if (s.includes('civil')) return 'civil';
  return s.slice(0, 40) || null;
}

// ─── Notion Markdown helpers (notas exportadas) ──────────────────────────────
function normTitle(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function extractMdBody(md: string): { title: string; body: string } {
  const lines = md.split(/\r?\n/);
  let i = 0;
  let title = '';
  if (lines[i]?.startsWith('# ')) { title = lines[i].slice(2).trim(); i++; }
  // skip blank lines + key:value property block
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    if (/^[A-Za-zÁÉÍÓÚáéíóúÑñ][\w \(\)/áéíóúÁÉÍÓÚñÑ]*:\s/.test(ln)) { i++; continue; }
    break;
  }
  return { title, body: lines.slice(i).join('\n').trim() };
}
function lookupMdBody(map: Map<string, string>, titulo: string): string {
  if (!map.size || !titulo) return '';
  const key = normTitle(titulo);
  if (map.has(key)) return map.get(key) || '';
  // prefix fallback (titles truncated by Notion)
  if (key.length >= 20) {
    for (const [k, v] of map.entries()) {
      if (k.startsWith(key) || key.startsWith(k)) return v;
    }
    const frag = key.slice(0, 30);
    for (const [k, v] of map.entries()) {
      if (k.includes(frag)) return v;
    }
  }
  return '';
}

// ─── SortHeader (same as FichasList) ─────────────────────────────────────────
type SortKey = 'titulo' | 'estado' | 'abogado' | 'audiencias' | 'vencimiento' | 'tipo_caso';
function SortHeader({ k, label, className='', sortKey, sortDir, onClick }: {
  k: SortKey; label: string; className?: string;
  sortKey: SortKey; sortDir: 'asc'|'desc'; onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className={`sticky top-14 sm:top-16 z-20 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10 text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase ${className}`}>
      <button type="button" onClick={() => onClick(k)}
        className={`flex items-center gap-1 hover:text-white transition-colors ${active ? 'text-white' : ''}`}>
        {label}
        {!active && <ArrowUpDown className="w-3 h-3 opacity-40"/>}
        {active && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3"/> : <ArrowDown className="w-3 h-3"/>)}
      </button>
    </th>
  );
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

  const set = (key: keyof CasoGeneral, val: unknown) =>
    setEditing(p => ({ ...p, [key]: val }));

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
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="flex-1 pr-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`badge border ${eColor(editing.estado ?? null)}`}>
                {eLabel(editing.estado ?? null)}
              </span>
              {editing.prioridad && (
                <span className="badge border bg-amber-500/10 text-amber-400 border-amber-500/20 flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-400"/>Alta prioridad
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-white leading-tight">
              {isNew ? (editing.titulo || 'Nuevo caso') : editing.titulo}
            </h2>
            {editing.expediente && (
              <p className="text-xs text-gray-500 font-mono mt-0.5">{editing.expediente}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isNew && (
              <button onClick={() => setEditMode(m => !m)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${editMode ? 'bg-violet-500/20 text-violet-300' : 'bg-white/5 text-gray-400 hover:text-white'}`}>
                {editMode ? 'Ver' : 'Editar'}
              </button>
            )}
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-300 text-gray-400 transition-colors">
              <X className="w-4 h-4"/>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[72vh]">
          {editMode ? (
            <>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Título *</label>
                <input className={inp} value={editing.titulo ?? ''} onChange={e => set('titulo', e.target.value)} placeholder="Nombre del caso"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['Estado','estado','select',[...ESTADOS_ORDERED]],
                  ['Tipo de caso','tipo_caso','select',[...TIPOS_CASO]],
                  ['Abogado','abogado','select',[...ABOGADOS]],
                  ['Personería','personeria','select',['APODERADO','Patrocinante','Personería de urgencia']],
                  ['Estadísticas','estadisticas_estado','select',['al día','atrasado']],
                  ['Expediente','expediente','text',[]],
                  ['Próx. audiencia','audiencias','date',[]],
                  ['Vencimiento','vencimiento','date',[]],
                ] as [string, keyof CasoGeneral, string, string[]][]).map(([label, key, type, opts]) => (
                  <div key={key as string}>
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">{label}</label>
                    {type === 'select' ? (
                      <select className={sel} value={(editing as Record<string,unknown>)[key as string] as string ?? ''}
                        onChange={e => set(key, e.target.value || null)}>
                        <option value="">—</option>
                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={type} className={inp}
                        value={(editing as Record<string,unknown>)[key as string] as string ?? ''}
                        onChange={e => set(key, e.target.value || null)}/>
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
                <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Notas / Actualizaciones</label>
                <textarea className={`${inp} resize-none`} rows={3}
                  value={editing.actualizacion ?? ''} onChange={e => set('actualizacion', e.target.value || null)}/>
              </div>
              <div className="flex gap-6">
                {(['prioridad','archivado'] as const).map(k => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => set(k, !editing[k])}
                      className={`w-9 h-5 rounded-full relative transition-colors ${editing[k] ? 'bg-violet-500' : 'bg-white/10'}`}>
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${editing[k] ? 'translate-x-4' : ''}`}/>
                    </div>
                    <span className="text-sm text-gray-300 capitalize">{k}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {editing.abogado && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Abogado</p>
                  <p className="text-sm font-semibold text-white">{editing.abogado}</p>
                  {editing.personeria && <p className="text-xs text-gray-500 mt-0.5">{editing.personeria}</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {([
                  {label:'Expediente', val:editing.expediente, mono:true},
                  {label:'Tipo de caso', val:editing.tipo_caso},
                  {label:'Estadísticas', val:editing.estadisticas_estado},
                  {label:'Próx. audiencia', val:formatDate(editing.audiencias??null)},
                  {label:'Vencimiento', val:formatDate(editing.vencimiento??null)},
                ] as {label:string;val:string|null|undefined;mono?:boolean}[])
                  .filter(i => i.val)
                  .map(item => (
                    <div key={item.label} className="bg-white/[0.025] rounded-xl p-3 border border-white/[0.05]">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{item.label}</p>
                      <p className={`text-sm text-white font-medium capitalize ${item.mono ? 'font-mono text-xs' : ''}`}>{item.val}</p>
                    </div>
                  ))}
              </div>
              {editing.radicado && (
                <div className="bg-white/[0.025] rounded-xl p-3 border border-white/[0.05]">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Tribunal / Radicado</p>
                  <p className="text-sm text-white">{editing.radicado}</p>
                </div>
              )}
              {editing.url_drive && (
                <a href={editing.url_drive} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm hover:bg-blue-500/20 transition-colors">
                  <ExternalLink className="w-4 h-4 shrink-0"/>Abrir carpeta en Drive
                </a>
              )}
              {/* Panel de Seguimiento (notas + tareas en tiempo real) */}
              {!isNew && editing.id && (
                <div className="pt-3 border-t border-white/[0.06]">
                  <NotasFeedPanel casoId={editing.id} />
                </div>
              )}
              {/* Archivos: fotos / PDFs / audios / cualquier tipo */}
              {!isNew && editing.id && (
                <div className="pt-3 border-t border-white/[0.06]">
                  <ArchivosCasoGeneralPanel casoId={editing.id} />
                </div>
              )}
              {/* Histórico importado de Notion (colapsable) */}
              {editing.actualizacion && (
                <details className="bg-white/[0.025] rounded-xl border border-white/[0.05] group">
                  <summary className="cursor-pointer px-3 py-2 flex items-center justify-between hover:bg-white/[0.03] rounded-xl">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">Histórico (importado de Notion)</p>
                    <span className="text-[10px] text-gray-600 group-open:hidden">Ver ▾</span>
                    <span className="text-[10px] text-gray-600 hidden group-open:inline">Ocultar ▴</span>
                  </summary>
                  <div className="p-3 pt-0 border-t border-white/[0.04]">
                    <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed">{editing.actualizacion}</p>
                  </div>
                </details>
              )}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.06]">
            <button onClick={onClose} className="btn-secondary text-sm px-4">Cerrar</button>
            {editMode && (
              <button onClick={handleSave} disabled={saving}
                className="btn-primary text-sm px-4 flex items-center gap-2 disabled:opacity-50">
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
// Per-field alias lists — the more the better for Notion CSV variety
const COL_TITULO = ['nombre','titulo','name','title','caratula','caratula del expediente','denominacion','caso'];
const COL_ESTADO = ['estado','status','state','situacion','pipeline'];
const COL_ABOGADO = ['sistema','abogado','abogado/a','abogada','captado por','dr','dra','letrado','letrada','profesional','responsable','asignado','a cargo','letrada/o'];
const COL_PERSONERIA = ['personeria','personeria procesal','caracter','rol procesal','facultad'];
const COL_EXPEDIENTE = ['expediente','exp','numero expediente','nro expediente','num exp','n expediente','n° expediente','numero de expediente','nro exp'];
const COL_RADICADO = ['radicado','tribunal','juzgado','juzgado/tribunal','radicacion','fuero','juzgado actuante','juzgado de radicacion'];
const COL_TIPO = ['tipo de caso','tipo caso','tipodecaso','tipo_caso','tipo','type','category','categoria','materia','fuero juridico'];
const COL_AUDIENCIAS = ['audiencias','audiencia','proxima audiencia','proxima audiencia','fecha audiencia','fecha de audiencia','proxima fecha','fecha proxima','div audiencias'];
const COL_VENCIMIENTO = ['vencimiento','vence','fecha vencimiento','fecha de vencimiento','fecha limite','fecha_vencimiento','plazo'];
const COL_URL_DRIVE = ['url del drive','url drive','url del drive','drive','url_drive','link drive','carpeta drive','google drive','link carpeta','url carpeta','enlace drive','link de drive'];
const COL_ACTUALIZACION = ['actualizacion','actualizaciones','notas','notes','observaciones','novedad','novedades','situacion actual','situacion','nota','comentario','comentarios','ultima novedad','estado de avance'];
const COL_PRIORIDAD = ['prioridad','priority','urgente','urgent','prioritario'];
const COL_ARCHIVAR = ['archivar','archivado','archived','archive','cerrado','inactivo','cancelado'];
const COL_ESTADISTICAS = ['estadisticas (no tocar)','estadisticas_estado','estadisticas','statistics','avance'];

interface ImportRow { titulo: string; ok: boolean; error?: string }
interface PreviewRow { titulo: string; estadoRaw: string; estadoNorm: string; abogado: string; expediente: string; tipo: string }
interface FieldMapping { field: string; csvCol: string | null; rawSample: string }

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
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [fieldMapping, setFieldMapping] = useState<FieldMapping[]>([]);
  // Notas .md de Notion: title (normalizado) → body
  const [mdMap, setMdMap] = useState<Map<string, string>>(new Map());
  const [mdLoading, setMdLoading] = useState(false);
  const [mdFileName, setMdFileName] = useState<string>('');

  const ALL_EXPECTED = [...COL_TITULO,...COL_ESTADO,...COL_ABOGADO,...COL_PERSONERIA,...COL_EXPEDIENTE,...COL_RADICADO,...COL_TIPO,...COL_AUDIENCIAS,...COL_VENCIMIENTO,...COL_URL_DRIVE,...COL_ACTUALIZACION,...COL_PRIORIDAD,...COL_ARCHIVAR];

  async function handleFileChange(f: File | undefined) {
    if (!f) return;
    setFile(f); setResults([]); setPreview(null);
    try {
      let rows: Record<string,string>[] = [];
      if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as Record<string,string>[];
      } else {
        rows = parseCSV(await f.text());
      }
      if (!rows.length) return;
      setDetectedHeaders(Object.keys(rows[0]));
      let filtered = rows.filter(r => makeAccessor(r)(...COL_TITULO).length > 0);
      if (skipArchived) filtered = filtered.filter(r => !parseNotionBool(makeAccessor(r)(...COL_ARCHIVAR)));
      setPreviewTotal(filtered.length);
      if (!filtered.length) return;
      // Build field mapping — scan ALL rows to find first non-empty value per field
      const buildMapping = (cols: string[], label: string): FieldMapping => {
        let csvCol: string | null = null; let rawSample = '';
        for (const row of filtered) {
          const g = makeAccessor(row);
          const key = g.detectedKey(...cols);
          if (key) { csvCol = key; rawSample = g(...cols); break; }
        }
        return { field: label, csvCol, rawSample };
      };
      setFieldMapping([
        buildMapping(COL_TITULO,      'Título'),
        buildMapping(COL_ESTADO,      'Estado'),
        buildMapping(COL_ABOGADO,     'Abogado'),
        buildMapping(COL_PERSONERIA,  'Personería'),
        buildMapping(COL_EXPEDIENTE,  'Expediente'),
        buildMapping(COL_RADICADO,    'Radicado'),
        buildMapping(COL_TIPO,        'Tipo'),
        buildMapping(COL_AUDIENCIAS,  'Audiencia'),
        buildMapping(COL_VENCIMIENTO, 'Vencimiento'),
        buildMapping(COL_URL_DRIVE,   'Drive URL'),
        buildMapping(COL_ACTUALIZACION,'Notas'),
      ]);
      setPreview(filtered.slice(0, 8).map(r => {
        const g = makeAccessor(r);
        const estadoRaw = g(...COL_ESTADO);
        return {
          titulo:    g(...COL_TITULO),
          estadoRaw,
          estadoNorm: normEstado(estadoRaw),
          abogado:   g(...COL_ABOGADO),
          expediente: g(...COL_EXPEDIENTE),
          tipo:      normTipo(g(...COL_TIPO)) ?? '',
        };
      }));
    } catch { /* ignore */ }
  }

  async function handleMdFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setMdLoading(true);
    try {
      const map = new Map<string, string>();
      const arr = Array.from(files);
      // detect single zip
      const zips = arr.filter(f => f.name.toLowerCase().endsWith('.zip'));
      const mds  = arr.filter(f => f.name.toLowerCase().endsWith('.md'));

      const ingest = (rawTitle: string, content: string) => {
        const { title: h1Title, body } = extractMdBody(content);
        // prefer H1 title if present, else derive from filename
        const titleForKey = h1Title || rawTitle.replace(/\s+[a-f0-9]{20,}$/, '').replace(/\.md$/i, '');
        if (!body) return;
        map.set(normTitle(titleForKey), body);
      };

      if (zips.length) {
        const JSZipMod = (await import('jszip')).default;
        for (const z of zips) {
          const zip = await JSZipMod.loadAsync(await z.arrayBuffer());
          const entries = Object.values(zip.files).filter(e => !e.dir && e.name.toLowerCase().endsWith('.md'));
          // Notion sometimes nests another zip inside
          const innerZips = Object.values(zip.files).filter(e => !e.dir && e.name.toLowerCase().endsWith('.zip'));
          for (const e of entries) {
            const txt = await e.async('string');
            const base = e.name.split('/').pop() || e.name;
            ingest(base, txt);
          }
          for (const iz of innerZips) {
            try {
              const inner = await JSZipMod.loadAsync(await iz.async('arraybuffer'));
              const innerMds = Object.values(inner.files).filter(x => !x.dir && x.name.toLowerCase().endsWith('.md'));
              for (const e of innerMds) {
                const txt = await e.async('string');
                const base = e.name.split('/').pop() || e.name;
                ingest(base, txt);
              }
            } catch { /* not a zip, skip */ }
          }
        }
      }

      for (const f of mds) {
        const txt = await f.text();
        ingest(f.name, txt);
      }

      setMdMap(map);
      const fname = arr.length === 1 ? arr[0].name : `${arr.length} archivos`;
      setMdFileName(fname);
      showToast(`${map.size} nota(s) cargada(s) desde ${fname}`, map.size ? 'success' : 'error');
    } catch (e: unknown) {
      showToast(`Error leyendo notas: ${(e as Error)?.message ?? e}`, 'error');
    } finally {
      setMdLoading(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true); setResults([]);
    try {
      let rows: Record<string,string>[] = [];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as Record<string,string>[];
      } else {
        rows = parseCSV(await file.text());
      }
      rows = rows.filter(r => makeAccessor(r)(...COL_TITULO).length > 0);
      if (skipArchived) rows = rows.filter(r => !parseNotionBool(makeAccessor(r)(...COL_ARCHIVAR)));
      setProgress({ done: 0, total: rows.length });
      if (!rows.length) { showToast('No hay filas para importar', 'error'); setImporting(false); return; }

      if (borrarPrimero) {
        await supabase.from('casos_generales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const { data: ud } = await supabase.auth.getUser();
      const userId = ud?.user?.id ?? null;

      const batch = rows.map(r => {
        const g = makeAccessor(r);
        return {
          titulo:              g(...COL_TITULO),
          expediente:          g(...COL_EXPEDIENTE) || null,
          estado:              normEstado(g(...COL_ESTADO)),
          tipo_caso:           normTipo(g(...COL_TIPO)),
          abogado:             g(...COL_ABOGADO) || null,
          personeria:          g(...COL_PERSONERIA) || null,
          radicado:            g(...COL_RADICADO) || null,
          url_drive:           g(...COL_URL_DRIVE) || null,
          actualizacion:       (() => {
            const csvNotes = g(...COL_ACTUALIZACION) || '';
            const titulo = g(...COL_TITULO);
            const body = lookupMdBody(mdMap, titulo);
            const merged = [csvNotes, body].filter(Boolean).join('\n\n---\n\n').trim();
            return merged || null;
          })(),
          audiencias:          parseNotionDate(g(...COL_AUDIENCIAS)),
          vencimiento:         parseNotionDate(g(...COL_VENCIMIENTO)),
          prioridad:           parseNotionBool(g(...COL_PRIORIDAD)),
          archivado:           parseNotionBool(g(...COL_ARCHIVAR)),
          estadisticas_estado: g(...COL_ESTADISTICAS) || 'al día',
          created_by:          userId,
        };
      });

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
      <div className="modal-content sm:max-w-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-violet-400"/>Importar desde Notion / Excel
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-red-500/20 hover:text-red-300 text-gray-400 transition-colors">
            <X className="w-4 h-4"/>
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
          {totalExistentes > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0"/>
                <div>
                  <p className="text-sm font-semibold text-amber-200">Hay {totalExistentes} registros existentes</p>
                  <p className="text-xs text-amber-200/60 mt-0.5">Podés reemplazarlos todos o agregar encima</p>
                </div>
              </div>
              <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                <div onClick={() => setBorrarPrimero(!borrarPrimero)} className={`w-9 h-5 rounded-full relative transition-colors ${borrarPrimero ? 'bg-amber-500' : 'bg-white/10'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${borrarPrimero ? 'translate-x-4' : ''}`}/>
                </div>
                <span className="text-sm text-amber-200 font-medium">Borrar todos antes de importar (recomendado)</span>
              </label>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div onClick={() => setSkipArchived(!skipArchived)} className={`w-9 h-5 rounded-full relative transition-colors ${skipArchived ? 'bg-violet-500' : 'bg-white/10'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${skipArchived ? 'translate-x-4' : ''}`}/>
            </div>
            <span className="text-sm text-gray-300">Omitir archivados (Archivar = Yes)</span>
          </label>

          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-3">
            <p className="text-xs text-blue-200 font-semibold mb-1">⚠ Importante para CSV de Notion</p>
            <p className="text-[11px] text-blue-200/70 leading-relaxed">
              Notion exporta <span className="font-mono bg-white/5 px-1 rounded">2 archivos</span>:
              <br/>• <span className="font-mono bg-white/5 px-1 rounded">nombre.csv</span> (chico) → <span className="text-red-300">sólo títulos, NO USAR</span>
              <br/>• <span className="font-mono bg-white/5 px-1 rounded">nombre_all.csv</span> (grande) → <span className="text-emerald-300">TODOS los datos ✓ usar este</span>
            </p>
          </div>

          <label className="cursor-pointer block">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 hover:bg-violet-500/10 transition-colors">
              <Upload className="w-5 h-5 text-violet-400 shrink-0"/>
              <div className="min-w-0">
                <p className="text-sm text-violet-200 font-medium truncate">{file ? file.name : 'Elegir archivo _all.csv (o XLSX)'}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">NOMBRE · Estado · SISTEMA · Expediente · Radicado · tipo de caso · Audiencias · Vencimiento · URL del DRIVE</p>
              </div>
            </div>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={e => handleFileChange(e.target.files?.[0])}/>
          </label>

          {/* Notas .md de Notion (opcional) */}
          <label className="cursor-pointer block">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors">
              {mdLoading
                ? <Loader2 className="w-5 h-5 text-cyan-400 shrink-0 animate-spin"/>
                : <Upload className="w-5 h-5 text-cyan-400 shrink-0"/>}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-cyan-200 font-medium truncate">
                  {mdMap.size
                    ? `✓ ${mdMap.size} nota(s) cargada(s) — ${mdFileName}`
                    : 'Notas (opcional): subí el .zip de Notion o varios .md'}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  El cuerpo de cada página se mergea al campo "Notas" del caso por título
                </p>
              </div>
              {mdMap.size > 0 && (
                <button type="button"
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setMdMap(new Map()); setMdFileName(''); }}
                  className="text-[10px] text-gray-500 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 shrink-0">
                  limpiar
                </button>
              )}
            </div>
            <input type="file" accept=".md,.zip" multiple className="hidden"
              onChange={e => handleMdFiles(e.target.files)}/>
          </label>

          {file && !file.name.toLowerCase().includes('_all') && file.name.toLowerCase().endsWith('.csv') && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3">
              <p className="text-xs text-red-300 font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5"/> Cuidado: este archivo NO incluye "_all" en el nombre
              </p>
              <p className="text-[11px] text-red-200/70 mt-1">
                Probablemente sea el CSV chico de Notion que sólo trae el título. Buscá en tu carpeta de descargas el archivo con <span className="font-mono">_all.csv</span> al final.
              </p>
            </div>
          )}

          {/* Preview */}
          {preview && !importing && !results.length && (
            <div className="space-y-3">
              {/* Field mapping table — shows exactly which CSV col maps to which field + raw sample value */}
              {fieldMapping.length > 0 && (
                <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] p-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Eye className="w-3 h-3"/>Mapeo de columnas CSV → base de datos
                  </p>
                  <div className="space-y-0.5 text-[11px]">
                    {fieldMapping.map(fm => (
                      <div key={fm.field} className={`flex items-center gap-2 px-2 py-1 rounded-lg ${fm.csvCol ? 'bg-emerald-500/5 border border-emerald-500/15' : 'bg-white/[0.02] border border-white/5'}`}>
                        <span className={`font-semibold shrink-0 w-20 ${fm.csvCol ? 'text-emerald-400' : 'text-gray-600'}`}>{fm.field}:</span>
                        {fm.csvCol
                          ? <><span className="text-white font-mono text-[10px]">{fm.csvCol}</span>
                              {fm.rawSample && <span className="text-gray-500 text-[10px] truncate max-w-[160px]" title={fm.rawSample}>= "{fm.rawSample}"</span>}
                            </>
                          : <span className="text-red-400/70 italic">⚠ no detectada</span>}
                      </div>
                    ))}
                  </div>
                  {fieldMapping.some(fm => !fm.csvCol) && (
                    <p className="text-[10px] text-amber-400/70 mt-2">
                      Los campos marcados ⚠ no se encontraron en el CSV. Verificá los nombres de columna.
                    </p>
                  )}
                </div>
              )}
              {/* All CSV headers */}
              <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] p-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Eye className="w-3 h-3"/>Columnas en el CSV ({detectedHeaders.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {detectedHeaders.map(h => {
                    const nk = normalizeKey(h);
                    const known = ALL_EXPECTED.some(k => normalizeKey(k) === nk);
                    return (
                      <span key={h} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${known ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-white/5 text-gray-500 border border-white/10'}`}>
                        {h}{known ? ' ✓' : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">
                  Vista previa — {previewTotal} filas para importar
                </p>
                <div className="rounded-xl border border-white/[0.06] overflow-x-auto text-xs">
                  <table className="w-full min-w-max">
                    <thead className="bg-white/[0.04]">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] text-gray-500 font-semibold uppercase">Nombre</th>
                        <th className="px-3 py-2 text-left text-[10px] text-gray-500 font-semibold uppercase">Estado (CSV raw)</th>
                        <th className="px-3 py-2 text-left text-[10px] text-gray-500 font-semibold uppercase">→ Importado como</th>
                        <th className="px-3 py-2 text-left text-[10px] text-gray-500 font-semibold uppercase">Abogado</th>
                        <th className="px-3 py-2 text-left text-[10px] text-gray-500 font-semibold uppercase">Expediente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((p, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="px-3 py-2 text-white font-medium max-w-[200px] truncate">
                            {p.titulo || <span className="text-red-400">¡vacío!</span>}
                          </td>
                          <td className="px-3 py-2 text-amber-300/80 font-mono text-[10px] max-w-[140px] truncate" title={p.estadoRaw}>
                            {p.estadoRaw || <span className="text-gray-600 italic">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`badge border ${eColor(p.estadoNorm)}`}>{eLabel(p.estadoNorm)}</span>
                          </td>
                          <td className="px-3 py-2 text-gray-300 max-w-[120px] truncate">{p.abogado || '—'}</td>
                          <td className="px-3 py-2 text-gray-400 font-mono">{p.expediente || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewTotal > 8 && (
                  <p className="text-[10px] text-gray-600 mt-1.5 text-center">… y {previewTotal - 8} más</p>
                )}
              </div>
              <button onClick={handleImport} className="btn-primary text-sm w-full">
                {borrarPrimero
                  ? `Borrar ${totalExistentes} registros e importar ${previewTotal}`
                  : `Importar ${previewTotal} casos`}
              </button>
            </div>
          )}

          {importing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-violet-300 text-sm">
                <Loader2 className="w-4 h-4 animate-spin"/>Procesando {progress.done}/{progress.total}…
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all"
                  style={{ width: `${progress.total ? (progress.done/progress.total)*100 : 0}%` }}/>
              </div>
            </div>
          )}

          {results.length > 0 && !importing && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1 text-emerald-300">
                  <CheckCircle2 className="w-4 h-4"/>{results.filter(r => r.ok).length} importados
                </span>
                {results.some(r => !r.ok) && (
                  <span className="flex items-center gap-1 text-red-300">
                    <AlertCircle className="w-4 h-4"/>{results.filter(r => !r.ok).length} errores
                  </span>
                )}
              </div>
              {results.find(r => !r.ok)?.error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
                  {results.find(r => !r.ok)?.error}
                </div>
              )}
              <button onClick={onClose} className="btn-secondary text-sm w-full">Cerrar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tabla (FichasList style) ─────────────────────────────────────────────────
function CasosTabla({ casos, onSelect, onDelete, deletingId }: {
  casos: CasoGeneral[];
  onSelect: (c: CasoGeneral) => void;
  onDelete: (id: string) => void;
  deletingId: string | null;
}) {
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('titulo');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  };

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a?: string|null, b?: string|null) => (a||'').localeCompare(b||'');
    return [...casos].sort((a, b) => {
      switch (sortKey) {
        case 'titulo':     return cmp(a.titulo, b.titulo) * dir;
        case 'estado':     return cmp(a.estado, b.estado) * dir;
        case 'abogado':    return cmp(a.abogado, b.abogado) * dir;
        case 'tipo_caso':  return cmp(a.tipo_caso, b.tipo_caso) * dir;
        case 'audiencias': return cmp(a.audiencias, b.audiencias) * dir;
        case 'vencimiento':return cmp(a.vencimiento, b.vencimiento) * dir;
      }
      return 0;
    });
  }, [casos, sortKey, sortDir]);

  function askDel(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (confirmDel === id) { onDelete(id); setConfirmDel(null); }
    else { setConfirmDel(id); setTimeout(() => setConfirmDel(p => p === id ? null : p), 3000); }
  }

  return (
    <div className="glass-card">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <SortHeader k="titulo"     label="Caso / Expediente" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}/>
            <SortHeader k="estado"     label="Estado"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}/>
            <SortHeader k="abogado"    label="Abogado"     sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}/>
            <SortHeader k="tipo_caso"  label="Tipo"        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="hidden lg:table-cell"/>
            <th className="sticky top-14 sm:top-16 z-20 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10 text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden xl:table-cell">
              Tribunal
            </th>
            <SortHeader k="audiencias" label="Fechas"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="hidden md:table-cell"/>
            <th className="sticky top-14 sm:top-16 z-20 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10 w-16"/>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={7} className="text-center py-12 text-gray-500">Sin resultados</td></tr>
          )}
          {sorted.map((c, i) => {
            const aud = daysUntil(c.audiencias);
            const venc = daysUntil(c.vencimiento);
            return (
              <tr key={c.id} onClick={() => onSelect(c)}
                className="table-row animate-slide-up align-top"
                style={{ animationDelay: `${Math.min(i, 40) * 20}ms` }}>

                {/* Caso / Expediente */}
                <td className="px-4 py-3 max-w-[320px]">
                  <div className="flex items-start gap-1.5">
                    {c.prioridad && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0 mt-0.5"/>}
                    <div className="min-w-0">
                      <p className="font-medium text-white leading-snug truncate" title={c.titulo}>{c.titulo}</p>
                      {c.expediente && (
                        <p className="text-xs text-gray-500 font-mono mt-0.5 truncate" title={c.expediente}>{c.expediente}</p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Estado badge — identical to Pipeline badge in FichasList */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`badge border ${eColor(c.estado)}`}>
                      {eLabel(c.estado)}
                    </span>
                    {c.estadisticas_estado === 'atrasado' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-300 font-medium">
                        ⚠ Atrasado
                      </span>
                    )}
                  </div>
                </td>

                {/* Abogado */}
                <td className="px-4 py-3 max-w-[180px]">
                  {c.abogado
                    ? <p className="text-sm text-gray-300 truncate" title={c.abogado}>{c.abogado}</p>
                    : <span className="text-gray-600 text-xs">—</span>}
                  {c.personeria && <p className="text-[10px] text-gray-600 mt-0.5 truncate" title={c.personeria}>{c.personeria}</p>}
                </td>

                {/* Tipo */}
                <td className="px-4 py-3 hidden lg:table-cell max-w-[140px]">
                  <span className="text-xs text-gray-400 capitalize line-clamp-1" title={c.tipo_caso ?? ''}>{c.tipo_caso || '—'}</span>
                </td>

                {/* Tribunal */}
                <td className="px-4 py-3 hidden xl:table-cell max-w-[180px]">
                  <p className="text-xs text-gray-500 truncate" title={c.radicado ?? ''}>{c.radicado || '—'}</p>
                </td>

                {/* Fechas */}
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="space-y-1">
                    {c.audiencias && (
                      <p className={`text-xs flex items-center gap-1 font-medium ${isOverdue(c.audiencias) ? 'text-red-400' : aud !== null && aud <= 7 ? 'text-orange-400' : 'text-blue-400'}`}>
                        <Calendar className="w-3 h-3 shrink-0"/>{formatDate(c.audiencias)}
                        {aud !== null && aud >= 0 && aud <= 30 ? <span className="text-gray-600">({aud}d)</span> : null}
                      </p>
                    )}
                    {c.vencimiento && (
                      <p className={`text-xs flex items-center gap-1 font-medium ${isOverdue(c.vencimiento) ? 'text-red-400' : venc !== null && venc <= 15 ? 'text-amber-400' : 'text-gray-500'}`}>
                        <Clock className="w-3 h-3 shrink-0"/>{formatDate(c.vencimiento)}
                        {venc !== null && venc >= 0 && venc <= 30 ? <span className="text-gray-600">({venc}d)</span> : null}
                      </p>
                    )}
                    {!c.audiencias && !c.vencimiento && <span className="text-xs text-gray-600">—</span>}
                  </div>
                </td>

                {/* Acciones */}
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1 justify-end">
                    {c.url_drive && (
                      <a href={c.url_drive} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-gray-600 hover:text-blue-400 hover:bg-blue-400/10 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5"/>
                      </a>
                    )}
                    <button onClick={e => askDel(e, c.id)} disabled={deletingId === c.id}
                      title={confirmDel === c.id ? 'Click otra vez para eliminar' : 'Eliminar'}
                      className={`p-1.5 rounded-lg transition-colors ${confirmDel === c.id ? 'bg-red-500/20 text-red-400' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'}`}>
                      {deletingId === c.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                        : <Trash2 className="w-3.5 h-3.5"/>}
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-600"/>
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

// ─── Kanban (exact same structure as PrevisionalKanban) ───────────────────────
function DraggableKanbanCard({ caso, onSelect, onDelete, confirmDel, askDel }: {
  caso: CasoGeneral;
  onSelect: (c: CasoGeneral) => void;
  onDelete: (id: string) => void;
  confirmDel: string | null;
  askDel: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: caso.id });
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.25 : 1, touchAction: 'none' as const };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="relative group p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/10 transition-all cursor-grab active:cursor-grabbing select-none">
      {/* Delete — only this button stops pointer propagation to prevent drag conflict */}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); askDel(caso.id); }}
        title={confirmDel === caso.id ? 'Click otra vez para eliminar' : 'Eliminar'}
        className={`absolute top-1.5 right-1.5 p-1 rounded-md transition-colors ${confirmDel === caso.id ? 'bg-red-500/20 text-red-400 opacity-100' : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 hover:bg-red-500/10'}`}>
        <Trash2 className="w-3 h-3"/>
      </button>
      {/* Main click — uses onClick, NOT onPointerDown, so drag can still be initiated */}
      <button className="w-full text-left" onClick={e => { e.stopPropagation(); onSelect(caso); }}>
        <div className="flex items-start gap-1.5 pr-5">
          {caso.prioridad && <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0 mt-0.5"/>}
          <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${eDot(caso.estado)}`}/>
          <p className="text-[11px] font-medium text-white leading-tight">{caso.titulo}</p>
        </div>
        {caso.abogado && <p className="text-[10px] text-gray-500 mt-1 truncate pl-6">{caso.abogado}</p>}
        {caso.tipo_caso && <p className="text-[10px] text-gray-600 mt-0.5 truncate pl-6 capitalize">{caso.tipo_caso}</p>}
        {(caso.audiencias || caso.vencimiento) && (
          <div className="flex flex-col gap-0.5 mt-1.5 pl-6">
            {caso.audiencias && (
              <span className={`text-[10px] flex items-center gap-1 ${isOverdue(caso.audiencias) ? 'text-red-400' : 'text-blue-400'}`}>
                <Calendar className="w-2.5 h-2.5 shrink-0"/>{formatDate(caso.audiencias)}
              </span>
            )}
            {caso.vencimiento && (
              <span className={`text-[10px] flex items-center gap-1 ${isOverdue(caso.vencimiento) ? 'text-red-400' : 'text-amber-400'}`}>
                <Clock className="w-2.5 h-2.5 shrink-0"/>{formatDate(caso.vencimiento)}
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}

function KanbanCol({ estadoKey, label, count, isOver, children }: {
  estadoKey: string; label: string; count: number; isOver: boolean; children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: estadoKey });
  return (
    <div ref={setNodeRef}
      className={`glass-card p-0 overflow-hidden border-t-2 ${KANBAN_BORDER[estadoKey] ?? 'border-t-gray-500'} transition-all ${isOver ? 'ring-2 ring-white/20 scale-[1.01]' : ''}`}>
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${eDot(estadoKey)}`}/>
          <h3 className="text-xs font-semibold text-white truncate">{label}</h3>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ml-1 ${KANBAN_BADGE[estadoKey] ?? 'bg-gray-500/10 text-gray-400'}`}>
          {count}
        </span>
      </div>
      <div className="p-2 space-y-2 min-h-[80px] max-h-[65vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function CasosKanban({ casos, onSelect, onDelete, saveCaso }: {
  casos: CasoGeneral[];
  onSelect: (c: CasoGeneral) => void;
  onDelete: (id: string) => void;
  saveCaso: (data: Partial<CasoGeneral>, id?: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [items, setItems] = useState<CasoGeneral[]>(casos);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const { showToast } = useToast();
  // pendingOverrides: id → estado that we just set optimistically.
  // While the entry exists, fetched data for that id is overridden so realtime
  // updates (which may briefly return stale data right after a save) cannot
  // bounce the card back. Cleared once the fetched data confirms the new estado.
  const pendingRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    setItems(prev => {
      const next = casos.map(c => {
        const pending = pendingRef.current.get(c.id);
        if (pending !== undefined) {
          if (c.estado === pending) {
            // server confirmed our optimistic value — we can stop overriding
            pendingRef.current.delete(c.id);
            return c;
          }
          // server returned stale data; keep showing the optimistic estado
          return { ...c, estado: pending };
        }
        return c;
      });
      return next;
    });
  }, [casos]);

  const askDel = (id: string) => {
    if (confirmDel === id) { onDelete(id); setConfirmDel(null); }
    else { setConfirmDel(id); setTimeout(() => setConfirmDel(p => p === id ? null : p), 3000); }
  };

  // distance:8 = same as PrevisionalKanban, ensures accidental clicks don't trigger drag
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const activeItem = items.find(c => c.id === activeId) ?? null;

  const grouped = ESTADOS_ORDERED.reduce<Record<string, CasoGeneral[]>>((acc, e) => {
    acc[e] = items.filter(c => (c.estado ?? '').toLowerCase() === e);
    return acc;
  }, {} as Record<string, CasoGeneral[]>);
  // Casos con estado null/desconocido → activos
  items.filter(c => !ESTADOS_ORDERED.includes((c.estado ?? '') as EstadoCaso))
    .forEach(c => grouped['activos'].push(c));

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null); setOverCol(null);
    if (!over) return;
    // over.id may be a column key or another card's id
    let newEstado: string | null = null;
    if (ESTADOS_ORDERED.includes(over.id as EstadoCaso)) {
      newEstado = over.id as string;
    } else {
      const overCard = items.find(c => c.id === over.id);
      if (overCard) newEstado = overCard.estado;
    }
    if (!newEstado) return;
    const card = items.find(c => c.id === active.id);
    if (!card || card.estado === newEstado) return;

    // Optimistic update + register the override so subsequent fetches don't bounce it back.
    pendingRef.current.set(active.id as string, newEstado);
    setItems(prev => prev.map(c => c.id === active.id ? { ...c, estado: newEstado! } : c));
    const r = await saveCaso({ estado: newEstado }, active.id as string);
    if (!r.ok) {
      // rollback: clear override and restore original estado
      pendingRef.current.delete(active.id as string);
      setItems(prev => prev.map(c => c.id === active.id ? { ...c, estado: card.estado } : c));
      showToast('No se pudo mover: ' + (r.error ?? ''), 'error');
    } else {
      showToast(`Movido a ${eLabel(newEstado)}`, 'success');
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={e => setActiveId(e.active.id as string)}
      onDragOver={e => setOverCol(e.over?.id as string ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setActiveId(null); setOverCol(null); }}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {ESTADOS_ORDERED.map(estado => (
          <KanbanCol key={estado} estadoKey={estado} label={eLabel(estado)}
            count={grouped[estado]?.length ?? 0} isOver={overCol === estado}>
            {!grouped[estado]?.length
              ? <p className="text-[10px] text-gray-600 text-center py-6">Sin casos</p>
              : grouped[estado].map(c => (
                  <DraggableKanbanCard key={c.id} caso={c} onSelect={onSelect}
                    onDelete={onDelete} confirmDel={confirmDel} askDel={askDel}/>
                ))
            }
          </KanbanCol>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem && (
          <div className="p-3 rounded-xl shadow-2xl w-48 select-none"
            style={{ background: '#1a1a2e', border: '1px solid rgba(139,92,246,0.4)' }}>
            <p className="text-xs font-medium text-white leading-tight">{activeItem.titulo}</p>
            <p className="text-[10px] text-violet-400/70 mt-1">{eLabel(activeItem.estado)}</p>
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
  const [view, setView] = useState<'tabla'|'kanban'>('tabla');
  const [search, setSearch] = useState('');
  const [filtroEstados, setFiltroEstados] = useState<Set<string>>(new Set());
  const [detailCaso, setDetailCaso] = useState<CasoGeneral | null | 'new'>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const activos = casos.filter(c => !c.archivado);

  const filtered = useMemo(() => activos.filter(c => {
    if (filtroEstados.size > 0 && !filtroEstados.has((c.estado ?? '').toLowerCase())) return false;
    if (search) {
      const q = search.toLowerCase();
      return [c.titulo, c.expediente, c.radicado, c.abogado, c.tipo_caso]
        .some(v => v?.toLowerCase().includes(q));
    }
    return true;
  }), [activos, search, filtroEstados]);

  function toggleEstado(e: string) {
    setFiltroEstados(prev => {
      const next = new Set(prev);
      next.has(e) ? next.delete(e) : next.add(e);
      return next;
    });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const ok = await deleteCaso(id);
    setDeletingId(null);
    showToast(ok ? 'Caso eliminado' : 'No se pudo eliminar', ok ? 'success' : 'error');
  }

  async function handleDeleteAll() {
    const n = filtered.length; if (!n) return;
    if (!window.confirm(`¿Eliminás los ${n} casos del listado?`)) return;
    if (window.prompt(`Escribí: BORRAR ${n}`) !== `BORRAR ${n}`) { showToast('Cancelado', 'info'); return; }
    setBulkLoading(true);
    const r = await deleteMany(filtered.map(c => c.id));
    setBulkLoading(false); refetch();
    showToast(`${r.ok} eliminado(s)${r.fail ? `, ${r.fail} errores` : ''}`, r.fail ? 'error' : 'success');
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="w-8 h-8 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-violet-400"/>Casos Generales
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} caso{filtered.length !== 1 ? 's' : ''}{filtroEstados.size > 0 ? ' filtrados' : ''} · {activos.length} total activos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={refetch} className="btn-secondary p-2.5" title="Actualizar">
            <RefreshCw className="w-4 h-4"/>
          </button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4"/>Importar
          </button>
          <button onClick={handleDeleteAll} disabled={!filtered.length || bulkLoading}
            className="btn-danger flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4"/>}
            <span className="hidden sm:inline">Eliminar visibles</span>
          </button>
          <button onClick={() => setDetailCaso('new')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4"/>Nuevo caso
          </button>
        </div>
      </div>

      {/* Search + view toggle */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
          <input type="text" placeholder="Buscar por nombre, expediente, abogado, tribunal…"
            value={search} onChange={e => setSearch(e.target.value)} className="input-dark pl-10 text-sm"/>
        </div>
        <div className="flex bg-white/5 rounded-xl p-0.5 border border-white/10">
          <button onClick={() => setView('tabla')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${view === 'tabla' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>
            <Table2 className="w-3.5 h-3.5"/>Tabla
          </button>
          <button onClick={() => setView('kanban')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${view === 'kanban' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}>
            <Columns3 className="w-3.5 h-3.5"/>Pipeline
          </button>
        </div>
      </div>

      {/* Estado filter pills (multi-select, same as FichasList pipeline pills) */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button onClick={() => setFiltroEstados(new Set())}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${filtroEstados.size === 0 ? 'bg-white/10 text-white border-white/20' : 'bg-white/5 text-gray-500 border-white/5 hover:text-white'}`}>
          Todos ({activos.length})
        </button>
        {ESTADOS_ORDERED.map(e => {
          const count = activos.filter(c => (c.estado ?? '') === e).length;
          if (!count) return null;
          const active = filtroEstados.has(e);
          return (
            <button key={e} onClick={() => toggleEstado(e)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${active ? `${eColor(e)}` : 'bg-white/5 text-gray-500 border-white/5 hover:text-white'}`}>
              {eLabel(e)} ({count})
            </button>
          );
        })}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-600">
          <Scale className="w-12 h-12 mb-3 opacity-10"/>
          <p className="text-base font-semibold text-gray-500">Sin casos</p>
          <p className="text-sm mt-1">Importá desde Notion o creá el primero</p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setImportOpen(true)} className="btn-secondary text-sm flex items-center gap-2">
              <Upload className="w-4 h-4"/>Importar
            </button>
            <button onClick={() => setDetailCaso('new')} className="btn-primary text-sm flex items-center gap-2">
              <Plus className="w-4 h-4"/>Nuevo caso
            </button>
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
          onSaved={refetch}/>
      )}
      {importOpen && (
        <NotionImportModal onClose={() => setImportOpen(false)} onImported={refetch} totalExistentes={casos.length}/>
      )}
    </div>
  );
}
