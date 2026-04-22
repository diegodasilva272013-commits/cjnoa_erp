import { CasoCompleto } from '../../types/database';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Mic } from 'lucide-react';

interface CaseTableProps {
  casos: CasoCompleto[];
  onSelect: (caso: CasoCompleto) => void;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: (ids: string[]) => void;
}

const estadoColor: Record<string, string> = {
  'Vino a consulta': 'text-yellow-400',
  'Trámite no judicial': 'text-blue-400',
  'Cliente Judicial': 'text-emerald-400',
};

const estadoBorder: Record<string, string> = {
  'Vino a consulta': 'border-l-2 border-l-yellow-500/40',
  'Trámite no judicial': 'border-l-2 border-l-blue-500/40',
  'Cliente Judicial': 'border-l-2 border-l-emerald-500/40',
};

const materiaBadge = (materia: string) => {
  switch (materia) {
    case 'Jubilaciones':
      return 'badge-blue';
    case 'Sucesorios':
      return 'badge-purple';
    case 'Reajuste':
      return 'badge-green';
    case 'Accidentes':
      return 'badge-yellow';
    case 'Laboral':
      return 'badge-yellow';
    default:
      return 'badge-yellow';
  }
};

const interesColor: Record<string, string> = {
  'Muy interesante': 'text-emerald-400',
  'Interesante': 'text-blue-400',
  'Poco interesante': 'text-yellow-400',
};

const interesLabel: Record<string, string> = {
  'Muy interesante': 'Muy int.',
  'Interesante': 'Int.',
  'Poco interesante': 'Poco',
};

export default function CaseTable({ casos, onSelect, selected, onToggle, onToggleAll }: CaseTableProps) {
  const allSelected = casos.length > 0 && casos.every(c => selected?.has(c.id));
  const someSelected = !allSelected && casos.some(c => selected?.has(c.id));
  const hasSelection = selected && selected.size > 0;
  if (casos.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <p className="text-gray-500">No se encontraron casos</p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {onToggle && (
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={() => onToggleAll?.(casos.map(c => c.id))}
                    className="checkbox-dark"
                  />
                </th>
              )}
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Cliente
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-3">
                Materia
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-3 hidden md:table-cell">
                Estado
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-3 py-3 hidden lg:table-cell">
                Socio
              </th>
            </tr>
          </thead>
          <tbody>
            {casos.map((caso) => {
              return (
              <tr
                key={caso.id}
                onClick={() => !hasSelection && onSelect(caso)}
                className={`table-row ${estadoBorder[caso.estado] || ''} ${selected?.has(caso.id) ? 'bg-violet-500/5' : ''}`}
              >
                {onToggle && (
                  <td className="px-4 py-3" onClick={e => { e.stopPropagation(); onToggle(caso.id); }}>
                    <input
                      type="checkbox"
                      checked={selected?.has(caso.id) ?? false}
                      onChange={() => onToggle(caso.id)}
                      className="checkbox-dark"
                    />
                  </td>
                )}
                {/* CLIENTE — nombre + teléfono + fecha debajo */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-white/70 text-xs font-bold shrink-0">
                      {caso.nombre_apellido.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">
                          {caso.nombre_apellido}
                        </span>
                        {caso.tiene_nota_voz && (
                          <Mic className="w-3 h-3 text-emerald-400 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">
                          {caso.telefono || 'Sin tel.'}
                        </span>
                        {caso.fecha && (
                          <>
                            <span className="text-gray-700">·</span>
                            <span className="text-xs text-gray-500">
                              {format(new Date(caso.fecha + 'T12:00:00'), "dd/MM/yy", { locale: es })}
                            </span>
                          </>
                        )}
                        {caso.interes && (
                          <>
                            <span className="text-gray-700">·</span>
                            <span className={`text-xs font-medium ${interesColor[caso.interes] || 'text-gray-500'}`}>
                              {interesLabel[caso.interes] || caso.interes}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </td>

                {/* MATERIA */}
                <td className="px-3 py-3">
                  <span className={materiaBadge(caso.materia)}>
                    {caso.materia === 'Otro' ? caso.materia_otro || 'Otro' : caso.materia}
                  </span>
                </td>

                {/* ESTADO */}
                <td className="px-3 py-3 hidden md:table-cell">
                  <span className={`text-xs font-medium ${estadoColor[caso.estado] || 'text-blue-400'}`}>
                    {caso.estado}
                  </span>
                </td>

                {/* SOCIO + fuente debajo */}
                <td className="px-3 py-3 hidden lg:table-cell">
                  <div>
                    <span className="text-sm text-gray-300">{caso.socio}</span>
                    {caso.fuente && (
                      <div className="text-xs text-gray-600 mt-0.5">
                        {caso.fuente}{caso.captadora ? ` · ${caso.captadora.split(' - ')[0]}` : ''}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    </div>
  );
}
