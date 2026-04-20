import { useState, useMemo } from 'react';
import {
  Plus, Search, ListTodo, Columns3, Calendar as CalendarIcon,
  Clock, CheckCircle, AlertTriangle, Trash2, User, Bell, X
} from 'lucide-react';
import { TareaPrevisional, EstadoTarea, PrioridadTarea,
  ESTADO_TAREA_LABELS, PRIORIDAD_LABELS, PRIORIDAD_COLORS,
} from '../types/previsional';
import { useTareasPrevisional, useClientesPrevisional, useAudiencias, useAlertasPrevisional } from '../hooks/usePrevisional';
import { useAuth } from '../context/AuthContext';
import TareaModal from '../components/previsional/TareaModal';
import AudienciaModal from '../components/previsional/AudienciaModal';

const ESTADOS: EstadoTarea[] = ['pendiente', 'en_curso', 'completada'];
const ESTADO_COLORS: Record<EstadoTarea, string> = {
  pendiente: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  en_curso: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  completada: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

export default function Seguimiento() {
  const { user } = useAuth();
  const { tareas, loading, upsert, completar, remove } = useTareasPrevisional();
  const { clientes } = useClientesPrevisional();
  const { audiencias, loading: loadAud, upsert: upsertAud, remove: removeAud } = useAudiencias();
  const { alertas, marcarLeida, marcarTodasLeidas } = useAlertasPrevisional();

  const [view, setView] = useState<'lista' | 'kanban' | 'audiencias'>('lista');
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoTarea | 'all'>('all');
  const [filterPrioridad, setFilterPrioridad] = useState<PrioridadTarea | 'all'>('all');
  const [tareaModalOpen, setTareaModalOpen] = useState(false);
  const [selectedTarea, setSelectedTarea] = useState<TareaPrevisional | null>(null);
  const [audModalOpen, setAudModalOpen] = useState(false);
  const [selectedAud, setSelectedAud] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return tareas.filter(t => {
      const matchSearch = !search || t.titulo.toLowerCase().includes(search.toLowerCase()) ||
        (t.cliente_nombre || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.responsable_nombre || '').toLowerCase().includes(search.toLowerCase());
      const matchEstado = filterEstado === 'all' || t.estado === filterEstado;
      const matchPrioridad = filterPrioridad === 'all' || t.prioridad === filterPrioridad;
      return matchSearch && matchEstado && matchPrioridad;
    });
  }, [tareas, search, filterEstado, filterPrioridad]);

  const isVencida = (t: TareaPrevisional) =>
    t.fecha_limite && new Date(t.fecha_limite) < new Date() && t.estado !== 'completada';

  const handleDelete = async (tarea: TareaPrevisional) => {
    if (confirmDelete === tarea.id) {
      await remove(tarea.id, tarea, user?.id || '');
      setConfirmDelete(null);
    } else {
      setConfirmDelete(tarea.id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const tareasVencidas = tareas.filter(t => isVencida(t)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <ListTodo className="w-5 h-5 text-white" />
            </div>
            Seguimiento y Tareas
          </h1>
          <p className="text-sm text-gray-500 mt-1 ml-[52px]">
            {tareas.length} tareas · {tareasVencidas > 0 && <span className="text-red-400">{tareasVencidas} vencidas</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setSelectedAud(null); setAudModalOpen(true); }} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5" /> Audiencia
          </button>
          <button onClick={() => { setSelectedTarea(null); setTareaModalOpen(true); }} className="btn-primary text-xs px-3 py-2 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nueva Tarea
          </button>
        </div>
      </div>

      {/* Alertas automáticas */}
      {alertas.length > 0 && (
        <div className="glass-card p-4 border border-red-500/20 bg-red-500/[0.03]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-red-400" />
              <p className="text-sm font-semibold text-white">{alertas.length} alerta{alertas.length !== 1 ? 's' : ''} activa{alertas.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={marcarTodasLeidas} className="text-[10px] text-gray-500 hover:text-white transition-colors">
              Marcar todas leídas
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {alertas.map(a => (
              <div key={a.id} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="flex items-start gap-2 min-w-0">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${a.tipo === 'vencimiento' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="min-w-0">
                    {a.cliente_nombre && <p className="text-[10px] text-gray-500 mb-0.5">{a.cliente_nombre}</p>}
                    <p className="text-xs text-gray-300">{a.mensaje}</p>
                  </div>
                </div>
                <button onClick={() => marcarLeida(a.id)} className="flex-shrink-0 p-1 hover:bg-white/10 rounded-lg text-gray-600 hover:text-white transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-dark pl-10 text-sm"
            placeholder="Buscar tareas..."
          />
        </div>

        <div className="flex gap-2">
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as any)} className="select-dark text-xs py-2">
            <option value="all">Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_TAREA_LABELS[e]}</option>)}
          </select>
          <select value={filterPrioridad} onChange={e => setFilterPrioridad(e.target.value as any)} className="select-dark text-xs py-2">
            <option value="all">Todas las prioridades</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="sin_prioridad">Sin prioridad</option>
          </select>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl">
          {[
            { id: 'lista', icon: ListTodo, label: 'Lista' },
            { id: 'kanban', icon: Columns3, label: 'Kanban' },
            { id: 'audiencias', icon: CalendarIcon, label: 'Audiencias' },
          ].map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                view === v.id ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
              }`}
            >
              <v.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {view === 'lista' && (
        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-12"><div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <ListTodo className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No hay tareas</p>
            </div>
          ) : (
            filtered.map((t, i) => (
              <div
                key={t.id}
                className={`glass-card p-4 cursor-pointer hover:bg-white/[0.03] transition-all animate-fade-in ${isVencida(t) ? 'border-red-500/20' : ''}`}
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => { setSelectedTarea(t); setTareaModalOpen(true); }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Checkbox */}
                    <button
                      onClick={e => { e.stopPropagation(); t.estado !== 'completada' && completar(t.id, user?.id || ''); }}
                      className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        t.estado === 'completada' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-600 hover:border-white'
                      }`}
                    >
                      {t.estado === 'completada' && <CheckCircle className="w-3.5 h-3.5" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`text-sm font-medium ${t.estado === 'completada' ? 'text-gray-500 line-through' : 'text-white'}`}>{t.titulo}</h4>
                        {isVencida(t) && (
                          <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                            <AlertTriangle className="w-2.5 h-2.5" /> Vencida
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {t.cliente_nombre && <span className="text-xs text-gray-500">{t.cliente_nombre}</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${ESTADO_COLORS[t.estado]}`}>
                          {ESTADO_TAREA_LABELS[t.estado]}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${PRIORIDAD_COLORS[t.prioridad]}`}>
                          {PRIORIDAD_LABELS[t.prioridad]}
                        </span>
                        {t.responsable_nombre && (
                          <span className="text-[10px] text-gray-600 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" /> {t.responsable_nombre}
                          </span>
                        )}
                        {t.fecha_limite && (
                          <span className="text-[10px] text-gray-600 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" /> {new Date(t.fecha_limite).toLocaleDateString('es-AR')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(t); }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      confirmDelete === t.id ? 'bg-red-500/20 text-red-400' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Kanban */}
      {view === 'kanban' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {ESTADOS.map(estado => {
            const tareasEstado = filtered.filter(t => t.estado === estado);
            return (
              <div key={estado} className="space-y-2">
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ESTADO_COLORS[estado]}`}>
                    {ESTADO_TAREA_LABELS[estado]}
                  </span>
                  <span className="text-xs text-gray-600">{tareasEstado.length}</span>
                </div>
                <div className="space-y-2 min-h-[120px]">
                  {tareasEstado.map(t => (
                    <div
                      key={t.id}
                      className={`glass-card p-3 cursor-pointer hover:bg-white/[0.03] transition-all ${isVencida(t) ? 'border-red-500/20' : ''}`}
                      onClick={() => { setSelectedTarea(t); setTareaModalOpen(true); }}
                    >
                      <h4 className="text-xs font-medium text-white mb-1 truncate">{t.titulo}</h4>
                      {t.cliente_nombre && <p className="text-[10px] text-gray-500 truncate">{t.cliente_nombre}</p>}
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${PRIORIDAD_COLORS[t.prioridad]}`}>
                          {PRIORIDAD_LABELS[t.prioridad]}
                        </span>
                        {isVencida(t) && <AlertTriangle className="w-3 h-3 text-red-400" />}
                      </div>
                    </div>
                  ))}
                  {tareasEstado.length === 0 && (
                    <div className="text-center py-6 text-gray-700 text-xs">Vacío</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Audiencias */}
      {view === 'audiencias' && (
        <div className="space-y-2">
          {loadAud ? (
            <div className="text-center py-12"><div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto" /></div>
          ) : audiencias.length === 0 ? (
            <div className="text-center py-12">
              <CalendarIcon className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No hay audiencias agendadas</p>
            </div>
          ) : (
            audiencias.map((a, i) => {
              const isPast = new Date(a.fecha) < new Date();
              return (
                <div
                  key={a.id}
                  className={`glass-card p-4 cursor-pointer hover:bg-white/[0.03] transition-all animate-fade-in ${isPast ? 'opacity-60' : ''}`}
                  style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => { setSelectedAud(a); setAudModalOpen(true); }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <CalendarIcon className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-white">
                          {new Date(a.fecha).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        {a.hora && <span className="text-xs text-gray-500">{a.hora}</span>}
                        {isPast && <span className="text-[10px] text-gray-600 bg-white/[0.03] px-1.5 py-0.5 rounded-full">Pasada</span>}
                      </div>
                      {a.cliente_nombre && <p className="text-xs text-gray-400 ml-6">{a.cliente_nombre}</p>}
                      <div className="flex items-center gap-3 mt-1 ml-6 text-[10px] text-gray-500">
                        {a.juzgado && <span>Juzgado: {a.juzgado}</span>}
                        {a.tipo && <span>Tipo: {a.tipo}</span>}
                        {a.abogado_cargo && <span>Abogado: {a.abogado_cargo}</span>}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeAud(a.id); }}
                      className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modales */}
      <TareaModal
        open={tareaModalOpen}
        onClose={() => setTareaModalOpen(false)}
        tarea={selectedTarea}
        clientes={clientes}
        onSave={upsert}
      />
      <AudienciaModal
        open={audModalOpen}
        onClose={() => setAudModalOpen(false)}
        audiencia={selectedAud}
        clientes={clientes}
        onSave={upsertAud}
      />
    </div>
  );
}
