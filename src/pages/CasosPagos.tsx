import { useEffect, useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, CalendarClock, CheckCircle2, Clock, DollarSign, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSocios } from '../hooks/useSocios';
import Modal from '../components/Modal';
import { formatMoney } from '../lib/financeFormat';

interface CasoPago {
  id: string;
  caso_id: string | null;
  cliente_nombre: string;
  telefono: string | null;
  detalle_consulta: string | null;
  socio_carga: string;
  fecha_carga: string;
  fecha_consulta: string | null;
  hora_consulta: string | null;
  abogado_asignado: string | null;
  monto_reserva: number;
  monto_a_cancelar: number;
  reserva_pagada: boolean;
  reserva_modalidad: string | null;
  consulta_realizada: boolean;
  resultado_estado: string | null;
  saldo_pagado: boolean;
  saldo_monto_real: number;
  saldo_modalidad: string | null;
  honorarios: number;
  observaciones: string | null;
  ingreso_reserva_id: string | null;
  ingreso_saldo_id: string | null;
  created_at: string;
}

const ESTADOS_RESULTADO = ['Vino a consulta', 'Trámite no judicial', 'Cliente Judicial'] as const;
const MODALIDADES = ['Efectivo', 'Transferencia'] as const;

export default function CasosPagos() {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  const socios = useSocios();
  const [items, setItems] = useState<CasoPago[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CasoPago | null>(null);
  const [search, setSearch] = useState('');

  const isSocio = perfil?.rol === 'socio';

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('casos_pagos')
      .select('*')
      .order('fecha_consulta', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) {
      showToast(error.message || 'Error al cargar', 'error');
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (isSocio) load();
  }, [isSocio]);

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este registro? Si tenía ingresos vinculados, también se eliminarán.')) return;
    const { error } = await supabase.from('casos_pagos').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
    else { showToast('Eliminado'); load(); }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      it.cliente_nombre.toLowerCase().includes(q) ||
      (it.telefono || '').toLowerCase().includes(q) ||
      (it.abogado_asignado || '').toLowerCase().includes(q) ||
      it.socio_carga.toLowerCase().includes(q)
    );
  }, [items, search]);

  if (!isSocio) {
    return (
      <div className="glass-card p-8 text-center">
        <h2 className="text-lg font-semibold text-white mb-2">Acceso restringido</h2>
        <p className="text-sm text-gray-400">El módulo "Casos - Pagos" es exclusivo para socios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Casos — Pagos</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión financiera y agendamiento de consultas (solo socios)</p>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo registro
        </button>
      </div>

      <div className="glass-card p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Buscar por cliente, teléfono, abogado..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
        />
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">Sin registros</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Consulta</th>
                  <th className="px-4 py-3 text-left">Abogado</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Reserva</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-left">Socio</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(it => {
                  const total = (it.reserva_pagada ? Number(it.monto_reserva) : 0) + (it.saldo_pagado ? Number(it.saldo_monto_real) : 0);
                  return (
                    <tr key={it.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-white">
                        <div className="font-medium">{it.cliente_nombre}</div>
                        {it.telefono && <div className="text-xs text-gray-500">{it.telefono}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {it.fecha_consulta ? (
                          <div className="flex items-center gap-1.5">
                            <CalendarClock className="w-3.5 h-3.5 text-blue-400" />
                            <span>{it.fecha_consulta}{it.hora_consulta ? ` ${it.hora_consulta.slice(0,5)}` : ''}</span>
                          </div>
                        ) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{it.abogado_asignado || '—'}</td>
                      <td className="px-4 py-3">
                        {it.consulta_realizada ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> {it.resultado_estado || 'Realizada'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" /> Agendada
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={it.reserva_pagada ? 'text-emerald-400' : 'text-gray-500'}>
                          {formatMoney(Number(it.monto_reserva))}
                        </span>
                        {it.reserva_pagada && <div className="text-[10px] text-emerald-500">Cobrada</div>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={it.saldo_pagado ? 'text-emerald-400' : 'text-gray-500'}>
                          {formatMoney(Number(it.saldo_monto_real))}
                        </span>
                        {it.saldo_pagado && <div className="text-[10px] text-emerald-500">Cobrado</div>}
                      </td>
                      <td className="px-4 py-3 text-right text-white font-semibold">{formatMoney(total)}</td>
                      <td className="px-4 py-3 text-gray-400">{it.socio_carga}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => { setEditing(it); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(it.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CasoPagoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        socios={socios}
        onSaved={() => { setModalOpen(false); load(); }}
      />
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  editing: CasoPago | null;
  socios: string[];
  onSaved: () => void;
}

function CasoPagoModal({ open, onClose, editing, socios, onSaved }: ModalProps) {
  const { showToast } = useToast();
  const isEditing = !!editing;

  const [form, setForm] = useState({
    cliente_nombre: '',
    telefono: '',
    detalle_consulta: '',
    socio_carga: socios[0] || 'Rodrigo',
    fecha_carga: new Date().toISOString().split('T')[0],
    // Paso 1
    fecha_consulta: '',
    hora_consulta: '',
    abogado_asignado: '',
    monto_reserva: '',
    monto_a_cancelar: '',
    reserva_pagada: false,
    reserva_modalidad: '' as string,
    // Paso 2
    consulta_realizada: false,
    resultado_estado: '' as string,
    saldo_pagado: false,
    saldo_monto_real: '',
    saldo_modalidad: '' as string,
    honorarios: '',
    observaciones: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        cliente_nombre: editing.cliente_nombre,
        telefono: editing.telefono || '',
        detalle_consulta: editing.detalle_consulta || '',
        socio_carga: editing.socio_carga,
        fecha_carga: editing.fecha_carga,
        fecha_consulta: editing.fecha_consulta || '',
        hora_consulta: editing.hora_consulta?.slice(0, 5) || '',
        abogado_asignado: editing.abogado_asignado || '',
        monto_reserva: String(editing.monto_reserva || ''),
        monto_a_cancelar: String(editing.monto_a_cancelar || ''),
        reserva_pagada: editing.reserva_pagada,
        reserva_modalidad: editing.reserva_modalidad || '',
        consulta_realizada: editing.consulta_realizada,
        resultado_estado: editing.resultado_estado || '',
        saldo_pagado: editing.saldo_pagado,
        saldo_monto_real: String(editing.saldo_monto_real || ''),
        saldo_modalidad: editing.saldo_modalidad || '',
        honorarios: String(editing.honorarios || ''),
        observaciones: editing.observaciones || '',
      });
    } else {
      setForm({
        cliente_nombre: '', telefono: '', detalle_consulta: '',
        socio_carga: socios[0] || 'Rodrigo',
        fecha_carga: new Date().toISOString().split('T')[0],
        fecha_consulta: '', hora_consulta: '', abogado_asignado: '',
        monto_reserva: '', monto_a_cancelar: '',
        reserva_pagada: false, reserva_modalidad: '',
        consulta_realizada: false, resultado_estado: '',
        saldo_pagado: false, saldo_monto_real: '', saldo_modalidad: '',
        honorarios: '', observaciones: '',
      });
    }
  }, [editing, open, socios]);

  async function handleSave() {
    if (!form.cliente_nombre.trim()) {
      showToast('El nombre del cliente es obligatorio', 'error');
      return;
    }
    if (form.reserva_pagada && (!parseFloat(form.monto_reserva) || parseFloat(form.monto_reserva) <= 0)) {
      showToast('Para marcar reserva como pagada, indicá el monto', 'error');
      return;
    }
    if (form.saldo_pagado && (!parseFloat(form.saldo_monto_real) || parseFloat(form.saldo_monto_real) <= 0)) {
      showToast('Para marcar saldo como pagado, indicá el monto', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      cliente_nombre: form.cliente_nombre.trim(),
      telefono: form.telefono.trim() || null,
      detalle_consulta: form.detalle_consulta.trim() || null,
      socio_carga: form.socio_carga,
      fecha_carga: form.fecha_carga,
      fecha_consulta: form.fecha_consulta || null,
      hora_consulta: form.hora_consulta || null,
      abogado_asignado: form.abogado_asignado.trim() || null,
      monto_reserva: parseFloat(form.monto_reserva) || 0,
      monto_a_cancelar: parseFloat(form.monto_a_cancelar) || 0,
      reserva_pagada: form.reserva_pagada,
      reserva_modalidad: form.reserva_modalidad || null,
      consulta_realizada: form.consulta_realizada,
      resultado_estado: form.resultado_estado || null,
      saldo_pagado: form.saldo_pagado,
      saldo_monto_real: parseFloat(form.saldo_monto_real) || 0,
      saldo_modalidad: form.saldo_modalidad || null,
      honorarios: parseFloat(form.honorarios) || 0,
      observaciones: form.observaciones.trim() || null,
    };
    try {
      if (isEditing && editing) {
        const { error } = await supabase.from('casos_pagos').update(payload).eq('id', editing.id);
        if (error) throw error;
        showToast('Registro actualizado');
      } else {
        const { error } = await supabase.from('casos_pagos').insert(payload);
        if (error) throw error;
        showToast('Registro creado');
      }
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar caso de pago' : 'Nuevo caso de pago'} subtitle="Paso 1: Agendamiento · Paso 2: Resultado" maxWidth="max-w-3xl">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        {/* Datos cliente */}
        <Section title="Cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre *">
              <input type="text" value={form.cliente_nombre} onChange={e => setForm({ ...form, cliente_nombre: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Socio que carga *">
              <select value={form.socio_carga} onChange={e => setForm({ ...form, socio_carga: e.target.value })} className="input-dark">
                {socios.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Fecha de carga">
              <input type="date" value={form.fecha_carga} onChange={e => setForm({ ...form, fecha_carga: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Detalle de la consulta (opcional)" full>
              <textarea value={form.detalle_consulta} onChange={e => setForm({ ...form, detalle_consulta: e.target.value })} className="input-dark" rows={2} />
            </Field>
          </div>
        </Section>

        {/* Paso 1 */}
        <Section title="Paso 1 — Agendamiento" badge="Antes de la consulta">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Fecha consulta">
              <input type="date" value={form.fecha_consulta} onChange={e => setForm({ ...form, fecha_consulta: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Hora">
              <input type="time" value={form.hora_consulta} onChange={e => setForm({ ...form, hora_consulta: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Abogado asignado">
              <input type="text" value={form.abogado_asignado} onChange={e => setForm({ ...form, abogado_asignado: e.target.value })} className="input-dark" placeholder="Nombre del abogado" />
            </Field>
            <Field label="Monto de reserva">
              <input type="number" step="0.01" value={form.monto_reserva} onChange={e => setForm({ ...form, monto_reserva: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Monto a cancelar en consulta">
              <input type="number" step="0.01" value={form.monto_a_cancelar} onChange={e => setForm({ ...form, monto_a_cancelar: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Modalidad reserva">
              <select value={form.reserva_modalidad} onChange={e => setForm({ ...form, reserva_modalidad: e.target.value })} className="input-dark">
                <option value="">—</option>
                {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-gray-300">
            <input type="checkbox" checked={form.reserva_pagada} onChange={e => setForm({ ...form, reserva_pagada: e.target.checked })} className="w-4 h-4" />
            <DollarSign className="w-4 h-4 text-emerald-400" />
            Reserva pagada (genera ingreso automático)
          </label>
        </Section>

        {/* Paso 2 */}
        <Section title="Paso 2 — Resultado" badge="Después de la consulta">
          <label className="flex items-center gap-2 mb-3 cursor-pointer text-sm text-gray-300">
            <input type="checkbox" checked={form.consulta_realizada} onChange={e => setForm({ ...form, consulta_realizada: e.target.checked })} className="w-4 h-4" />
            Consulta realizada
          </label>
          {form.consulta_realizada && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Resultado">
                <select value={form.resultado_estado} onChange={e => setForm({ ...form, resultado_estado: e.target.value })} className="input-dark">
                  <option value="">—</option>
                  {ESTADOS_RESULTADO.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </Field>
              <Field label="Honorarios">
                <input type="number" step="0.01" value={form.honorarios} onChange={e => setForm({ ...form, honorarios: e.target.value })} className="input-dark" />
              </Field>
              <Field label="Saldo cobrado real">
                <input type="number" step="0.01" value={form.saldo_monto_real} onChange={e => setForm({ ...form, saldo_monto_real: e.target.value })} className="input-dark" />
              </Field>
              <Field label="Modalidad saldo">
                <select value={form.saldo_modalidad} onChange={e => setForm({ ...form, saldo_modalidad: e.target.value })} className="input-dark">
                  <option value="">—</option>
                  {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Observaciones" full>
                <textarea value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} className="input-dark" rows={2} />
              </Field>
            </div>
          )}
          {form.consulta_realizada && (
            <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-gray-300">
              <input type="checkbox" checked={form.saldo_pagado} onChange={e => setForm({ ...form, saldo_pagado: e.target.checked })} className="w-4 h-4" />
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Saldo cobrado (genera ingreso automático)
            </label>
          )}
        </Section>
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/[0.06] mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? 'Guardando...' : (isEditing ? 'Actualizar' : 'Crear')}
        </button>
      </div>
    </Modal>
  );
}

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {badge && <span className="text-[10px] uppercase tracking-wider text-gray-500">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-3' : ''}>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
