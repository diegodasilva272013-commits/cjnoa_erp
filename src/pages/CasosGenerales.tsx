import { useState, useMemo, useEffect } from 'react';
import {
  Search, Plus, Upload, Trash2, Archive, Filter,
  AlertCircle, CheckCircle2, Loader2, X, Scale, Calendar, Gavel,
  Clock, Star, RefreshCw, Columns3, LayoutGrid, ExternalLink,
} from 'lucide-react';
import {
  DndContext, DragEndEvent, DragOverlay, PointerSensor,
  useSensor, useSensors, rectIntersection, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useCasosGenerales, CasoGeneral, TIPOS_CASO, ABOGADOS } from '../hooks/useCasosGenerales';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';

// ─── helpers ──────────────────────────────────────────────────────────────────
const ESTADO_META: Record<string, { label: string; color: string; dot: string; bg: string; border: string }> = {
  activos:                              { label: 'Activo',          color: 'text-emerald-300', dot: 'bg-emerald-400', bg: 'bg-emerald-400/10', border: 'border-l-emerald-500' },
  federales:                            { label: 'Federal',         color: 'text-blue-300',    dot: 'bg-blue-400',    bg: 'bg-blue-400/10',   border: 'border-l-blue-500' },
  'esperando sentencias':               { label: 'En espera',       color: 'text-amber-300',   dot: 'bg-amber-400',   bg: 'bg-amber-400/10',  border: 'border-l-amber-500' },
  'complicacion judicial/analisis':     { label: 'En análisis',     color: 'text-orange-300',  dot: 'bg-orange-400',  bg: 'bg-orange-400/10', border: 'border-l-orange-500' },
  'suspendido por falta de directivas': { label: 'Sin directivas',  color: 'text-gray-400',    dot: 'bg-gray-500',    bg: 'bg-gray-500/10',   border: 'border-l-gray-500' },
  'suspendido por falta de pago':       { label: 'Sin pago',        color: 'text-red-300',     dot: 'bg-red-400',     bg: 'bg-red-400/10',    border: 'border-l-red-500' },
};
const FALLBACK_META = { label: '—', color: 'text-gray-400', dot: 'bg-gray-600', bg: 'bg-white/5', border: 'border-l-white/10' };
const getEstado = (e: string | null) => ESTADO_META[(e ?? '').toLowerCase()] ?? FALLBACK_META;

const ABOGADO_COLORS: Record<string, string> = {
  'DR. RODRIGO':    'from-violet-600 to-violet-800',
  'DRA. NOELIA':    'from-pink-600 to-pink-800',
  'DR. ALEJANDRO':  'from-blue-600 to-blue-800',
  'DRA. MARIANELA': 'from-teal-600 to-teal-800',
  'DR. FABRICIO':   'from-amber-600 to-amber-800',
};
const getAbogadoColor = (a: string | null) =>
  ABOGADO_COLORS[Object.keys(ABOGADO_COLORS).find(k => a?.toUpperCase().includes(k.replace('DR. ','').replace('DRA. ',''))) ?? ''] ?? 'from-gray-600 to-gray-800';

const abogadoInitials = (s: string | null) => {
  if (!s) return '?';
  const m = s.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/g);
  return m ? m.slice(-1)[0].slice(0, 2).toUpperCase() : s.slice(0, 2).toUpperCase();
};

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
  // Split into lines respecting quoted newlines
  const lines: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++; } // escaped ""
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
  enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
  julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12',
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
  if (!s) return '';
  for (const t of [...TIPOS_CASO]) { if (s.includes(t.toLowerCase())) return t; }
  if (s.includes('sucesorio') || s.includes('suces')) return 'sucesorio';
  if (s.includes('laboral') || s.includes('despido')) return 'laboral';
  if (s.includes('ejecutivo')) return 'ejecutivo';
  if (s.includes('familia') || s.includes('alimento')) return 'familia';
  if (s.includes('previsional')) return 'previsional';
  return s.slice(0, 40);
}

