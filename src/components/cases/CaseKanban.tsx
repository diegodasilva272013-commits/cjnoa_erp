import { Star } from 'lucide-react';
import {
  DndContext, DragEndEvent, DragOverEvent, PointerSensor,
  useSensor, useSensors, closestCenter, DragOverlay, DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { CasoCompleto, ESTADOS_CASO, EstadoCaso } from '../../types/database';
import { supabase } from '../../lib/supabase';

interface CaseKanbanProps {
  casos: CasoCompleto[];
  onSelect: (caso: CasoCompleto) => void;
  onRefetch?: () => void;
}

const COLUMN_COLORS: Record<EstadoCaso, { border: string; badge: string; dot: string }> = {
  'Vino a consulta': { border: 'border-t-yellow-500', badge: 'bg-yellow-500/10 text-yellow-400', dot: 'bg-yellow-500' },
  'Trámite no judicial': { border: 'border-t-blue-500', badge: 'bg-blue-500/10 text-blue-400', dot: 'bg-blue-500' },
  'Cliente Judicial': { border: 'border-t-emerald-500', badge: 'bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-500' },
};

const formatMoney = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function KanbanCard({ caso, onSelect, isDragging }: { caso: CasoCompleto; onSelect: (c: CasoCompleto) => void; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: sorting } = useSortable({ id: caso.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: sorting ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/10 transition-all cursor-grab active:cursor-grabbing ${isDragging ? 'shadow-2xl ring-1 ring-white/20' : ''}`}
    >
      <button className="w-full text-left" onClick={() => onSelect(caso)} onPointerDown={e => e.stopPropagation()}>
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
    </div>
  );
}

export default function CaseKanban({ casos, onSelect, onRefetch }: CaseKanbanProps) {
  const [items, setItems] = useState<CasoCompleto[]>(casos);
  const [activeCaso, setActiveCaso] = useState<CasoCompleto | null>(null);

  // sync when parent updates
  if (casos !== items && !activeCaso) setItems(casos);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const grouped = ESTADOS_CASO.reduce<Record<EstadoCaso, CasoCompleto[]>>(
    (acc, estado) => {
      acc[estado] = items.filter(c => c.estado === estado);
      return acc;
    },
    {} as Record<EstadoCaso, CasoCompleto[]>
  );

  function handleDragStart(event: DragStartEvent) {
    const c = items.find(i => i.id === event.active.id);
    setActiveCaso(c || null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const overId = over.id as string;
    // if over a column header
    const overEstado = ESTADOS_CASO.find(e => e === overId);
    if (overEstado) {
      setItems(prev => prev.map(c => c.id === active.id ? { ...c, estado: overEstado } : c));
    } else {
      // over a card — find its estado
      const overCard = items.find(c => c.id === overId);
      if (overCard && overCard.estado !== items.find(c => c.id === active.id)?.estado) {
        setItems(prev => prev.map(c => c.id === active.id ? { ...c, estado: overCard.estado } : c));
      }
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active } = event;
    setActiveCaso(null);
    const moved = items.find(c => c.id === active.id);
    if (!moved) return;
    const original = casos.find(c => c.id === active.id);
    if (original && original.estado !== moved.estado) {
      await supabase.from('casos').update({ estado: moved.estado }).eq('id', moved.id);
      onRefetch?.();
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ESTADOS_CASO.map(estado => {
          const colItems = grouped[estado];
          const colors = COLUMN_COLORS[estado];
          return (
            <div key={estado} id={estado} className={`glass-card p-0 overflow-hidden border-t-2 ${colors.border}`}>
              <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <h3 className="text-sm font-semibold text-white">{estado}</h3>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                  {colItems.length}
                </span>
              </div>
              <SortableContext items={colItems.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div className="p-2 space-y-2 max-h-[65vh] overflow-y-auto">
                  {colItems.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-6">Sin casos</p>
                  ) : (
                    colItems.map(caso => (
                      <KanbanCard key={caso.id} caso={caso} onSelect={onSelect} />
                    ))
                  )}
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>
      <DragOverlay>
        {activeCaso && (
          <div className="p-3 rounded-xl bg-[#1a1a2e] border border-violet-500/30 shadow-2xl w-64 opacity-90">
            <p className="text-sm font-medium text-white">{activeCaso.nombre_apellido}</p>
            <p className="text-xs text-gray-500 mt-1">{activeCaso.materia}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
