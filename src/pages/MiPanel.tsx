import { useState, useMemo } from 'react';
import { ListTodo, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTareasPrevisional } from '../hooks/usePrevisional';
import { TareaPrevisional, PRIORIDAD_LABELS, PRIORIDAD_COLORS } from '../types/previsional';

export default function MiPanel() {
  const { user } = useAuth();
  const { tareas, loading, completar } = useTareasPrevisional(user?.id);
  const [filter, setFilter] = useState<'todas' | 'pendientes' | 'completadas'>('pendientes');

  const filtered = useMemo(() => {
    if (filter === 'pendientes') return tareas.filter(t => t.estado !== 'completada');
    if (filter === 'completadas') return tareas.filter(t => t.estado === 'completada');
    return tareas;
  }, [tareas, filter]);

  const stats = useMemo(() => ({
    total: tareas.length,
    pendientes: tareas.filter(t => t.estado === 'pendiente').length,
    enCurso: tareas.filter(t => t.estado === 'en_curso').length,
    completadas: tareas.filter(t => t.estado === 'completada').length,
    vencidas: tareas.filter(t => t.fecha_limite && new Date(t.fecha_limite) < new Date() && t.estado !== 'completada').length,
  }), [tareas]);

  const isVencida = (t: TareaPrevisional) =>
    t.fecha_limite && new Date(t.fecha_limite) < new Date() && t.estado !== 'completada';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <ListTodo className="w-5 h-5 text-white" />
          </div>
          Mi Panel
        </h1>
        <p className="text-sm text-gray-500 mt-1 ml-[52px]">Tus tareas asignadas</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pendientes</p>
          <p className="text-2xl font-bold text-amber-400">{stats.pendientes}</p>
        </div>
        <div className="stat-card">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">En Curso</p>
          <p className="text-2xl font-bold text-blue-400">{stats.enCurso}</p>
        </div>
        <div className="stat-card">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Completadas</p>
          <p className="text-2xl font-bold text-emerald-400">{stats.completadas}</p>
        </div>
        <div className="stat-card">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Vencidas</p>
          <p className={`text-2xl font-bold ${stats.vencidas > 0 ? 'text-red-400' : 'text-gray-600'}`}>{stats.vencidas}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl w-fit">
        {(['pendientes', 'todas', 'completadas'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              filter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'
            }`}
          >
            {f === 'pendientes' ? 'Pendientes' : f === 'completadas' ? 'Completadas' : 'Todas'}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="text-center py-12"><div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{filter === 'pendientes' ? 'No tenés tareas pendientes' : 'No hay tareas'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t, i) => (
            <div
              key={t.id}
              className={`glass-card p-4 transition-all animate-fade-in ${isVencida(t) ? 'border-red-500/20' : ''}`}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => t.estado !== 'completada' && completar(t.id, user?.id || '')}
                  className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    t.estado === 'completada' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-600 hover:border-white'
                  }`}
                >
                  {t.estado === 'completada' && <CheckCircle className="w-3.5 h-3.5" />}
                </button>

                <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-medium ${t.estado === 'completada' ? 'text-gray-500 line-through' : 'text-white'}`}>{t.titulo}</h4>
                  {t.descripcion && <p className="text-xs text-gray-500 mt-0.5">{t.descripcion}</p>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {t.cliente_nombre && <span className="text-[10px] text-gray-500 bg-white/[0.03] px-1.5 py-0.5 rounded-full">{t.cliente_nombre}</span>}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${PRIORIDAD_COLORS[t.prioridad]}`}>
                      {PRIORIDAD_LABELS[t.prioridad]}
                    </span>
                    {t.fecha_limite && (
                      <span className={`text-[10px] flex items-center gap-1 ${isVencida(t) ? 'text-red-400' : 'text-gray-500'}`}>
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(t.fecha_limite).toLocaleDateString('es-AR')}
                        {isVencida(t) && <AlertTriangle className="w-2.5 h-2.5" />}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
