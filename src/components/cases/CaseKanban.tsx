import { Users, Star, Phone } from 'lucide-react';
import { CasoCompleto, ESTADOS_CASO, EstadoCaso } from '../../types/database';

interface CaseKanbanProps {
  casos: CasoCompleto[];
  onSelect: (caso: CasoCompleto) => void;
}

const COLUMN_COLORS: Record<EstadoCaso, { border: string; badge: string; dot: string }> = {
  'Vino a consulta': { border: 'border-t-yellow-500', badge: 'bg-yellow-500/10 text-yellow-400', dot: 'bg-yellow-500' },
  'Trámite no judicial': { border: 'border-t-blue-500', badge: 'bg-blue-500/10 text-blue-400', dot: 'bg-blue-500' },
  'Cliente Judicial': { border: 'border-t-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-500' },
};

const formatMoney = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function CaseKanban({ casos, onSelect }: CaseKanbanProps) {
  const grouped = ESTADOS_CASO.reduce<Record<EstadoCaso, CasoCompleto[]>>(
    (acc, estado) => {
      acc[estado] = casos.filter(c => c.estado === estado);
      return acc;
    },
    {} as Record<EstadoCaso, CasoCompleto[]>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {ESTADOS_CASO.map(estado => {
        const items = grouped[estado];
        const colors = COLUMN_COLORS[estado];
        return (
          <div key={estado} className={`glass-card p-0 overflow-hidden border-t-2 ${colors.border}`}>
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                <h3 className="text-sm font-semibold text-white">{estado}</h3>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                {items.length}
              </span>
            </div>
            <div className="p-2 space-y-2 max-h-[65vh] overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-6">Sin casos</p>
              ) : (
                items.map((caso, idx) => (
                  <button
                    key={caso.id}
                    onClick={() => onSelect(caso)}
                    className="w-full text-left p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/10 transition-all animate-slide-up"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <p className="text-sm font-medium text-white truncate">{caso.nombre_apellido}</p>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {caso.materia === 'Otro' ? caso.materia_otro || 'Otro' : caso.materia}
                      {caso.socio && ` · ${caso.socio}`}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      {caso.interes === 'Muy interesante' && (
                        <span className="flex items-center gap-1 text-[10px] text-purple-400">
                          <Star className="w-3 h-3" /> Muy int.
                        </span>
                      )}
                      {caso.saldo_pendiente > 0 && (
                        <span className="text-[10px] text-emerald-400 font-medium">
                          {formatMoney(caso.saldo_pendiente)} pend.
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
