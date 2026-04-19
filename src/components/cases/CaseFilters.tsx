import { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { FilterState, MATERIAS, ESTADOS_CASO } from '../../types/database';
import { useSocios } from '../../hooks/useSocios';

interface CaseFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export default function CaseFilters({ filters, onChange }: CaseFiltersProps) {
  const socios = useSocios();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch });

  const toggleArray = <T,>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  const hasActiveFilters =
    filters.materias.length > 0 ||
    filters.estados.length > 0 ||
    filters.socios.length > 0 ||
    filters.interes.length > 0 ||
    filters.soloDeudores ||
    filters.soloCuotasVencidas ||
    filters.fechaDesde ||
    filters.fechaHasta;

  return (
    <div className="space-y-4">
      {/* Barra de búsqueda */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={filters.busqueda}
            onChange={(e) => update({ busqueda: e.target.value })}
            placeholder="Buscar por nombre o apellido..."
            className="input-dark pl-10"
          />
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`btn-secondary flex items-center gap-2 ${hasActiveFilters ? 'border-white/20 text-white' : ''}`}
        >
          <Filter className="w-4 h-4" />
          <span className="hidden sm:inline">Filtros</span>
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-white" />
          )}
        </button>
      </div>

      {/* Filtros avanzados */}
      {showAdvanced && (
        <div className="glass-card p-5 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-white">Filtros avanzados</h4>
            {hasActiveFilters && (
              <button
                onClick={() => onChange({
                  busqueda: filters.busqueda,
                  materias: [],
                  estados: [],
                  socios: [],
                  interes: [],
                  soloDeudores: false,
                  soloCuotasVencidas: false,
                  fechaDesde: '',
                  fechaHasta: '',
                })}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Limpiar filtros
              </button>
            )}
          </div>

          {/* Materia */}
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Materia</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {MATERIAS.map(m => (
                <button
                  key={m}
                  onClick={() => update({ materias: toggleArray(filters.materias, m) })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filters.materias.includes(m)
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Estado */}
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Estado</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ESTADOS_CASO.map(e => (
                <button
                  key={e}
                  onClick={() => update({ estados: toggleArray(filters.estados, e) })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filters.estados.includes(e)
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Socio */}
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Socio</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {socios.map(s => (
                <button
                  key={s}
                  onClick={() => update({ socios: toggleArray(filters.socios, s) })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filters.socios.includes(s)
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Interés */}
          <div>
            <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Interés</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {['Muy interesante', 'Interesante', 'Poco interesante'].map(i => (
                <button
                  key={i}
                  onClick={() => update({ interes: toggleArray(filters.interes, i) })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filters.interes.includes(i)
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          {/* Checks y fechas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.soloDeudores}
                onChange={(e) => update({ soloDeudores: e.target.checked })}
                className="checkbox-dark"
              />
              <span className="text-sm text-gray-400 group-hover:text-gray-300">Solo deudores</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.soloCuotasVencidas}
                onChange={(e) => update({ soloCuotasVencidas: e.target.checked })}
                className="checkbox-dark"
              />
              <span className="text-sm text-gray-400 group-hover:text-gray-300">Solo cuotas vencidas</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 font-medium">Desde</label>
              <input
                type="date"
                value={filters.fechaDesde}
                onChange={(e) => update({ fechaDesde: e.target.value })}
                className="input-dark mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Hasta</label>
              <input
                type="date"
                value={filters.fechaHasta}
                onChange={(e) => update({ fechaHasta: e.target.value })}
                className="input-dark mt-1"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
