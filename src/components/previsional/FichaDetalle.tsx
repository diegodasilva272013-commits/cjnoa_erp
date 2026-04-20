import { useState } from 'react';
import { ArrowLeft, Briefcase, Clock, ExternalLink, Edit3, Trash2 } from 'lucide-react';
import { ClientePrevisional, SexoCliente, PIPELINE_LABELS, PIPELINE_COLORS, calcularSemaforo, SEMAFORO_COLORS } from '../../types/previsional';
import { useAportesLaborales, useHistorialAvances } from '../../hooks/usePrevisional';
import AportesTable from './AportesTable';
import HistorialTimeline from './HistorialTimeline';

interface Props {
  cliente: ClientePrevisional;
  onBack: () => void;
  onEdit: (c: ClientePrevisional) => void;
  onDelete: (id: string) => void;
}

export default function FichaDetalle({ cliente, onBack, onEdit, onDelete }: Props) {
  const [tab, setTab] = useState<'aportes' | 'historial'>('aportes');
  const { aportes, loading: loadAp, add: addAporte, remove: removeAporte } = useAportesLaborales(cliente.id);
  const { avances, loading: loadHist, add: addAvance } = useHistorialAvances(cliente.id);
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
      <div className="flex gap-1 p-1 bg-white/[0.03] rounded-xl">
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
    </div>
  );
}
