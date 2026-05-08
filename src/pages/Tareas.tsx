import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, ListTodo, Columns3, Calendar as CalendarIcon,
  Clock, CheckCircle, AlertTriangle, Trash2, User, X, Paperclip,
  Filter, Edit2, FileDown, Briefcase, FileText, ArrowRight, Eye,
  ExternalLink, Users, ChevronUp, ChevronDown, GripVertical,
} from 'lucide-react';
import { useTareas, uploadTareaAdjunto, getTareaAdjuntoUrl } from '../hooks/useTareas';
import { useTareaPasos, useTareasConPasos, TareaPaso } from '../hooks/useTareaPasos';
import { useCases } from '../hooks/useCases';
import { useCasosGenerales } from '../hooks/useCasosGenerales';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import { notificarSiguientePaso } from '../lib/tareaPasosNotify';
import { useAvatarUrl } from '../hooks/useAvatarUrl';
import NotasFeedPanel from '../components/cases/NotasFeedPanel';
import {
  TareaCompleta, EstadoTareaGeneral, PrioridadTareaGeneral,
  ESTADO_TAREA_GENERAL_LABELS, PRIORIDAD_TAREA_GENERAL_LABELS,
  PRIORIDAD_TAREA_GENERAL_COLORS,
} from '../types/database';

const ESTADO_COLORS: Record<EstadoTareaGeneral, string> = {
  // Verde flúor sólido para tareas en curso (alta visibilidad)
  en_curso: 'bg-lime-400 text-black border-lime-300 shadow-[0_0_14px_rgba(190,242,100,0.6)] font-bold',
  // Esmeralda para completadas
  completada: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
};

const PRIORIDAD_COLORS_V2: Record<PrioridadTareaGeneral, string> = {
  alta: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  media: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  sin_prioridad: 'bg-white/5 text-gray-400 border-white/10',
};

interface PerfilLite { id: string; nombre: string; rol: string }

