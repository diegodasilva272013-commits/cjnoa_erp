import { useEffect, useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, Clock, DollarSign, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSocios } from '../hooks/useSocios';
import Modal from '../components/Modal';
import { formatMoney } from '../lib/financeFormat';

interface CasoPago {
  id: string;
  caso_id: string | null;
  estado_caso: string | null;
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

const ESTADOS_CASO = ['Vino a consulta', 'Trámite no judicial', 'Cliente Judicial'] as const;
const MODALIDADES = ['Efectivo', 'Transferencia'] as const;

export default function CasosPagos() {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  const socios = useSocios();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<CasoPago[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CasoPago | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('q') || '');

  // Auto-open record when navigated from another module
  useEffect(() => {
    const openId = searchParams.get('openId');
    if (!openId || items.length === 0) return;
    const target = items.find(i => i.id === openId);
    if (target) { setEditing(target); setModalOpen(true); }
  }, [items, searchParams]);

  const canAccessCasosPagos = perfil?.rol === 'socio' || perfil?.rol === 'admin';

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
    if (canAccessCasosPagos) load();
  }, [canAccessCasosPagos]);

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

  if (!canAccessCasosPagos) {
    return (
      <div className="glass-card p-8 text-center">
        <h2 className="text-lg font-semibold text-white mb-2">Acceso restringido</h2>
        <p className="text-sm text-gray-400">El módulo "Casos - Pagos" es exclusivo para socios y administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Casos - Pagos</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión financiera y agendamiento de consultas (socios y administradores)</p>
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
                  <th className="px-4 py-3 text-left">Estado del caso</th>
                  <th className="px-4 py-3 text-right">Honorarios</th>
                  <th className="px-4 py-3 text-right">Saldo cobrado</th>
                  <th className="px-4 py-3 text-left">Socio</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(it => {
                  return (
                    <tr key={it.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-white">
                        <div className="font-medium">{it.cliente_nombre}</div>
                        {it.telefono && <div className="text-xs text-gray-500">{it.telefono}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {it.estado_caso ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            <CheckCircle2 className="w-3 h-3" /> {it.estado_caso}
                          </span>
                        ) : it.consulta_realizada ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> {it.resultado_estado || 'Realizada'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3" /> Sin resultado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-300">{Number(it.honorarios) > 0 ? formatMoney(Number(it.honorarios)) : <span className="text-gray-600">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={it.saldo_pagado ? 'text-emerald-400' : 'text-gray-500'}>
                          {formatMoney(Number(it.saldo_monto_real))}
                        </span>
                        {it.saldo_pagado && <div className="text-[10px] text-emerald-500">Cobrado</div>}
                      </td>
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

interface Cuota {
  id: string;
  caso_pago_id: string;
  numero: number;
  fecha_vencimiento: string;
  monto: number;
  estado: 'Pendiente' | 'Pagada';
  fecha_pago: string | null;
  modalidad_pago: string | null;
  cobrado_por: string | null;
  observaciones: string | null;
  ingreso_id: string | null;
}

function CasoPagoModal({ open, onClose, editing, socios, onSaved }: ModalProps) {
  const { showToast } = useToast();
  const isEditing = !!editing;
  const [casos, setCasos] = useState<Array<{ id: string; label: string }>>([]);
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  const [cuotaForm, setCuotaForm] = useState({ fecha_vencimiento: '', monto: '', observaciones: '' });
  const [savingCuota, setSavingCuota] = useState(false);
  const [payingCuota, setPayingCuota] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ fecha_pago: new Date().toISOString().slice(0, 10), modalidad_pago: '', cobrado_por: '' });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from('casos')
        .select('id, expediente, materia, clientes(nombre_apellido)')
        .order('created_at', { ascending: false })
        .limit(500);
      const list = (data || []).map((c: any) => ({
        id: c.id,
        label: `${c.clientes?.nombre_apellido || 'Sin cliente'} — ${c.materia}${c.expediente ? ` (${c.expediente})` : ''}`,
      }));
      setCasos(list);

      if (editing) {
        const { data: cuotasData } = await supabase
          .from('casos_pagos_cuotas')
          .select('*')
          .eq('caso_pago_id', editing.id)
          .order('numero');
        setCuotas((cuotasData || []) as Cuota[]);
      } else {
        setCuotas([]);
      }
    })();
  }, [open, editing]);

  const [form, setForm] = useState({
    cliente_nombre: '',
    caso_id: '',
    estado_caso: '',
    telefono: '',
    detalle_consulta: '',
    socio_carga: socios[0] || 'Rodrigo',
    fecha_carga: new Date().toISOString().split('T')[0],
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
        caso_id: editing.caso_id || '',
        estado_caso: editing.estado_caso || '',
        telefono: editing.telefono || '',
        detalle_consulta: editing.detalle_consulta || '',
        socio_carga: editing.socio_carga,
        fecha_carga: editing.fecha_carga,
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
        cliente_nombre: '', caso_id: '', estado_caso: '',
        telefono: '', detalle_consulta: '',
        socio_carga: socios[0] || 'Rodrigo',
        fecha_carga: new Date().toISOString().split('T')[0],
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
    if (!form.estado_caso) {
      showToast('Debes indicar el estado del caso', 'error');
      return;
    }
    if (form.saldo_pagado && (!parseFloat(form.saldo_monto_real) || parseFloat(form.saldo_monto_real) <= 0)) {
      showToast('Para marcar saldo como cobrado, indicá el monto', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      cliente_nombre: form.cliente_nombre.trim(),
      caso_id: form.caso_id || null,
      estado_caso: form.estado_caso || null,
      telefono: form.telefono.trim() || null,
      detalle_consulta: form.detalle_consulta.trim() || null,
      socio_carga: form.socio_carga,
      fecha_carga: form.fecha_carga,
      consulta_realizada: form.consulta_realizada,
      resultado_estado: form.resultado_estado || null,
      saldo_pagado: form.saldo_pagado,
      saldo_monto_real: parseFloat(form.saldo_monto_real) || 0,
      saldo_modalidad: form.saldo_modalidad || null,
      honorarios: parseFloat(form.honorarios) || 0,
      observaciones: form.observaciones.trim() || null,
    };
    try {
      let savedId: string | null = null;
      let triggerCreatedIngreso = false;

      if (isEditing && editing) {
        const { data: updated, error } = await supabase
          .from('casos_pagos').update(payload).eq('id', editing.id)
          .select('id, ingreso_saldo_id').single();
        if (error) throw error;
        savedId = updated?.id ?? editing.id;
        triggerCreatedIngreso = !!updated?.ingreso_saldo_id;
        showToast('Registro actualizado');
      } else {
        const { data: inserted, error } = await supabase
          .from('casos_pagos').insert(payload)
          .select('id, ingreso_saldo_id').single();
        if (error) throw error;
        savedId = inserted?.id ?? null;
        triggerCreatedIngreso = !!inserted?.ingreso_saldo_id;
        showToast('Registro creado');
      }

      // Fallback: si el trigger de DB no creó el ingreso de saldo, crearlo desde el frontend
      if (savedId && form.saldo_pagado && parseFloat(form.saldo_monto_real) > 0 && !triggerCreatedIngreso) {
        const saldoMonto = parseFloat(form.saldo_monto_real);
        const { data: ingreso } = await supabase.from('ingresos').insert({
          caso_id: form.caso_id || null,
          fecha: new Date().toISOString().slice(0, 10),
          cliente_nombre: form.cliente_nombre.trim(),
          concepto: 'Saldo consulta - ' + form.cliente_nombre.trim(),
          monto_total: saldoMonto,
          monto_cj_noa: saldoMonto,
          socio_cobro: form.socio_carga,
          modalidad: form.saldo_modalidad || null,
          es_manual: false,
        }).select('id').single();
        if (ingreso?.id) {
          await supabase.from('casos_pagos').update({ ingreso_saldo_id: ingreso.id }).eq('id', savedId);
        }
      }

      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCuota() {
    if (!editing) return;
    if (!cuotaForm.fecha_vencimiento || !cuotaForm.monto) {
      showToast('Fecha y monto son obligatorios', 'error');
      return;
    }
    setSavingCuota(true);
    const nextNumero = cuotas.length > 0 ? Math.max(...cuotas.map(c => c.numero)) + 1 : 1;
    const { error } = await supabase.from('casos_pagos_cuotas').insert({
      caso_pago_id: editing.id,
      numero: nextNumero,
      fecha_vencimiento: cuotaForm.fecha_vencimiento,
      monto: parseFloat(cuotaForm.monto),
      observaciones: cuotaForm.observaciones || null,
    });
    if (error) { showToast(error.message, 'error'); }
    else {
      setCuotaForm({ fecha_vencimiento: '', monto: '', observaciones: '' });
      const { data } = await supabase.from('casos_pagos_cuotas').select('*').eq('caso_pago_id', editing.id).order('numero');
      setCuotas((data || []) as Cuota[]);
    }
    setSavingCuota(false);
  }

  async function handleTogglePaid(cuota: Cuota) {
    if (cuota.estado === 'Pagada') {
      const { error } = await supabase.from('casos_pagos_cuotas')
        .update({ estado: 'Pendiente', fecha_pago: null, modalidad_pago: null, cobrado_por: null })
        .eq('id', cuota.id);
      if (error) { showToast(error.message, 'error'); return; }
      const { data } = await supabase.from('casos_pagos_cuotas').select('*').eq('caso_pago_id', editing!.id).order('numero');
      setCuotas((data || []) as Cuota[]);
    } else {
      setPayingCuota(cuota.id);
      setPayForm({ fecha_pago: new Date().toISOString().slice(0, 10), modalidad_pago: '', cobrado_por: socios[0] || '' });
    }
  }

  async function handleConfirmPay(cuota: Cuota) {
    const { data: updated, error } = await supabase.from('casos_pagos_cuotas')
      .update({
        estado: 'Pagada',
        fecha_pago: payForm.fecha_pago || new Date().toISOString().slice(0, 10),
        modalidad_pago: payForm.modalidad_pago || null,
        cobrado_por: payForm.cobrado_por || null,
      })
      .eq('id', cuota.id)
      .select('id, ingreso_id').single();
    if (error) { showToast(error.message, 'error'); setPayingCuota(null); return; }

    // Fallback: si trigger no creó el ingreso, crearlo desde el frontend
    if (updated && !updated.ingreso_id && editing) {
      const { data: ingreso } = await supabase.from('ingresos').insert({
        caso_id: editing.caso_id || null,
        fecha: payForm.fecha_pago || new Date().toISOString().slice(0, 10),
        cliente_nombre: editing.cliente_nombre,
        concepto: `Cuota caso de pago #${cuota.numero} - ${editing.cliente_nombre}`,
        monto_total: Number(cuota.monto),
        monto_cj_noa: Number(cuota.monto),
        socio_cobro: payForm.cobrado_por || editing.socio_carga,
        modalidad: payForm.modalidad_pago || null,
        es_manual: false,
      }).select('id').single();
      if (ingreso?.id) {
        await supabase.from('casos_pagos_cuotas').update({ ingreso_id: ingreso.id }).eq('id', cuota.id);
      }
    }

    setPayingCuota(null);
    const { data } = await supabase.from('casos_pagos_cuotas').select('*').eq('caso_pago_id', editing!.id).order('numero');
    setCuotas((data || []) as Cuota[]);
    showToast('Cuota marcada como pagada');
  }

  async function handleDeleteCuota(cuotaId: string) {
    if (!confirm('¿Eliminar esta cuota?')) return;
    const { error } = await supabase.from('casos_pagos_cuotas').delete().eq('id', cuotaId);
    if (error) { showToast(error.message, 'error'); return; }
    setCuotas(prev => prev.filter(c => c.id !== cuotaId));
  }

  const totalCuotas = cuotas.reduce((s, c) => s + Number(c.monto), 0);
  const cobradoCuotas = cuotas.filter(c => c.estado === 'Pagada').reduce((s, c) => s + Number(c.monto), 0);

  return (
    <Modal open={open} onClose={onClose}
      title={isEditing ? 'Editar caso de pago' : 'Nuevo caso de pago'}
      subtitle="Resultado · Honorarios · Cuotas"
      maxWidth="max-w-3xl">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        {/* Datos cliente */}
        <Section title="Cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre *">
              <input type="text" value={form.cliente_nombre} onChange={e => setForm({ ...form, cliente_nombre: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Caso">
              <select value={form.caso_id} onChange={e => setForm({ ...form, caso_id: e.target.value })} className="select-dark">
                <option value="">Sin vincular</option>
                {casos.map(caso => <option key={caso.id} value={caso.id}>{caso.label}</option>)}
              </select>
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Estado del caso *">
              <select value={form.estado_caso} onChange={e => setForm({ ...form, estado_caso: e.target.value })} className="select-dark">
                <option value="">—</option>
                {ESTADOS_CASO.map(estado => <option key={estado} value={estado}>{estado}</option>)}
              </select>
            </Field>
            <Field label="Socio que carga *">
              <select value={form.socio_carga} onChange={e => setForm({ ...form, socio_carga: e.target.value })} className="select-dark">
                {socios.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Fecha de carga">
              <input type="date" value={form.fecha_carga} onChange={e => setForm({ ...form, fecha_carga: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Detalle (opcional)" full>
              <textarea value={form.detalle_consulta} onChange={e => setForm({ ...form, detalle_consulta: e.target.value })} className="input-dark" rows={2} />
            </Field>
          </div>
        </Section>

        {/* Resultado */}
        <Section title="Resultado de la consulta">
          <label className="flex items-center gap-2 mb-3 cursor-pointer text-sm text-gray-300">
            <input type="checkbox" checked={form.consulta_realizada} onChange={e => setForm({ ...form, consulta_realizada: e.target.checked })} className="checkbox-dark" />
            Consulta realizada
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Resultado">
              <select value={form.resultado_estado} onChange={e => setForm({ ...form, resultado_estado: e.target.value })} className="select-dark">
                <option value="">—</option>
                {ESTADOS_CASO.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Honorarios acordados">
              <input type="number" step="0.01" value={form.honorarios} onChange={e => setForm({ ...form, honorarios: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Saldo cobrado">
              <input type="number" step="0.01" value={form.saldo_monto_real} onChange={e => setForm({ ...form, saldo_monto_real: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Modalidad saldo">
              <select value={form.saldo_modalidad} onChange={e => setForm({ ...form, saldo_modalidad: e.target.value })} className="select-dark">
                <option value="">—</option>
                {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Observaciones" full>
              <textarea value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} className="input-dark" rows={2} />
            </Field>
          </div>
          <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-gray-300">
            <input type="checkbox" checked={form.saldo_pagado} onChange={e => setForm({ ...form, saldo_pagado: e.target.checked })} className="checkbox-dark" />
            <DollarSign className="w-4 h-4 text-emerald-400" />
            Saldo cobrado (genera ingreso automático)
          </label>
        </Section>

        {/* Cuotas — solo cuando editando */}
        {isEditing && (
          <Section title="Cuotas / Plan de pago">
            {cuotas.length > 0 && (
              <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
                <span>Total: <span className="text-white font-semibold">{formatMoney(totalCuotas)}</span></span>
                <span>Cobrado: <span className="text-emerald-400 font-semibold">{formatMoney(cobradoCuotas)}</span></span>
                <span>Pendiente: <span className="text-amber-400 font-semibold">{formatMoney(totalCuotas - cobradoCuotas)}</span></span>
              </div>
            )}
            {cuotas.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {cuotas.map(cuota => (
                  <div key={cuota.id}>
                    <div className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                      cuota.estado === 'Pagada'
                        ? 'bg-emerald-500/10 border border-emerald-500/20'
                        : 'bg-white/[0.03] border border-white/[0.06]'
                    }`}>
                      <span className="text-gray-500 w-5 text-right">#{cuota.numero}</span>
                      <span className="flex-1 text-gray-300">{cuota.fecha_vencimiento}</span>
                      <span className="font-semibold text-white">{formatMoney(Number(cuota.monto))}</span>
                      <span className={`px-1.5 py-0.5 rounded-full border text-[10px] ${
                        cuota.estado === 'Pagada'
                          ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                          : 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                      }`}>{cuota.estado}</span>
                      {cuota.estado === 'Pagada' && cuota.cobrado_por && (
                        <span className="text-gray-500">{cuota.cobrado_por}</span>
                      )}
                      <button onClick={() => handleTogglePaid(cuota)} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        cuota.estado === 'Pagada'
                          ? 'bg-gray-500/20 text-gray-400 hover:bg-rose-500/20 hover:text-rose-400'
                          : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                      }`}>
                        {cuota.estado === 'Pagada' ? 'Desmarcar' : 'Marcar pagada'}
                      </button>
                      <button onClick={() => handleDeleteCuota(cuota.id)} className="p-1 text-gray-600 hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {payingCuota === cuota.id && (
                      <div className="mt-1 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] grid grid-cols-3 gap-2">
                        <Field label="Fecha pago">
                          <input type="date" value={payForm.fecha_pago} onChange={e => setPayForm(p => ({ ...p, fecha_pago: e.target.value }))} className="input-dark text-xs py-1" />
                        </Field>
                        <Field label="Modalidad">
                          <select value={payForm.modalidad_pago} onChange={e => setPayForm(p => ({ ...p, modalidad_pago: e.target.value }))} className="select-dark text-xs py-1">
                            <option value="">—</option>
                            {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </Field>
                        <Field label="Cobrado por">
                          <select value={payForm.cobrado_por} onChange={e => setPayForm(p => ({ ...p, cobrado_por: e.target.value }))} className="select-dark text-xs py-1">
                            <option value="">—</option>
                            {socios.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </Field>
                        <div className="col-span-3 flex gap-2 justify-end">
                          <button onClick={() => setPayingCuota(null)} className="text-xs text-gray-500 hover:text-white px-3 py-1">Cancelar</button>
                          <button onClick={() => handleConfirmPay(cuota)} className="btn-primary text-xs py-1 px-3">Confirmar pago</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-lg border border-dashed border-white/20 p-3">
              <p className="text-xs text-gray-500 mb-2">Agregar cuota</p>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Vencimiento *">
                  <input type="date" value={cuotaForm.fecha_vencimiento} onChange={e => setCuotaForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} className="input-dark text-xs py-1" />
                </Field>
                <Field label="Monto *">
                  <input type="number" step="0.01" placeholder="0" value={cuotaForm.monto} onChange={e => setCuotaForm(f => ({ ...f, monto: e.target.value }))} className="input-dark text-xs py-1" />
                </Field>
                <Field label="Notas">
                  <input type="text" value={cuotaForm.observaciones} onChange={e => setCuotaForm(f => ({ ...f, observaciones: e.target.value }))} className="input-dark text-xs py-1" />
                </Field>
              </div>
              <div className="flex justify-end mt-2">
                <button onClick={handleAddCuota} disabled={savingCuota} className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5">
                  <Plus className="w-3 h-3" /> {savingCuota ? 'Agregando...' : 'Agregar cuota'}
                </button>
              </div>
            </div>
          </Section>
        )}
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
