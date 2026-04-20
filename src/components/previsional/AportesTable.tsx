import { useState } from 'react';
import { Plus, Trash2, Briefcase, Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import { AporteLaboral, calcularResumenAportes, SexoCliente, COSTO_MENSUAL_27705 } from '../../types/previsional';

interface Props {
  aportes: AporteLaboral[];
  loading: boolean;
  hijos: number;
  sexo: SexoCliente | null;
  onAdd: (a: Partial<AporteLaboral>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}

export default function AportesTable({ aportes, loading, hijos, sexo, onAdd, onRemove }: Props) {
  const [adding, setAdding] = useState(false);
  const [newAporte, setNewAporte] = useState({
    empleador: '',
    fecha_desde: '',
    fecha_hasta: '',
    es_antes_0993: false,
    es_simultaneo: false,
    observaciones: '',
  });

  const resumen = sexo
    ? calcularResumenAportes(aportes, hijos, sexo, 0)
    : null;

  const handleAdd = async () => {
    if (!newAporte.fecha_desde || !newAporte.fecha_hasta) return;
    const ok = await onAdd(newAporte);
    if (ok) {
      setNewAporte({ empleador: '', fecha_desde: '', fecha_hasta: '', es_antes_0993: false, es_simultaneo: false, observaciones: '' });
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Historial de Aportes Laborales</h3>
          <span className="text-xs text-gray-500">({aportes.length})</span>
        </div>
        <button onClick={() => setAdding(!adding)} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
          <Plus className="w-3 h-3" /> Agregar
        </button>
      </div>

      {/* Formulario de nuevo aporte */}
      {adding && (
        <div className="glass-card p-4 space-y-3 border-blue-500/20">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <input
                type="text"
                value={newAporte.empleador}
                onChange={e => setNewAporte({ ...newAporte, empleador: e.target.value })}
                className="input-dark text-sm"
                placeholder="Empleador / Empresa"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Desde</label>
              <input type="date" value={newAporte.fecha_desde} onChange={e => setNewAporte({ ...newAporte, fecha_desde: e.target.value })} className="input-dark text-sm" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">Hasta</label>
              <input type="date" value={newAporte.fecha_hasta} onChange={e => setNewAporte({ ...newAporte, fecha_hasta: e.target.value })} className="input-dark text-sm" />
            </div>
            <div className="flex flex-col gap-2 justify-center">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={newAporte.es_antes_0993} onChange={e => setNewAporte({ ...newAporte, es_antes_0993: e.target.checked })} className="accent-blue-500" />
                Antes 09/93
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={newAporte.es_simultaneo} onChange={e => setNewAporte({ ...newAporte, es_simultaneo: e.target.checked })} className="accent-amber-500" />
                Simultáneo
              </label>
            </div>
          </div>
          <input
            type="text"
            value={newAporte.observaciones}
            onChange={e => setNewAporte({ ...newAporte, observaciones: e.target.value })}
            className="input-dark text-sm"
            placeholder="Observaciones (opcional)"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
            <button onClick={handleAdd} disabled={!newAporte.fecha_desde || !newAporte.fecha_hasta} className="btn-primary text-xs px-3 py-1.5">Guardar</button>
          </div>
        </div>
      )}

      {/* Tabla de aportes */}
      {aportes.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Empleador</th>
                <th className="text-left text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Desde</th>
                <th className="text-left text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Hasta</th>
                <th className="text-center text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Meses</th>
                <th className="text-center text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Antes 09/93</th>
                <th className="text-center text-[10px] text-gray-500 uppercase tracking-wider py-2 px-3">Simult.</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {aportes.map(a => (
                <tr key={a.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-3 text-white font-medium">{a.empleador || '—'}</td>
                  <td className="py-2.5 px-3 text-gray-400">{a.fecha_desde ? new Date(a.fecha_desde).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="py-2.5 px-3 text-gray-400">{a.fecha_hasta ? new Date(a.fecha_hasta).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="py-2.5 px-3 text-center text-white font-mono">{a.total_meses}</td>
                  <td className="py-2.5 px-3 text-center">
                    {a.es_antes_0993 ? <CheckCircle className="w-4 h-4 text-blue-400 mx-auto" /> : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {a.es_simultaneo ? <AlertCircle className="w-4 h-4 text-amber-400 mx-auto" /> : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="py-2.5 px-3">
                    <button onClick={() => onRemove(a.id)} className="p-1 hover:bg-red-500/10 rounded-lg text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8">
          <Briefcase className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">No hay aportes registrados</p>
        </div>
      )}

      {/* Resumen de aportes */}
      {resumen && aportes.length > 0 && (
        <div className="glass-card p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Resumen de Servicios</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
              <p className="text-lg font-bold text-white">{resumen.totalMeses}</p>
              <p className="text-[10px] text-gray-500">Total Meses</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-center">
              <p className="text-lg font-bold text-amber-400">-{resumen.mesesSimultaneos}</p>
              <p className="text-[10px] text-gray-500">Simultáneos</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-center">
              <p className="text-lg font-bold text-blue-400">{resumen.mesesAntes0993}</p>
              <p className="text-[10px] text-gray-500">Antes 09/93</p>
            </div>
            {sexo === 'MUJER' && (
              <div className="p-3 rounded-xl bg-pink-500/5 border border-pink-500/10 text-center">
                <p className="text-lg font-bold text-pink-400">+{resumen.mesesHijos}</p>
                <p className="text-[10px] text-gray-500">Por Hijos ({hijos})</p>
              </div>
            )}
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
              <p className="text-lg font-bold text-emerald-400">{resumen.totalServicios}</p>
              <p className="text-[10px] text-gray-500">Total Servicios</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
              <p className="text-lg font-bold text-emerald-400">{resumen.totalAniosServicios}a</p>
              <p className="text-[10px] text-gray-500">Años Servicios</p>
            </div>
            <div className={`p-3 rounded-xl text-center ${resumen.faltanMeses > 0 ? 'bg-red-500/5 border border-red-500/10' : 'bg-emerald-500/5 border border-emerald-500/10'}`}>
              <p className={`text-lg font-bold ${resumen.faltanMeses > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {resumen.faltanMeses > 0 ? resumen.faltanMeses : '✓'}
              </p>
              <p className="text-[10px] text-gray-500">{resumen.faltanMeses > 0 ? 'Faltan Meses' : 'Completo'}</p>
            </div>
            {resumen.faltanMeses > 0 && (
              <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 text-center">
                <p className="text-lg font-bold text-purple-400">${(resumen.costoTotal27705 / 1000000).toFixed(1)}M</p>
                <p className="text-[10px] text-gray-500">Costo 27.705</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