export default function Tareas() {
  const { user } = useAuth();
  const { tareas, loading, upsert, completar, reabrir, archivar } = useTareas();
  const { casos } = useCases();
  const { casos: casosGenerales } = useCasosGenerales();
  const [perfiles, setPerfiles] = useState<PerfilLite[]>([]);

  const [view, setView] = useState<'lista' | 'kanban' | 'calendario' | 'responsable' | 'compartidas'>('lista');
  const { data: tareasConPasos } = useTareasConPasos();
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoTareaGeneral | 'all'>('all');
  const [filterPrioridad, setFilterPrioridad] = useState<PrioridadTareaGeneral | 'all'>('all');
  const [filterResponsable, setFilterResponsable] = useState<string>('all');
  const [filterSemana, setFilterSemana] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<TareaCompleta | null>(null);
  const [drawerCaso, setDrawerCaso] = useState<{ type: 'general' | 'legal'; id: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // Abrir tarea via ?focus=<id> (link desde notificacion / alarma)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (!focusId || !tareas.length) return;
    const t = tareas.find(x => x.id === focusId);
    if (t) {
      setSelected(t);
      setModalOpen(true);
      // limpiar query param
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, tareas, setSearchParams]);

  useEffect(() => {
    supabase.from('perfiles').select('id, nombre, rol').eq('activo', true).then(({ data }) => {
      if (data) setPerfiles(data as PerfilLite[]);
    });
  }, []);

  const isVencida = (t: TareaCompleta) =>
    !!t.fecha_limite && new Date(t.fecha_limite) < new Date() && t.estado !== 'completada';

  const inSemana = (t: TareaCompleta) => {
    if (!t.fecha_limite) return false;
    const f = new Date(t.fecha_limite);
    const hoy = new Date();
    const en7 = new Date(); en7.setDate(hoy.getDate() + 7);
    return f >= hoy && f <= en7;
  };

  const filtered = useMemo(() => {
    return tareas.filter(t => {
      const s = search.toLowerCase();
      const matchSearch = !s || t.titulo.toLowerCase().includes(s) ||
        (t.cliente_nombre || '').toLowerCase().includes(s) ||
        (t.responsable_nombre || '').toLowerCase().includes(s) ||
        (t.expediente || '').toLowerCase().includes(s);
      const matchEstado = filterEstado === 'all' || t.estado === filterEstado;
      const matchPrioridad = filterPrioridad === 'all' || t.prioridad === filterPrioridad;
      const matchResp = filterResponsable === 'all' || t.responsable_id === filterResponsable;
      const matchSemana = !filterSemana || inSemana(t);
      return matchSearch && matchEstado && matchPrioridad && matchResp && matchSemana;
    });
  }, [tareas, search, filterEstado, filterPrioridad, filterResponsable, filterSemana]);

  const tareasVencidas = tareas.filter(isVencida).length;

  // Calendario: agrupar por fecha_limite (yyyy-mm-dd)
  const calendarMap = useMemo(() => {
    const map = new Map<string, TareaCompleta[]>();
    filtered.forEach(t => {
      if (!t.fecha_limite) return;
      const key = t.fecha_limite.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [filtered]);

  const handleArchivar = async (t: TareaCompleta) => {
    if (confirmDel === t.id) {
      await archivar(t.id, user?.id || '');
      setConfirmDel(null);
    } else {
      setConfirmDel(t.id);
      setTimeout(() => setConfirmDel(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <ListTodo className="w-5 h-5 text-white" />
            </div>
            Seguimiento de Tareas
          </h1>
          <p className="text-sm text-gray-500 mt-1 ml-[52px]">
            {tareas.length} activas {tareasVencidas > 0 && <span className="text-red-400">· {tareasVencidas} vencidas</span>}
          </p>
        </div>
        <button onClick={() => { setSelected(null); setModalOpen(true); }} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nueva Tarea
        </button>
      </div>

      {/* Filters */}
      <div className="glass-card p-3 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="input-dark pl-10 text-sm w-full" placeholder="Buscar por tarea, cliente, expediente…" />
          </div>
          <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl shrink-0">
            {[
              { id: 'lista', icon: ListTodo, label: 'Lista' },
              { id: 'kanban', icon: Columns3, label: 'Kanban' },
              { id: 'calendario', icon: CalendarIcon, label: 'Calendario' },
              { id: 'responsable', icon: User, label: 'Responsable' },
              { id: 'compartidas', icon: Users, label: 'Compartidas' },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  view === v.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
                }`}>
                <v.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as any)} className="select-dark text-xs py-1.5 min-w-[140px]">
            <option value="all">Todos los estados</option>
            <option value="en_curso">En curso</option>
            <option value="completada">Completada</option>
          </select>
          <select value={filterPrioridad} onChange={e => setFilterPrioridad(e.target.value as any)} className="select-dark text-xs py-1.5 min-w-[140px]">
            <option value="all">Todas las prioridades</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="sin_prioridad">Sin prioridad</option>
          </select>
          <select value={filterResponsable} onChange={e => setFilterResponsable(e.target.value)} className="select-dark text-xs py-1.5 min-w-[160px]">
            <option value="all">Todos los responsables</option>
            {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button onClick={() => setFilterSemana(s => !s)}
            className={`text-xs px-3 py-1.5 rounded-xl border transition-colors flex items-center gap-1.5 ${
              filterSemana ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'border-white/10 text-gray-500 hover:text-white'
            }`}>
            <Filter className="w-3 h-3" /> Esta semana
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <ListTodo className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No hay tareas que mostrar</p>
        </div>
      ) : view === 'lista' ? (
        <ListaView tareas={filtered} onOpen={t => { setSelected(t); setModalOpen(true); }}
          onOpenCaso={(type, id) => setDrawerCaso({ type, id })}
          onCompletar={id => completar(id, user?.id || '')}
          onReabrir={id => reabrir(id, user?.id || '')}
          onArchivar={handleArchivar} confirmDel={confirmDel} isVencida={isVencida} />
      ) : view === 'kanban' ? (
        <KanbanView tareas={filtered} onOpen={t => { setSelected(t); setModalOpen(true); }} isVencida={isVencida} />
      ) : view === 'calendario' ? (
        <CalendarioView calendarMap={calendarMap} onOpen={t => { setSelected(t); setModalOpen(true); }} />
      ) : view === 'responsable' ? (
        <ResponsableView tareas={filtered} perfiles={perfiles}
          onOpen={t => { setSelected(t); setModalOpen(true); }} isVencida={isVencida} />
      ) : (
        <CompartidasView tareas={tareas} tareasConPasos={tareasConPasos}
          currentUserId={user?.id || ''}
          onOpen={t => { setSelected(t); setModalOpen(true); }} />
      )}

      {modalOpen && (
        <TareaModal
          tarea={selected}
          casos={casos}
          casosGenerales={casosGenerales}
          perfiles={perfiles}
          onClose={() => { setModalOpen(false); setSelected(null); }}
          onSave={async (t, pasosNuevos) => {
            const saved = await upsert(t, user?.id || '');
            if (!saved) return;
            // Si era una tarea nueva y trajo pasos locales, los insertamos ahora
            const tareaId = (saved as any)?.id || t.id;
            if (tareaId && pasosNuevos && pasosNuevos.length > 0) {
              const rows = pasosNuevos
                .filter(p => p.descripcion.trim())
                .map((p, i) => ({
                  tarea_id: tareaId,
                  orden: i + 1,
                  descripcion: p.descripcion.trim(),
                  responsable_id: p.responsable_id || null,
                }));
              if (rows.length > 0) {
                await supabase.from('tarea_pasos').insert(rows);
              }
            }
            setModalOpen(false); setSelected(null);
          }}
        />
      )}

      {drawerCaso && (
        <CasoDetalleDrawer
          tipo={drawerCaso.type}
          casoId={drawerCaso.id}
          onClose={() => setDrawerCaso(null)}
          onOpenTarea={(t) => { setDrawerCaso(null); setSelected(t); setModalOpen(true); }}
        />
      )}
    </div>
  );
}

// ============================================
// MiniAvatar
// ============================================
function MiniAvatar({ path, nombre, size = 24 }: { path?: string | null; nombre?: string | null; size?: number }) {
  const url = useAvatarUrl(path);
  const initial = (nombre || '?').trim().charAt(0).toUpperCase();
  if (url) {
    return <img src={url} alt={nombre || ''} className="rounded-full object-cover ring-1 ring-white/10" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 ring-1 ring-white/10 flex items-center justify-center text-white font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {initial}
    </div>
  );
}

// ============================================
// CasoInfoBar (clickable -> abre drawer con todo el caso)
// ============================================
function CasoInfoBar({ t, onOpenCaso }: {
  t: TareaCompleta;
  onOpenCaso?: (type: 'general' | 'legal', id: string) => void;
}) {
  const hasCasoGeneral = !!t.caso_general_id;
  const hasCaso = !!t.caso_id;
  if (!hasCasoGeneral && !hasCaso) return null;
  const palette = hasCasoGeneral
    ? { bg: 'bg-violet-500/[0.08]', hover: 'hover:bg-violet-500/[0.15]', border: 'border-violet-500/30', icon: 'text-violet-300', text: 'text-violet-100', mono: 'text-violet-400/80' }
    : { bg: 'bg-emerald-500/[0.08]', hover: 'hover:bg-emerald-500/[0.15]', border: 'border-emerald-500/30', icon: 'text-emerald-300', text: 'text-emerald-100', mono: 'text-emerald-400/80' };
  return (
    <button type="button"
      onClick={e => {
        e.stopPropagation();
        if (onOpenCaso) onOpenCaso(hasCasoGeneral ? 'general' : 'legal', (hasCasoGeneral ? t.caso_general_id : t.caso_id) as string);
      }}
      className={`mt-2.5 w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${palette.bg} ${palette.hover} ${palette.border} text-[11px] text-left group`}
      title="Ver detalle completo del caso">
      {hasCasoGeneral ? <Briefcase className={`w-3.5 h-3.5 flex-shrink-0 ${palette.icon}`} /> : <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${palette.icon}`} />}
      <span className={`font-semibold truncate ${palette.text}`}>
        {hasCasoGeneral ? t.caso_general_titulo : t.cliente_nombre}
      </span>
      {(hasCasoGeneral ? t.caso_general_expediente : t.expediente_caso) && (
        <span className={`font-mono text-[10px] truncate ${palette.mono}`}>· {hasCasoGeneral ? t.caso_general_expediente : t.expediente_caso}</span>
      )}
      <span className={`ml-auto text-[10px] ${palette.mono} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0`}>
        Ver caso <ArrowRight className="w-3 h-3" />
      </span>
    </button>
  );
}

// ============================================
// ListaView
// ============================================
function ListaView({ tareas, onOpen, onOpenCaso, onCompletar, onReabrir, onArchivar, confirmDel, isVencida }: {
  tareas: TareaCompleta[]; onOpen: (t: TareaCompleta) => void;
  onOpenCaso: (type: 'general' | 'legal', id: string) => void;
  onCompletar: (id: string) => void; onReabrir: (id: string) => void;
  onArchivar: (t: TareaCompleta) => void; confirmDel: string | null;
  isVencida: (t: TareaCompleta) => boolean;
}) {
  if (tareas.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <ListTodo className="w-10 h-10 text-gray-700 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No hay tareas que coincidan con los filtros</p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {tareas.map((t, i) => {
        const vencida = isVencida(t);
        const completada = t.estado === 'completada';
        return (
        <div key={t.id}
          className={`glass-card p-4 cursor-pointer hover:bg-white/[0.04] transition-all animate-fade-in ${
            vencida ? 'border-red-500/30 ring-1 ring-red-500/10' : ''
          } ${completada ? 'opacity-70' : ''}`}
          style={{ animationDelay: `${i * 20}ms` }}
          onClick={() => onOpen(t)}>

          {/* Row 1: checkbox + título  ---  estado + acciones */}
          <div className="flex items-center gap-3">
            <button onClick={e => { e.stopPropagation(); completada ? onReabrir(t.id) : onCompletar(t.id); }}
              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                completada ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-600 hover:border-violet-400'
              }`}>
              {completada && <CheckCircle className="w-3.5 h-3.5" />}
            </button>
            <h4 className={`text-sm font-semibold flex-1 min-w-0 truncate ${completada ? 'text-gray-500 line-through' : 'text-white'}`}>
              {t.titulo}
            </h4>
            {t.adjunto_path && <Paperclip className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />}
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${ESTADO_COLORS[t.estado]}`}>
              {ESTADO_TAREA_GENERAL_LABELS[t.estado]}
            </span>
            <button onClick={e => { e.stopPropagation(); onArchivar(t); }}
              className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                confirmDel === t.id ? 'bg-red-500/20 text-red-400' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'
              }`}
              title={confirmDel === t.id ? 'Click otra vez para archivar' : 'Archivar'}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Row 2: caso info bar (full width, color según tipo) */}
          <CasoInfoBar t={t} onOpenCaso={onOpenCaso} />

          {/* Row 3: grid simétrico  [personas]  [chips meta]  */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            {/* Izquierda: creador → responsable */}
            <div className="flex items-center gap-2 text-[11px] text-gray-400 min-w-0">
              {t.creado_por_nombre && (
                <div className="flex items-center gap-1.5 min-w-0" title={`Creada por ${t.creado_por_nombre}`}>
                  <MiniAvatar path={t.creado_por_avatar} nombre={t.creado_por_nombre} size={22} />
                  <span className="truncate text-gray-400">{t.creado_por_nombre}</span>
                </div>
              )}
              {t.responsable_nombre && (
                <>
                  <ArrowRight className="w-3 h-3 text-violet-400/60 flex-shrink-0" />
                  <div className="flex items-center gap-1.5 min-w-0" title={`Asignada a ${t.responsable_nombre}`}>
                    <MiniAvatar path={t.responsable_avatar} nombre={t.responsable_nombre} size={22} />
                    <span className="text-white font-medium truncate">{t.responsable_nombre}</span>
                  </div>
                </>
              )}
              {t.visto_por_asignado && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full flex-shrink-0" title="Visto por el responsable">
                  <Eye className="w-3 h-3" /> Visto
                </span>
              )}
            </div>

            {/* Derecha: chips de meta (prioridad / vencida / fecha / cargo_hora) */}
            <div className="flex items-center justify-end gap-1.5 flex-wrap">
              {t.prioridad !== 'sin_prioridad' && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${PRIORIDAD_COLORS_V2[t.prioridad]}`}>
                  {PRIORIDAD_TAREA_GENERAL_LABELS[t.prioridad]}
                </span>
              )}
              {vencida && (
                <span className="flex items-center gap-1 text-[10px] text-red-300 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                  <AlertTriangle className="w-2.5 h-2.5" /> Vencida
                </span>
              )}
              {t.fecha_limite && (
                <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${
                  vencida ? 'bg-red-500/10 text-red-300 border-red-500/20' : 'bg-white/5 text-gray-300 border-white/10'
                }`}>
                  <Clock className="w-2.5 h-2.5" />
                  {new Date(t.fecha_limite).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                </span>
              )}
              {t.cargo_hora && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-orange-500/15 text-orange-300 border-orange-500/30 whitespace-nowrap">
                  {t.cargo_hora}
                </span>
              )}
            </div>
          </div>

          {t.observaciones_demora && (
            <div className="mt-2.5 flex items-start gap-2 px-3 py-2 rounded-xl border border-orange-500/20 bg-orange-500/[0.06]">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-orange-300" />
              <p className="text-[11px] text-orange-200 italic">{t.observaciones_demora}</p>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

// ============================================
// KanbanView
// ============================================
function KanbanView({ tareas, onOpen, isVencida }: {
  tareas: TareaCompleta[]; onOpen: (t: TareaCompleta) => void; isVencida: (t: TareaCompleta) => boolean;
}) {
  const estados: EstadoTareaGeneral[] = ['en_curso', 'completada'];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {estados.map(estado => {
        const list = tareas.filter(t => t.estado === estado);
        return (
          <div key={estado} className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-2">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ESTADO_COLORS[estado]}`}>
                {ESTADO_TAREA_GENERAL_LABELS[estado]}
              </span>
              <span className="text-xs text-gray-600">{list.length}</span>
            </div>
            <div className="space-y-2 min-h-[160px]">
              {list.map(t => (
                <div key={t.id} onClick={() => onOpen(t)}
                  className={`glass-card p-3 cursor-pointer hover:bg-white/[0.04] transition-all ${isVencida(t) ? 'border-red-500/30' : ''}`}>
                  <h4 className="text-xs font-semibold text-white mb-1 line-clamp-2">{t.titulo}</h4>
                  {(t.caso_general_titulo || t.cliente_nombre) && (
                    <p className="text-[10px] truncate flex items-center gap-1">
                      {t.caso_general_titulo
                        ? <><Briefcase className="w-2.5 h-2.5 text-violet-400" /> <span className="text-violet-300">{t.caso_general_titulo}</span></>
                        : <><FileText className="w-2.5 h-2.5 text-emerald-400" /> <span className="text-emerald-300">{t.cliente_nombre}</span></>}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-1.5 mt-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {t.prioridad !== 'sin_prioridad' && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${PRIORIDAD_COLORS_V2[t.prioridad]}`}>
                          {PRIORIDAD_TAREA_GENERAL_LABELS[t.prioridad]}
                        </span>
                      )}
                      {isVencida(t) && <AlertTriangle className="w-3 h-3 text-red-400" />}
                      {t.adjunto_path && <Paperclip className="w-3 h-3 text-gray-500" />}
                    </div>
                    {t.responsable_nombre && (
                      <MiniAvatar path={t.responsable_avatar} nombre={t.responsable_nombre} size={20} />
                    )}
                  </div>
                </div>
              ))}
              {list.length === 0 && <div className="text-center py-6 text-gray-700 text-xs">Vacío</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// CalendarioView (mes actual)
// ============================================
function CalendarioView({ calendarMap, onOpen }: {
  calendarMap: Map<string, TareaCompleta[]>; onOpen: (t: TareaCompleta) => void;
}) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // lunes=0
  const days: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const monthName = cursor.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="text-xs text-gray-500 hover:text-white px-2 py-1">‹ Anterior</button>
        <h3 className="text-sm font-semibold text-white capitalize">{monthName}</h3>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="text-xs text-gray-500 hover:text-white px-2 py-1">Siguiente ›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
          <div key={d} className="text-[10px] text-gray-600 text-center font-medium uppercase tracking-wider">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          if (!d) return <div key={i} className="aspect-square" />;
          const list = calendarMap.get(fmt(d)) || [];
          const isToday = fmt(d) === fmt(new Date());
          return (
            <div key={i} className={`aspect-square min-h-[60px] p-1.5 rounded-lg border text-[10px] overflow-hidden ${
              isToday ? 'bg-blue-500/10 border-blue-500/30' : list.length ? 'bg-white/[0.02] border-white/5' : 'border-transparent'
            }`}>
              <div className={`text-[10px] font-semibold mb-1 ${isToday ? 'text-blue-300' : 'text-gray-500'}`}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map(t => (
                  <div key={t.id} onClick={() => onOpen(t)}
                    className={`truncate px-1 py-0.5 rounded cursor-pointer hover:bg-white/10 ${
                      t.prioridad === 'alta' ? 'text-red-300' : t.prioridad === 'media' ? 'text-amber-300' : 'text-gray-400'
                    }`}
                    title={t.titulo}>
                    • {t.titulo}
                  </div>
                ))}
                {list.length > 3 && <div className="text-gray-600 px-1">+{list.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// ResponsableView
// ============================================
function ResponsableView({ tareas, perfiles, onOpen, isVencida }: {
  tareas: TareaCompleta[]; perfiles: PerfilLite[]; onOpen: (t: TareaCompleta) => void;
  isVencida: (t: TareaCompleta) => boolean;
}) {
  const grupos = useMemo(() => {
    const map = new Map<string, { nombre: string; rol?: string; tareas: TareaCompleta[] }>();
    map.set('__sin', { nombre: 'Sin responsable', tareas: [] });
    perfiles.forEach(p => map.set(p.id, { nombre: p.nombre, rol: p.rol, tareas: [] }));
    tareas.forEach(t => {
      const k = t.responsable_id || '__sin';
      if (!map.has(k)) map.set(k, { nombre: t.responsable_nombre || 'Otro', tareas: [] });
      map.get(k)!.tareas.push(t);
    });
    return Array.from(map.entries()).filter(([, v]) => v.tareas.length > 0);
  }, [tareas, perfiles]);

  return (
    <div className="space-y-4">
      {grupos.map(([id, g]) => {
        const pendientes = g.tareas.filter(t => t.estado !== 'completada');
        const vencidas = pendientes.filter(isVencida);
        const completadas = g.tareas.length - pendientes.length;
        const altas = pendientes.filter(t => t.prioridad === 'alta').length;
        const avatarPath = g.tareas.find(t => t.responsable_avatar)?.responsable_avatar || null;
        return (
          <div key={id} className="glass-card p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                {id === '__sin'
                  ? <User className="w-4 h-4 text-gray-500" />
                  : <MiniAvatar path={avatarPath} nombre={g.nombre} size={28} />}
                {g.nombre}
                {g.rol && <span className="text-[10px] text-gray-600 uppercase">· {g.rol}</span>}
              </h3>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {pendientes.length} pendientes
                </span>
                {vencidas.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                    {vencidas.length} vencidas
                  </span>
                )}
                {altas > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {altas} alta prioridad
                  </span>
                )}
                {completadas > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {completadas} completadas
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              {g.tareas
                .slice()
                .sort((a, b) => {
                  // vencidas primero, luego por prioridad, luego por fecha_limite
                  const va = isVencida(a) ? 0 : 1;
                  const vb = isVencida(b) ? 0 : 1;
                  if (va !== vb) return va - vb;
                  const pOrd: Record<string, number> = { alta: 0, media: 1, sin_prioridad: 2 };
                  const pa = pOrd[a.prioridad] ?? 9;
                  const pb = pOrd[b.prioridad] ?? 9;
                  if (pa !== pb) return pa - pb;
                  return (a.fecha_limite || '').localeCompare(b.fecha_limite || '');
                })
                .map(t => (
                  <div key={t.id} onClick={() => onOpen(t)}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-white/[0.04] ${
                      isVencida(t) ? 'border border-red-500/20 bg-red-500/[0.03]' : ''
                    } ${t.estado === 'completada' ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        t.prioridad === 'alta' ? 'bg-red-500' : t.prioridad === 'media' ? 'bg-amber-500' : 'bg-gray-500'
                      }`} />
                      <span className={`text-xs truncate ${t.estado === 'completada' ? 'text-gray-500 line-through' : 'text-white'}`}>{t.titulo}</span>
                      {t.caso_general_titulo
                        ? <span className="text-[10px] text-violet-300 truncate flex items-center gap-1"><Briefcase className="w-2.5 h-2.5" /> {t.caso_general_titulo}</span>
                        : t.cliente_nombre && <span className="text-[10px] text-emerald-300/80 truncate flex items-center gap-1"><FileText className="w-2.5 h-2.5" /> {t.cliente_nombre}</span>}
                      {t.cargo_hora && <span className="text-[10px] text-orange-300 flex-shrink-0">⏰ {t.cargo_hora}</span>}
                    </div>
                    {t.fecha_limite && (
                      <span className={`text-[10px] flex-shrink-0 ${isVencida(t) ? 'text-red-400' : 'text-gray-600'}`}>
                        {new Date(t.fecha_limite).toLocaleDateString('es-AR')}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// TareaModal
// ============================================
function TareaModal({ tarea, casos, casosGenerales, perfiles, onClose, onSave }: {
  tarea: TareaCompleta | null;
  casos: any[];
  casosGenerales: any[];
  perfiles: PerfilLite[];
  onClose: () => void;
  onSave: (t: any, pasosNuevos?: { descripcion: string; responsable_id: string }[]) => void;
}) {
  const [form, setForm] = useState({
    id: tarea?.id,
    titulo: tarea?.titulo || '',
    caso_id: tarea?.caso_id || '',
    caso_general_id: tarea?.caso_general_id || '',
    descripcion: tarea?.descripcion || '',
    culminacion: tarea?.culminacion || '',
    cargo_hora: tarea?.cargo_hora || '',
    cargo_hora_favor: tarea?.cargo_hora_favor || '',
    cargo_hora_favor_fecha: tarea?.cargo_hora_favor_fecha || '',
    estado: tarea?.estado || 'en_curso',
    prioridad: tarea?.prioridad || 'sin_prioridad',
    fecha_limite: tarea?.fecha_limite || '',
    responsable_id: tarea?.responsable_id || '',
    observaciones_demora: tarea?.observaciones_demora || '',
    adjunto_path: tarea?.adjunto_path || '',
    adjunto_nombre: tarea?.adjunto_nombre || '',
  });
  const [uploading, setUploading] = useState(false);
  const [adjuntoUrl, setAdjuntoUrl] = useState<string | null>(null);
  // Pasos locales cuando estamos creando una nueva (sin id todavía)
  const [pasosLocales, setPasosLocales] = useState<{ descripcion: string; responsable_id: string }[]>([]);

  useEffect(() => {
    if (form.adjunto_path) {
      getTareaAdjuntoUrl(form.adjunto_path).then(setAdjuntoUrl);
    }
  }, [form.adjunto_path]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const tempId = form.id || `tmp-${Date.now()}`;
    const r = await uploadTareaAdjunto(f, tempId);
    if (r) setForm(s => ({ ...s, adjunto_path: r.path, adjunto_nombre: r.nombre }));
    setUploading(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) return;
    onSave({
      ...form,
      caso_id: form.caso_id || null,
      caso_general_id: form.caso_general_id || null,
      responsable_id: form.responsable_id || null,
      fecha_limite: form.fecha_limite || null,
      cargo_hora_favor: form.cargo_hora_favor.trim() || null,
      cargo_hora_favor_fecha: form.cargo_hora_favor_fecha || null,
    }, form.id ? undefined : pasosLocales);
  };

  const casoSeleccionado = useMemo(() => {
    if (form.caso_general_id) {
      const c = casosGenerales.find((x: any) => x.id === form.caso_general_id);
      return c ? { tipo: 'general' as const, data: c } : null;
    }
    if (form.caso_id) {
      const c = casos.find((x: any) => x.id === form.caso_id);
      return c ? { tipo: 'legal' as const, data: c } : null;
    }
    return null;
  }, [form.caso_id, form.caso_general_id, casos, casosGenerales]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <form onSubmit={submit} className="glass-card w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header sticky */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            {tarea ? <><Edit2 className="w-4 h-4" /> Editar tarea</> : <><Plus className="w-4 h-4" /> Nueva tarea</>}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-white/5"><X className="w-5 h-5" /></button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Título *</label>
          <input value={form.titulo} onChange={e => setForm(s => ({ ...s, titulo: e.target.value }))}
            className="input-dark text-sm mt-1" required autoFocus placeholder="Ej: Presentar escrito de pronto despacho" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1"><FileText className="w-3 h-3 text-emerald-400" /> Cliente / Caso legal</label>
            <select value={form.caso_id} onChange={e => setForm(s => ({ ...s, caso_id: e.target.value, caso_general_id: e.target.value ? '' : s.caso_general_id }))} className="select-dark text-sm mt-1">
              <option value="">— Sin vincular —</option>
              {casos.map((c: any) => (
                <option key={c.id} value={c.id}>{c.nombre_apellido} {c.expediente ? `· ${c.expediente}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1"><Briefcase className="w-3 h-3 text-violet-400" /> Caso general</label>
            <select value={form.caso_general_id} onChange={e => setForm(s => ({ ...s, caso_general_id: e.target.value, caso_id: e.target.value ? '' : s.caso_id }))} className="select-dark text-sm mt-1">
              <option value="">— Sin vincular —</option>
              {casosGenerales.filter((c: any) => !c.archivado).map((c: any) => (
                <option key={c.id} value={c.id}>{c.titulo}{c.expediente ? ` · ${c.expediente}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Responsable</label>
            <select value={form.responsable_id} onChange={e => setForm(s => ({ ...s, responsable_id: e.target.value }))} className="select-dark text-sm mt-1">
              <option value="">— Sin asignar —</option>
              {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.rol === 'procurador' ? '(Procurador)' : ''}</option>)}
            </select>
          </div>
        </div>

        {/* Panel con TODA la info del caso seleccionado */}
        {casoSeleccionado && <CasoInlineInfo tipo={casoSeleccionado.tipo} caso={casoSeleccionado.data} />}

        {/* PASOS COMPARTIDOS (arriba para que se vea sin scrollear) */}
        {form.id ? (
          <PasosEditor tareaId={form.id} perfiles={perfiles} />
        ) : (
          <PasosEditorLocal pasos={pasosLocales} setPasos={setPasosLocales} perfiles={perfiles} />
        )}

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Descripción</label>
          <textarea value={form.descripcion} onChange={e => setForm(s => ({ ...s, descripcion: e.target.value }))}
            className="input-dark text-sm mt-1" rows={3} placeholder="Detalle completo de qué hay que hacer y por qué" />
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Culminación / Avance</label>
          <textarea value={form.culminacion} onChange={e => setForm(s => ({ ...s, culminacion: e.target.value }))}
            className="input-dark text-sm mt-1" rows={2} placeholder="Lo que se fue haciendo. Se actualiza a medida que avanza." />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Estado</label>
            <select value={form.estado} onChange={e => setForm(s => ({ ...s, estado: e.target.value as any }))} className="select-dark text-sm mt-1">
              <option value="en_curso">En curso</option>
              <option value="completada">Completada</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Prioridad</label>
            <select value={form.prioridad} onChange={e => setForm(s => ({ ...s, prioridad: e.target.value as any }))} className="select-dark text-sm mt-1">
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="sin_prioridad">Sin prioridad</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Fecha límite</label>
            <input type="date" value={form.fecha_limite} onChange={e => setForm(s => ({ ...s, fecha_limite: e.target.value }))}
              className="input-dark text-sm mt-1" />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-red-400" /> Cargo de hora EN CONTRA (mi vencimiento)
          </label>
          <input value={form.cargo_hora} onChange={e => setForm(s => ({ ...s, cargo_hora: e.target.value }))}
            className="input-dark text-sm mt-1" placeholder="Ej: vence 30/04 a las 12hs" />
          {form.cargo_hora.trim() && (
            <div className={`mt-2 px-3 py-2 rounded-lg text-[11px] flex items-start gap-2 border ${
              form.fecha_limite
                ? 'bg-lime-400/10 text-lime-200 border-lime-400/30'
                : 'bg-red-500/10 text-red-200 border-red-500/40'
            }`}>
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Recordatorio</p>
                <p className="opacity-90">
                  Cuando carg\u00e1s un cargo de hora en contra, la <b>Fecha l\u00edmite</b> es OBLIGATORIA.
                  Te avisaremos al responsable <b>2 d\u00edas antes</b> y otra vez si la tarea no se realiza.
                </p>
                {!form.fecha_limite && <p className="mt-1 font-bold">⚠ Falta cargar la fecha límite arriba.</p>}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" /> Cargo de hora A FAVOR (vence plazo de la contraparte)
            </label>
            <input value={form.cargo_hora_favor} onChange={e => setForm(s => ({ ...s, cargo_hora_favor: e.target.value }))}
              className="input-dark text-sm mt-1" placeholder="Ej: traslado contestación demanda" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Fecha en que vence el plazo de la contraparte</label>
            <input type="date" value={form.cargo_hora_favor_fecha}
              onChange={e => setForm(s => ({ ...s, cargo_hora_favor_fecha: e.target.value }))}
              className="input-dark text-sm mt-1" />
          </div>
          {(form.cargo_hora_favor.trim() || form.cargo_hora_favor_fecha) && (
            <div className="sm:col-span-2 mt-1 px-3 py-2 rounded-lg text-[11px] flex items-start gap-2 border bg-emerald-500/10 text-emerald-100 border-emerald-500/40">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Aviso automático de PRESENTAR ESCRITO</p>
                <p className="opacity-90">
                  El día que llegue esa fecha (y los días siguientes hasta marcar la tarea como completada),
                  el sistema avisará que <b>venció el plazo de la contraparte</b> y hay que <b>presentar el escrito</b> para dejar la causa al día.
                </p>
                {!form.cargo_hora_favor_fecha && form.cargo_hora_favor.trim() && (
                  <p className="mt-1 font-bold">⚠ Cargate la fecha exacta para que dispare la alarma.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Observaciones de demora</label>
          <input value={form.observaciones_demora} onChange={e => setForm(s => ({ ...s, observaciones_demora: e.target.value }))}
            className="input-dark text-sm mt-1" placeholder="Ej: al 15/04 sin avance por falta de poder del cliente" />
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Adjunto</label>
          <div className="flex items-center gap-2 mt-1">
            <input type="file" onChange={handleFile} disabled={uploading}
              className="text-xs text-gray-400 file:bg-white/10 file:border-0 file:rounded-lg file:px-3 file:py-1.5 file:text-xs file:text-white file:cursor-pointer hover:file:bg-white/20" />
            {uploading && <span className="text-[10px] text-gray-500">Subiendo...</span>}
            {form.adjunto_nombre && (
              <span className="text-[10px] text-gray-400 flex items-center gap-1 truncate">
                <Paperclip className="w-3 h-3" />
                {adjuntoUrl ? <a href={adjuntoUrl} target="_blank" rel="noreferrer" className="hover:text-white underline truncate">{form.adjunto_nombre}</a> : form.adjunto_nombre}
              </span>
            )}
            {form.adjunto_path && (
              <button type="button" onClick={() => setForm(s => ({ ...s, adjunto_path: '', adjunto_nombre: '' }))}
                className="text-[10px] text-red-400 hover:text-red-300">Quitar</button>
            )}
          </div>
        </div>

        {/* PASOS COMPARTIDOS (movido arriba) */}
        </div>{/* /body */}

        {/* Footer sticky */}
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-white/[0.06] flex-shrink-0 bg-black/20">
          <button type="button" onClick={onClose} className="btn-secondary text-xs px-4 py-2">Cancelar</button>
          <button type="submit" className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================
// CasoInlineInfo — panel resumen del caso dentro del modal
// ============================================
function CasoInlineInfo({ tipo, caso }: { tipo: 'general' | 'legal'; caso: any }) {
  const palette = tipo === 'general'
    ? { bg: 'bg-violet-500/[0.08]', border: 'border-violet-500/30', text: 'text-violet-200', label: 'text-violet-400', icon: Briefcase, tag: 'Caso general' }
    : { bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/30', text: 'text-emerald-200', label: 'text-emerald-400', icon: FileText, tag: 'Caso legal' };
  const Icon = palette.icon;
  const fmt = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  const fields = tipo === 'general'
    ? [
        { label: 'Estado', val: caso.estado },
        { label: 'Tipo', val: caso.tipo_caso },
        { label: 'Abogado', val: caso.abogado },
        { label: 'Personería', val: caso.personeria },
        { label: 'Próx. audiencia', val: fmt(caso.audiencias) },
        { label: 'Vencimiento', val: fmt(caso.vencimiento) },
        { label: 'Estadísticas', val: caso.estadisticas_estado },
        { label: 'Radicado', val: caso.radicado },
      ]
    : [
        { label: 'Cliente', val: caso.nombre_apellido },
        { label: 'Expediente', val: caso.expediente, mono: true },
        { label: 'Tipo', val: caso.tipo_caso },
        { label: 'Estado', val: caso.estado },
        { label: 'Juzgado', val: caso.juzgado },
        { label: 'Carátula', val: caso.caratula },
      ];
  const visibles = fields.filter(f => f.val);

  return (
    <div className={`rounded-2xl border ${palette.border} ${palette.bg} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${palette.label}`} />
        <span className={`text-[10px] uppercase tracking-widest font-semibold ${palette.label}`}>{palette.tag}</span>
        <span className={`text-sm font-bold ${palette.text} truncate`}>{tipo === 'general' ? caso.titulo : caso.nombre_apellido}</span>
        {caso.expediente && <span className={`text-[10px] font-mono ${palette.label} ml-auto`}>{caso.expediente}</span>}
      </div>
      {visibles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {visibles.map(f => (
            <div key={f.label} className="bg-black/20 rounded-lg px-2 py-1.5 border border-white/[0.04]">
              <p className="text-[9px] text-gray-500 uppercase tracking-wider">{f.label}</p>
              <p className={`text-xs text-white truncate ${(f as any).mono ? 'font-mono' : ''}`}>{f.val}</p>
            </div>
          ))}
        </div>
      )}
      {tipo === 'general' && caso.url_drive && (
        <a href={caso.url_drive} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-violet-300 hover:text-violet-200">
          <ExternalLink className="w-3 h-3" /> Abrir en Drive
        </a>
      )}
    </div>
  );
}

// ============================================
// CasoDetalleDrawer — toda la info del caso + notas + tareas
// ============================================
function CasoDetalleDrawer({ tipo, casoId, onClose, onOpenTarea }: {
  tipo: 'general' | 'legal';
  casoId: string;
  onClose: () => void;
  onOpenTarea: (t: TareaCompleta) => void;
}) {
  const [caso, setCaso] = useState<any>(null);
  const [tareasCaso, setTareasCaso] = useState<TareaCompleta[]>([]);
  const [notas, setNotas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      // 1. cargar el caso
      let casoData: any = null;
      if (tipo === 'general') {
        const { data } = await supabase.from('casos_generales').select('*').eq('id', casoId).maybeSingle();
        casoData = data;
      } else {
        const { data } = await supabase.from('casos_completos').select('*').eq('id', casoId).maybeSingle();
        casoData = data;
      }
      if (!alive) return;
      setCaso(casoData);

      // 2. cargar tareas del caso (de la vista v2 con avatares)
      const filterCol = tipo === 'general' ? 'caso_general_id' : 'caso_id';
      let q = await supabase.from('tareas_completas_v2').select('*').eq(filterCol, casoId).eq('archivada', false).order('created_at', { ascending: false });
      if (q.error && (q.error.code === '42P01' || /does not exist/i.test(q.error.message))) {
        q = await supabase.from('tareas_completas').select('*').eq(filterCol, casoId).eq('archivada', false).order('created_at', { ascending: false });
      }
      if (!alive) return;
      setTareasCaso((q.data as TareaCompleta[]) || []);

      // 3. cargar notas (solo casos generales tienen notas)
      if (tipo === 'general') {
        let n = await supabase.from('caso_general_notas_completo').select('*').eq('caso_id', casoId).order('created_at', { ascending: false });
        if (n.error) n = await supabase.from('caso_general_notas').select('*').eq('caso_id', casoId).order('created_at', { ascending: false }) as any;
        if (!alive) return;
        setNotas(n.data || []);
      } else {
        setNotas([]);
      }
      setLoading(false);
    })();

    // realtime: refetch on changes
    const ch = supabase.channel(`caso-drawer-${casoId}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => {
        if (!alive) return;
        const filterCol = tipo === 'general' ? 'caso_general_id' : 'caso_id';
        supabase.from('tareas_completas_v2').select('*').eq(filterCol, casoId).eq('archivada', false).order('created_at', { ascending: false })
          .then(({ data }) => alive && data && setTareasCaso(data as TareaCompleta[]));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caso_general_notas' }, () => {
        if (!alive || tipo !== 'general') return;
        supabase.from('caso_general_notas_completo').select('*').eq('caso_id', casoId).order('created_at', { ascending: false })
          .then(({ data }) => alive && data && setNotas(data));
      })
      .subscribe();

    return () => { alive = false; supabase.removeChannel(ch); };
  }, [tipo, casoId]);

  const fmt = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (d: string | null | undefined) => d ? new Date(d).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

  const palette = tipo === 'general'
    ? { ring: 'ring-violet-500/30', text: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-500/30', icon: Briefcase }
    : { ring: 'ring-emerald-500/30', text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: FileText };
  const Icon = palette.icon;

  const titulo = tipo === 'general' ? caso?.titulo : caso?.nombre_apellido;
  const expediente = caso?.expediente;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`glass-card w-full max-w-3xl flex flex-col max-h-[90vh] border ${palette.border} shadow-2xl ring-1 ${palette.ring} animate-fade-in overflow-hidden`}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : !caso ? (
          <div className="p-8 text-center text-gray-500">
            <p>No se encontró el caso</p>
            <button onClick={onClose} className="mt-4 btn-secondary text-xs">Cerrar</button>
          </div>
        ) : (
          <>
            {/* Header sticky */}
            <div className={`flex items-start justify-between gap-3 px-6 py-4 border-b ${palette.border} flex-shrink-0 ${palette.bg}`}>
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${palette.bg} border ${palette.border}`}>
                  <Icon className={`w-5 h-5 ${palette.text}`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${palette.text}`}>
                    {tipo === 'general' ? 'Caso general' : 'Caso legal'}
                  </p>
                  <h2 className="text-xl font-bold text-white truncate">{titulo || 'Sin título'}</h2>
                  {expediente && <p className="text-xs text-gray-500 font-mono mt-0.5">{expediente}</p>}
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Datos del caso */}
            <div className="grid grid-cols-2 gap-2">
              {tipo === 'general' ? (
                <>
                  <Field label="Estado" value={caso.estado} chip="violet" />
                  <Field label="Tipo de caso" value={caso.tipo_caso} chip="violet" />
                  <Field label="Abogado" value={caso.abogado} />
                  <Field label="Personería" value={caso.personeria} chip="violet" />
                  <Field label="Próx. audiencia" value={fmt(caso.audiencias)} />
                  <Field label="Vencimiento" value={fmt(caso.vencimiento)} chip={caso.vencimiento ? 'orange' : undefined} />
                  <Field label="Estadísticas" value={caso.estadisticas_estado} chip={caso.estadisticas_estado === 'al día' ? 'emerald' : 'orange'} />
                  <Field label="Prioridad" value={caso.prioridad ? 'Sí' : 'No'} chip={caso.prioridad ? 'orange' : undefined} />
                </>
              ) : (
                <>
                  <Field label="Cliente" value={caso.nombre_apellido} chip="emerald" />
                  <Field label="Expediente" value={caso.expediente} mono chip="emerald" />
                  <Field label="Tipo" value={caso.tipo_caso} chip="emerald" />
                  <Field label="Estado" value={caso.estado} chip="emerald" />
                  <Field label="Juzgado" value={caso.juzgado} />
                  <Field label="Carátula" value={caso.caratula} full />
                  <Field label="Honorarios" value={caso.honorarios_total != null ? `$${Number(caso.honorarios_total).toLocaleString('es-AR')}` : null} chip="orange" />
                  <Field label="Fecha inicio" value={fmt(caso.fecha_inicio)} />
                </>
              )}
            </div>

            {tipo === 'general' && caso.radicado && (
              <Field label="Tribunal / Radicado" value={caso.radicado} full />
            )}
            {tipo === 'general' && caso.url_drive && (
              <a href={caso.url_drive} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs hover:bg-violet-500/20 transition-colors">
                <ExternalLink className="w-3.5 h-3.5" /> Abrir carpeta en Drive
              </a>
            )}
            {tipo === 'general' && caso.actualizacion && (
              <details className="bg-white/[0.025] rounded-xl border border-white/[0.05] group">
                <summary className="cursor-pointer px-3 py-2 flex items-center justify-between hover:bg-white/[0.03] rounded-xl">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Histórico</p>
                  <span className="text-[10px] text-gray-600 group-open:hidden">Ver ▾</span>
                  <span className="text-[10px] text-gray-600 hidden group-open:inline">Ocultar ▴</span>
                </summary>
                <div className="p-3 pt-0 border-t border-white/[0.04]">
                  <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{caso.actualizacion}</p>
                </div>
              </details>
            )}

            {/* Tareas del caso */}
            <div className="pt-4 border-t border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-violet-300" />
                  Tareas <span className="text-gray-500 font-normal">({tareasCaso.length})</span>
                </h3>
              </div>
              <div className="space-y-1.5">
                {tareasCaso.length === 0 && <p className="text-xs text-gray-600 italic">Este caso no tiene tareas todavía.</p>}
                {tareasCaso.map(t => (
                  <button key={t.id} onClick={() => onOpenTarea(t)}
                    className="w-full text-left flex items-center gap-2 p-2 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-white/10 transition-colors">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      t.estado === 'completada' ? 'bg-emerald-500' : t.prioridad === 'alta' ? 'bg-orange-500' : 'bg-violet-500'
                    }`} />
                    <span className={`text-xs flex-1 truncate ${t.estado === 'completada' ? 'text-gray-500 line-through' : 'text-white'}`}>{t.titulo}</span>
                    {t.responsable_nombre && <MiniAvatar path={t.responsable_avatar} nombre={t.responsable_nombre} size={18} />}
                    {t.fecha_limite && (
                      <span className="text-[10px] text-gray-500 flex-shrink-0">
                        {new Date(t.fecha_limite).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Notas + audio + dictado (solo caso general) */}
            {tipo === 'general' && (
              <div className="pt-4 border-t border-white/[0.06]">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-violet-300" />
                  Seguimiento — notas, audio y dictado
                </h3>
                <NotasFeedPanel casoId={casoId} />
              </div>
            )}
            </div>{/* /body */}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono, full, chip }: { label: string; value: any; mono?: boolean; full?: boolean; chip?: 'violet' | 'emerald' | 'orange' | 'amber' }) {
  if (!value) return null;
  const chipClass: Record<NonNullable<typeof chip>, string> = {
    violet:  'bg-violet-500/15 text-violet-200 border border-violet-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
    orange:  'bg-orange-500/15 text-orange-200 border border-orange-500/30',
    amber:   'bg-amber-500/15 text-amber-200 border border-amber-500/30',
  };
  return (
    <div className={`bg-white/[0.025] rounded-xl p-3 border border-white/[0.05] ${full ? 'col-span-2' : ''}`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">{label}</p>
      {chip ? (
        <span className={`inline-block text-xs font-semibold rounded-md px-2 py-1 ${chipClass[chip]} ${mono ? 'font-mono' : ''}`}>{value}</span>
      ) : (
        <p className={`text-sm text-white font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
      )}
    </div>
  );
}

// ============================================
// PasosEditorLocal — para tareas NUEVAS (sin id todavía).
// Mantiene los pasos en estado local; al guardar la tarea se persisten.
// ============================================
function PasosEditorLocal({ pasos, setPasos, perfiles }: {
  pasos: { descripcion: string; responsable_id: string }[];
  setPasos: React.Dispatch<React.SetStateAction<{ descripcion: string; responsable_id: string }[]>>;
  perfiles: PerfilLite[];
}) {
  const update = (idx: number, patch: Partial<{ descripcion: string; responsable_id: string }>) =>
    setPasos(arr => arr.map((p, i) => i === idx ? { ...p, ...patch } : p));
  const remove = (idx: number) => setPasos(arr => arr.filter((_, i) => i !== idx));
  const add = () => setPasos(arr => [...arr, { descripcion: '', responsable_id: '' }]);
  const move = (idx: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= pasos.length) return;
    setPasos(arr => {
      const next = [...arr];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-300" />
          <span className="text-[11px] uppercase tracking-widest font-semibold text-violet-300">
            Pasos compartidos (opcional)
          </span>
        </div>
        <button type="button" onClick={add}
          className="text-[10px] text-violet-200 hover:text-white flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/15 border border-violet-500/30">
          <Plus className="w-3 h-3" /> Agregar paso
        </button>
      </div>

      <p className="text-[11px] text-gray-500 -mt-1">
        Si la tarea la hacen entre varias personas (ej: procurador retira, secretaria carga),
        agregá un paso por cada uno. El orden se respeta y al terminar uno se notifica al siguiente.
        Los pasos se guardan al hacer click en <b>Guardar</b>.
      </p>

      <div className="space-y-1.5">
        {pasos.length === 0 && (
          <p className="text-[11px] text-gray-600 italic px-1">
            Sin pasos. Si la tarea la hace una sola persona, dejá esto vacío.
          </p>
        )}
        {pasos.map((p, idx) => (
          <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(idx, 'up')} disabled={idx === 0}
                className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                <ChevronUp className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => move(idx, 'down')} disabled={idx === pasos.length - 1}
                className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            <span className="text-[10px] font-mono text-violet-400 mt-1.5 w-4 text-center flex-shrink-0">{idx + 1}</span>
            <div className="flex-1 min-w-0 space-y-1">
              <input
                value={p.descripcion}
                onChange={e => update(idx, { descripcion: e.target.value })}
                className="input-dark text-xs py-1"
                placeholder="Qué hay que hacer en este paso"
              />
              <select
                value={p.responsable_id}
                onChange={e => update(idx, { responsable_id: e.target.value })}
                className="select-dark text-[10px] py-0.5 w-full"
              >
                <option value="">— Responsable —</option>
                {perfiles.map(pp => (
                  <option key={pp.id} value={pp.id}>{pp.nombre}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => remove(idx)}
              className="text-gray-600 hover:text-red-400 p-1 mt-1">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// PasosEditor — pasos compartidos dentro del modal de tarea
// ============================================
function PasosEditor({ tareaId, perfiles }: { tareaId: string; perfiles: PerfilLite[] }) {
  const { user } = useAuth();
  const { pasos, agregar, actualizar, eliminar, togglePaso, mover } = useTareaPasos(tareaId);
  const [nuevoDesc, setNuevoDesc] = useState('');
  const [nuevoResp, setNuevoResp] = useState('');

  const total = pasos.length;
  const hechos = pasos.filter(p => p.completado).length;

  const onAgregar = async () => {
    if (!nuevoDesc.trim()) return;
    const ok = await agregar(nuevoDesc, nuevoResp || null);
    if (ok) { setNuevoDesc(''); setNuevoResp(''); }
  };

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-300" />
          <span className="text-[11px] uppercase tracking-widest font-semibold text-violet-300">
            Pasos compartidos
          </span>
        </div>
        {total > 0 && (
          <span className="text-[10px] text-gray-400">
            {hechos}/{total} completados
          </span>
        )}
      </div>

      <p className="text-[11px] text-gray-500 -mt-1">
        Dividí la tarea en pasos. Asignale cada paso a alguien. Cuando todos estén completos,
        la tarea se marca como completada automáticamente. Al terminar tu paso se notifica al siguiente.
      </p>

      {/* Lista */}
      <div className="space-y-1.5">
        {pasos.map((p, i) => (
          <div key={p.id} className={`flex items-start gap-2 p-2 rounded-lg border ${
            p.completado ? 'bg-emerald-500/[0.06] border-emerald-500/20' : 'bg-white/[0.03] border-white/[0.06]'
          }`}>
            {/* Reorder */}
            <div className="flex flex-col -gap-1 pt-0.5">
              <button type="button" onClick={() => mover(p, 'up')} disabled={i === 0}
                className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                <ChevronUp className="w-3 h-3" />
              </button>
              <button type="button" onClick={() => mover(p, 'down')} disabled={i === pasos.length - 1}
                className="text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Orden */}
            <span className="text-[10px] font-mono text-violet-400 mt-1.5 w-4 text-center flex-shrink-0">
              {p.orden}
            </span>

            {/* Check */}
            <button type="button" onClick={() => togglePaso(p, user?.id || '')}
              className={`mt-1 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                p.completado ? 'bg-emerald-500/30 border-emerald-500' : 'border-gray-600 hover:border-emerald-400'
              }`}>
              {p.completado && <CheckCircle className="w-3 h-3 text-emerald-300" />}
            </button>

            {/* Contenido */}
            <div className="flex-1 min-w-0 space-y-1">
              <input
                value={p.descripcion}
                onChange={e => actualizar(p.id, { descripcion: e.target.value })}
                className={`input-dark text-xs py-1 ${p.completado ? 'line-through text-gray-500' : ''}`}
                placeholder="Qué hay que hacer en este paso"
              />
              <div className="flex items-center gap-2">
                <select
                  value={p.responsable_id || ''}
                  onChange={e => actualizar(p.id, { responsable_id: e.target.value || null })}
                  className="select-dark text-[10px] py-0.5 flex-1"
                >
                  <option value="">— Sin asignar —</option>
                  {perfiles.map(pp => (
                    <option key={pp.id} value={pp.id}>{pp.nombre}</option>
                  ))}
                </select>
                {p.completado && p.completado_por_nombre && (
                  <span className="text-[9px] text-emerald-400 whitespace-nowrap">
                    ✓ {p.completado_por_nombre} · {p.completado_at && new Date(p.completado_at).toLocaleDateString('es-AR')}
                  </span>
                )}
                <button type="button" onClick={() => eliminar(p.id)}
                  className="text-gray-600 hover:text-red-400 p-0.5">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Nuevo paso */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/[0.05]">
        <input
          value={nuevoDesc}
          onChange={e => setNuevoDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAgregar(); } }}
          className="input-dark text-xs flex-1"
          placeholder="Descripción del nuevo paso (ej: Procurador retira oficio)"
        />
        <select
          value={nuevoResp}
          onChange={e => setNuevoResp(e.target.value)}
          className="select-dark text-xs sm:w-44"
        >
          <option value="">— Responsable —</option>
          {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <button type="button" onClick={onAgregar} disabled={!nuevoDesc.trim()}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
          <Plus className="w-3 h-3" /> Agregar
        </button>
      </div>
    </div>
  );
}

// ============================================
// CompartidasView — vista global de tareas con pasos compartidos
// ============================================
function CompartidasView({ tareas, tareasConPasos, currentUserId, onOpen }: {
  tareas: TareaCompleta[];
  tareasConPasos: { tarea_id: string; pasos: TareaPaso[] }[];
  currentUserId: string;
  onOpen: (t: TareaCompleta) => void;
}) {
  const { user, perfil } = useAuth();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<'todas' | 'mias' | 'pendientes'>('todas');

  const items = useMemo(() => {
    return tareasConPasos
      .map(tp => {
        const tarea = tareas.find(t => t.id === tp.tarea_id);
        return tarea ? { tarea, pasos: tp.pasos } : null;
      })
      .filter((x): x is { tarea: TareaCompleta; pasos: TareaPaso[] } => !!x)
      .filter(({ pasos }) => {
        if (filter === 'mias') return pasos.some(p => p.responsable_id === currentUserId);
        if (filter === 'pendientes') return pasos.some(p => !p.completado);
        return true;
      })
      .sort((a, b) => {
        // pendientes primero
        const ap = a.pasos.every(p => p.completado) ? 1 : 0;
        const bp = b.pasos.every(p => p.completado) ? 1 : 0;
        if (ap !== bp) return ap - bp;
        return (b.tarea.created_at || '').localeCompare(a.tarea.created_at || '');
      });
  }, [tareasConPasos, tareas, filter, currentUserId]);

  const togglePasoQuick = async (paso: TareaPaso) => {
    const next = !paso.completado;
    const { error } = await supabase.from('tarea_pasos').update({
      completado: next,
      completado_at: next ? new Date().toISOString() : null,
      completado_por: next ? (user?.id || null) : null,
    }).eq('id', paso.id);
    if (error) showToast('Error: ' + error.message, 'error');
    else {
      showToast(next ? 'Paso completado' : 'Paso reabierto', 'success');
      if (next && user?.id) {
        notificarSiguientePaso(paso.tarea_id, paso.orden, paso.descripcion, user.id, perfil?.nombre || 'Alguien');
      }
    }
  };

  if (items.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <Users className="w-10 h-10 text-gray-700 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No hay tareas con pasos compartidos.</p>
        <p className="text-[11px] text-gray-600 mt-1">
          Abrí una tarea, guardala y agregale pasos para asignar partes a distintos responsables.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { id: 'todas', label: 'Todas' },
          { id: 'mias', label: 'Con mi participación' },
          { id: 'pendientes', label: 'Con pasos pendientes' },
        ] as const).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`text-xs px-3 py-1.5 rounded-xl border transition-colors ${
              filter === f.id
                ? 'bg-violet-500/20 border-violet-500/40 text-violet-200'
                : 'border-white/10 text-gray-500 hover:text-white'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {items.map(({ tarea, pasos }) => {
        const total = pasos.length;
        const hechos = pasos.filter(p => p.completado).length;
        const pct = total > 0 ? Math.round((hechos / total) * 100) : 0;
        const completa = total > 0 && hechos === total;
        const siguiente = pasos.find(p => !p.completado);

        return (
          <div key={tarea.id} className={`glass-card p-4 ${completa ? 'opacity-70' : ''}`}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <button onClick={() => onOpen(tarea)} className="text-left min-w-0 flex-1 group">
                <h4 className={`text-sm font-semibold truncate ${completa ? 'text-gray-400 line-through' : 'text-white group-hover:text-violet-200'}`}>
                  {tarea.titulo}
                </h4>
                {(tarea.caso_general_titulo || tarea.cliente_nombre) && (
                  <p className="text-[10px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                    {tarea.caso_general_titulo
                      ? <><Briefcase className="w-2.5 h-2.5 text-violet-400" /> <span className="text-violet-300">{tarea.caso_general_titulo}</span></>
                      : <><FileText className="w-2.5 h-2.5 text-emerald-400" /> <span className="text-emerald-300">{tarea.cliente_nombre}</span></>}
                  </p>
                )}
              </button>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] text-gray-500">{hechos}/{total}</div>
                <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden mt-1">
                  <div className={`h-full transition-all ${completa ? 'bg-emerald-500' : 'bg-violet-500'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>

            {!completa && siguiente && (
              <div className="text-[10px] text-violet-300 flex items-center gap-1 mb-2">
                <ArrowRight className="w-3 h-3" />
                Siguiente: <span className="font-semibold">{siguiente.descripcion}</span>
                {siguiente.responsable_nombre && <span className="text-gray-500">· {siguiente.responsable_nombre}</span>}
              </div>
            )}

            <div className="space-y-1">
              {pasos.map(p => {
                const esMio = p.responsable_id === currentUserId;
                return (
                  <div key={p.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${
                      p.completado ? 'bg-emerald-500/[0.05]' : esMio ? 'bg-violet-500/[0.08] border border-violet-500/20' : 'bg-white/[0.02]'
                    }`}>
                    <button type="button" onClick={() => togglePasoQuick(p)}
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        p.completado ? 'bg-emerald-500/30 border-emerald-500' : 'border-gray-600 hover:border-emerald-400'
                      }`}>
                      {p.completado && <CheckCircle className="w-3 h-3 text-emerald-300" />}
                    </button>
                    <span className="text-[10px] font-mono text-gray-600 w-3">{p.orden}</span>
                    <span className={`text-xs flex-1 min-w-0 truncate ${p.completado ? 'text-gray-500 line-through' : 'text-white'}`}>
                      {p.descripcion}
                    </span>
                    {p.responsable_nombre && (
                      <span className="flex items-center gap-1 text-[10px] text-gray-400 flex-shrink-0">
                        <MiniAvatar path={p.responsable_avatar} nombre={p.responsable_nombre} size={16} />
                        <span className={esMio ? 'text-violet-200 font-semibold' : ''}>
                          {esMio ? 'Vos' : p.responsable_nombre}
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// (fin)

