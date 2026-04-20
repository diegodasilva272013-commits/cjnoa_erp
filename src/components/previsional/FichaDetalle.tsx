import { useState } from 'react';
import { ArrowLeft, Briefcase, Clock, ExternalLink, Edit3, Trash2, CheckSquare, CalendarDays, Plus } from 'lucide-react';
import { ClientePrevisional, SexoCliente, TareaPrevisional, Audiencia, PIPELINE_LABELS, PIPELINE_COLORS, calcularSemaforo, SEMAFORO_COLORS, PRIORIDAD_LABELS, ESTADO_TAREA_LABELS } from '../../types/previsional';
import { useAportesLaborales, useHistorialAvances, useTareasPrevisional, useAudiencias } from '../../hooks/usePrevisional';
import AportesTable from './AportesTable';
import HistorialTimeline from './HistorialTimeline';
import TareaModal from './TareaModal';
import AudienciaModal from './AudienciaModal';

interface Props {
  cliente: ClientePrevisional;
  onBack: () => void;
  onEdit: (c: ClientePrevisional) => void;
  onDelete: (id: string) => void;
}

export default function FichaDetalle({ cliente, onBack, onEdit, onDelete }: Props) {
  const [tab, setTab] = useState<'aportes' | 'historial' | 'tareas' | 'audiencias'>('aportes');
  const [tareaOpen, setTareaOpen] = useState(false);
  const [tareaEdit, setTareaEdit] = useState<TareaPrevisional | null>(null);
  const [audienciaOpen, setAudienciaOpen] = useState(false);
  const [audienciaEdit, setAudienciaEdit] = useState<Audiencia | null>(null);

  const { aportes, loading: loadAp, add: addAporte, remove: removeAporte } = useAportesLaborales(cliente.id);
  const { avances, loading: loadHist, add: addAvance } = useHistorialAvances(cliente.id);
  const { tareas: allTareas, upsert: upsertTarea } = useTareasPrevisional();
  const { audiencias: allAudiencias, upsert: upsertAudiencia } = useAudiencias();
  const tareas = allTareas.filter(t => t.cliente_prev_id === cliente.id);
  const audiencias = allAudiencias.filter(a => a.cliente_prev_id === cliente.id);
  const semaforo = calcularSemaforo(cliente.fecha_ultimo_contacto);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver a lista
        </button>
        <div className="flex items-center gap-2">
          {cliente.url_drive && (
            <a href={cliente.url_drive} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3" /> Drive
            </a>
          )}
          <button onClick={() => onEdit(cliente)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <Edit3 className="w-3 h-3" /> Editar
          </button>
          <button onClick={() => onDelete(cliente.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-600 hover:text-red-400 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Client header */}
      <div className="glass-card p-5">
        <div className="flex items-start gap-4">
          <div className={`w-3 h-3 rounded-full mt-1.5 ${SEMAFORO_COLORS[semaforo]}`} />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white truncate">{cliente.apellido_nombre}</h2>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              {cliente.cuil && <span className="text-xs text-gray-400 font-mono">{cliente.cuil}</span>}
              {cliente.telefono && <span className="text-xs text-gray-400">{cliente.telefono}</span>}
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${PIPELINE_COLORS[cliente.pipeline]}`}>
                {PIPELINE_LABELS[cliente.pipeline]}
              </span>
              {cliente.sub_estado && (
                <span className="text-[10px] text-gray-500 bg-white/[0.03] px-2 py-0.5 rounded-full">{cliente.sub_estado}</span>
              )}
            </div>
          </div>
        </div>

        {/* Quick info grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase">Captado por</p>
            <p className="text-sm font-medium text-white mt-0.5">{cliente.captado_por || '—'}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase">Cobro Total</p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">${(cliente.cobro_total || 0).toLocaleString('es-AR')}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase">Cobrado</p>
            <p className="text-sm font-bold text-white mt-0.5">${(cliente.monto_cobrado || 0).toLocaleString('es-AR')}</p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase">Pendiente</p>
            <p className="text-sm font-bold text-amber-400 mt-0.5">${(cliente.saldo_pendiente || 0).toLocaleString('es-AR')}</p>
          </div>
        </div>

        {/* Situación actual */}
        {cliente.situacion_actual && (
          <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
            <p className="text-[10px] text-gray-500 uppercase mb-1">Situación Actual</p>
            <p className="text-xs text-gray-300 leading-relaxed">{cliente.situacion_actual}</p>
          </div>
        )}

        {/* Cobro progress bar */}
        {cliente.cobro_total > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-gray-500">Progreso de cobro</p>
              <p className="text-[10px] text-gray-500">{Math.round(((cliente.monto_cobrado || 0) / cliente.cobro_total) * 100)}%</p>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${Math.min(100, ((cliente.monto_cobrado || 0) / cliente.cobro_total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl flex-wrap">
        <button
          onClick={() => setTab('aportes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center ${
            tab === 'aportes' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" /> Aportes Laborales
          <span className="ml-1 text-[10px] text-gray-600">({aportes.length})</span>
        </button>
        <button
          onClick={() => setTab('historial')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center ${
            tab === 'historial' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'
          }`}
        >
          <Clock className="w-3.5 h-3.5" /> Historial
          <span className="ml-1 text-[10px] text-gray-600">({avances.length})</span>
        </button>
        <button
          onClick={() => setTab('tareas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center ${
            tab === 'tareas' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" /> Tareas
          {tareas.filter(t => t.estado !== 'completada').length > 0 && (
            <span className="ml-1 text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
              {tareas.filter(t => t.estado !== 'completada').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('audiencias')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium transition-all flex-1 justify-center ${
            tab === 'audiencias' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white hover:bg-white/5'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" /> Audiencias
          {audiencias.length > 0 && (
            <span className="ml-1 text-[10px] text-gray-600">({audiencias.length})</span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {tab === 'aportes' && (
        <AportesTable
          aportes={aportes}
          loading={loadAp}
          hijos={cliente.hijos}
          sexo={cliente.sexo as SexoCliente}
          onAdd={addAporte}
          onRemove={removeAporte}
        />
      )}
      {tab === 'historial' && (
        <HistorialTimeline avances={avances} loading={loadHist} onAdd={addAvance} />
      )}

      {/* Tareas tab */}
      {tab === 'tareas' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{tareas.length} tarea{tareas.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => { setTareaEdit(null); setTareaOpen(true); }}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Nueva tarea
            </button>
          </div>
          {tareas.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <CheckSquare className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Sin tareas para este cliente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tareas.map(tarea => {
                const vencida = tarea.fecha_limite && new Date(tarea.fecha_limite) < new Date() && tarea.estado !== 'completada';
                return (
                  <div
                    key={tarea.id}
                    className="glass-card p-4 flex items-start gap-3 cursor-pointer hover:bg-white/[0.04] transition-colors"
                    onClick={() => { setTareaEdit(tarea); setTareaOpen(true); }}
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      tarea.estado === 'completada' ? 'bg-emerald-500' :
                      vencida ? 'bg-red-500' :
                      tarea.prioridad === 'alta' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        tarea.estado === 'completada' ? 'text-gray-500 line-through' : 'text-white'
                      }`}>{tarea.titulo}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-[10px] text-gray-500">
                          {ESTADO_TAREA_LABELS[tarea.estado]}
                        </span>
                        {tarea.prioridad !== 'sin_prioridad' && (
                          <span className="text-[10px] text-gray-500">
                            · {PRIORIDAD_LABELS[tarea.prioridad]}
                          </span>
                        )}
                        {tarea.fecha_limite && (
                          <span className={`text-[10px] ${
                            vencida ? 'text-red-400' : 'text-gray-500'
                          }`}>
                            · Vence {new Date(tarea.fecha_limite).toLocaleDateString('es-AR')}
                          </span>
                        )}
                        {tarea.responsable_nombre && (
                          <span className="text-[10px] text-gray-500">· {tarea.responsable_nombre}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Audiencias tab */}
      {tab === 'audiencias' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{audiencias.length} audiencia{audiencias.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => { setAudienciaEdit(null); setAudienciaOpen(true); }}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Nueva audiencia
            </button>
          </div>
          {audiencias.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <CalendarDays className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Sin audiencias para este cliente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {audiencias
                .slice()
                .sort((a, b) => a.fecha.localeCompare(b.fecha))
                .map(audiencia => {
                  const pasada = new Date(audiencia.fecha) < new Date();
                  return (
                    <div
                      key={audiencia.id}
                      className="glass-card p-4 flex items-start gap-3 cursor-pointer hover:bg-white/[0.04] transition-colors"
                      onClick={() => { setAudienciaEdit(audiencia); setAudienciaOpen(true); }}
                    >
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        pasada ? 'bg-gray-600' : 'bg-purple-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">
                          {new Date(audiencia.fecha).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          {audiencia.hora && <span className="text-gray-400 font-normal"> – {audiencia.hora}</span>}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-0.5">
                          {audiencia.tipo && <span className="text-[10px] text-gray-500">{audiencia.tipo}</span>}
                          {audiencia.juzgado && <span className="text-[10px] text-gray-500">· {audiencia.juzgado}</span>}
                          {audiencia.abogado_cargo && <span className="text-[10px] text-gray-500">· {audiencia.abogado_cargo}</span>}
                        </div>
                        {audiencia.notas && (
                          <p className="text-[11px] text-gray-500 mt-1 line-clamp-1">{audiencia.notas}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <TareaModal
        open={tareaOpen}
        onClose={() => { setTareaOpen(false); setTareaEdit(null); }}
        tarea={tareaEdit}
        clientes={[cliente]}
        onSave={async (data, id) => {
          const ok = await upsertTarea({ ...data, cliente_prev_id: cliente.id }, id);
          if (ok) setTareaOpen(false);
          return ok;
        }}
      />
      <AudienciaModal
        open={audienciaOpen}
        onClose={() => { setAudienciaOpen(false); setAudienciaEdit(null); }}
        audiencia={audienciaEdit}
        clientes={[cliente]}
        onSave={async (data, id) => {
          const ok = await upsertAudiencia({ ...data, cliente_prev_id: cliente.id }, id);
          if (ok) setAudienciaOpen(false);
          return ok;
        }}
      />
    </div>
  );
}
