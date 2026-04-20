import { useState } from 'react';
import { Search, Plus, Filter, ExternalLink, Phone, ChevronRight } from 'lucide-react';
import { ClientePrevisional, PIPELINE_LABELS, PIPELINE_COLORS, calcularSemaforo, SEMAFORO_COLORS, SEMAFORO_LABELS, PipelinePrevisional } from '../../types/previsional';

interface Props {
  clientes: ClientePrevisional[];
  onSelect: (c: ClientePrevisional) => void;
  onNew: () => void;
}

const PIPELINES: PipelinePrevisional[] = ['consulta', 'seguimiento', 'ingreso', 'cobro', 'finalizado', 'descartado'];

export default function FichasList({ clientes, onSelect, onNew }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroPipeline, setFiltroPipeline] = useState<PipelinePrevisional | 'todos'>('todos');
  const [vista, setVista] = useState<'tabla' | 'pipeline'>('tabla');

  const filtrados = clientes.filter(c => {
    const matchBusqueda = !busqueda ||
      c.apellido_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.cuil?.includes(busqueda) ||
      c.telefono?.includes(busqueda);
    const matchPipeline = filtroPipeline === 'todos' || c.pipeline === filtroPipeline;
    return matchBusqueda && matchPipeline;
  });

  const formatMoney = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por nombre, CUIL o teléfono..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="input-dark pl-10 text-sm"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
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
          <button onClick={onNew} className="btn-primary text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nueva Ficha</span>
          </button>
        </div>
      </div>

      {/* Pipeline filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setFiltroPipeline('todos')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
            filtroPipeline === 'todos'
              ? 'bg-white/10 text-white border-white/20'
              : 'bg-white/5 text-gray-500 border-white/5 hover:text-white'
          }`}
        >
          Todos ({clientes.length})
        </button>
        {PIPELINES.map(p => {
          const count = clientes.filter(c => c.pipeline === p).length;
          return (
            <button
              key={p}
              onClick={() => setFiltroPipeline(p)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                filtroPipeline === p
                  ? `${PIPELINE_COLORS[p]}`
                  : 'bg-white/5 text-gray-500 border-white/5 hover:text-white'
              }`}
            >
              {PIPELINE_LABELS[p]} ({count})
            </button>
          );
        })}
      </div>

      {/* Vista: Tabla */}
      {vista === 'tabla' && (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Contacto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">CUIL</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Captado por</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pipeline</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Cobro</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-500">Sin resultados</td></tr>
                ) : (
                  filtrados.map((c, i) => {
                    const semaforo = calcularSemaforo(c.fecha_ultimo_contacto);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => onSelect(c)}
                        className="table-row animate-slide-up"
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${SEMAFORO_COLORS[semaforo]} animate-pulse`} title={SEMAFORO_LABELS[semaforo]} />
                          </div>
                        </td>
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
                        <td className="px-4 py-3 text-gray-400 hidden md:table-cell font-mono text-xs">
                          {c.cuil || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-400 hidden lg:table-cell text-xs">
                          {c.captado_por || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`badge border ${PIPELINE_COLORS[c.pipeline]}`}>
                            {PIPELINE_LABELS[c.pipeline]}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {c.cobro_total > 0 ? (
                            <div>
                              <p className="text-xs text-emerald-400">{formatMoney(c.monto_cobrado)}</p>
                              <p className="text-[10px] text-gray-600">de {formatMoney(c.cobro_total)}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight className="w-4 h-4 text-gray-600" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vista: Pipeline Kanban */}
      {vista === 'pipeline' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {PIPELINES.map(pipeline => {
            const items = filtrados.filter(c => c.pipeline === pipeline);
            return (
              <div key={pipeline} className="glass-card p-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${
                    pipeline === 'consulta' ? 'from-blue-500 to-blue-600' :
                    pipeline === 'seguimiento' ? 'from-amber-500 to-amber-600' :
                    pipeline === 'ingreso' ? 'from-purple-500 to-purple-600' :
                    pipeline === 'cobro' ? 'from-emerald-500 to-emerald-600' :
                    pipeline === 'finalizado' ? 'from-gray-500 to-gray-600' :
                    'from-red-500 to-red-600'
                  }`} />
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider">{PIPELINE_LABELS[pipeline]}</h4>
                  <span className="text-[10px] text-gray-600 ml-auto">{items.length}</span>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {items.map(c => {
                    const sem = calcularSemaforo(c.fecha_ultimo_contacto);
                    return (
                      <button
                        key={c.id}
                        onClick={() => onSelect(c)}
                        className="w-full text-left p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 hover:bg-white/[0.06] transition-all group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${SEMAFORO_COLORS[sem]}`} />
                          <p className="text-xs font-medium text-white truncate group-hover:text-emerald-400 transition-colors">{c.apellido_nombre}</p>
                        </div>
                        {c.situacion_actual && (
                          <p className="text-[10px] text-gray-500 line-clamp-2 ml-3.5">{c.situacion_actual}</p>
                        )}
                      </button>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="text-[10px] text-gray-600 text-center py-4">Vacío</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
