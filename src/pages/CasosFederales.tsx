import { useMemo, useRef, useState } from 'react';
import { Plus, Search, Edit2, Trash2, Briefcase, Phone, CreditCard, FileText, LayoutGrid, List } from 'lucide-react';
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

type Vista = 'lista' | 'kanban';

export default function CasosFederales() {
  const { clientes, loading, upsert, updatePipeline, remove } = useClientesFederales();
  const [vista, setVista] = useState<Vista>('lista');
  const [busqueda, setBusqueda] = useState('');
  const [filtroPipeline, setFiltroPipeline] = useState<PipelineFederal | 'todos'>('todos');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [fichaEditando, setFichaEditando] = useState<ClienteFederal | null>(null);
  const [fichaDetalle, setFichaDetalle] = useState<ClienteFederal | null>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clientes.filter(c => {
      if (filtroPipeline !== 'todos' && c.pipeline !== filtroPipeline) return false;
      if (!q) return true;
      return (
        (c.apellido_nombre || '').toLowerCase().includes(q) ||
        (c.cuil || '').toLowerCase().includes(q) ||
        (c.telefono || '').toLowerCase().includes(q) ||
        (c.numero_expediente || '').toLowerCase().includes(q)
      );
    });
  }, [clientes, busqueda, filtroPipeline]);

  const totales = useMemo(() => {
    const total = clientes.length;
    const porPipeline: Record<PipelineFederal, number> = {
      activo: 0, esperando_audiencia: 0, esperando_sentencia: 0,
      analisis_sin_directivas: 0, sin_pago: 0, seguimiento: 0,
    };
    clientes.forEach(c => { porPipeline[c.pipeline] = (porPipeline[c.pipeline] || 0) + 1; });
    return { total, porPipeline };
  }, [clientes]);

  function abrirNuevo() { setFichaEditando(null); setModalAbierto(true); }
  function abrirEditar(f: ClienteFederal) { setFichaEditando(f); setModalAbierto(true); }
  async function handleSave(data: Partial<ClienteFederal>, id?: string) { return upsert(data, id); }
  async function handleDelete(f: ClienteFederal) {
    if (confirm(`¿Eliminar el caso de "${f.apellido_nombre}"?`)) await remove(f.id);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-blue-400" />
            Casos Federales
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Listado exclusivo de causas federales — {totales.total} caso{totales.total !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-800/60 border border-gray-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setVista('lista')}
              className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1 ${vista === 'lista' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <List className="w-3.5 h-3.5" /> Lista
            </button>
            <button
              onClick={() => setVista('kanban')}
              className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1 ${vista === 'kanban' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Pipeline
            </button>
          </div>
          <button
            onClick={abrirNuevo}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-1.5 text-sm font-semibold shadow"
          >
            <Plus className="w-4 h-4" /> Nuevo caso
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, CUIL, teléfono o expediente..."
            className="w-full pl-9 pr-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-sm text-white focus:border-blue-500 outline-none"
          />
        </div>
        <select
          value={filtroPipeline}
          onChange={e => setFiltroPipeline(e.target.value as PipelineFederal | 'todos')}
          className="px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-sm text-white"
        >
          <option value="todos">Todos los estados</option>
          {PIPELINE_FEDERAL_ORDERED.map(p => (
            <option key={p} value={p}>{PIPELINE_FEDERAL_LABELS[p]} ({totales.porPipeline[p] || 0})</option>
          ))}
        </select>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando casos federales...</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {clientes.length === 0
            ? 'No hay casos federales todavía. Tocá "Nuevo caso" para empezar.'
            : 'Ningún caso coincide con los filtros.'}
        </div>
      ) : vista === 'lista' ? (
        <VistaLista items={filtrados} onAbrir={setFichaDetalle} onEditar={abrirEditar} onEliminar={handleDelete} />
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
        />
      )}
    </div>
  );
}

function VistaLista({
  items, onAbrir, onEditar, onEliminar,
}: {
  items: ClienteFederal[];
  onAbrir: (f: ClienteFederal) => void;
  onEditar: (f: ClienteFederal) => void;
  onEliminar: (f: ClienteFederal) => void;
}) {
  return (
    <div className="space-y-1.5">
      {items.map(c => (
        <div key={c.id} className="group p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/10 transition-all">
          <div className="flex flex-wrap items-start gap-3">
            <button onClick={() => onAbrir(c)} className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${pipelineDot(c.pipeline)}`} />
                <p className="font-medium text-white truncate">{c.apellido_nombre}</p>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${PIPELINE_FEDERAL_COLORS[c.pipeline]}`}>
                  {PIPELINE_FEDERAL_LABELS[c.pipeline]}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1 pl-4">
                {c.cuil && <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" />{c.cuil}</span>}
                {c.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.telefono}</span>}
                {c.numero_expediente && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />Expte: <span className="font-mono text-gray-300">{c.numero_expediente}</span></span>}
              </div>
              {(c.tipo_caso || []).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5 pl-4">
                  {c.tipo_caso.map(t => (
                    <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-300 border border-blue-500/30">
                      {TIPO_CASO_FEDERAL_LABELS[t]}
                    </span>
                  ))}
                </div>
              )}
            </button>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEditar(c)} className="p-1.5 rounded-md text-gray-500 hover:text-blue-400 hover:bg-blue-400/10" title="Editar">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onEliminar(c)} className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10" title="Eliminar">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Dot color por pipeline (mismo enfoque que CasosGenerales con eDot)
function pipelineDot(p: PipelineFederal): string {
  switch (p) {
    case 'activo': return 'bg-emerald-500';
    case 'esperando_audiencia': return 'bg-blue-500';
    case 'esperando_sentencia': return 'bg-cyan-500';
    case 'analisis_sin_directivas': return 'bg-orange-500';
    case 'sin_pago': return 'bg-red-500';
    case 'seguimiento': return 'bg-purple-500';
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
  // Usamos useRef para no depender del closure del estado en onDrop
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
