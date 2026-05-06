import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Search, ListTodo, Columns3, Calendar as CalendarIcon,
  Clock, CheckCircle, AlertTriangle, Trash2, User, X, Paperclip,
  Filter, Edit2, FileDown, Briefcase, FileText, ArrowRight, Eye,
} from 'lucide-react';
import { useTareas, uploadTareaAdjunto, getTareaAdjuntoUrl } from '../hooks/useTareas';
import { useCases } from '../hooks/useCases';
import { useCasosGenerales } from '../hooks/useCasosGenerales';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useAvatarUrl } from '../hooks/useAvatarUrl';
import {
  TareaCompleta, EstadoTareaGeneral, PrioridadTareaGeneral,
  ESTADO_TAREA_GENERAL_LABELS, PRIORIDAD_TAREA_GENERAL_LABELS,
  PRIORIDAD_TAREA_GENERAL_COLORS,
} from '../types/database';

const ESTADO_COLORS: Record<EstadoTareaGeneral, string> = {
  en_curso: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  completada: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
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

  const [view, setView] = useState<'lista' | 'kanban' | 'calendario' | 'responsable'>('lista');
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoTareaGeneral | 'all'>('all');
  const [filterPrioridad, setFilterPrioridad] = useState<PrioridadTareaGeneral | 'all'>('all');
  const [filterResponsable, setFilterResponsable] = useState<string>('all');
  const [filterSemana, setFilterSemana] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<TareaCompleta | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

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
          onCompletar={id => completar(id, user?.id || '')}
          onReabrir={id => reabrir(id, user?.id || '')}
          onArchivar={handleArchivar} confirmDel={confirmDel} isVencida={isVencida} />
      ) : view === 'kanban' ? (
        <KanbanView tareas={filtered} onOpen={t => { setSelected(t); setModalOpen(true); }} isVencida={isVencida} />
      ) : view === 'calendario' ? (
        <CalendarioView calendarMap={calendarMap} onOpen={t => { setSelected(t); setModalOpen(true); }} />
      ) : (
        <ResponsableView tareas={filtered} perfiles={perfiles}
          onOpen={t => { setSelected(t); setModalOpen(true); }} isVencida={isVencida} />
      )}

      {modalOpen && (
        <TareaModal
          tarea={selected}
          casos={casos}
          casosGenerales={casosGenerales}
          perfiles={perfiles}
          onClose={() => { setModalOpen(false); setSelected(null); }}
          onSave={async (t) => { const ok = await upsert(t, user?.id || ''); if (ok) { setModalOpen(false); setSelected(null); } }}
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
// CasoInfoBar
// ============================================
function CasoInfoBar({ t }: { t: TareaCompleta }) {
  const hasCasoGeneral = !!t.caso_general_id;
  const hasCaso = !!t.cliente_nombre || !!t.expediente_caso;
  if (!hasCasoGeneral && !hasCaso) return null;
  const palette = hasCasoGeneral
    ? { bg: 'bg-violet-500/[0.06]', border: 'border-violet-500/20', icon: 'text-violet-300', text: 'text-violet-200', mono: 'text-violet-400/70' }
    : { bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/20', icon: 'text-emerald-300', text: 'text-emerald-100', mono: 'text-emerald-400/70' };
  return (
    <div className={`mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl border ${palette.bg} ${palette.border} text-[11px]`}>
      {hasCasoGeneral ? (
        <>
          <Briefcase className={`w-3.5 h-3.5 flex-shrink-0 ${palette.icon}`} />
          <span className={`font-semibold truncate ${palette.text}`}>{t.caso_general_titulo}</span>
          {t.caso_general_expediente && <span className={`font-mono text-[10px] truncate ${palette.mono}`}>· {t.caso_general_expediente}</span>}
        </>
      ) : (
        <>
          <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${palette.icon}`} />
          {t.cliente_nombre && <span className={`font-semibold truncate ${palette.text}`}>{t.cliente_nombre}</span>}
          {t.expediente_caso && <span className={`font-mono text-[10px] truncate ${palette.mono}`}>· {t.expediente_caso}</span>}
        </>
      )}
    </div>
  );
}

// ============================================
// ListaView
// ============================================
function ListaView({ tareas, onOpen, onCompletar, onReabrir, onArchivar, confirmDel, isVencida }: {
  tareas: TareaCompleta[]; onOpen: (t: TareaCompleta) => void;
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
          <CasoInfoBar t={t} />

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
  onSave: (t: any) => void;
}) {
  const [form, setForm] = useState({
    id: tarea?.id,
    titulo: tarea?.titulo || '',
    caso_id: tarea?.caso_id || '',
    caso_general_id: tarea?.caso_general_id || '',
    descripcion: tarea?.descripcion || '',
    culminacion: tarea?.culminacion || '',
    cargo_hora: tarea?.cargo_hora || '',
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
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <form onSubmit={submit} className="glass-card w-full max-w-2xl my-8 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            {tarea ? <><Edit2 className="w-4 h-4" /> Editar tarea</> : <><Plus className="w-4 h-4" /> Nueva tarea</>}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

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
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Cargo de hora (vencimiento vinculado)</label>
          <input value={form.cargo_hora} onChange={e => setForm(s => ({ ...s, cargo_hora: e.target.value }))}
            className="input-dark text-sm mt-1" placeholder="Ej: A favor 22/04 - en contra 30/04" />
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

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary text-xs px-4 py-2">Cancelar</button>
          <button type="submit" className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
            <FileDown className="w-3.5 h-3.5" /> Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
