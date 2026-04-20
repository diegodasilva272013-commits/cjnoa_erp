import { useState } from 'react';
import { Clock, Plus, MessageSquare, ArrowRight, Send } from 'lucide-react';
import { HistorialAvance } from '../../types/previsional';
import { useAuth } from '../../context/AuthContext';

interface Props {
  avances: HistorialAvance[];
  loading: boolean;
  onAdd: (a: Partial<HistorialAvance>) => Promise<boolean>;
}

export default function HistorialTimeline({ avances, loading, onAdd }: Props) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ titulo: '', descripcion: '', tarea_siguiente: '' });

  const handleAdd = async () => {
    if (!form.titulo.trim()) return;
    const ok = await onAdd({
      titulo: form.titulo,
      descripcion: form.descripcion || null,
      tarea_siguiente: form.tarea_siguiente || null,
      usuario_id: user?.id,
      usuario_nombre: user?.user_metadata?.nombre || user?.email || 'Sistema',
    });
    if (ok) {
      setForm({ titulo: '', descripcion: '', tarea_siguiente: '' });
      setAdding(false);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">Historial de Avances</h3>
          <span className="text-xs text-gray-500">({avances.length})</span>
          <span className="text-[10px] text-gray-600 bg-white/[0.03] px-2 py-0.5 rounded-full">Permanente</span>
        </div>
        <button onClick={() => setAdding(!adding)} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
          <Plus className="w-3 h-3" /> Nuevo Avance
        </button>
      </div>

      {/* Formulario */}
      {adding && (
        <div className="glass-card p-4 space-y-3 border-purple-500/20">
          <input
            type="text"
            value={form.titulo}
            onChange={e => setForm({ ...form, titulo: e.target.value })}
            className="input-dark text-sm font-medium"
            placeholder="Título del avance *"
          />
          <textarea
            rows={2}
            value={form.descripcion}
            onChange={e => setForm({ ...form, descripcion: e.target.value })}
            className="input-dark resize-none text-sm"
            placeholder="Descripción detallada..."
          />
          <div className="relative">
            <ArrowRight className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              value={form.tarea_siguiente}
              onChange={e => setForm({ ...form, tarea_siguiente: e.target.value })}
              className="input-dark text-sm pl-9"
              placeholder="Próxima tarea a realizar..."
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
            <button onClick={handleAdd} disabled={!form.titulo.trim()} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
              <Send className="w-3 h-3" /> Registrar
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {avances.length > 0 ? (
        <div className="relative pl-6">
          {/* Línea vertical */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gradient-to-b from-purple-500/40 via-purple-500/20 to-transparent" />

          {avances.map((a, i) => (
            <div key={a.id} className="relative mb-4 last:mb-0" style={{ animationDelay: `${i * 60}ms` }}>
              {/* Dot */}
              <div className={`absolute -left-6 top-2 w-[10px] h-[10px] rounded-full border-2 ${
                i === 0 ? 'border-purple-400 bg-purple-500/30' : 'border-gray-600 bg-gray-800'
              }`} />

              <div className={`glass-card p-3.5 transition-all hover:bg-white/[0.03] ${i === 0 ? 'border-purple-500/10' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-white">{a.titulo}</h4>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">{formatDate(a.created_at)} · {formatTime(a.created_at)}</span>
                </div>
                
                {a.descripcion && (
                  <p className="text-xs text-gray-400 mb-2 leading-relaxed">{a.descripcion}</p>
                )}

                {a.tarea_siguiente && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400/80 bg-emerald-500/5 px-2.5 py-1 rounded-lg w-fit">
                    <ArrowRight className="w-3 h-3" />
                    {a.tarea_siguiente}
                  </div>
                )}

                <p className="text-[10px] text-gray-600 mt-2">
                  por {a.usuario_nombre || 'Sistema'}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <MessageSquare className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">Sin avances registrados</p>
          <p className="text-[10px] text-gray-600 mt-1">Los avances son permanentes y no se pueden eliminar</p>
        </div>
      )}
    </div>
  );
}