// ─── CaseCard ─────────────────────────────────────────────────────────────────
function CaseCard({ caso, onClick, onDelete, deleting }: {
  caso: CasoGeneral; onClick: () => void; onDelete: (id: string) => void; deleting: boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const meta = getEstado(caso.estado);
  return (
    <div onClick={onClick}
      className={`group relative flex flex-col gap-2.5 p-4 rounded-2xl cursor-pointer
        bg-white/[0.025] hover:bg-white/[0.05] border border-white/[0.06] hover:border-white/[0.14]
        border-l-2 ${meta.border} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {caso.prioridad && <Star className="inline w-3.5 h-3.5 fill-amber-400 text-amber-400 mr-1.5 -mt-0.5"/>}
          <span className="text-[13px] font-semibold text-white/90 leading-snug">{caso.titulo}</span>
        </div>
        <button onClick={e => { e.stopPropagation(); if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return; } onDelete(caso.id); }}
          disabled={deleting}
          className={`shrink-0 p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 ${confirmDel ? 'bg-red-500/30 text-red-300' : 'text-gray-600 hover:text-red-400 hover:bg-red-400/10'}`}>
          {deleting ? <Loader2 className="w-3 h-3 animate-spin"/> : <Trash2 className="w-3 h-3"/>}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${meta.bg} ${meta.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}/>{meta.label}
        </span>
        {caso.tipo_caso && <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-gray-400 capitalize">{caso.tipo_caso}</span>}
        {caso.personeria && <span className="px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-300">{caso.personeria}</span>}
        {caso.estadisticas_estado === 'atrasado' && <span className="px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-[10px] text-red-400 font-semibold">Atrasado</span>}
      </div>
      {(caso.expediente || caso.radicado) && (
        <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
          {caso.expediente && <span className="flex items-center gap-1 font-mono"><Scale className="w-3 h-3"/>{caso.expediente}</span>}
          {caso.radicado && <span className="flex items-center gap-1 truncate max-w-[200px]" title={caso.radicado}><Gavel className="w-3 h-3 shrink-0"/><span className="truncate">{caso.radicado}</span></span>}
        </div>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
        <div className="flex items-center gap-1.5">
          {caso.abogado && (
            <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${getAbogadoColor(caso.abogado)} flex items-center justify-center text-[8px] font-bold text-white`}>
              {abogadoInitials(caso.abogado)}
            </div>
          )}
          <span className="text-[10px] text-gray-500">{caso.abogado || '—'}</span>
        </div>
        <div className="flex gap-2">
          {caso.audiencias && <span className={`flex items-center gap-0.5 text-[10px] ${isOverdue(caso.audiencias) ? 'text-red-400' : 'text-blue-400'}`}><Calendar className="w-3 h-3"/>{formatDate(caso.audiencias)}</span>}
          {caso.vencimiento && <span className={`flex items-center gap-0.5 text-[10px] ${isOverdue(caso.vencimiento) ? 'text-red-400' : 'text-amber-400'}`}><Clock className="w-3 h-3"/>{formatDate(caso.vencimiento)}</span>}
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="w-full max-w-2xl max-h-[95vh] overflow-y-auto bg-[#0d0d10] border border-white/10 rounded-3xl shadow-2xl shadow-black/60">
        {/* Header */}
        <div className={`flex items-start justify-between px-6 pt-6 pb-4 border-b border-white/[0.06] border-l-4 ${meta.border} rounded-tl-3xl`}>
          <div className="flex-1 pr-4 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1.5">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}/>{meta.label}
              </span>
              {editing.prioridad && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-300 text-[10px] font-semibold"><Star className="w-3 h-3 fill-amber-400"/>Alta prioridad</span>}
              {editing.estadisticas_estado === 'atrasado' && <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 text-[10px] font-semibold">Atrasado</span>}
            </div>
            <h2 className="text-base font-bold text-white leading-tight">{isNew ? (editing.titulo || 'Nuevo caso') : editing.titulo}</h2>
            {editing.expediente && <p className="text-xs text-gray-500 font-mono mt-1">{editing.expediente}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isNew && (
              <button onClick={() => setEditMode(m => !m)}
                className={`px-3 py-1.5 rounded-xl text-xs transition-colors ${editMode ? 'bg-violet-500/20 text-violet-300' : 'bg-white/5 text-gray-400 hover:text-white'}`}>
                {editMode ? 'Ver' : 'Editar'}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
              <X className="w-4 h-4"/>
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {editMode ? (
            <>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-widest">Título *</label>
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
                ] as [string,keyof CasoGeneral,string,string[]][]).map(([label,key,type,opts]) => (
                  <div key={key as string} className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</label>
                    {type === 'select' ? (
                      <select className={sel} value={(editing as Record<string,unknown>)[key as string] as string ?? ''} onChange={e => set(key, e.target.value || null)}>
                        <option value="">—</option>
                        {opts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={type} className={inp} value={(editing as Record<string,unknown>)[key as string] as string ?? ''} onChange={e => set(key, e.target.value || null)}/>
                    )}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-widest">Radicado / Tribunal</label>
                <input className={inp} value={editing.radicado ?? ''} onChange={e => set('radicado', e.target.value || null)}/>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-widest">URL Drive</label>
                <input className={inp} value={editing.url_drive ?? ''} onChange={e => set('url_drive', e.target.value || null)} placeholder="https://drive.google.com/..."/>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-widest">Notas / Actualización</label>
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
            // View mode
            <div className="space-y-5">
              {editing.abogado && (
                <div className="flex items-center gap-3">
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
                ] as { label:string; val:string|null|undefined; mono?:boolean }[]).map(item => item.val ? (
                  <div key={item.label} className="bg-white/[0.025] rounded-2xl p-3 border border-white/[0.05]">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{item.label}</p>
                    <p className={`text-sm text-white font-medium capitalize ${item.mono ? 'font-mono' : ''}`}>{item.val}</p>
                  </div>
                ) : null)}
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
              {!editing.expediente && !editing.radicado && !editing.abogado && !editing.tipo_caso && !editing.actualizacion && !editing.url_drive && (
                <div className="text-center py-6 text-gray-600 text-sm">
                  <p>Sin datos adicionales.</p>
                  <button onClick={() => setEditMode(true)} className="mt-2 text-violet-400 hover:text-violet-300 text-xs underline">Completar ficha</button>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
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

function NotionImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [skipArchived, setSkipArchived] = useState(true);

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

      const { data: ud } = await supabase.auth.getUser();
      const userId = ud?.user?.id ?? null;

      const batch = rows.map(r => ({
        titulo: (r['NOMBRE'] || r['titulo'] || r['Title'] || '').trim(),
        expediente: (r['Expediente'] || r['expediente'] || '').trim() || null,
        estado: normEstado(r['Estado'] || r['estado'] || ''),
        tipo_caso: normTipo(r['tipo de caso'] || r['tipo_caso'] || r['Tipo'] || '') || null,
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
      const firstErr = localResults.find(r => !r.ok)?.error;
      if (firstErr?.includes('does not exist')) {
        showToast('Tabla no existe — corrí migration_casos_generales.sql en Supabase primero', 'error');
      } else {
        showToast(`${ok} importado(s)${fail ? `, ${fail} con error` : ''}`, fail ? 'error' : 'success');
      }
      onImported();
    } catch (e: unknown) {
      showToast(`Error: ${(e as Error)?.message ?? e}`, 'error');
    } finally { setImporting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl max-h-[88vh] overflow-y-auto bg-[#0d0d10] border border-white/10 rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><Upload className="w-4 h-4 text-violet-400"/>Importar desde Notion / Excel</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-200/80">
            <p className="font-semibold text-blue-200 mb-1">Columnas reconocidas del CSV de Notion:</p>
            <p className="font-mono text-violet-300">NOMBRE, Estado, SISTEMA, PERSONERIA, Expediente, Radicado, tipo de caso, Audiencias, vencimiento, Prioridad, Archivar, URL del DRIVE, Estadisticas (NO TOCAR)</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div onClick={() => setSkipArchived(!skipArchived)} className={`w-9 h-5 rounded-full relative transition-colors ${skipArchived ? 'bg-violet-500' : 'bg-white/10'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${skipArchived ? 'translate-x-4' : ''}`}/>
            </div>
            <span className="text-sm text-gray-300">Omitir archivados (Archivar = Yes)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 text-sm transition-colors">
              <Upload className="w-4 h-4"/>
              {file ? file.name : 'Elegir archivo CSV / XLSX'}
            </div>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { setFile(e.target.files?.[0] || null); setResults([]); }}/>
          </label>
          {file && !importing && !results.length && (
            <button onClick={handleImport} className="btn-primary text-sm">Importar{skipArchived ? ' (solo activos)' : ' todos'}</button>
          )}
          {importing && (
            <div className="flex items-center gap-2 text-violet-300 text-sm"><Loader2 className="w-4 h-4 animate-spin"/>Procesando {progress.done}/{progress.total}…</div>
          )}
          {results.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="w-4 h-4"/>{results.filter(r => r.ok).length} ok</span>
                {results.some(r => !r.ok) && <span className="flex items-center gap-1 text-red-300"><AlertCircle className="w-4 h-4"/>{results.filter(r => !r.ok).length} errores</span>}
              </div>
              {results.find(r => !r.ok)?.error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">{results.find(r => !r.ok)?.error}</div>
              )}
              <div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 text-xs">
                <table className="w-full">
                  <thead className="bg-white/5 sticky top-0"><tr>
                    <th className="px-3 py-1.5 text-left text-gray-500">Título</th>
                    <th className="px-3 py-1.5 text-right text-gray-500">Resultado</th>
                  </tr></thead>
                  <tbody>{results.map((r, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-3 py-1 text-gray-300 truncate max-w-[250px]">{r.titulo}</td>
                      <td className={`px-3 py-1 text-right ${r.ok ? 'text-emerald-300' : 'text-red-300'}`}>{r.ok ? 'OK' : 'Error'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <button onClick={onClose} className="btn-secondary text-sm">Cerrar</button>
            </div>
          )}
        </div>
      </div>
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
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.2 : 1, touchAction: 'none' }}
      {...attributes}
      {...listeners}
      className="relative group rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/10 transition-all cursor-grab active:cursor-grabbing select-none"
    >
      {/* Delete — stopPropagation prevents triggering drag */}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); askDel(caso.id); }}
        className={`absolute z-10 top-1.5 right-1.5 p-1 rounded-md transition-colors
          ${confirmDel === caso.id ? 'bg-red-500/20 text-red-400' : 'opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 hover:bg-red-500/10'}`}
      >
        <Trash2 className="w-3 h-3"/>
      </button>
      {/* Click area — also stops propagation so drag doesn't intercept */}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={() => onSelect(caso)}
        className="w-full text-left p-3"
      >
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

function KCol({ col, count, isOver, children }: {
  col: typeof KANBAN_COLS[0]; count: number; isOver: boolean; children: React.ReactNode;
}) {
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
      <div className="p-2 space-y-2 min-h-[100px] max-h-[68vh] overflow-y-auto">{children}</div>
    </div>
  );
}

function CasosKanban({ casos, onSelect, onDelete, saveCaso }: {
  casos: CasoGeneral[];
  onSelect: (c: CasoGeneral) => void;
  onDelete: (id: string) => void;
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
    acc[col.key] = items.filter(c => (c.estado ?? '').toLowerCase() === col.key);
    return acc;
  }, {});
  // Items with unrecognized estado go to activos
  items.filter(c => !colKeys.includes((c.estado ?? '').toLowerCase())).forEach(c => grouped['activos'].push(c));

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null); setOverCol(null);
    if (!over) return;
    const newEstado = colKeys.includes(over.id as string)
      ? over.id as string
      : items.find(c => c.id === over.id)?.estado ?? null;
    if (!newEstado) return;
    const card = items.find(c => c.id === active.id);
    if (!card || card.estado === newEstado) return;
    // Optimistic
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
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={e => setActiveId(e.active.id as string)}
      onDragOver={e => setOverCol(e.over?.id as string ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveId(null); setOverCol(null); }}
    >
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
          <div className="p-3 rounded-xl shadow-2xl w-48 select-none rotate-2"
            style={{ background: '#1a1a2e', border: '1px solid rgba(139,92,246,0.5)' }}>
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
  const [view, setView] = useState<'tarjetas' | 'kanban'>('tarjetas');
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroAbogado, setFiltroAbogado] = useState('');
  const [mostrarArchivados, setMostrarArchivados] = useState(false);
  const [detailCaso, setDetailCaso] = useState<CasoGeneral | null | 'new'>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const filtered = useMemo(() => casos.filter(c => {
    if (!mostrarArchivados && c.archivado) return false;
    if (filtroEstado && (c.estado ?? '').toLowerCase() !== filtroEstado) return false;
    if (filtroTipo && (c.tipo_caso ?? '').toLowerCase() !== filtroTipo) return false;
    if (filtroAbogado && (c.abogado ?? '').toUpperCase() !== filtroAbogado.toUpperCase()) return false;
    if (search) {
      const q = search.toLowerCase();
      return [c.titulo, c.expediente, c.radicado, c.abogado, c.tipo_caso].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  }), [casos, search, filtroEstado, filtroTipo, filtroAbogado, mostrarArchivados]);

  const stats = useMemo(() => {
    const a = casos.filter(c => !c.archivado);
    return {
      total: a.length,
      activos: a.filter(c => c.estado === 'activos').length,
      federales: a.filter(c => c.estado === 'federales').length,
      atrasados: a.filter(c => c.estadisticas_estado === 'atrasado').length,
      prioridad: a.filter(c => c.prioridad).length,
      vence15: a.filter(c => {
        if (!c.vencimiento) return false;
        const d = (new Date(c.vencimiento).getTime() - Date.now()) / 86400000;
        return d >= 0 && d <= 15;
      }).length,
    };
  }, [casos]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    const ok = await deleteCaso(id);
    setDeletingId(null);
    if (ok) showToast('Caso eliminado', 'success');
    else showToast('No se pudo eliminar', 'error');
  }
  async function handleDeleteAll() {
    const n = filtered.length;
    if (!n) return;
    if (!window.confirm(`¿Eliminás los ${n} casos del listado actual?`)) return;
    const confirm2 = window.prompt(`Escribí: BORRAR ${n}`);
    if (confirm2 !== `BORRAR ${n}`) { showToast('Cancelado', 'info'); return; }
    setBulkLoading(true);
    const r = await deleteMany(filtered.map(c => c.id));
    setBulkLoading(false);
    refetch();
    showToast(`${r.ok} eliminado(s)${r.fail ? `, ${r.fail} con error` : ''}`, r.fail ? 'error' : 'success');
  }

  const activeFilters = [filtroEstado, filtroTipo, filtroAbogado].filter(Boolean).length;
  const sel = 'bg-[#141418] border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500/50 [&>option]:bg-[#141418] [&>option]:text-white';

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Scale className="w-5 h-5 text-white"/>
            </div>
            Casos Generales
          </h1>
          <p className="text-sm text-gray-500 mt-1 ml-[52px]">{filtered.length} caso{filtered.length !== 1 ? 's' : ''} · {mostrarArchivados ? 'incluye archivados' : 'solo activos'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={refetch} className="btn-secondary p-2.5" title="Actualizar"><RefreshCw className="w-4 h-4"/></button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-2 text-sm"><Upload className="w-4 h-4"/><span className="hidden sm:inline">Importar</span></button>
          <button onClick={handleDeleteAll} disabled={!filtered.length || bulkLoading}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4"/>}
            <span className="hidden sm:inline">Eliminar visibles</span>
          </button>
          <button onClick={() => setDetailCaso('new')} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4"/>Nuevo caso</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total',      val: stats.total,      color: 'text-white' },
          { label: 'Activos',    val: stats.activos,    color: 'text-emerald-300' },
          { label: 'Federales',  val: stats.federales,  color: 'text-blue-300' },
          { label: 'Atrasados',  val: stats.atrasados,  color: 'text-red-300' },
          { label: 'Prioridad',  val: stats.prioridad,  color: 'text-amber-300' },
          { label: 'Vence ≤15d', val: stats.vence15,    color: 'text-orange-300' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-3 text-center border border-white/[0.06]">
            <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"/>
          <input type="text" placeholder="Buscar por título, expediente, tribunal…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50"/>
        </div>
        <button onClick={() => setFilterOpen(!filterOpen)}
          className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl border transition-colors ${filterOpen || activeFilters > 0 ? 'border-violet-500/40 bg-violet-500/10 text-violet-300' : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'}`}>
          <Filter className="w-4 h-4"/>
          Filtros
          {activeFilters > 0 && <span className="rounded-full bg-violet-500 text-white text-[10px] px-1.5">{activeFilters}</span>}
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer select-none" title="Mostrar archivados">
          <div onClick={() => setMostrarArchivados(!mostrarArchivados)} className={`w-8 h-4 rounded-full relative transition-colors ${mostrarArchivados ? 'bg-violet-500' : 'bg-white/10'}`}>
            <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${mostrarArchivados ? 'translate-x-4' : ''}`}/>
          </div>
          <Archive className="w-4 h-4"/>
        </label>
        <div className="flex rounded-xl border border-white/10 overflow-hidden">
          <button onClick={() => setView('tarjetas')} className={`px-3 py-2 transition-colors ${view === 'tarjetas' ? 'bg-violet-500/20 text-violet-300' : 'text-gray-500 hover:text-white'}`} title="Tarjetas"><LayoutGrid className="w-3.5 h-3.5"/></button>
          <button onClick={() => setView('kanban')} className={`px-3 py-2 transition-colors ${view === 'kanban' ? 'bg-violet-500/20 text-violet-300' : 'text-gray-500 hover:text-white'}`} title="Kanban"><Columns3 className="w-3.5 h-3.5"/></button>
        </div>
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="flex flex-wrap gap-3 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          {([
            ['Estado', filtroEstado, setFiltroEstado, Object.keys(ESTADO_META)],
            ['Tipo', filtroTipo, setFiltroTipo, [...TIPOS_CASO]],
            ['Abogado', filtroAbogado, setFiltroAbogado, [...ABOGADOS]],
          ] as [string,string,(v:string)=>void,string[]][]).map(([label, val, setter, opts]) => (
            <div key={label} className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</label>
              <select className={sel} value={val} onChange={e => setter(e.target.value)}>
                <option value="">Todos</option>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          {activeFilters > 0 && (
            <button onClick={() => { setFiltroEstado(''); setFiltroTipo(''); setFiltroAbogado(''); }}
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
          <button onClick={() => setDetailCaso('new')} className="btn-primary mt-5 flex items-center gap-2 text-sm"><Plus className="w-4 h-4"/>Nuevo caso</button>
        </div>
      ) : view === 'kanban' ? (
        <CasosKanban casos={filtered} onSelect={c => setDetailCaso(c)} onDelete={handleDelete} saveCaso={saveCaso}/>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => <CaseCard key={c.id} caso={c} onClick={() => setDetailCaso(c)} onDelete={handleDelete} deleting={deletingId === c.id}/>)}
        </div>
      )}

      {/* Modals */}
      {detailCaso !== null && (
        <CaseDetailModal
          caso={detailCaso === 'new' ? null : detailCaso}
          onClose={() => setDetailCaso(null)}
          onSaved={refetch}
        />
      )}
      {importOpen && <NotionImportModal onClose={() => setImportOpen(false)} onImported={refetch}/>}
    </div>
  );
}
