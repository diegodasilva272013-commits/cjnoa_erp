import { useEffect, useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay,
  PointerSensor, useSensor, useSensors, pointerWithin,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ClientePrevisional, PipelinePrevisional, PIPELINE_LABELS, calcularSemaforo, SEMAFORO_COLORS } from '../../types/previsional';
import { supabase } from '../../lib/supabase';

const ORDERED_PIPELINES: PipelinePrevisional[] = [
  'consulta', 'seguimiento', 'ingreso', 'cobro',
  'jubi_especiales', 'ucap', 'jubi_ordinarias', 'finalizado', 'descartado',
];

const COLUMN_STYLES: Record<PipelinePrevisional, { border: string; badge: string; dot: string }> = {
  consulta:        { border: 'border-t-blue-500',    badge: 'bg-blue-500/10 text-blue-400',      dot: 'bg-blue-500' },
  seguimiento:     { border: 'border-t-amber-500',   badge: 'bg-amber-500/10 text-amber-400',    dot: 'bg-amber-500' },
  ingreso:         { border: 'border-t-purple-500',  badge: 'bg-purple-500/10 text-purple-400',  dot: 'bg-purple-500' },
  cobro:           { border: 'border-t-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400',dot: 'bg-emerald-500' },
  jubi_especiales: { border: 'border-t-violet-500',  badge: 'bg-violet-500/10 text-violet-400',  dot: 'bg-violet-500' },
  ucap:            { border: 'border-t-cyan-500',    badge: 'bg-cyan-500/10 text-cyan-400',      dot: 'bg-cyan-500' },
  jubi_ordinarias: { border: 'border-t-sky-500',     badge: 'bg-sky-500/10 text-sky-400',        dot: 'bg-sky-500' },
  finalizado:      { border: 'border-t-gray-500',    badge: 'bg-gray-500/10 text-gray-400',      dot: 'bg-gray-500' },
  descartado:      { border: 'border-t-red-500',     badge: 'bg-red-500/10 text-red-400',        dot: 'bg-red-500' },
};

interface Props {
  clientes: ClientePrevisional[];
  onSelect: (c: ClientePrevisional) => void;
  onRefetch?: () => void;
}

function DraggableCard({ cliente, onSelect }: { cliente: ClientePrevisional; onSelect: (c: ClientePrevisional) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: cliente.id });
  const semaforo = calcularSemaforo(cliente.fecha_ultimo_contacto);
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.25 : 1, touchAction: 'none' };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-white/10 transition-all cursor-grab active:cursor-grabbing select-none">
      <button className="w-full text-left" onClick={e => { e.stopPropagation(); onSelect(cliente); }} onPointerDown={e => e.stopPropagation()}>
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

function DropColumn({ pipeline, styles, children, count }: {
  pipeline: PipelinePrevisional; styles: typeof COLUMN_STYLES[PipelinePrevisional]; children: React.ReactNode; count: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: pipeline });
  return (
    <div className={`glass-card p-0 overflow-hidden border-t-2 ${styles.border} transition-all ${isOver ? 'ring-2 ring-white/20 scale-[1.01]' : ''}`}>
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
          <h3 className="text-xs font-semibold text-white truncate">{PIPELINE_LABELS[pipeline]}</h3>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ml-1 ${styles.badge}`}>{count}</span>
      </div>
      <div ref={setNodeRef} className="p-2 space-y-2 min-h-[80px] max-h-[65vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

export default function PrevisionalKanban({ clientes, onSelect, onRefetch }: Props) {
  const [items, setItems] = useState<ClientePrevisional[]>(clientes);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => { if (!activeId) setItems(clientes); }, [clientes, activeId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const activeCliente = items.find(c => c.id === activeId) ?? null;

  const grouped = ORDERED_PIPELINES.reduce<Record<PipelinePrevisional, ClientePrevisional[]>>(
    (acc, p) => { acc[p] = items.filter(c => c.pipeline === p); return acc; },
    {} as Record<PipelinePrevisional, ClientePrevisional[]>
  );

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;

    // over.id puede ser el id de una columna (string pipeline) o el id de otra card (UUID)
    let newPipeline: PipelinePrevisional | null = null;
    if (ORDERED_PIPELINES.includes(over.id as PipelinePrevisional)) {
      newPipeline = over.id as PipelinePrevisional;
    } else {
      // Soltó encima de una card → usar el pipeline de esa card
      const overCard = items.find(c => c.id === over.id);
      if (overCard) newPipeline = overCard.pipeline as PipelinePrevisional;
    }

    if (!newPipeline) return;
    const card = items.find(c => c.id === active.id);
    if (!card || card.pipeline === newPipeline) return;

    setItems(prev => prev.map(c => c.id === active.id ? { ...c, pipeline: newPipeline! } : c));
    await supabase.from('clientes_previsional').update({ pipeline: newPipeline }).eq('id', active.id);
    onRefetch?.();
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={e => setActiveId(e.active.id as string)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {ORDERED_PIPELINES.map(pipeline => (
          <DropColumn key={pipeline} pipeline={pipeline} styles={COLUMN_STYLES[pipeline]} count={grouped[pipeline].length}>
            {grouped[pipeline].length === 0
              ? <p className="text-[10px] text-gray-600 text-center py-6">Sin clientes</p>
              : grouped[pipeline].map(c => <DraggableCard key={c.id} cliente={c} onSelect={onSelect} />)
            }
          </DropColumn>
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeCliente && (
          <div className="p-3 rounded-xl shadow-2xl w-44 select-none"
            style={{ background: '#1a1a2e', border: '1px solid rgba(139,92,246,0.4)' }}>
            <p className="text-xs font-medium text-white leading-tight">{activeCliente.apellido_nombre}</p>
            <p className="text-[10px] text-violet-400/70 mt-1">{PIPELINE_LABELS[activeCliente.pipeline as PipelinePrevisional]}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
