import { useState } from 'react';
import { Search, Plus, Filter, ExternalLink, Phone, ChevronRight, Copy, Check, Trash2 } from 'lucide-react';
import { ClientePrevisional, PIPELINE_LABELS, PIPELINE_COLORS, PIPELINE_GRADIENT, PipelinePrevisional, formatFechaLocal } from '../../types/previsional';
import PrevisionalKanban from './PrevisionalKanban';

interface Props {
  clientes: ClientePrevisional[];
  onSelect: (c: ClientePrevisional) => void;
  onNew: () => void;
  onRefetch?: () => void;
  onDelete?: (id: string) => Promise<boolean> | void;
}

const PIPELINES: PipelinePrevisional[] = ['consulta', 'seguimiento', 'ingreso', 'cobro', 'jubi_especiales', 'ucap', 'jubi_ordinarias', 'finalizado', 'descartado'];

export default function FichasList({ clientes, onSelect, onNew, onRefetch, onDelete }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroPipeline, setFiltroPipeline] = useState<PipelinePrevisional | 'todos'>('todos');
  const [vista, setVista] = useState<'tabla' | 'pipeline'>('tabla');
  const [copiado, setCopiado] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const handleDel = async (e: React.MouseEvent, c: ClientePrevisional) => {
    e.stopPropagation();
    if (!onDelete) return;
    if (confirmDel === c.id) {
      await onDelete(c.id);
      setConfirmDel(null);
    } else {
      setConfirmDel(c.id);
      setTimeout(() => setConfirmDel(p => p === c.id ? null : p), 3000);
    }
  };

  const copiar = (e: React.MouseEvent, texto: string, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(texto).catch(() => {});
    setCopiado(id);
    setTimeout(() => setCopiado(null), 1500);
  };

  const filtrados = clientes.filter(c => {
    const matchBusqueda = !busqueda ||
      c.apellido_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.cuil?.includes(busqueda) ||
      c.telefono?.includes(busqueda);
    const matchPipeline = filtroPipeline === 'todos' || c.pipeline === filtroPipeline;
    return matchBusqueda && matchPipeline;
  });

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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">CUIL</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Clave ANSES</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden xl:table-cell">Edad Jubilatoria</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Situación Actual</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pipeline</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-500">Sin resultados</td></tr>
                ) : (
                  filtrados.map((c, i) => {
                    return (
                      <tr
                        key={c.id}
                        onClick={() => onSelect(c)}
                        className="table-row animate-slide-up"
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
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
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {(() => {
                            const fechaJub = c.fecha_edad_jubilatoria || (() => {
                              if (!c.fecha_nacimiento) return null;
                              const m = c.fecha_nacimiento.match(/^(\d{4})-(\d{2})-(\d{2})/);
                              if (!m) return null;
                              const y = parseInt(m[1], 10) + (c.sexo === 'MUJER' ? 60 : 65);
                              return `${String(y).padStart(4,'0')}-${m[2]}-${m[3]}`;
                            })();
                            return fechaJub
                              ? <span className="text-xs text-gray-300">{formatFechaLocal(fechaJub)}</span>
                              : <span className="text-gray-600 text-xs">—</span>;
                          })()}
                        </td>
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
                        <td className="px-4 py-3">
                          <span className={`badge border ${PIPELINE_COLORS[c.pipeline ?? 'consulta'] ?? PIPELINE_COLORS['consulta']}`}>
                            {PIPELINE_LABELS[c.pipeline]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            {onDelete && (
                              <button
                                onClick={e => handleDel(e, c)}
                                title={confirmDel === c.id ? 'Click otra vez para eliminar' : 'Eliminar'}
                                className={`p-1.5 rounded-lg transition-colors ${confirmDel === c.id ? 'bg-red-500/20 text-red-400' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <ChevronRight className="w-4 h-4 text-gray-600" />
                          </div>
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
        <PrevisionalKanban clientes={filtrados} onSelect={onSelect} onRefetch={onRefetch} onDelete={onDelete} />
      )}
    </div>
  );
}
