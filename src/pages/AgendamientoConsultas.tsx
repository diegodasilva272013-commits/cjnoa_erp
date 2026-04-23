import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, CalendarClock, CheckCircle2, Clock, DollarSign, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSocios } from '../hooks/useSocios';
import Modal from '../components/Modal';
import { formatMoney } from '../lib/financeFormat';

interface ConsultaAgendada {
  id: string;
  cliente_nombre: string;
  telefono: string | null;
  detalle_consulta: string | null;
  socio_carga: string;
  fecha_carga: string;
  fecha_consulta: string;
  hora_consulta: string | null;
  abogado_asignado: string | null;
  monto_reserva: number;
  monto_a_cancelar: number;
  reserva_pagada: boolean;
  reserva_modalidad: string | null;
  observaciones: string | null;
  ingreso_reserva_id: string | null;
  created_at: string;
}

const MODALIDADES = ['Efectivo', 'Transferencia'] as const;

export default function AgendamientoConsultas() {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  const socios = useSocios();
  const [items, setItems] = useState<ConsultaAgendada[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConsultaAgendada | null>(null);
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();

  // Auto-open record when navigated from another module
  useEffect(() => {
    const openId = searchParams.get('openId');
    if (!openId || items.length === 0) return;
    const target = items.find(i => i.id === openId);
    if (target) { setEditing(target); setModalOpen(true); }
  }, [items, searchParams]);

  const canAccessAgendamiento = perfil?.rol === 'empleado' || perfil?.rol === 'socio' || perfil?.rol === 'admin';

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('consultas_agendadas')
      .select('*')
      .order('fecha_consulta', { ascending: true })
      .order('hora_consulta', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      showToast(error.message || 'Error al cargar agendamientos', 'error');
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (canAccessAgendamiento) {
      load();
    }
  }, [canAccessAgendamiento]);

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este agendamiento? Si tenía una reserva cobrada, también se eliminará el ingreso vinculado.')) return;
    const { error } = await supabase.from('consultas_agendadas').delete().eq('id', id);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast('Agendamiento eliminado');
    load();
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter(item =>
      item.cliente_nombre.toLowerCase().includes(query) ||
      (item.telefono || '').toLowerCase().includes(query) ||
      (item.abogado_asignado || '').toLowerCase().includes(query) ||
      item.socio_carga.toLowerCase().includes(query),
    );
  }, [items, search]);

  if (!canAccessAgendamiento) {
    return (
      <div className="glass-card p-8 text-center">
        <h2 className="text-lg font-semibold text-white mb-2">Acceso restringido</h2>
        <p className="text-sm text-gray-400">El módulo "Agendamiento" está habilitado para empleados, socios y administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Agendamiento</h1>
          <p className="text-sm text-gray-500 mt-1">Consultas previas al caso, separadas del módulo comercial y con reserva opcional</p>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo agendamiento
        </button>
      </div>

      <div className="glass-card p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Buscar por cliente, teléfono, abogado o socio..."
          value={search}
          onChange={event => setSearch(event.target.value)}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
        />
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">Sin agendamientos</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Consulta</th>
                  <th className="px-4 py-3 text-left">Abogado</th>
                  <th className="px-4 py-3 text-right">Reserva</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Carga</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(item => (
                  <tr key={item.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white">
                      <div className="font-medium">{item.cliente_nombre}</div>
                      {item.telefono && <div className="text-xs text-gray-500">{item.telefono}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      <div className="flex items-center gap-1.5">
                        <CalendarClock className="w-3.5 h-3.5 text-blue-400" />
                        <span>{item.fecha_consulta}{item.hora_consulta ? ` ${item.hora_consulta.slice(0, 5)}` : ''}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{item.abogado_asignado || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={item.reserva_pagada ? 'text-emerald-400' : 'text-gray-500'}>
                        {formatMoney(Number(item.monto_reserva || 0))}
                      </span>
                      {item.monto_a_cancelar > 0 && (
                        <div className="text-[10px] text-gray-500">Resta en consulta {formatMoney(Number(item.monto_a_cancelar || 0))}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.reserva_pagada ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Reserva cobrada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Clock className="w-3 h-3" /> Pendiente de reserva
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      <div>{item.socio_carga}</div>
                      <div className="text-[10px] text-gray-600">{item.fecha_carga}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => { setEditing(item); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConsultaAgendadaModal
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
  editing: ConsultaAgendada | null;
  socios: string[];
  onSaved: () => void;
}

function ConsultaAgendadaModal({ open, onClose, editing, socios, onSaved }: ModalProps) {
  const { showToast } = useToast();
  const isEditing = !!editing;
  const [form, setForm] = useState({
    cliente_nombre: '',
    telefono: '',
    detalle_consulta: '',
    socio_carga: socios[0] || 'Rodrigo',
    fecha_carga: new Date().toISOString().split('T')[0],
    fecha_consulta: '',
    hora_consulta: '',
    abogado_asignado: '',
    monto_reserva: '',
    monto_a_cancelar: '',
    reserva_pagada: false,
    reserva_modalidad: '',
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
        fecha_consulta: editing.fecha_consulta,
        hora_consulta: editing.hora_consulta?.slice(0, 5) || '',
        abogado_asignado: editing.abogado_asignado || '',
        monto_reserva: String(editing.monto_reserva || ''),
        monto_a_cancelar: String(editing.monto_a_cancelar || ''),
        reserva_pagada: editing.reserva_pagada,
        reserva_modalidad: editing.reserva_modalidad || '',
        observaciones: editing.observaciones || '',
      });
      return;
    }

    setForm({
      cliente_nombre: '',
      telefono: '',
      detalle_consulta: '',
      socio_carga: socios[0] || 'Rodrigo',
      fecha_carga: new Date().toISOString().split('T')[0],
      fecha_consulta: '',
      hora_consulta: '',
      abogado_asignado: '',
      monto_reserva: '',
      monto_a_cancelar: '',
      reserva_pagada: false,
      reserva_modalidad: '',
      observaciones: '',
    });
  }, [editing, open, socios]);

  async function handleSave() {
    if (!form.cliente_nombre.trim()) {
      showToast('El nombre del cliente es obligatorio', 'error');
      return;
    }
    if (!form.fecha_consulta) {
      showToast('Debes indicar la fecha de la consulta', 'error');
      return;
    }
    if (form.reserva_pagada && (!parseFloat(form.monto_reserva) || parseFloat(form.monto_reserva) <= 0)) {
      showToast('Para marcar la reserva como pagada, indicá un monto válido', 'error');
      return;
    }
    if (form.reserva_pagada && !form.reserva_modalidad) {
      showToast('Indicá la modalidad de cobro de la reserva', 'error');
      return;
    }

    setSaving(true);
    const payload = {
      cliente_nombre: form.cliente_nombre.trim(),
      telefono: form.telefono.trim() || null,
      detalle_consulta: form.detalle_consulta.trim() || null,
      socio_carga: form.socio_carga,
      fecha_carga: form.fecha_carga,
      fecha_consulta: form.fecha_consulta,
      hora_consulta: form.hora_consulta || null,
      abogado_asignado: form.abogado_asignado.trim() || null,
      monto_reserva: parseFloat(form.monto_reserva) || 0,
      monto_a_cancelar: parseFloat(form.monto_a_cancelar) || 0,
      reserva_pagada: form.reserva_pagada,
      reserva_modalidad: form.reserva_modalidad || null,
      observaciones: form.observaciones.trim() || null,
    };

    try {
      if (isEditing && editing) {
        const { error } = await supabase.from('consultas_agendadas').update(payload).eq('id', editing.id);
        if (error) throw error;
        showToast('Agendamiento actualizado');
      } else {
        const { error } = await supabase.from('consultas_agendadas').insert(payload);
        if (error) throw error;
        showToast('Agendamiento creado');
      }
      onSaved();
    } catch (error: any) {
      showToast(error.message || 'Error al guardar el agendamiento', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar agendamiento' : 'Nuevo agendamiento'}
      subtitle="Módulo operativo previo a Casos - Pagos"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        <Section title="Cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre *">
              <input type="text" value={form.cliente_nombre} onChange={event => setForm({ ...form, cliente_nombre: event.target.value })} className="input-dark" />
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={form.telefono} onChange={event => setForm({ ...form, telefono: event.target.value })} className="input-dark" />
            </Field>
            <Field label="Socio que carga *">
              <select value={form.socio_carga} onChange={event => setForm({ ...form, socio_carga: event.target.value })} className="select-dark">
                {socios.map(socio => <option key={socio} value={socio}>{socio}</option>)}
              </select>
            </Field>
            <Field label="Fecha de carga">
              <input type="date" value={form.fecha_carga} onChange={event => setForm({ ...form, fecha_carga: event.target.value })} className="input-dark" />
            </Field>
            <Field label="Detalle de la consulta (opcional)" full>
              <textarea value={form.detalle_consulta} onChange={event => setForm({ ...form, detalle_consulta: event.target.value })} className="input-dark" rows={2} />
            </Field>
          </div>
        </Section>

        <Section title="Agendamiento" badge="Antes de que exista el caso">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Fecha consulta *">
              <input type="date" value={form.fecha_consulta} onChange={event => setForm({ ...form, fecha_consulta: event.target.value })} className="input-dark" />
            </Field>
            <Field label="Hora">
              <input type="time" value={form.hora_consulta} onChange={event => setForm({ ...form, hora_consulta: event.target.value })} className="input-dark" />
            </Field>
            <Field label="Abogado asignado">
              <input type="text" value={form.abogado_asignado} onChange={event => setForm({ ...form, abogado_asignado: event.target.value })} className="input-dark" placeholder="Nombre del abogado" />
            </Field>
            <Field label="Monto de reserva">
              <input type="number" step="0.01" value={form.monto_reserva} onChange={event => setForm({ ...form, monto_reserva: event.target.value })} className="input-dark" />
            </Field>
            <Field label="Monto a cancelar en consulta">
              <input type="number" step="0.01" value={form.monto_a_cancelar} onChange={event => setForm({ ...form, monto_a_cancelar: event.target.value })} className="input-dark" />
            </Field>
            <Field label="Modalidad reserva">
              <select value={form.reserva_modalidad} onChange={event => setForm({ ...form, reserva_modalidad: event.target.value })} className="select-dark">
                <option value="">—</option>
                {MODALIDADES.map(modalidad => <option key={modalidad} value={modalidad}>{modalidad}</option>)}
              </select>
            </Field>
            <Field label="Observaciones" full>
              <textarea value={form.observaciones} onChange={event => setForm({ ...form, observaciones: event.target.value })} className="input-dark" rows={2} />
            </Field>
          </div>
          <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-gray-300">
            <input type="checkbox" checked={form.reserva_pagada} onChange={event => setForm({ ...form, reserva_pagada: event.target.checked })} className="checkbox-dark" />
            <DollarSign className="w-4 h-4 text-emerald-400" />
            Reserva pagada (genera ingreso automático)
          </label>
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