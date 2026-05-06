import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search, Plus, Upload, Download, Trash2, Archive, Filter,
  ExternalLink, ChevronRight, AlertCircle, CheckCircle2,
  Loader2, X, Scale, Calendar, Gavel, FolderOpen,
  Clock, Star, RefreshCw, Pencil, Eye, Columns3, LayoutGrid,
} from 'lucide-react';
import {
  DndContext, DragEndEvent, DragOverlay, PointerSensor,
  useSensor, useSensors, rectIntersection, useDraggable, useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useCasosGenerales, CasoGeneral, ESTADOS_CASO_GENERAL, TIPOS_CASO, ABOGADOS } from '../hooks/useCasosGenerales';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';

// ─── helpers ──────────────────────────────────────────────────────────────────
const ESTADO_META: Record<string, { label: string; color: string; dot: string; bg: string; border: string }> = {
  activos:                          { label: 'Activo',           color: 'text-emerald-300', dot: 'bg-emerald-400',  bg: 'bg-emerald-400/10', border: 'border-l-emerald-500' },
  federales:                        { label: 'Federal',          color: 'text-blue-300',    dot: 'bg-blue-400',     bg: 'bg-blue-400/10',    border: 'border-l-blue-500' },
  'esperando sentencias':           { label: 'En espera',        color: 'text-amber-300',   dot: 'bg-amber-400',    bg: 'bg-amber-400/10',   border: 'border-l-amber-500' },
  'complicacion judicial/analisis': { label: 'En análisis',      color: 'text-orange-300',  dot: 'bg-orange-400',   bg: 'bg-orange-400/10',  border: 'border-l-orange-500' },
  'suspendido por falta de directivas': { label: 'Sin directivas', color: 'text-gray-400', dot: 'bg-gray-500',   bg: 'bg-gray-500/10',    border: 'border-l-gray-500' },
  'suspendido por falta de pago':   { label: 'Sin pago',         color: 'text-red-300',     dot: 'bg-red-400',      bg: 'bg-red-400/10',     border: 'border-l-red-500' },
};

const getEstado = (e: string | null) =>
  ESTADO_META[e?.toLowerCase() || ''] ?? { label: e || '—', color: 'text-gray-400', dot: 'bg-gray-600', bg: 'bg-white/5', border: 'border-l-white/10' };

const abogadoInitials = (s: string | null) => {
  if (!s) return '?';
  const m = s.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/g);
  return m ? m.slice(-1)[0].slice(0, 2).toUpperCase() : s.slice(0, 2).toUpperCase();
};

const ABOGADO_COLORS: Record<string, string> = {
  'DR. RODRIGO':    'from-violet-600 to-violet-800',
  'DRA. NOELIA':    'from-pink-600 to-pink-800',
  'DR. ALEJANDRO':  'from-blue-600 to-blue-800',
  'DRA. MARIANELA': 'from-teal-600 to-teal-800',
  'DR. FABRICIO':   'from-amber-600 to-amber-800',
};
const getAbogadoColor = (a: string | null) =>
  ABOGADO_COLORS[a?.toUpperCase() || ''] || 'from-gray-600 to-gray-800';

function formatDate(d: string | null) {
  if (!d) return null;
  const [y, m, day] = d.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
}

function isOverdue(d: string | null) {
  if (!d) return false;
  return new Date(d) < new Date();
}

// ─── Notion CSV import helpers ─────────────────────────────────────────────────
const MESES: Record<string, string> = {
  enero:'01', febrero:'02', marzo:'03', abril:'04', mayo:'05', junio:'06',
  julio:'07', agosto:'08', septiembre:'09', octubre:'10', noviembre:'11', diciembre:'12',
};

function parseNotionDate(v: string): string | null {
  if (!v?.trim()) return null;
  // "17 de marzo de 2026" or "15 de octubre de 2025 9:00 (GMT-3)" or "22/04/2026"
  const slashM = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashM) return `${slashM[3]}-${slashM[2].padStart(2,'0')}-${slashM[1].padStart(2,'0')}`;
  const spM = v.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (spM) {
    const mes = MESES[spM[2].toLowerCase()];
    if (mes) return `${spM[3]}-${mes}-${spM[1].padStart(2,'0')}`;
  }
  return null;
}

