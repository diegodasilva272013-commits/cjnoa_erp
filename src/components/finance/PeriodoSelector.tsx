import { CalendarRange } from 'lucide-react';
import type { PeriodoFinanciero, PresetPeriodo } from '../../hooks/usePeriodoFinanciero';

interface Opcion {
  id: PresetPeriodo;
  label: string;
}

const OPCIONES: Opcion[] = [
  { id: 'mes_actual', label: 'Mes actual' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: 'ultimos_30', label: 'Últ. 30 días' },
  { id: 'ultimos_90', label: 'Últ. 90 días' },
  { id: 'anio_actual', label: 'Año actual' },
  { id: 'todo', label: 'Todo' },
];

interface Props {
  periodo: PeriodoFinanciero;
  /**
   * Si es true muestra los inputs de fecha cuando el preset es "personalizado".
   * Default: true.
   */
  conPersonalizado?: boolean;
  className?: string;
}

/**
 * Selector de período reutilizable para tableros financieros.
 *
 * Pills compactas + inputs de fecha cuando el usuario elige "Personalizado".
 * El estado vive en el hook `usePeriodoFinanciero` (persistido en localStorage).
 */
export default function PeriodoSelector({ periodo, conPersonalizado = true, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <CalendarRange className="w-4 h-4 text-zinc-500 shrink-0" aria-hidden />
      <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Período">
        {OPCIONES.map(op => {
          const activa = periodo.preset === op.id;
          return (
            <button
              key={op.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => periodo.setPreset(op.id)}
              className={
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ' +
                (activa
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-white hover:border-white/20')
              }
            >
              {op.label}
            </button>
          );
        })}
        {conPersonalizado && (
          <button
            type="button"
            role="tab"
            aria-selected={periodo.preset === 'personalizado'}
            onClick={() => periodo.setRangoPersonalizado(periodo.desde, periodo.hasta)}
            className={
              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ' +
              (periodo.preset === 'personalizado'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:text-white hover:border-white/20')
            }
          >
            Personalizado
          </button>
        )}
      </div>

      {conPersonalizado && periodo.preset === 'personalizado' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={periodo.desde}
            onChange={e => periodo.setRangoPersonalizado(e.target.value, periodo.hasta)}
            className="px-2 py-1 rounded-md bg-black/40 border border-white/10 text-xs text-white"
            aria-label="Desde"
          />
          <span className="text-zinc-500 text-xs">→</span>
          <input
            type="date"
            value={periodo.hasta}
            onChange={e => periodo.setRangoPersonalizado(periodo.desde, e.target.value)}
            className="px-2 py-1 rounded-md bg-black/40 border border-white/10 text-xs text-white"
            aria-label="Hasta"
          />
        </div>
      )}
    </div>
  );
}
