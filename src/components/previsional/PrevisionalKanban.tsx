import { useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCenter, DragOverlay,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ClientePrevisional, PipelinePrevisional, PIPELINE_LABELS, calcularSemaforo, SEMAFORO_COLORS } from '../../types/previsional';
import { supabase } from '../../lib/supabase';

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
  onRefetch?: () => void;
}

function PrevCard({ cliente, onSelect }: { cliente: ClientePrevisional; onSelect: (c: ClientePrevisional) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cliente.id });
  const semaforo = calcularSemaforo(cliente.fecha_ultimo_contacto);
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/10 transition-all cursor-grab active:cursor-grabbing"
    >
      <button className="w-full text-left" onClick={() => onSelect(cliente)} onPointerDown={e => e.stopPropagation()}>
        <div className="flex items-start gap-2">
          <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${SEMAFORO_COLORS[semaforo]}`} />
          <p className="text-xs font-medium text-white leading-tight">{cliente.apellido_nombre}</p>
        </div>
        {cliente.captado_por && <p className="text-[10px] text-gray-600 mt-1 truncate pl-4">{cliente.captado_por}</p>}
        {cliente.cobro_total > 0 && <p className="text-[10px] text-emerald-400 font-medium mt-1 pl-4">${cliente.cobro_total.toLocaleString('es-AR')}</p>}
        {cliente.saldo_pendiente > 0 && <p className="text-[10px] text-amber-400 mt-0.5 pl-4">Pend. ${cliente.saldo_pendiente.toLocaleString('es-AR')}</p>}
      </button>
    </div>
  );
}

export default function PrevisionalKanban({ clientes, onSelect, onRefetch }: Props) {
  const [items, setItems] = useState<ClientePrevisional[]>(clientes);
  const [active, setActive] = useState<ClientePrevisional | null>(null);

  if (clientes !== items && !active) setItems(clientes);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const grouped = ORDERED_PIPELINES.reduce<Record<PipelinePrevisional, ClientePrevisional[]>>(
    (acc, p) => { acc[p] = items.filter(c => c.pipeline === p); return acc; },
    {} as Record<PipelinePrevisional, ClientePrevisional[]>
  );

  function handleDragStart(e: DragStartEvent) {
    setActive(items.find(c => c.id === e.active.id) || null);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active: a, over } = e;
    if (!over) return;
    const overPipeline = ORDERED_PIPELINES.find(p => p === over.id);
    if (overPipeline) {
      setItems(prev => prev.map(c => c.id === a.id ? { ...c, pipeline: overPipeline } : c));
    } else {
      const overCard = items.find(c => c.id === over.id);
      if (overCard && overCard.pipeline !== items.find(c => c.id === a.id)?.pipeline) {
        setItems(prev => prev.map(c => c.id === a.id ? { ...c, pipeline: overCard.pipeline } : c));
      }
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActive(null);
    const moved = items.find(c => c.id === e.active.id);
    if (!moved) return;
    const original = clientes.find(c => c.id === e.active.id);
    if (original && original.pipeline !== moved.pipeline) {
      await supabase.from('clientes_previsional').update({ pipeline: moved.pipeline }).eq('id', moved.id);
      onRefetch?.();
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {ORDERED_PIPELINES.map(pipeline => {
          const colItems = grouped[pipeline];
          const styles = COLUMN_STYLES[pipeline];
          return (
            <div key={pipeline} id={pipeline} className={`glass-card p-0 overflow-hidden border-t-2 ${styles.border}`}>
              <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
                  <h3 className="text-xs font-semibold text-white truncate">{PIPELINE_LABELS[pipeline]}</h3>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ml-1 ${styles.badge}`}>{colItems.length}</span>
              </div>
              <SortableContext items={colItems.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div className="p-2 space-y-2 max-h-[65vh] overflow-y-auto">
                  {colItems.length === 0
                    ? <p className="text-[10px] text-gray-600 text-center py-6">Sin clientes</p>
                    : colItems.map(c => <PrevCard key={c.id} cliente={c} onSelect={onSelect} />)
                  }
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>
      <DragOverlay>
        {active && (
          <div className="p-3 rounded-xl bg-[#1a1a2e] border border-violet-500/30 shadow-2xl w-44 opacity-90">
            <p className="text-xs font-medium text-white">{active.apellido_nombre}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

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