function parseNotionBool(v: string): boolean {
  return v?.trim().toLowerCase() === 'yes' || v?.trim().toLowerCase() === 'sí';
}

function normTipo(v: string): string {
  const s = v?.toLowerCase().trim();
  if (!s) return '';
  if (s.includes('sucesorio') || s.includes('suces')) return 'sucesorio';
  if (s.includes('laboral') || s.includes('despido') || s.includes('trabajo')) return 'laboral';
  if (s.includes('ejecutivo')) return 'ejecutivo';
  if (s.includes('familia') || s.includes('alimento')) return 'familia';
  if (s.includes('previsional') || s.includes('anses') || s.includes('reajuste')) return 'previsional';
  if (s.includes('prescripci')) return 'prescripciones';
  if (s.includes('real') || s.includes('condomini') || s.includes('escritura') || s.includes('adquisitiv')) return 'reales';
  return s;
}

function normEstado(v: string): string {
  const s = v?.toLowerCase().trim();
  if (!s) return 'activos';
  if (s.includes('federal')) return 'federales';
  if (s.includes('espera') || s.includes('sentencia')) return 'esperando sentencias';
  if (s.includes('complic') || s.includes('analisis') || s.includes('análisis')) return 'complicacion judicial/analisis';
  if (s.includes('directiva')) return 'suspendido por falta de directivas';
  if (s.includes('pago')) return 'suspendido por falta de pago';
  if (s.includes('activ')) return 'activos';
  return s || 'activos';
}

