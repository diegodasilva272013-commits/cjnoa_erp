import { useState, useMemo } from 'react';
import { Plus, DollarSign, X, Trash2, Edit2, Search, Lock } from 'lucide-react';
import { useHonorarios } from '../hooks/useTareas';
import { useCases } from '../hooks/useCases';
import { useAuth } from '../context/AuthContext';
import { usePermisos } from '../hooks/usePermisos';
import { HonorarioCompleto, EstadoCobroHonorario, ESTADO_COBRO_HONORARIO_LABELS } from '../types/database';

const ESTADO_COLORS: Record<EstadoCobroHonorario, string> = {
  pendiente: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  parcial: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  cobrado: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const fmtAr = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

export default function Honorarios() {
  const { canSee } = usePermisos();
  const { user } = useAuth();
  const { honorarios, loading, upsert, remove } = useHonorarios();
  const { casos } = useCases();
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoCobroHonorario | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<HonorarioCompleto | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  if (!canSee('honorarios')) {
    return (
      <div className="text-center py-24">
        <Lock className="w-12 h-12 text-gray-700 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">Módulo bloqueado</h2>
        <p className="text-sm text-gray-500">Honorarios y Cobros no es accesible para tu rol.</p>
      </div>
    );
  }

  const filtered = useMemo(() => {
    return honorarios.filter(h => {
      const s = search.toLowerCase();
      const matchSearch = !s || (h.cliente_nombre || '').toLowerCase().includes(s) || h.concepto.toLowerCase().includes(s);
      const matchEstado = filterEstado === 'all' || h.estado_cobro === filterEstado;
      return matchSearch && matchEstado;
    });
  }, [honorarios, search, filterEstado]);

  const totales = useMemo(() => {
    const t = { pendiente: 0, parcial: 0, cobrado: 0, total: 0 };
    honorarios.forEach(h => { t[h.estado_cobro] += h.monto; t.total += h.monto; });
    return t;
  }, [honorarios]);

  const handleDel = async (h: HonorarioCompleto) => {
    if (confirmDel === h.id) { await remove(h.id); setConfirmDel(null); }
    else { setConfirmDel(h.id); setTimeout(() => setConfirmDel(null), 3000); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            Honorarios y Cobros
          </h1>
          <p className="text-sm text-gray-500 mt-1 ml-[52px]">{honorarios.length} registros · oculto a procurador</p>
        </div>
        <button onClick={() => { setSelected(null); setModalOpen(true); }} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nuevo honorario
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total" value={fmtAr(totales.total)} color="text-white" />
        <KpiCard label="Cobrado" value={fmtAr(totales.cobrado)} color="text-emerald-400" />
        <KpiCard label="Parcial" value={fmtAr(totales.parcial)} color="text-blue-400" />
        <KpiCard label="Pendiente" value={fmtAr(totales.pendiente)} color="text-amber-400" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-dark pl-10 text-sm" placeholder="Buscar por cliente o concepto..." />
        </div>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as any)} className="select-dark text-xs py-2">
          <option value="all">Todos los estados</option>
          {Object.entries(ESTADO_COBRO_HONORARIO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <DollarSign className="w-10 h-10 text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Sin registros</p>
          <p className="text-[11px] text-gray-600 mt-1">El detalle completo del módulo se define en v2 del spec.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(h => (
            <div key={h.id} className="glass-card p-4 cursor-pointer hover:bg-white/[0.03] transition-all"
              onClick={() => { setSelected(h); setModalOpen(true); }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-medium text-white truncate">{h.concepto}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${ESTADO_COLORS[h.estado_cobro]}`}>
                      {ESTADO_COBRO_HONORARIO_LABELS[h.estado_cobro]}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {h.cliente_nombre || '— Sin cliente —'} · {new Date(h.fecha).toLocaleDateString('es-AR')}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-white">{fmtAr(h.monto)}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDel(h); }}
                  className={`p-1.5 rounded-lg transition-colors ${
                    confirmDel === h.id ? 'bg-red-500/20 text-red-400' : 'text-gray-600 hover:text-red-400 hover:bg-red-500/10'
                  }`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <HonorarioModal
          honorario={selected}
          casos={casos}
          onClose={() => { setModalOpen(false); setSelected(null); }}
          onSave={async (h) => { const ok = await upsert(h, user?.id || ''); if (ok) { setModalOpen(false); setSelected(null); } }}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass-card p-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold ${color} mt-1`}>{value}</p>
    </div>
  );
}

function HonorarioModal({ honorario, casos, onClose, onSave }: {
  honorario: HonorarioCompleto | null; casos: any[];
  onClose: () => void; onSave: (h: any) => void;
}) {
  const [form, setForm] = useState({
    id: honorario?.id,
    caso_id: honorario?.caso_id || '',
    concepto: honorario?.concepto || '',
    monto: honorario?.monto || 0,
    estado_cobro: honorario?.estado_cobro || 'pendiente' as EstadoCobroHonorario,
    fecha: honorario?.fecha || new Date().toISOString().slice(0, 10),
    notas: honorario?.notas || '',
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.concepto.trim()) return;
    onSave({ ...form, caso_id: form.caso_id || null, monto: Number(form.monto) || 0 });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <form onSubmit={submit} className="glass-card w-full max-w-xl my-8 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            {honorario ? <><Edit2 className="w-4 h-4" /> Editar</> : <><Plus className="w-4 h-4" /> Nuevo honorario</>}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Cliente / Caso</label>
          <select value={form.caso_id} onChange={e => setForm(s => ({ ...s, caso_id: e.target.value }))} className="select-dark text-sm mt-1">
            <option value="">— Sin vincular —</option>
            {casos.map((c: any) => (
              <option key={c.id} value={c.id}>{c.nombre_apellido} {c.expediente ? `· ${c.expediente}` : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Concepto *</label>
          <input value={form.concepto} required onChange={e => setForm(s => ({ ...s, concepto: e.target.value }))}
            className="input-dark text-sm mt-1" placeholder="Ej: Honorarios sentencia primera instancia" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Monto</label>
            <input type="number" min={0} step="0.01" value={form.monto} onChange={e => setForm(s => ({ ...s, monto: parseFloat(e.target.value) || 0 }))}
              className="input-dark text-sm mt-1" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Estado</label>
            <select value={form.estado_cobro} onChange={e => setForm(s => ({ ...s, estado_cobro: e.target.value as EstadoCobroHonorario }))} className="select-dark text-sm mt-1">
              {Object.entries(ESTADO_COBRO_HONORARIO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm(s => ({ ...s, fecha: e.target.value }))}
              className="input-dark text-sm mt-1" />
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Notas</label>
          <textarea value={form.notas} onChange={e => setForm(s => ({ ...s, notas: e.target.value }))}
            className="input-dark text-sm mt-1" rows={3} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary text-xs px-4 py-2">Cancelar</button>
          <button type="submit" className="btn-primary text-xs px-4 py-2">Guardar</button>
        </div>
      </form>
    </div>
  );
}
