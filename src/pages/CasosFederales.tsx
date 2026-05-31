import { useMemo, useRef, useState } from 'react';
import { Plus, Search, Trash2, Briefcase, Phone, Check, Copy, ChevronRight, Filter, FileText, Pencil } from 'lucide-react';
import { useClientesFederales } from '../hooks/useFederales';
import FichaFederalModal from '../components/federales/FichaFederalModal';
import FichaFederalDetalle from '../components/federales/FichaFederalDetalle';
import {
  ClienteFederal,
  PipelineFederal,
  PIPELINE_FEDERAL_ORDERED,
  PIPELINE_FEDERAL_LABELS,
  PIPELINE_FEDERAL_COLORS,
  TIPO_CASO_FEDERAL_LABELS,
} from '../types/federales';

type Vista = 'tabla' | 'pipeline';

type SortKey = 'apellido_nombre' | 'cuil' | 'numero_expediente' | 'fecha_ultimo_contacto' | 'pipeline';
type SortDir = 'asc' | 'desc';

function formatFechaLocal(s: string | null | undefined): string {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export default function CasosFederales() {
  const { clientes, loading, upsert, updatePipeline, remove } = useClientesFederales();
  const [vista, setVista] = useState<Vista>('tabla');
  const [busqueda, setBusqueda] = useState('');
  const [filtroPipelines, setFiltroPipelines] = useState<Set<PipelineFederal>>(new Set());
  const [modalAbierto, setModalAbierto] = useState(false);
  const [fichaEditando, setFichaEditando] = useState<ClienteFederal | null>(null);
  const [fichaDetalle, setFichaDetalle] = useState<ClienteFederal | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('apellido_nombre');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  function togglePipeline(p: PipelineFederal) {
    setFiltroPipelines(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  }
  async function copiar(e: React.MouseEvent, txt: string, id: string) {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(txt); } catch { /* noop */ }
    setCopiado(id);
    setTimeout(() => setCopiado(c => c === id ? null : c), 1200);
  }
  function handleDel(e: React.MouseEvent, c: ClienteFederal) {
    e.stopPropagation();
    if (confirmDel === c.id) {
      remove(c.id);
      setConfirmDel(null);
    } else {
      setConfirmDel(c.id);
      setTimeout(() => setConfirmDel(prev => prev === c.id ? null : prev), 3000);
    }
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let arr = clientes.filter(c => {
      if (filtroPipelines.size > 0 && !filtroPipelines.has(c.pipeline)) return false;
      if (!q) return true;
      return (
        (c.apellido_nombre || '').toLowerCase().includes(q) ||
        (c.cuil || '').toLowerCase().includes(q) ||
        (c.telefono || '').toLowerCase().includes(q) ||
        (c.numero_expediente || '').toLowerCase().includes(q)
      );
    });
    arr = [...arr].sort((a, b) => {
      const av = (a as any)[sortKey] ?? '';
      const bv = (b as any)[sortKey] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [clientes, busqueda, filtroPipelines, sortKey, sortDir]);

  function abrirNuevo() { setFichaEditando(null); setModalAbierto(true); }
  function abrirEditar(c: ClienteFederal) {
    setFichaEditando(c);
    setFichaDetalle(null);
    setModalAbierto(true);
  }
  async function handleSave(data: Partial<ClienteFederal>, id?: string) { return upsert(data, id); }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header: título + búsqueda + toggle + Nueva */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Casos Federales</h1>
              <p className="text-xs text-gray-500">{clientes.length} caso{clientes.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto items-center">
            <div className="relative flex-1 sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar por nombre, CUIL o teléfono..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="input-dark pl-10 text-sm"
              />
            </div>
            <div className="flex bg-white/5 rounded-xl p-0.5 border border-white/10">
              <button
                onClick={() => setVista('tabla')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${vista === 'tabla' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
              >Tabla</button>
              <button
                onClick={() => setVista('pipeline')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${vista === 'pipeline' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
              >Pipeline</button>
            </div>
            <button onClick={abrirNuevo} className="btn-primary text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nuevo caso</span>
            </button>
          </div>
        </div>

        {/* Pipeline filter pills */}
        <div className="flex flex-wrap gap-2 pb-1">
          <button
            onClick={() => setFiltroPipelines(new Set())}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
              filtroPipelines.size === 0
                ? 'bg-white/10 text-white border-white/20'
                : 'bg-white/5 text-gray-500 border-white/5 hover:text-white'
            }`}
          >
            Todos ({clientes.length})
          </button>
          {PIPELINE_FEDERAL_ORDERED.map(p => {
            const count = clientes.filter(c => c.pipeline === p).length;
            const active = filtroPipelines.has(p);
            return (
              <button
                key={p}
                onClick={() => togglePipeline(p)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  active ? PIPELINE_FEDERAL_COLORS[p] : 'bg-white/5 text-gray-500 border-white/5 hover:text-white'
                }`}
              >
                <span className={`w-3 h-3 rounded border flex items-center justify-center ${active ? 'bg-white/20 border-white/40' : 'border-white/20'}`}>
                  {active && <Check className="w-2.5 h-2.5" />}
                </span>
                {PIPELINE_FEDERAL_LABELS[p]} ({count})
              </button>
            );
          })}
          <button
            className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap flex items-center gap-1.5 bg-white/5 text-gray-500 border-white/5 hover:text-white"
            disabled
            title="Próximamente"
          >
            <Filter className="w-3 h-3" /> Filtros
          </button>
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando casos federales...</div>
      ) : vista === 'tabla' ? (
        <VistaTabla
          items={filtrados}
          sortKey={sortKey}
          sortDir={sortDir}
          toggleSort={toggleSort}
          onSelect={setFichaDetalle}
          onEdit={abrirEditar}
          copiado={copiado}
          copiar={copiar}
          confirmDel={confirmDel}
          handleDel={handleDel}
        />
      ) : (
        <VistaKanban items={filtrados} onAbrir={setFichaDetalle} onMover={updatePipeline} />
      )}

      {modalAbierto && (
        <FichaFederalModal
          ficha={fichaEditando}
          onClose={() => setModalAbierto(false)}
          onSave={handleSave}
        />
      )}
      {fichaDetalle && (
        <FichaFederalDetalle
          ficha={fichaDetalle}
          onClose={() => setFichaDetalle(null)}
          onEdit={() => {
            setFichaEditando(fichaDetalle);
            setFichaDetalle(null);
            setModalAbierto(true);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────── Tabla ─────────────────────────────────────────
function SortHeader({ k, label, sortKey, sortDir, onClick, className = '' }: {
  k: SortKey; label: string; sortKey: SortKey; sortDir: SortDir;
  onClick: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={`sticky top-14 sm:top-16 z-20 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10 text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase ${className}`}>
      <button onClick={() => onClick(k)} className="flex items-center gap-1 hover:text-white transition-colors">
        {label}
        <span className="text-[10px]">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

function VistaTabla({
  items, sortKey, sortDir, toggleSort, onSelect, onEdit, copiado, copiar, confirmDel, handleDel,
}: {
  items: ClienteFederal[];
  sortKey: SortKey;
  sortDir: SortDir;
  toggleSort: (k: SortKey) => void;
  onSelect: (c: ClienteFederal) => void;
  onEdit: (c: ClienteFederal) => void;
  copiado: string | null;
  copiar: (e: React.MouseEvent, txt: string, id: string) => void;
  confirmDel: string | null;
  handleDel: (e: React.MouseEvent, c: ClienteFederal) => void;
}) {
  return (
    <div className="glass-card">
      <div>
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <SortHeader k="apellido_nombre" label="Cliente" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="cuil" label="CUIL" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th className="sticky top-14 sm:top-16 z-20 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10 text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Clave ANSES</th>
              <SortHeader k="numero_expediente" label="Expediente" className="hidden xl:table-cell" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="fecha_ultimo_contacto" label="Situación Actual" className="hidden lg:table-cell" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortHeader k="pipeline" label="Pipeline" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th className="sticky top-14 sm:top-16 z-20 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/10 text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">Sin resultados</td></tr>
            ) : items.map((c, i) => (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                className="table-row animate-slide-up"
                style={{ animationDelay: `${Math.min(i, 20) * 30}ms` }}
              >
                {/* Cliente + Teléfono */}
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-white">{c.apellido_nombre}</p>
                    {c.telefono && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" /> {c.telefono}
                      </p>
                    )}
                  </div>
                </td>
                {/* CUIL */}
                <td className="px-4 py-3">
                  {c.cuil ? (
                    <button
                      onClick={e => copiar(e, c.cuil!, `cuil-${c.id}`)}
                      className="flex items-center gap-1.5 font-mono text-xs text-gray-300 hover:text-white group"
                      title="Copiar CUIL"
                    >
                      {c.cuil}
                      {copiado === `cuil-${c.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 text-gray-500" />}
                    </button>
                  ) : <span className="text-gray-600 text-xs">—</span>}
                </td>
                {/* Clave ANSES */}
                <td className="px-4 py-3 hidden md:table-cell">
                  {c.clave_social ? (
                    <button
                      onClick={e => copiar(e, c.clave_social!, `clave-${c.id}`)}
                      className="flex items-center gap-1.5 font-mono text-xs text-gray-300 hover:text-white group"
                      title="Copiar Clave ANSES"
                    >
                      {'*'.repeat(Math.min(c.clave_social.length, 6))}
                      {copiado === `clave-${c.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 text-gray-500" />}
                    </button>
                  ) : <span className="text-gray-600 text-xs">—</span>}
                </td>
                {/* Expediente */}
                <td className="px-4 py-3 hidden xl:table-cell">
                  {c.numero_expediente ? (
                    <span className="flex items-center gap-1 text-xs text-gray-300 font-mono">
                      <FileText className="w-3 h-3 text-gray-500" />{c.numero_expediente}
                    </span>
                  ) : <span className="text-gray-600 text-xs">—</span>}
                </td>
                {/* Situación Actual */}
                <td className="px-4 py-3 hidden lg:table-cell max-w-[240px]">
                  {c.situacion_actual || c.fecha_ultimo_contacto ? (
                    <div className="text-xs">
                      {c.fecha_ultimo_contacto && (
                        <p className="text-gray-400 font-medium">{formatFechaLocal(c.fecha_ultimo_contacto)}</p>
                      )}
                      {c.situacion_actual && (
                        <p className="text-gray-300 truncate" title={c.situacion_actual}>{c.situacion_actual}</p>
                      )}
                    </div>
                  ) : <span className="text-gray-600 text-xs">—</span>}
                </td>
                {/* Pipeline Badge */}
                <td className="px-4 py-3">
                  <span className={`badge border ${PIPELINE_FEDERAL_COLORS[c.pipeline]}`}>
                    {PIPELINE_FEDERAL_LABELS[c.pipeline]}
                  </span>
                </td>
                {/* Acciones */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={e => { e.stopPropagation(); onEdit(c); }}
                      title="Editar"
                      className="p-1.5 rounded-lg transition-colors text-gray-600 hover:text-blue-400 hover:bg-blue-500/10"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={e => handleDel(e, c)}
                      title={confirmDel === c.id ? 'Click otra vez para eliminar' : 'Eliminar'}
                      className={`p-1.5 rounded-lg transition-colors ${confirmDel === c.id ? 'bg-red-500/20 text-red-400' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────── Kanban ────────────────────────────────────────
function pipelineDot(p: PipelineFederal): string {
  switch (p) {
    case 'activo': return 'bg-emerald-500';
    case 'esperando_audiencia': return 'bg-blue-500';
    case 'esperando_sentencia': return 'bg-violet-500';
    case 'analisis_sin_directivas': return 'bg-amber-500';
    case 'en_ejecucion': return 'bg-cyan-500';
    case 'seguimiento': return 'bg-sky-500';
    case 'archivado': return 'bg-gray-500';
    default: return 'bg-gray-500';
  }
}

function VistaKanban({
  items, onAbrir, onMover,
}: {
  items: ClienteFederal[];
  onAbrir: (f: ClienteFederal) => void;
  onMover: (id: string, pipeline: PipelineFederal) => Promise<boolean>;
}) {
  const draggingIdRef = useRef<string | null>(null);
  const [hoverCol, setHoverCol] = useState<PipelineFederal | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, id: string, fromPipeline: PipelineFederal) {
    draggingIdRef.current = id;
    setDraggingId(id);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.setData('application/x-fed-from', fromPipeline);
    } catch { /* noop */ }
  }
  function handleDragEnd() {
    draggingIdRef.current = null;
    setDraggingId(null);
    setHoverCol(null);
  }
  function handleDragOver(e: React.DragEvent, col: PipelineFederal) {
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch { /* noop */ }
    if (hoverCol !== col) setHoverCol(col);
  }
  async function handleDrop(e: React.DragEvent, col: PipelineFederal) {
    e.preventDefault();
    const id = draggingIdRef.current || e.dataTransfer.getData('text/plain');
    setHoverCol(null);
    draggingIdRef.current = null;
    setDraggingId(null);
    if (!id) return;
    const item = items.find(c => c.id === id);
    if (!item || item.pipeline === col) return;
    await onMover(id, col);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {PIPELINE_FEDERAL_ORDERED.map(p => {
        const enCol = items.filter(c => c.pipeline === p);
        const isHover = hoverCol === p && draggingId !== null;
        return (
          <div
            key={p}
            onDragOver={e => handleDragOver(e, p)}
            onDragEnter={e => handleDragOver(e, p)}
            onDragLeave={() => { if (hoverCol === p) setHoverCol(null); }}
            onDrop={e => handleDrop(e, p)}
            className={`flex-shrink-0 w-64 bg-white/[0.02] border rounded-xl p-2 min-h-[200px] transition-colors ${
              isHover ? 'border-blue-400 bg-blue-500/10' : 'border-white/[0.06]'
            }`}
          >
            <div className={`text-[11px] font-bold uppercase mb-2 px-2 py-1 rounded-lg border ${PIPELINE_FEDERAL_COLORS[p]} flex items-center justify-between`}>
              <span className="truncate">{PIPELINE_FEDERAL_LABELS[p]}</span>
              <span className="text-[10px] opacity-80 shrink-0 ml-2">{enCol.length}</span>
            </div>
            <div className="space-y-1.5 min-h-[60px]">
              {enCol.map(c => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={e => handleDragStart(e, c.id, p)}
                  onDragEnd={handleDragEnd}
                  onClick={() => { if (draggingIdRef.current === null) onAbrir(c); }}
                  className={`relative group p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/10 transition-all cursor-grab active:cursor-grabbing select-none ${
                    draggingId === c.id ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${pipelineDot(c.pipeline)}`} />
                    <p className="text-[11px] font-medium text-white leading-tight">{c.apellido_nombre}</p>
                  </div>
                  {c.numero_expediente && (
                    <p className="text-[10px] text-gray-500 mt-1 pl-4 font-mono truncate">Expte {c.numero_expediente}</p>
                  )}
                  {(c.tipo_caso || []).length > 0 && (
                    <p className="text-[10px] text-blue-300/80 truncate mt-0.5 pl-4">
                      {c.tipo_caso.map(t => TIPO_CASO_FEDERAL_LABELS[t]).join(' · ')}
                    </p>
                  )}
                  {c.telefono && (
                    <p className="text-[10px] text-gray-600 mt-0.5 pl-4 truncate flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5 shrink-0" />{c.telefono}
                    </p>
                  )}
                </div>
              ))}
              {enCol.length === 0 && (
                <div className="text-center text-[10px] text-gray-600 py-3 italic">
                  {isHover ? 'Soltar acá' : 'Vacío'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
