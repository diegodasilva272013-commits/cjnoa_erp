import { useEffect, useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, DollarSign, Search, ListChecks, Trash } from 'lucide-react';
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
  // modalidad_pago may not exist in DB yet, handled with fallback
  modalidad_pago?: 'Único' | 'En cuotas' | null;
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

  const canAccessCasosPagos = perfil?.rol === 'socio' || perfil?.rol === 'admin' || perfil?.rol === 'abogado' || (perfil?.permisos?.finanzas === true);

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

  const [borrandoTodo, setBorrandoTodo] = useState(false);
  async function handleDeleteAll() {
    if (items.length === 0) {
      showToast('No hay registros para borrar', 'info');
      return;
    }
    const ok1 = window.confirm(`¿Eliminar TODOS los ${items.length} registros de Casos - Pagos?\n\nTambién se eliminarán sus cuotas. Esta acción no se puede deshacer.`);
    if (!ok1) return;
    const confirmacion = window.prompt('Para confirmar, escribí BORRAR TODO');
    if (confirmacion !== 'BORRAR TODO') {
      showToast('Cancelado: la confirmación no coincide', 'error');
      return;
    }
    setBorrandoTodo(true);
    try {
      // Borrar de a tandas para evitar timeouts y respetar RLS por fila
      let totalEliminados = 0;
      const errores: string[] = [];
      for (const it of items) {
        const { error } = await supabase.from('casos_pagos').delete().eq('id', it.id);
        if (error) errores.push(`${it.cliente_nombre}: ${error.message}`);
        else totalEliminados++;
      }
      if (errores.length === 0) {
        showToast(`✅ ${totalEliminados} registro(s) eliminado(s)`);
      } else {
        showToast(`Eliminados ${totalEliminados}. Errores en ${errores.length}: ${errores[0]}`, 'error');
      }
      await load();
    } finally {
      setBorrandoTodo(false);
    }
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
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={borrandoTodo}
              className="px-3 py-2 rounded-lg text-sm bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-2 disabled:opacity-40"
              title="Borrar todos los registros"
            >
              <Trash className="w-4 h-4" />
              {borrandoTodo ? 'Borrando…' : 'Borrar todos'}
            </button>
          )}
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nuevo registro
          </button>
        </div>
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
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Modalidad</th>
                  <th className="px-4 py-3 text-right">Total acordado</th>
                  <th className="px-4 py-3 text-right">Cobrado</th>
                  <th className="px-4 py-3 text-right">Pendiente</th>
                  <th className="px-4 py-3 text-left">Socio</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(it => {
                  const esCuotas = it.modalidad_pago === 'En cuotas';
                  const cobrado = esCuotas ? 0 : (it.saldo_pagado ? Number(it.saldo_monto_real) : 0);
                  const total = Number(it.honorarios) || 0;
                  const pendiente = Math.max(0, total - cobrado);
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
                        ) : (
                          <span className="text-gray-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {esCuotas ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20">
                            <ListChecks className="w-3 h-3" /> En cuotas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <DollarSign className="w-3 h-3" /> Único
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-white font-medium">{total > 0 ? formatMoney(total) : <span className="text-gray-600">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        {esCuotas ? (
                          <span className="text-gray-500 text-xs">Ver cuotas</span>
                        ) : (
                          <span className={cobrado > 0 ? 'text-emerald-400' : 'text-gray-600'}>{cobrado > 0 ? formatMoney(cobrado) : '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {esCuotas ? (
                          <span className="text-gray-500 text-xs">Ver cuotas</span>
                        ) : (
                          <span className={pendiente > 0 ? 'text-amber-400' : 'text-gray-600'}>{pendiente > 0 ? formatMoney(pendiente) : '—'}</span>
                        )}
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

// Local cuota row before saving to DB
interface PendingCuota {
  localId: string;
  fecha_vencimiento: string;
  monto: string;
  observaciones: string;
}

function CasoPagoModal({ open, onClose, editing, socios, onSaved }: ModalProps) {
  const { showToast } = useToast();
  const isEditing = !!editing;
  // Cuotas already in DB (editing mode)
  const [cuotas, setCuotas] = useState<Cuota[]>([]);
  // Cuotas pending save (new record mode)
  const [pendingCuotas, setPendingCuotas] = useState<PendingCuota[]>([]);
  const [cuotaForm, setCuotaForm] = useState({ fecha_vencimiento: '', monto: '', observaciones: '' });
  const [savingCuota, setSavingCuota] = useState(false);
  const [payingCuota, setPayingCuota] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ fecha_pago: new Date().toISOString().slice(0, 10), modalidad_pago: '', cobrado_por: '' });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      (async () => {
        const { data: cuotasData } = await supabase
          .from('casos_pagos_cuotas')
          .select('*')
          .eq('caso_pago_id', editing.id)
          .order('numero');
        setCuotas((cuotasData || []) as Cuota[]);
      })();
    } else {
      setCuotas([]);
      setPendingCuotas([]);
    }
  }, [open, editing]);

  const [form, setForm] = useState({
    cliente_nombre: '',
    telefono: '',
    estado_caso: '',
    socio_carga: socios[0] || 'Rodrigo',
    honorarios: '',
    modalidad_pago: 'Único' as 'Único' | 'En cuotas',
    // Único mode fields
    saldo_pagado: false,
    saldo_monto_real: '',
    saldo_modalidad: '' as string,
    fecha_cobro: '',
    // Misc
    observaciones: '',
    caso_id: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      const hasCuotasFlag = editing.modalidad_pago === 'En cuotas';
      setForm({
        cliente_nombre: editing.cliente_nombre,
        telefono: editing.telefono || '',
        estado_caso: editing.estado_caso || '',
        socio_carga: editing.socio_carga,
        honorarios: String(editing.honorarios || ''),
        modalidad_pago: hasCuotasFlag ? 'En cuotas' : 'Único',
        saldo_pagado: editing.saldo_pagado,
        saldo_monto_real: String(editing.saldo_monto_real || ''),
        saldo_modalidad: editing.saldo_modalidad || '',
        fecha_cobro: editing.fecha_consulta || '',
        observaciones: editing.observaciones || '',
        caso_id: editing.caso_id || '',
      });
    } else {
      setForm({
        cliente_nombre: '', telefono: '', estado_caso: '',
        socio_carga: socios[0] || 'Rodrigo',
        honorarios: '', modalidad_pago: 'Único',
        saldo_pagado: false, saldo_monto_real: '', saldo_modalidad: '', fecha_cobro: '',
        observaciones: '', caso_id: '',
      });
    }
  }, [editing, open, socios]);

  async function handleSave() {
    if (!form.cliente_nombre.trim()) {
      showToast('El nombre del cliente es obligatorio', 'error');
      return;
    }
    if (form.modalidad_pago === 'Único' && form.saldo_pagado &&
        (!parseFloat(form.saldo_monto_real) || parseFloat(form.saldo_monto_real) <= 0)) {
      showToast('Ingresá el monto cobrado', 'error');
      return;
    }
    setSaving(true);
    const basePayload: Record<string, any> = {
      cliente_nombre: form.cliente_nombre.trim(),
      caso_id: form.caso_id || null,
      estado_caso: form.estado_caso || null,
      telefono: form.telefono.trim() || null,
      socio_carga: form.socio_carga,
      honorarios: parseFloat(form.honorarios) || 0,
      saldo_pagado: form.modalidad_pago === 'Único' ? form.saldo_pagado : false,
      saldo_monto_real: form.modalidad_pago === 'Único' ? (parseFloat(form.saldo_monto_real) || 0) : 0,
      saldo_modalidad: form.modalidad_pago === 'Único' ? (form.saldo_modalidad || null) : null,
      fecha_consulta: form.modalidad_pago === 'Único' && form.fecha_cobro ? form.fecha_cobro : null,
      observaciones: form.observaciones.trim() || null,
    };

    try {
      // Try with modalidad_pago column first; fall back without it if column missing
      async function trySave(payload: Record<string, any>, recordId?: string) {
        if (isEditing && recordId) {
          const { data, error } = await supabase.from('casos_pagos').update(payload).eq('id', recordId).select('id, ingreso_saldo_id').single();
          if (error) throw error;
          return data;
        } else {
          const { data, error } = await supabase.from('casos_pagos').insert(payload).select('id, ingreso_saldo_id').single();
          if (error) throw error;
          return data;
        }
      }

      let saved: any;
      try {
        saved = await trySave({ ...basePayload, modalidad_pago: form.modalidad_pago }, editing?.id);
      } catch (e: any) {
        if (e.message?.includes('modalidad_pago')) {
          // Column doesn’t exist yet — retry without it
          saved = await trySave(basePayload, editing?.id);
        } else {
          throw e;
        }
      }

      const savedId: string = saved?.id ?? editing?.id;

      // Ingreso fallback for único payment
      if (form.modalidad_pago === 'Único' && form.saldo_pagado && parseFloat(form.saldo_monto_real) > 0 && !saved?.ingreso_saldo_id) {
        const monto = parseFloat(form.saldo_monto_real);
        const modalidad = form.saldo_modalidad || 'Efectivo';
        const { data: ingreso } = await supabase.from('ingresos_operativos').insert({
          caso_id: form.caso_id || null,
          fecha: form.fecha_cobro || new Date().toISOString().slice(0, 10),
          cliente_nombre: form.cliente_nombre.trim(),
          tipo_cliente: 'Nuevo',
          monto,
          modalidad,
          doctor_cobra: form.socio_carga,
          receptor_transfer: modalidad === 'Transferencia' ? form.socio_carga : null,
          rama: 'Otros',
          fuente: 'Derivado',
          concepto: 'Honorarios - ' + form.cliente_nombre.trim(),
        } as any).select('id').single();
        if (ingreso?.id) {
          await supabase.from('casos_pagos').update({ ingreso_saldo_id: ingreso.id }).eq('id', savedId);
        }
      }

      // Save pending cuotas for new record
      if (!isEditing && savedId && pendingCuotas.length > 0) {
        for (let i = 0; i < pendingCuotas.length; i++) {
          const c = pendingCuotas[i];
          await supabase.from('casos_pagos_cuotas').insert({
            caso_pago_id: savedId,
            numero: i + 1,
            fecha_vencimiento: c.fecha_vencimiento,
            monto: parseFloat(c.monto),
            observaciones: c.observaciones || null,
          });
        }
      }

      showToast(isEditing ? 'Registro actualizado' : 'Registro creado');
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  // Add cuota to pending list (for new records) or directly to DB (for editing)
  async function handleAddCuota() {
    if (!cuotaForm.fecha_vencimiento || !cuotaForm.monto) {
      showToast('Fecha y monto son obligatorios', 'error');
      return;
    }
    if (!isEditing) {
      // Store locally, will be saved together with the record
      setPendingCuotas(prev => [...prev, {
        localId: crypto.randomUUID(),
        fecha_vencimiento: cuotaForm.fecha_vencimiento,
        monto: cuotaForm.monto,
        observaciones: cuotaForm.observaciones,
      }]);
      setCuotaForm({ fecha_vencimiento: '', monto: '', observaciones: '' });
      return;
    }
    setSavingCuota(true);
    const nextNumero = cuotas.length > 0 ? Math.max(...cuotas.map(c => c.numero)) + 1 : 1;
    const { error } = await supabase.from('casos_pagos_cuotas').insert({
      caso_pago_id: editing!.id,
      numero: nextNumero,
      fecha_vencimiento: cuotaForm.fecha_vencimiento,
      monto: parseFloat(cuotaForm.monto),
      observaciones: cuotaForm.observaciones || null,
    });
    if (error) { showToast(error.message, 'error'); }
    else {
      setCuotaForm({ fecha_vencimiento: '', monto: '', observaciones: '' });
      const { data } = await supabase.from('casos_pagos_cuotas').select('*').eq('caso_pago_id', editing!.id).order('numero');
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
      const modalidadCuota = payForm.modalidad_pago || 'Efectivo';
      const doctorCuota = payForm.cobrado_por || editing.socio_carga;
      const { data: ingreso } = await supabase.from('ingresos_operativos').insert({
        caso_id: editing.caso_id || null,
        fecha: payForm.fecha_pago || new Date().toISOString().slice(0, 10),
        cliente_nombre: editing.cliente_nombre,
        tipo_cliente: 'Nuevo',
        monto: Number(cuota.monto),
        modalidad: modalidadCuota,
        doctor_cobra: doctorCuota,
        receptor_transfer: modalidadCuota === 'Transferencia' ? doctorCuota : null,
        rama: 'Otros',
        fuente: 'Derivado',
        concepto: `Cuota caso de pago #${cuota.numero} - ${editing.cliente_nombre}`,
      } as any).select('id').single();
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
  const totalPendingCuotas = pendingCuotas.reduce((s, c) => s + (parseFloat(c.monto) || 0), 0);

  return (
    <Modal open={open} onClose={onClose}
      title={isEditing ? 'Editar caso de pago' : 'Nuevo caso de pago'}
      subtitle="Honorarios · Modalidad · Estado"
      maxWidth="max-w-2xl">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-2">

        {/* Datos del cliente */}
        <Section title="Cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre y Apellido *">
              <input type="text" value={form.cliente_nombre}
                onChange={e => setForm({ ...form, cliente_nombre: e.target.value })}
                className="input-dark" placeholder="Ej: Juan Pérez" />
            </Field>
            <Field label="Teléfono">
              <input type="tel" value={form.telefono}
                onChange={e => setForm({ ...form, telefono: e.target.value })}
                className="input-dark" placeholder="Ej: 3885 123456" />
            </Field>
            <Field label="Estado del caso">
              <select value={form.estado_caso}
                onChange={e => setForm({ ...form, estado_caso: e.target.value })}
                className="select-dark">
                <option value="">—</option>
                {ESTADOS_CASO.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Socio que carga">
              <select value={form.socio_carga}
                onChange={e => setForm({ ...form, socio_carga: e.target.value })}
                className="select-dark">
                {socios.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        {/* Honorarios */}
        <Section title="Honorarios">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Monto acordado">
              <input type="number" step="0.01" placeholder="0"
                value={form.honorarios}
                onChange={e => setForm({ ...form, honorarios: e.target.value })}
                className="input-dark" />
            </Field>
            <Field label="Modalidad de pago">
              <div className="flex rounded-xl overflow-hidden border border-white/10">
                {(['Único', 'En cuotas'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setForm({ ...form, modalidad_pago: opt })}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                      form.modalidad_pago === opt
                        ? opt === 'Único'
                          ? 'bg-blue-500/20 text-blue-300 border-r border-white/10'
                          : 'bg-violet-500/20 text-violet-300'
                        : 'bg-white/[0.03] text-gray-500 hover:text-gray-300 border-r border-white/10 last:border-r-0'
                    }`}
                  >
                    {opt === 'Único' ? '💵 Pago Único' : '📋 En Cuotas'}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Pago Único */}
          {form.modalidad_pago === 'Único' && (
            <div className="mt-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300 mb-3">
                <input type="checkbox" checked={form.saldo_pagado}
                  onChange={e => setForm({ ...form, saldo_pagado: e.target.checked })}
                  className="checkbox-dark" />
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Ya cobró los honorarios
              </label>
              {form.saldo_pagado && (
                <div className="grid grid-cols-3 gap-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3">
                  <Field label="Monto cobrado">
                    <input type="number" step="0.01" value={form.saldo_monto_real}
                      onChange={e => setForm({ ...form, saldo_monto_real: e.target.value })}
                      className="input-dark" placeholder="0" />
                  </Field>
                  <Field label="Fecha de cobro">
                    <input type="date" value={form.fecha_cobro}
                      onChange={e => setForm({ ...form, fecha_cobro: e.target.value })}
                      className="input-dark" />
                  </Field>
                  <Field label="Modalidad">
                    <select value={form.saldo_modalidad}
                      onChange={e => setForm({ ...form, saldo_modalidad: e.target.value })}
                      className="select-dark">
                      <option value="">—</option>
                      {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                </div>
              )}
              {!form.saldo_pagado && (
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 px-3 py-2 text-xs text-amber-400">
                  ⚠️ Honorarios pendientes de cobro
                </div>
              )}
            </div>
          )}

          {/* En Cuotas */}
          {form.modalidad_pago === 'En cuotas' && (
            <div className="mt-3">
              {/* Summary */}
              {(cuotas.length > 0 || pendingCuotas.length > 0) && (
                <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
                  <span>Total: <span className="text-white font-semibold">{formatMoney(isEditing ? totalCuotas : totalPendingCuotas)}</span></span>
                  {isEditing && <>
                    <span>Cobrado: <span className="text-emerald-400 font-semibold">{formatMoney(cobradoCuotas)}</span></span>
                    <span>Pendiente: <span className="text-amber-400 font-semibold">{formatMoney(totalCuotas - cobradoCuotas)}</span></span>
                  </>}
                  {!isEditing && pendingCuotas.length > 0 && (
                    <span className="text-violet-400">{pendingCuotas.length} cuota{pendingCuotas.length !== 1 ? 's' : ''} para guardar</span>
                  )}
                </div>
              )}

              {/* Pending cuotas list (new record) */}
              {!isEditing && pendingCuotas.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {pendingCuotas.map((c, i) => (
                    <div key={c.localId} className="flex items-center gap-2 p-2 rounded-lg text-xs bg-violet-500/5 border border-violet-500/20">
                      <span className="text-gray-500 w-5 text-right">#{i + 1}</span>
                      <span className="flex-1 text-gray-300">{c.fecha_vencimiento}</span>
                      <span className="font-semibold text-white">{formatMoney(parseFloat(c.monto) || 0)}</span>
                      <span className="text-amber-400 text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10">Pendiente</span>
                      <button
                        onClick={() => setPendingCuotas(prev => prev.filter(x => x.localId !== c.localId))}
                        className="p-1 text-gray-600 hover:text-red-400"
                        title="Eliminar cuota"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* DB cuotas list (editing) */}
              {isEditing && cuotas.length > 0 && (
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
                        <button
                          onClick={() => handleTogglePaid(cuota)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            cuota.estado === 'Pagada'
                              ? 'bg-gray-500/20 text-gray-400 hover:bg-rose-500/20 hover:text-rose-400'
                              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                          }`}
                        >
                          {cuota.estado === 'Pagada' ? 'Desmarcar' : 'Marcar pagada'}
                        </button>
                        <button onClick={() => handleDeleteCuota(cuota.id)} title="Eliminar" className="p-1 text-gray-600 hover:text-red-400">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      {payingCuota === cuota.id && (
                        <div className="mt-1 p-3 rounded-lg bg-white/[0.04] border border-white/[0.08] grid grid-cols-3 gap-2">
                          <Field label="Fecha pago">
                            <input type="date" value={payForm.fecha_pago}
                              onChange={e => setPayForm(p => ({ ...p, fecha_pago: e.target.value }))}
                              className="input-dark text-xs py-1" />
                          </Field>
                          <Field label="Modalidad">
                            <select value={payForm.modalidad_pago}
                              onChange={e => setPayForm(p => ({ ...p, modalidad_pago: e.target.value }))}
                              className="select-dark text-xs py-1">
                              <option value="">—</option>
                              {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </Field>
                          <Field label="Cobrado por">
                            <select value={payForm.cobrado_por}
                              onChange={e => setPayForm(p => ({ ...p, cobrado_por: e.target.value }))}
                              className="select-dark text-xs py-1">
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

              {/* Add cuota form */}
              <div className="rounded-lg border border-dashed border-white/20 p-3">
                <p className="text-xs text-gray-500 mb-2">+ Agregar cuota</p>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Fecha vencimiento *">
                    <input type="date" value={cuotaForm.fecha_vencimiento}
                      onChange={e => setCuotaForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                      className="input-dark text-xs py-1" />
                  </Field>
                  <Field label="Monto *">
                    <input type="number" step="0.01" placeholder="0" value={cuotaForm.monto}
                      onChange={e => setCuotaForm(f => ({ ...f, monto: e.target.value }))}
                      className="input-dark text-xs py-1" />
                  </Field>
                  <Field label="Notas">
                    <input type="text" value={cuotaForm.observaciones}
                      onChange={e => setCuotaForm(f => ({ ...f, observaciones: e.target.value }))}
                      className="input-dark text-xs py-1" placeholder="Opcional" />
                  </Field>
                </div>
                <div className="flex justify-end mt-2">
                  <button onClick={handleAddCuota} disabled={savingCuota}
                    className="btn-primary text-xs py-1.5 px-4 flex items-center gap-1.5">
                    <Plus className="w-3 h-3" /> {savingCuota ? 'Agregando...' : 'Agregar cuota'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Observaciones */}
        <Section title="Observaciones (opcional)">
          <textarea value={form.observaciones}
            onChange={e => setForm({ ...form, observaciones: e.target.value })}
            className="input-dark w-full" rows={2}
            placeholder="Notas adicionales sobre el caso..." />
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