// ─── CaseCard ─────────────────────────────────────────────────────────────────
function CaseCard({
  caso, onClick, onDelete, deleting,
}: {
  caso: CasoGeneral; onClick: () => void;
  onDelete: (id: string) => void; deleting: boolean;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const meta = getEstado(caso.estado);
  const aud = formatDate(caso.audiencias);
  const venc = formatDate(caso.vencimiento);

  return (
    <div
      onClick={onClick}
      className={`group relative flex flex-col gap-3 p-4 rounded-2xl cursor-pointer
        bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12]
        border-l-2 ${meta.border} transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {caso.prioridad && (
            <Star className="inline w-3.5 h-3.5 fill-amber-400 text-amber-400 mr-1.5 -mt-0.5" />
          )}
          <span className="text-[13px] font-semibold text-white/90 leading-snug line-clamp-2">{caso.titulo}</span>
        </div>
        <button
          onClick={e => {
            e.stopPropagation();
            if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3000); return; }
            onDelete(caso.id);
          }}
          disabled={deleting}
          className={`shrink-0 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100
            ${confirmDel ? 'bg-red-500/30 text-red-300' : 'text-gray-600 hover:text-red-400 hover:bg-red-400/10'}`}
          title={confirmDel ? 'Confirmar borrado' : 'Eliminar'}
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.bg} ${meta.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        {caso.tipo_caso && (
          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-gray-400 capitalize">
            {caso.tipo_caso}
          </span>
        )}
        {caso.personeria && (
          <span className="px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-300">
            {caso.personeria}
          </span>
        )}
        {caso.estadisticas_estado === 'atrasado' && (
          <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 font-medium">
            Atrasado
          </span>
        )}
      </div>

      {/* Info row */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
        {caso.expediente && (
          <span className="flex items-center gap-1 font-mono">
            <Scale className="w-3 h-3" />
            {caso.expediente}
          </span>
        )}
        {caso.radicado && (
          <span className="flex items-center gap-1 truncate max-w-[180px]" title={caso.radicado}>
            <Gavel className="w-3 h-3 shrink-0" />
            <span className="truncate">{caso.radicado}</span>
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/[0.04]">
        {/* Abogado */}
        <div className="flex items-center gap-2">
          {caso.abogado && (
            <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${getAbogadoColor(caso.abogado)} flex items-center justify-center text-[9px] font-bold text-white shrink-0`}>
              {abogadoInitials(caso.abogado)}
            </div>
          )}
          <span className="text-[10px] text-gray-500">{caso.abogado || '—'}</span>
        </div>
        {/* Fechas */}
        <div className="flex items-center gap-2 text-[10px]">
          {aud && (
            <span className={`flex items-center gap-1 ${isOverdue(caso.audiencias) ? 'text-red-400' : 'text-blue-400'}`}>
              <Calendar className="w-3 h-3" />
              {aud}
            </span>
          )}
          {venc && (
            <span className={`flex items-center gap-1 ${isOverdue(caso.vencimiento) ? 'text-red-400' : 'text-amber-400'}`}>
              <Clock className="w-3 h-3" />
              {venc}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CaseDetailModal ───────────────────────────────────────────────────────────
function CaseDetailModal({
  caso: initial, onClose, onSaved,
}: {
  caso: CasoGeneral | null; onClose: () => void; onSaved: () => void;
}) {
  const { showToast } = useToast();
  const { saveCaso } = useCasosGenerales();
  const [editing, setEditing] = useState<Partial<CasoGeneral>>(initial || {});
  const [saving, setSaving] = useState(false);
  const isNew = !initial;
  const meta = getEstado(editing.estado ?? null);

  function field(key: keyof CasoGeneral, label: string, type: 'text' | 'date' | 'textarea' | 'select' | 'bool' = 'text', options?: string[]) {
    const val = editing[key] as any;
    if (type === 'bool') {
      return (
        <label key={key} className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setEditing(p => ({ ...p, [key]: !val }))}
            className={`w-9 h-5 rounded-full transition-colors relative ${val ? 'bg-violet-500' : 'bg-white/10'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${val ? 'translate-x-4' : ''}`} />
          </div>
          <span className="text-sm text-gray-300">{label}</span>
        </label>
      );
    }
    if (type === 'select' && options) {
      return (
        <div key={key} className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase tracking-wider">{label}</label>
          <select
            value={val || ''}
            onChange={e => setEditing(p => ({ ...p, [key]: e.target.value || null }))}
            className="bg-[#141418] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50 [&>option]:bg-[#141418] [&>option]:text-white"
          >
            <option value="">— Sin seleccionar —</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    if (type === 'textarea') {
      return (
        <div key={key} className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 uppercase tracking-wider">{label}</label>
          <textarea
            value={val || ''}
            onChange={e => setEditing(p => ({ ...p, [key]: e.target.value || null }))}
            rows={4}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-violet-500/50"
          />
        </div>
      );
    }
    return (
      <div key={key} className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 uppercase tracking-wider">{label}</label>
        <input
          type={type}
          value={val || ''}
          onChange={e => setEditing(p => ({ ...p, [key]: e.target.value || null }))}
          className="bg-[#141418] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
        />
      </div>
    );
  }

  async function handleSave() {
    if (!editing.titulo?.trim()) { showToast('El título es obligatorio', 'error'); return; }
    setSaving(true);
    const r = await saveCaso(editing as any, initial?.id);
    setSaving(false);
    if (r.ok) { showToast(isNew ? 'Caso creado' : 'Caso guardado', 'success'); onSaved(); onClose(); }
    else showToast(r.error || 'Error al guardar', 'error');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-[#0f0f12] border border-white/10 rounded-3xl shadow-2xl">
        {/* Header */}
        <div className={`flex items-start justify-between p-5 border-b border-white/[0.06] border-l-4 ${meta.border} rounded-tl-3xl`}>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">
              {isNew ? 'Nuevo caso' : 'Editar caso'}
            </p>
            <h2 className="text-lg font-bold text-white leading-snug line-clamp-2">
              {editing.titulo || 'Sin título'}
            </h2>
          </div>
          <button onClick={onClose} className="ml-4 text-gray-500 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Obligatorio */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 uppercase tracking-wider">Título *</label>
            <input
              type="text"
              value={editing.titulo || ''}
              onChange={e => setEditing(p => ({ ...p, titulo: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
              placeholder="Ej: FLORES ALMAZAN JOSE LUIS (EJECUTIVO)"
            />
          </div>

          {/* Grid 2 col */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('expediente', 'Expediente')}
            {field('estado', 'Estado', 'select', Object.keys(ESTADO_META))}
            {field('tipo_caso', 'Tipo de caso', 'select', [...TIPOS_CASO])}
            {field('abogado', 'Abogado', 'select', [...ABOGADOS])}
            {field('personeria', 'Personería', 'select', ['Apoderado', 'Patrocinante', 'Personería de urgencia'])}
            {field('estadisticas_estado', 'Estado expediente', 'select', ['al día', 'atrasado'])}
            {field('audiencias', 'Próxima audiencia', 'date')}
            {field('vencimiento', 'Vencimiento', 'date')}
          </div>

          {field('radicado', 'Radicado / Tribunal', 'text')}
          {field('url_drive', 'URL Drive')}
          {field('actualizacion', 'Actualización / notas', 'textarea')}

          {/* Flags */}
          <div className="flex items-center gap-6 pt-1">
            {field('prioridad', 'Prioridad', 'bool')}
            {field('archivado', 'Archivado', 'bool')}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isNew ? 'Crear caso' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── NotionImportModal ─────────────────────────────────────────────────────────
interface ImportRow { fila: number; titulo: string; ok: boolean; error?: string }

function NotionImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [skipArchived, setSkipArchived] = useState(true);

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResults([]);
    try {
      const text = await file.text();
      // Detect if CSV or XLSX
      const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      let rows: Record<string, string>[] = [];

      if (isXlsx) {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, string>[];
      } else {
        // CSV parsing
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          // Simple CSV split (handles quoted commas)
          const vals: string[] = [];
          let cur = '', inQ = false;
          for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
            else cur += ch;
          }
          vals.push(cur);
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
          rows.push(row);
        }
      }

      rows = rows.filter(r => {
        const titulo = r['NOMBRE'] || r['titulo'] || r['Título'] || r['Title'] || '';
        return titulo.trim();
      });
      if (skipArchived) rows = rows.filter(r => !parseNotionBool(r['Archivar'] || r['archivado'] || ''));

      setProgress({ done: 0, total: rows.length });
      if (rows.length === 0) { showToast('No hay filas para importar', 'error'); setImporting(false); return; }

      const { data: ud } = await supabase.auth.getUser();
      const userId = ud?.user?.id || null;
      const localResults: ImportRow[] = [];

      // Batch insert (50 at a time)
      const batch: any[] = [];
      for (const r of rows) {
        const titulo = (r['NOMBRE'] || r['titulo'] || r['Título'] || r['Title'] || '').trim();
        batch.push({
          titulo,
          expediente: r['Expediente'] || r['expediente'] || null,
          estado: normEstado(r['Estado'] || r['estado'] || ''),
          tipo_caso: normTipo(r['tipo de caso'] || r['tipo_caso'] || r['Tipo'] || ''),
          abogado: (r['SISTEMA'] || r['abogado'] || r['Abogado'] || '').trim() || null,
          personeria: (r['PERSONERIA'] || r['Personería'] || r['personeria'] || '').trim() || null,
          radicado: (r['Radicado'] || r['radicado'] || '').trim() || null,
          url_drive: (r['URL del DRIVE'] || r['url_drive'] || r['Drive'] || '').trim() || null,
          actualizacion: (r['actualizacion'] || r['Actualización'] || '').trim() || null,
          audiencias: parseNotionDate(r['Audiencias'] || r['audiencias'] || ''),
          vencimiento: parseNotionDate(r['vencimiento'] || r['Vencimiento'] || ''),
          prioridad: parseNotionBool(r['Prioridad'] || r['prioridad'] || ''),
          archivado: parseNotionBool(r['Archivar'] || r['archivado'] || ''),
          estadisticas_estado: (r['Estadisticas (NO TOCAR)'] || r['estadisticas_estado'] || 'al día').trim().toLowerCase() || 'al día',
          created_by: userId,
        });
      }

      // Insert in chunks
      const CHUNK = 50;
      let ok = 0, fail = 0;
      for (let i = 0; i < batch.length; i += CHUNK) {
        const chunk = batch.slice(i, i + CHUNK);
        const { data, error } = await supabase.from('casos_generales').insert(chunk).select('id');
        if (error) {
          fail += chunk.length;
          chunk.forEach((_, j) => localResults.push({ fila: i + j + 2, titulo: chunk[j].titulo, ok: false, error: error.message }));
        } else {
          ok += data?.length || 0;
          fail += chunk.length - (data?.length || 0);
          chunk.forEach((c, j) => localResults.push({ fila: i + j + 2, titulo: c.titulo, ok: j < (data?.length || 0) }));
        }
        setProgress({ done: Math.min(i + CHUNK, batch.length), total: batch.length });
        setResults([...localResults]);
      }

      const firstErr = localResults.find(r => !r.ok)?.error;
      if (firstErr?.includes('does not exist')) {
        showToast('Tabla no existe. Corrí migration_casos_generales.sql en Supabase primero.', 'error');
      } else {
        showToast(`${ok} caso(s) importado(s)${fail ? `, ${fail} con error` : ''}`, fail ? 'error' : 'success');
      }
      onImported();
    } catch (e: any) {
      showToast(`Error: ${e?.message || e}`, 'error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0f0f12] border border-white/10 rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-violet-400" />
            Importar desde Notion / Excel
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-200 space-y-2">
            <p className="font-semibold">Cómo importar desde Notion:</p>
            <ol className="list-decimal list-inside text-xs space-y-1 text-blue-200/80">
              <li>En tu base de Notion → menú <strong>···</strong> → <strong>Export</strong> → formato <strong>CSV</strong>.</li>
              <li>Subí el CSV acá (o tu plantilla Excel con los mismos campos).</li>
              <li>Las columnas reconocidas: <code>NOMBRE, Expediente, Estado, SISTEMA, PERSONERIA, Radicado, tipo de caso, vencimiento, Audiencias, Prioridad, Archivar, URL del DRIVE</code></li>
            </ol>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setSkipArchived(!skipArchived)}
              className={`w-9 h-5 rounded-full relative transition-colors ${skipArchived ? 'bg-violet-500' : 'bg-white/10'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${skipArchived ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-gray-300">Omitir casos con "Archivar = Yes"</span>
          </label>

          <label className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 cursor-pointer text-sm">
              <Upload className="w-4 h-4" />
              {file ? file.name : 'Elegir archivo CSV / XLSX'}
            </div>
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { setFile(e.target.files?.[0] || null); setResults([]); }} />
          </label>

          {file && !importing && results.length === 0 && (
            <button onClick={handleImport} className="btn-primary text-sm">Importar {skipArchived ? 'casos activos' : 'todos'}</button>
          )}

          {importing && (
            <div className="flex items-center gap-2 text-violet-300 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Procesando {progress.done}/{progress.total}…
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="w-4 h-4" />{results.filter(r => r.ok).length} ok</span>
                {results.some(r => !r.ok) && <span className="flex items-center gap-1 text-red-300"><AlertCircle className="w-4 h-4" />{results.filter(r => !r.ok).length} errores</span>}
              </div>
              {results.find(r => !r.ok)?.error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300">
                  <span className="font-semibold">Error: </span>{results.find(r => !r.ok)?.error}
                  {results.find(r => !r.ok)?.error?.includes('does not exist') && (
                    <p className="mt-1 font-semibold">→ Corrí migration_casos_generales.sql en el SQL Editor de Supabase primero.</p>
                  )}
                </div>
              )}
              <div className="max-h-52 overflow-y-auto rounded-xl border border-white/10 text-xs">
                <table className="w-full">
                  <thead className="bg-white/5 sticky top-0"><tr>
                    <th className="px-3 py-1.5 text-left text-gray-500">#</th>
                    <th className="px-3 py-1.5 text-left text-gray-500">Título</th>
                    <th className="px-3 py-1.5 text-left text-gray-500">Resultado</th>
                  </tr></thead>
                  <tbody>{results.map((r, i) => (
                    <tr key={i} className="border-t border-white/5">
                      <td className="px-3 py-1 text-gray-500">{r.fila}</td>
                      <td className="px-3 py-1 text-gray-300 max-w-[280px] truncate">{r.titulo}</td>
                      <td className={`px-3 py-1 ${r.ok ? 'text-emerald-300' : 'text-red-300'}`}>{r.ok ? 'OK' : (r.error || 'Error')}</td>
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
const KANBAN_COLUMNS = [
  { key: 'activos',                            label: 'Activos',        border: 'border-t-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-400' },
  { key: 'federales',                          label: 'Federales',      border: 'border-t-blue-500',    badge: 'bg-blue-500/10 text-blue-400',       dot: 'bg-blue-400' },
  { key: 'esperando sentencias',               label: 'En espera',      border: 'border-t-amber-500',   badge: 'bg-amber-500/10 text-amber-400',     dot: 'bg-amber-400' },
  { key: 'complicacion judicial/analisis',     label: 'En análisis',    border: 'border-t-orange-500',  badge: 'bg-orange-500/10 text-orange-400',   dot: 'bg-orange-400' },
  { key: 'suspendido por falta de directivas', label: 'Sin directivas', border: 'border-t-gray-500',    badge: 'bg-gray-500/10 text-gray-400',       dot: 'bg-gray-400' },
  { key: 'suspendido por falta de pago',       label: 'Sin pago',       border: 'border-t-red-500',     badge: 'bg-red-500/10 text-red-400',         dot: 'bg-red-400' },
];

function KanbanCard({ caso, onSelect, onDelete, confirmDel, askDel }: {
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
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); askDel(caso.id); }}
        title={confirmDel === caso.id ? 'Confirmar' : 'Eliminar'}
        className={`absolute top-1.5 right-1.5 p-1 rounded-md transition-colors ${confirmDel === caso.id ? 'bg-red-500/20 text-red-400 opacity-100' : 'opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 hover:bg-red-500/10'}`}
      >
        <Trash2 className="w-3 h-3" />
      </button>
      <button className="w-full text-left" onPointerDown={e => e.stopPropagation()} onClick={() => onSelect(caso)}>
        <div className="flex items-start gap-1.5 pr-5">
          {caso.prioridad && <Star className="w-3 h-3 fill-amber-400 text-amber-400 mt-0.5 shrink-0" />}
          <p className="text-[11px] font-medium text-white leading-tight line-clamp-2">{caso.titulo}</p>
        </div>
        {caso.tipo_caso && (
          <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded-full bg-white/5 text-[10px] text-gray-400 capitalize">{caso.tipo_caso}</span>
        )}
        {caso.abogado && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${getAbogadoColor(caso.abogado)} flex items-center justify-center text-[8px] font-bold text-white shrink-0`}>
              {abogadoInitials(caso.abogado)}
            </div>
            <span className="text-[10px] text-gray-500 truncate">{caso.abogado}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {caso.audiencias && (
            <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue(caso.audiencias) ? 'text-red-400' : 'text-blue-400'}`}>
              <Calendar className="w-2.5 h-2.5" />{formatDate(caso.audiencias)}
            </span>
          )}
          {caso.vencimiento && (
            <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue(caso.vencimiento) ? 'text-red-400' : 'text-amber-400'}`}>
              <Clock className="w-2.5 h-2.5" />{formatDate(caso.vencimiento)}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function KanbanDropCol({ col, count, isOver, children }: {
  col: typeof KANBAN_COLUMNS[0]; count: number; isOver: boolean; children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: col.key });
  return (
    <div ref={setNodeRef}
      className={`glass-card p-0 overflow-hidden border-t-2 ${col.border} transition-all ${isOver ? 'ring-2 ring-white/20 scale-[1.01]' : ''}`}>
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${col.dot}`} />
          <h3 className="text-xs font-semibold text-white truncate">{col.label}</h3>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ml-1 ${col.badge}`}>{count}</span>
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
  saveCaso: (data: Partial<Omit<CasoGeneral, 'id' | 'created_at' | 'updated_at'>>, id?: string) => Promise<{ ok: boolean }>;
}) {
  const [items, setItems] = useState<CasoGeneral[]>(casos);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => { setItems(casos); }, [casos]);

  const colKeys = KANBAN_COLUMNS.map(c => c.key);

  const askDel = (id: string) => {
    if (confirmDel === id) { onDelete(id); setConfirmDel(null); }
    else { setConfirmDel(id); setTimeout(() => setConfirmDel(p => p === id ? null : p), 3000); }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const activeCaso = items.find(c => c.id === activeId) ?? null;

  const grouped = KANBAN_COLUMNS.reduce<Record<string, CasoGeneral[]>>((acc, col) => {
    acc[col.key] = items.filter(c => (c.estado?.toLowerCase() ?? '') === col.key);
    return acc;
  }, {});
  // casos sin estado válido → activos
  items.filter(c => !colKeys.includes(c.estado?.toLowerCase() ?? '')).forEach(c => grouped['activos'].push(c));

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null); setOverCol(null);
    if (!over) return;
    const newEstado = colKeys.includes(over.id as string)
      ? (over.id as string)
      : (items.find(c => c.id === over.id)?.estado ?? null);
    if (!newEstado) return;
    const card = items.find(c => c.id === active.id);
    if (!card || card.estado === newEstado) return;
    setItems(prev => prev.map(c => c.id === active.id ? { ...c, estado: newEstado } : c));
    const r = await saveCaso({ estado: newEstado } as any, active.id as string);
    if (!r.ok) {
      showToast('No se pudo mover', 'error');
      setItems(prev => prev.map(c => c.id === active.id ? { ...c, estado: card.estado } : c));
    } else {
      showToast(`→ ${KANBAN_COLUMNS.find(c => c.key === newEstado)?.label ?? newEstado}`, 'success');
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={rectIntersection}
      onDragStart={e => setActiveId(e.active.id as string)}
      onDragOver={e => setOverCol(e.over?.id as string ?? null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setActiveId(null); setOverCol(null); }}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {KANBAN_COLUMNS.map(col => (
          <KanbanDropCol key={col.key} col={col} count={grouped[col.key]?.length ?? 0} isOver={overCol === col.key}>
            {(grouped[col.key]?.length ?? 0) === 0
              ? <p className="text-[10px] text-gray-600 text-center py-6">Sin casos</p>
              : grouped[col.key].map(c => (
                  <KanbanCard key={c.id} caso={c} onSelect={onSelect} onDelete={onDelete} confirmDel={confirmDel} askDel={askDel} />
                ))
            }
          </KanbanDropCol>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeCaso && (
          <div className="p-3 rounded-xl shadow-2xl w-44 select-none" style={{ background: '#1a1a2e', border: '1px solid rgba(139,92,246,0.4)' }}>
            <p className="text-[11px] font-medium text-white leading-tight line-clamp-2">{activeCaso.titulo}</p>
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

  const filtered = useMemo(() => {
    return casos.filter(c => {
      if (!mostrarArchivados && c.archivado) return false;
      if (filtroEstado && c.estado?.toLowerCase() !== filtroEstado) return false;
      if (filtroTipo && c.tipo_caso?.toLowerCase() !== filtroTipo) return false;
      if (filtroAbogado && c.abogado?.toUpperCase() !== filtroAbogado.toUpperCase()) return false;
      if (search) {
        const q = search.toLowerCase();
        return [c.titulo, c.expediente, c.radicado, c.abogado, c.tipo_caso]
          .some(v => v?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [casos, search, filtroEstado, filtroTipo, filtroAbogado, mostrarArchivados]);

  // Stats
  const stats = useMemo(() => {
    const active = casos.filter(c => !c.archivado);
    return {
      total: active.length,
      activos: active.filter(c => c.estado === 'activos').length,
      federales: active.filter(c => c.estado === 'federales').length,
      atrasados: active.filter(c => c.estadisticas_estado === 'atrasado').length,
      prioridad: active.filter(c => c.prioridad).length,
      vencimientoProximo: active.filter(c => {
        if (!c.vencimiento) return false;
        const diff = (new Date(c.vencimiento).getTime() - Date.now()) / 86400000;
        return diff >= 0 && diff <= 15;
      }).length,
    };
  }, [casos]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    const ok = await deleteCaso(id);
    setDeletingId(null);
    if (ok) { showToast('Caso eliminado', 'success'); refetch(); }
    else showToast('No se pudo eliminar', 'error');
  }

  async function handleDeleteAll() {
    const total = filtered.length;
    if (!total) return;
    if (!window.confirm(`¿Eliminás los ${total} casos del listado actual?`)) return;
    const conf = window.prompt(`Para confirmar escribí: BORRAR ${total}`);
    if (conf !== `BORRAR ${total}`) { showToast('Cancelado', 'info'); return; }
    setBulkLoading(true);
    const r = await deleteMany(filtered.map(c => c.id));
    setBulkLoading(false);
    refetch();
    showToast(`${r.ok} eliminado(s)${r.fail ? `, ${r.fail} con error` : ''}`, r.fail ? 'error' : 'success');
  }

  const activeFilters = [filtroEstado, filtroTipo, filtroAbogado].filter(Boolean).length;

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Scale className="w-7 h-7 text-violet-400" />
            Casos Generales
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} caso{filtered.length !== 1 ? 's' : ''} · {mostrarArchivados ? 'incluye archivados' : 'activos'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={refetch} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Importar</span>
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={filtered.length === 0 || bulkLoading}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            <span className="hidden sm:inline">Eliminar todos</span>
          </button>
          <button onClick={() => setDetailCaso('new')} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            Nuevo caso
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total activos', val: stats.total, color: 'text-white' },
          { label: 'Activos', val: stats.activos, color: 'text-emerald-300' },
          { label: 'Federales', val: stats.federales, color: 'text-blue-300' },
          { label: 'Atrasados', val: stats.atrasados, color: 'text-red-300' },
          { label: 'Alta prioridad', val: stats.prioridad, color: 'text-amber-300' },
          { label: 'Vence ≤15 días', val: stats.vencimientoProximo, color: 'text-orange-300' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-3 text-center border border-white/[0.06]">
            <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por título, expediente, tribunal…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
          />
        </div>

        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl border transition-colors ${filterOpen || activeFilters > 0 ? 'border-violet-500/40 bg-violet-500/10 text-violet-300' : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'}`}
        >
          <Filter className="w-4 h-4" />
          Filtros {activeFilters > 0 && <span className="rounded-full bg-violet-500 text-white text-[10px] px-1.5">{activeFilters}</span>}
        </button>

        <div className="flex items-center rounded-xl border border-white/10 overflow-hidden">
          <button
            onClick={() => setView('tarjetas')}
            className={`px-3 py-2 transition-colors ${view === 'tarjetas' ? 'bg-violet-500/20 text-violet-300' : 'text-gray-500 hover:text-white'}`}
            title="Vista tarjetas"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`px-3 py-2 transition-colors ${view === 'kanban' ? 'bg-violet-500/20 text-violet-300' : 'text-gray-500 hover:text-white'}`}
            title="Vista kanban"
          >
            <Columns3 className="w-3.5 h-3.5" />
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <div
            onClick={() => setMostrarArchivados(!mostrarArchivados)}
            className={`w-8 h-4 rounded-full relative transition-colors ${mostrarArchivados ? 'bg-violet-500' : 'bg-white/10'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${mostrarArchivados ? 'translate-x-4' : ''}`} />
          </div>
          <Archive className="w-4 h-4" />
          Archivados
        </label>
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="flex flex-wrap gap-3 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-fade-in">
          {[
            { label: 'Estado', value: filtroEstado, set: setFiltroEstado, options: Object.keys(ESTADO_META) },
            { label: 'Tipo de caso', value: filtroTipo, set: setFiltroTipo, options: [...TIPOS_CASO] },
            { label: 'Abogado', value: filtroAbogado, set: setFiltroAbogado, options: [...ABOGADOS] },
          ].map(f => (
            <div key={f.label} className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs text-gray-500">{f.label}</label>
              <select
                value={f.value}
                onChange={e => f.set(e.target.value)}
                className="bg-[#141418] border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500/50 [&>option]:bg-[#141418] [&>option]:text-white"
              >
                <option value="">Todos</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          {activeFilters > 0 && (
            <button
              onClick={() => { setFiltroEstado(''); setFiltroTipo(''); setFiltroAbogado(''); }}
              className="self-end text-xs text-gray-500 hover:text-white flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <Scale className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-lg font-medium">Sin casos</p>
          <p className="text-sm mt-1">Importá desde Notion o creá el primero</p>
          <button onClick={() => setDetailCaso('new')} className="btn-primary mt-4 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nuevo caso
          </button>
        </div>
      ) : view === 'kanban' ? (
        <CasosKanban
          casos={filtered}
          onSelect={c => setDetailCaso(c)}
          onDelete={handleDelete}
          saveCaso={saveCaso}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => (
            <CaseCard
              key={c.id}
              caso={c}
              onClick={() => setDetailCaso(c)}
              onDelete={handleDelete}
              deleting={deletingId === c.id}
            />
          ))}
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
      {importOpen && (
        <NotionImportModal onClose={() => setImportOpen(false)} onImported={refetch} />
      )}
    </div>
  );
}
