import { Inbox } from 'lucide-react';
import type { PeriodoFinanciero, PresetPeriodo } from '../../hooks/usePeriodoFinanciero';

interface Props {
  periodo: PeriodoFinanciero;
  /** Texto del recurso vacío, p.ej. "ingresos", "egresos". */
  recurso: string;
  /** Acción extra opcional (por ejemplo, "Nuevo ingreso"). */
  accionExtra?: React.ReactNode;
}

const SUGERENCIAS: { id: PresetPeriodo; label: string }[] = [
  { id: 'mes_anterior', label: 'Ver mes anterior' },
  { id: 'ultimos_90', label: 'Últimos 90 días' },
  { id: 'anio_actual', label: 'Año actual' },
  { id: 'todo', label: 'Mostrar todo' },
];

/**
 * Banner que se muestra cuando un período financiero no tiene registros.
 *
 * Ofrece accesos rápidos a otros rangos para evitar el "todo en cero" del día 1
 * del mes (cuando la página por defecto filtra al mes en curso y todavía no hay
 * registros cargados).
 */
export default function EmptyPeriodHint({ periodo, recurso, accionExtra }: Props) {
  const sugerencias = SUGERENCIAS.filter(s => s.id !== periodo.preset);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-start gap-3 flex-1">
        <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Inbox className="w-5 h-5 text-amber-300" />
        </div>
        <div>
          <div className="text-sm font-semibold text-amber-100">
            Sin {recurso} en {periodo.label}
          </div>
          <div className="text-xs text-amber-200/70 mt-0.5">
            Los datos siguen en la base. Probá otro período para verlos.
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {sugerencias.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => periodo.setPreset(s.id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 border border-amber-500/40 text-amber-100 hover:bg-amber-500/25 transition-colors"
          >
            {s.label}
          </button>
        ))}
        {accionExtra}
      </div>
    </div>
  );
}
