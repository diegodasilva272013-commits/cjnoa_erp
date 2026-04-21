import { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Clock, CheckCircle, X, Edit2, Trash2, TrendingUp, TrendingDown, Minus, Gavel } from 'lucide-react';
import { useCargosHora } from '../hooks/useCargosHora';
import { useCases } from '../hooks/useCases';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { CargoHoraCompleto, TipoCargoHora } from '../types/database';

const TIPO_LABELS: Record<TipoCargoHora, string> = {
  a_favor: 'A favor',
  en_contra: 'En contra',
  neutro: 'Neutro',
};

const TIPO_STYLES: Record<TipoCargoHora, string> = {
  a_favor: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
  en_contra: 'text-red-300 bg-red-500/15 border-red-500/30',
  neutro: 'text-gray-300 bg-white/5 border-white/10',
};

const tipoIcon = (t: TipoCargoHora) =>
  t === 'a_favor' ? <TrendingUp className="w-3.5 h-3.5" /> :
  t === 'en_contra' ? <TrendingDown className="w-3.5 h-3.5" /> :
  <Minus className="w-3.5 h-3.5" />;

interface TareaLite { id: string; titulo: string; caso_id: string | null }

export default function CargosHora() {
  const { user } = useAuth();
  const { cargos, loading, upsert, toggleRealizado, remove } = useCargosHora();
  const { casos } = useCases();
  const [tareas, setTareas] = useState<TareaLite[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todos' | 'pendientes' | 'realizados'>('pendientes');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<CargoHoraCompleto | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('tareas').select('id, titulo, caso_id').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => { if (data) setTareas(data as TareaLite[]); });
  }, []);

  const filtered = useMemo(() => {
    return cargos.filter(c => {
      const s = search.toLowerCase();
      const matchSearch = !s ||
        c.titulo.toLowerCase().includes(s) ||
        (c.cliente_nombre || '').toLowerCase().includes(s) ||
        (c.juzgado || '').toLowerCase().includes(s) ||
        (c.expediente || '').toLowerCase().includes(s);
      const matchFilter =
        filter === 'todos' ? true :
        filter === 'pendientes' ? !c.realizado :
        c.realizado;
      return matchSearch && matchFilter;
    });
  }, [cargos, search, filter]);

  const pendientes = cargos.filter(c => !c.realizado).length;
  const enContra = cargos.filter(c => c.tipo === 'en_contra' && !c.realizado).length;

  const handleDel = async (c: CargoHoraCompleto) => {
    if (confirmDel === c.id) { await remove(c.id); setConfirmDel(null); }
    else { setConfirmDel(c.id); setTimeout(() => setConfirmDel(null), 3000); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-400" />
            Cargos de Hora
          </h1>
          <p className="text-gray-400 text-sm mt-1">Actos procesales asentados con fecha y hora específica</p>
        </div>
        <button
          onClick={() => { setSelected(null); setModalOpen(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nuevo cargo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Pendientes</p>
          <p className="text-3xl font-bold text-amber-300 mt-1">{pendientes}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">En contra (pendientes)</p>
          <p className="text-3xl font-bold text-red-300 mt-1">{enContra}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500">Total histórico</p>
          <p className="text-3xl font-bold text-white mt-1">{cargos.length}</p>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, cliente, juzgado, expediente..."
            className="input-dark w-full pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(['pendientes', 'realizados', 'todos'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                filter === f ? 'bg-blue-500/25 text-blue-200 border border-blue-500/40' : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10'
              }`}
            >
              {f === 'pendientes' ? 'Pendientes' : f === 'realizados' ? 'Realizados' : 'Todos'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No hay cargos de hora {filter !== 'todos' && filter}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <div key={c.id} className={`glass-card p-4 flex flex-col md:flex-row gap-3 md:items-start ${c.realizado ? 'opacity-60' : ''}`}>
              <button
                onClick={() => toggleRealizado(c.id, !c.realizado)}
                className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center transition ${
                  c.realizado ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-white/5 border-white/15 text-gray-400 hover:border-emerald-500/40'
                }`}
                title={c.realizado ? 'Marcar pendiente' : 'Marcar realizado'}
              >
                <CheckCircle className="w-5 h-5" />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1 ${TIPO_STYLES[c.tipo]}`}>
                    {tipoIcon(c.tipo)}
                    {TIPO_LABELS[c.tipo]}
                  </span>
                  <h3 className={`font-semibold ${c.realizado ? 'line-through text-gray-400' : 'text-white'}`}>{c.titulo}</h3>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(c.fecha).toLocaleDateString('es-AR')}
                    {c.hora && ` · ${c.hora.slice(0, 5)}`}
                  </span>
                  {c.cliente_nombre && <span>👤 {c.cliente_nombre}</span>}
                  {c.juzgado && <span className="flex items-center gap-1"><Gavel className="w-3 h-3" /> {c.juzgado}</span>}
                  {c.expediente && <span>📂 Exp. {c.expediente}</span>}
                  {c.tarea_titulo && <span className="text-blue-300">🔗 {c.tarea_titulo}</span>}
                </div>
                {c.descripcion && <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">{c.descripcion}</p>}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setSelected(c); setModalOpen(true); }}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDel(c)}
                  className={`p-2 rounded-lg border ${confirmDel === c.id ? 'bg-red-500/30 border-red-500/50 text-red-200' : 'bg-white/5 border-white/10 text-gray-300 hover:bg-red-500/10'}`}
                  title={confirmDel === c.id ? '¿Confirmar?' : 'Eliminar'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <CargoHoraModal
          cargo={selected}
          casos={casos}
          tareas={tareas}
          userId={user?.id || ''}
          onClose={() => { setModalOpen(false); setSelected(null); }}
          onSave={async (data) => {
            const ok = await upsert(data);
            if (ok) { setModalOpen(false); setSelected(null); }
          }}
        />
      )}
    </div>
  );
}

// ============================================
// MODAL
// ============================================
interface ModalProps {
  cargo: CargoHoraCompleto | null;
  casos: { id: string; nombre_apellido: string; materia: string; expediente: string | null }[];
  tareas: TareaLite[];
  userId: string;
  onClose: () => void;
  onSave: (data: Parameters<ReturnType<typeof useCargosHora>['upsert']>[0]) => Promise<void>;
}

function CargoHoraModal({ cargo, casos, tareas, userId, onClose, onSave }: ModalProps) {
  const [form, setForm] = useState({
    titulo: cargo?.titulo || '',
    descripcion: cargo?.descripcion || '',
    fecha: cargo?.fecha || new Date().toISOString().slice(0, 10),
    hora: cargo?.hora?.slice(0, 5) || '',
    tipo: (cargo?.tipo || 'neutro') as TipoCargoHora,
    caso_id: cargo?.caso_id || '',
    tarea_id: cargo?.tarea_id || '',
    juzgado: cargo?.juzgado || '',
    expediente: cargo?.expediente || '',
    realizado: cargo?.realizado || false,
  });
  const [saving, setSaving] = useState(false);

  const tareasDelCaso = form.caso_id ? tareas.filter(t => t.caso_id === form.caso_id) : tareas;

  const handleSave = async () => {
    if (!form.titulo.trim() || !form.fecha) return;
    setSaving(true);
    await onSave({
      id: cargo?.id,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      fecha: form.fecha,
      hora: form.hora || null,
      tipo: form.tipo,
      caso_id: form.caso_id || null,
      tarea_id: form.tarea_id || null,
      juzgado: form.juzgado.trim() || null,
      expediente: form.expediente.trim() || null,
      realizado: form.realizado,
      ...(cargo ? {} : { created_by: userId }),
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white">{cargo ? 'Editar' : 'Nuevo'} cargo de hora</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Título *</label>
            <input
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="input-dark w-full"
              placeholder="Ej: Traslado, notificación, resolución..."
              autoFocus
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Fecha *</label>
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="input-dark w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Hora</label>
              <input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} className="input-dark w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tipo *</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoCargoHora })} className="input-dark w-full">
                <option value="neutro">Neutro</option>
                <option value="a_favor">A favor</option>
                <option value="en_contra">En contra</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Caso</label>
              <select value={form.caso_id} onChange={(e) => setForm({ ...form, caso_id: e.target.value, tarea_id: '' })} className="input-dark w-full">
                <option value="">— Sin caso —</option>
                {casos.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre_apellido || 'Sin cliente'} · {c.materia}{c.expediente ? ` · Exp. ${c.expediente}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tarea relacionada</label>
              <select value={form.tarea_id} onChange={(e) => setForm({ ...form, tarea_id: e.target.value })} className="input-dark w-full">
                <option value="">— Sin tarea —</option>
                {tareasDelCaso.map(t => (
                  <option key={t.id} value={t.id}>{t.titulo}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Juzgado</label>
              <input value={form.juzgado} onChange={(e) => setForm({ ...form, juzgado: e.target.value })} className="input-dark w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Expediente</label>
              <input value={form.expediente} onChange={(e) => setForm({ ...form, expediente: e.target.value })} className="input-dark w-full" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              rows={3}
              className="input-dark w-full"
              placeholder="Detalles del cargo..."
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.realizado}
              onChange={(e) => setForm({ ...form, realizado: e.target.checked })}
              className="w-4 h-4"
            />
            Ya realizado
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.titulo.trim()}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
