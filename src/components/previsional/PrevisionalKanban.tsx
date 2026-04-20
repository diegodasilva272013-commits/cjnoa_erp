import { ClientePrevisional, PipelinePrevisional, PIPELINE_LABELS, calcularSemaforo, SEMAFORO_COLORS } from '../../types/previsional';

const ORDERED_PIPELINES: PipelinePrevisional[] = ['consulta', 'seguimiento', 'ingreso', 'cobro', 'finalizado', 'descartado'];

const COLUMN_STYLES: Record<PipelinePrevisional, { border: string; badge: string; dot: string }> = {
  consulta:    { border: 'border-t-blue-500',    badge: 'bg-blue-500/10 text-blue-400',    dot: 'bg-blue-500' },
  seguimiento: { border: 'border-t-amber-500',   badge: 'bg-amber-500/10 text-amber-400',  dot: 'bg-amber-500' },
  ingreso:     { border: 'border-t-purple-500',  badge: 'bg-purple-500/10 text-purple-400',dot: 'bg-purple-500' },
  cobro:       { border: 'border-t-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-500' },
  finalizado:  { border: 'border-t-gray-500',    badge: 'bg-gray-500/10 text-gray-400',    dot: 'bg-gray-500' },
  descartado:  { border: 'border-t-red-500',     badge: 'bg-red-500/10 text-red-400',      dot: 'bg-red-500' },
};

interface Props {
  clientes: ClientePrevisional[];
  onSelect: (c: ClientePrevisional) => void;
}

export default function PrevisionalKanban({ clientes, onSelect }: Props) {
  const grouped = ORDERED_PIPELINES.reduce<Record<PipelinePrevisional, ClientePrevisional[]>>(
    (acc, p) => { acc[p] = clientes.filter(c => c.pipeline === p); return acc; },
    {} as Record<PipelinePrevisional, ClientePrevisional[]>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {ORDERED_PIPELINES.map(pipeline => {
        const items = grouped[pipeline];
        const styles = COLUMN_STYLES[pipeline];
        return (
          <div key={pipeline} className={`glass-card p-0 overflow-hidden border-t-2 ${styles.border}`}>
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
                <h3 className="text-xs font-semibold text-white truncate">{PIPELINE_LABELS[pipeline]}</h3>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ml-1 ${styles.badge}`}>
                {items.length}
              </span>
            </div>
            <div className="p-2 space-y-2 max-h-[65vh] overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-[10px] text-gray-600 text-center py-6">Sin clientes</p>
              ) : (
                items.map((c, idx) => {
                  const semaforo = calcularSemaforo(c.fecha_ultimo_contacto);
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelect(c)}
                      className="w-full text-left p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/10 transition-all animate-slide-up"
                      style={{ animationDelay: `${idx * 30}ms` }}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${SEMAFORO_COLORS[semaforo]}`} />
                        <p className="text-xs font-medium text-white leading-tight">{c.apellido_nombre}</p>
                      </div>
                      {c.captado_por && (
                        <p className="text-[10px] text-gray-600 mt-1 truncate pl-4">{c.captado_por}</p>
                      )}
                      {c.cobro_total > 0 && (
                        <p className="text-[10px] text-emerald-400 font-medium mt-1 pl-4">
                          ${c.cobro_total.toLocaleString('es-AR')}
                        </p>
                      )}
                      {c.saldo_pendiente > 0 && (
                        <p className="text-[10px] text-amber-400 mt-0.5 pl-4">
                          Pend. ${c.saldo_pendiente.toLocaleString('es-AR')}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
