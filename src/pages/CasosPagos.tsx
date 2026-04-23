import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2, DollarSign, Search, Receipt, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSocios } from '../hooks/useSocios';
import Modal from '../components/Modal';
import { formatMoney } from '../lib/financeFormat';

interface CasoPagoCuota {
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
  created_at: string;
}

interface CasoPago {
  id: string;
  caso_id: string | null;
  estado_caso: string | null;
  cliente_nombre: string;
  telefono: string | null;
  detalle_consulta: string | null;
  socio_carga: string;
  fecha_carga: string;
  consulta_realizada: boolean;
  resultado_estado: string | null;
  saldo_pagado: boolean;
  saldo_monto_real: number;
  saldo_modalidad: string | null;
  honorarios: number;
  observaciones: string | null;
  created_at: string;
  cuotas: CasoPagoCuota[];
}

interface EditableCuota {
  fecha_vencimiento: string;
  monto: string;
  pagada: boolean;
  fecha_pago: string;
  modalidad_pago: string;
  cobrado_por: string;
  observaciones: string;
}

const ESTADOS_CASO = ['Vino a consulta', 'Trámite no judicial', 'Cliente Judicial'] as const;
const MODALIDADES = ['Efectivo', 'Transferencia'] as const;

function createEmptyCuota(socio: string): EditableCuota {
  return {
    fecha_vencimiento: '',
    monto: '',
    pagada: false,
    fecha_pago: new Date().toISOString().split('T')[0],
    modalidad_pago: '',
    cobrado_por: socio,
    observaciones: '',
  };
}

function summarizeCuotas(cuotas: CasoPagoCuota[]) {
  const pagas = cuotas.filter(cuota => cuota.estado === 'Pagada');
  const montoPagado = pagas.reduce((total, cuota) => total + Number(cuota.monto || 0), 0);
  const montoPactado = cuotas.reduce((total, cuota) => total + Number(cuota.monto || 0), 0);

  return {
    pactadas: cuotas.length,
    pagas: pagas.length,
    pendientes: cuotas.length - pagas.length,
    montoPagado,
    montoPactado,
  };
}

function summarizeEditableCuotas(cuotas: EditableCuota[]) {
  const pagas = cuotas.filter(cuota => cuota.pagada);
  const montoPagado = pagas.reduce((total, cuota) => total + (parseFloat(cuota.monto) || 0), 0);
  const montoPactado = cuotas.reduce((total, cuota) => total + (parseFloat(cuota.monto) || 0), 0);

  return {
    pactadas: cuotas.length,
    pagas: pagas.length,
    pendientes: cuotas.length - pagas.length,
    montoPagado,
    montoPactado,
  };
}

export default function CasosPagos() {
  const { perfil } = useAuth();
  const { showToast } = useToast();
  const socios = useSocios();
  const [items, setItems] = useState<CasoPago[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CasoPago | null>(null);
  const [search, setSearch] = useState('');

  const canAccessCasosPagos = perfil?.rol === 'socio' || perfil?.rol === 'admin';

  async function load() {
    setLoading(true);
    const [casosRes, cuotasRes] = await Promise.all([
      supabase
        .from('casos_pagos')
        .select('*')
        .order('fecha_carga', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('casos_pagos_cuotas')
        .select('*')
        .order('numero', { ascending: true }),
    ]);

    if (casosRes.error) {
      showToast(casosRes.error.message || 'Error al cargar', 'error');
    } else if (cuotasRes.error) {
      showToast(cuotasRes.error.message || 'Error al cargar cuotas', 'error');
    } else {
      const cuotasByCasoPago = new Map<string, CasoPagoCuota[]>();

      (cuotasRes.data || []).forEach((cuota: any) => {
        const current = cuotasByCasoPago.get(cuota.caso_pago_id) || [];
        current.push(cuota as CasoPagoCuota);
        cuotasByCasoPago.set(cuota.caso_pago_id, current);
      });

      setItems((casosRes.data || []).map((item: any) => ({
        ...item,
        cuotas: cuotasByCasoPago.get(item.id) || [],
      })));
    }

    setLoading(false);
  }

  useEffect(() => {
    if (canAccessCasosPagos) {
      load();
    }
  }, [canAccessCasosPagos]);

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este registro? Si tenía ingresos vinculados, también se eliminarán.')) return;

    const { error } = await supabase.from('casos_pagos').delete().eq('id', id);
    if (error) {
      showToast(error.message, 'error');
      return;
    }

    showToast('Eliminado');
    load();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      it.cliente_nombre.toLowerCase().includes(q) ||
      (it.telefono || '').toLowerCase().includes(q) ||
      (it.estado_caso || '').toLowerCase().includes(q) ||
      (it.resultado_estado || '').toLowerCase().includes(q) ||
      it.socio_carga.toLowerCase().includes(q),
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
          <p className="text-sm text-gray-500 mt-1">Gestión comercial, honorarios y cobros posteriores a la consulta</p>
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
          placeholder="Buscar por cliente, teléfono, socio o estado..."
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
                  <th className="px-4 py-3 text-left">Cuotas</th>
                  <th className="px-4 py-3 text-right">Cobrado</th>
                  <th className="px-4 py-3 text-right">Pendiente</th>
                  <th className="px-4 py-3 text-left">Socio</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map(it => {
                  const cuotaStats = summarizeCuotas(it.cuotas || []);
                  const usaCuotas = cuotaStats.pactadas > 0;
                  const cobrado = usaCuotas ? cuotaStats.montoPagado : (it.saldo_pagado ? Number(it.saldo_monto_real || 0) : 0);
                  const pendiente = Math.max(Number(it.honorarios || 0) - cobrado, 0);
                  const estado = it.estado_caso || it.resultado_estado || 'Sin estado';

                  return (
                    <tr key={it.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-white">
                        <div className="font-medium">{it.cliente_nombre}</div>
                        {it.telefono && <div className="text-xs text-gray-500">{it.telefono}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          <CheckCircle2 className="w-3 h-3" /> {estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-white font-semibold">{formatMoney(Number(it.honorarios || 0))}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {usaCuotas ? (
                          <div className="space-y-0.5">
                            <div className="text-white">Pactadas {cuotaStats.pactadas}</div>
                            <div className="text-[10px] text-emerald-500">Pagas {cuotaStats.pagas}</div>
                            <div className="text-[10px] text-amber-400">Pendientes {cuotaStats.pendientes}</div>
                          </div>
                        ) : (
                          <span className="text-gray-500">Pago único</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cobrado > 0 ? 'text-emerald-400' : 'text-gray-500'}>{formatMoney(cobrado)}</span>
                        <div className="text-[10px] text-gray-600">{usaCuotas ? 'Cuotas pagas' : 'Cobro único'}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={pendiente > 0 ? 'text-amber-400' : 'text-emerald-400'}>{formatMoney(pendiente)}</span>
                        <div className="text-[10px] text-gray-600">Saldo comercial</div>
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

function CasoPagoModal({ open, onClose, editing, socios, onSaved }: ModalProps) {
  const { showToast } = useToast();
  const isEditing = !!editing;
  const [casos, setCasos] = useState<Array<{ id: string; label: string }>>([]);
  const [honorariosEnCuotas, setHonorariosEnCuotas] = useState(false);
  const [cuotas, setCuotas] = useState<EditableCuota[]>([]);

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
    })();
  }, [open]);

  const [form, setForm] = useState({
    cliente_nombre: '',
    caso_id: '',
    estado_caso: '',
    telefono: '',
    detalle_consulta: '',
    socio_carga: socios[0] || 'Rodrigo',
    fecha_carga: new Date().toISOString().split('T')[0],
    saldo_pagado: false,
    saldo_monto_real: '',
    saldo_modalidad: '' as string,
    honorarios: '',
    observaciones: '',
  });
  const [saving, setSaving] = useState(false);
  const cuotasSummary = useMemo(() => summarizeEditableCuotas(cuotas), [cuotas]);

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
        saldo_pagado: editing.saldo_pagado,
        saldo_monto_real: String(editing.saldo_monto_real || ''),
        saldo_modalidad: editing.saldo_modalidad || '',
        honorarios: String(editing.honorarios || ''),
        observaciones: editing.observaciones || '',
      });

      const editingCuotas = [...(editing.cuotas || [])]
        .sort((left, right) => left.numero - right.numero)
        .map(cuota => ({
          fecha_vencimiento: cuota.fecha_vencimiento || '',
          monto: String(cuota.monto || ''),
          pagada: cuota.estado === 'Pagada',
          fecha_pago: cuota.fecha_pago || new Date().toISOString().split('T')[0],
          modalidad_pago: cuota.modalidad_pago || '',
          cobrado_por: cuota.cobrado_por || editing.socio_carga,
          observaciones: cuota.observaciones || '',
        }));

      setHonorariosEnCuotas(editingCuotas.length > 0);
      setCuotas(editingCuotas);
      return;
    }

    setForm({
      cliente_nombre: '',
      caso_id: '',
      estado_caso: '',
      telefono: '',
      detalle_consulta: '',
      socio_carga: socios[0] || 'Rodrigo',
      fecha_carga: new Date().toISOString().split('T')[0],
      saldo_pagado: false,
      saldo_monto_real: '',
      saldo_modalidad: '',
      honorarios: '',
      observaciones: '',
    });
    setHonorariosEnCuotas(false);
    setCuotas([]);
  }, [editing, open, socios]);

  function addCuota() {
    setCuotas(current => [...current, createEmptyCuota(form.socio_carga)]);
  }

  function updateCuota(index: number, patch: Partial<EditableCuota>) {
    setCuotas(current => current.map((cuota, cuotaIndex) => (
      cuotaIndex === index ? { ...cuota, ...patch } : cuota
    )));
  }

  function removeCuota(index: number) {
    setCuotas(current => current.filter((_, cuotaIndex) => cuotaIndex !== index));
  }

  function activateCuotas() {
    setHonorariosEnCuotas(true);
    setForm(current => ({ ...current, saldo_pagado: false, saldo_monto_real: '', saldo_modalidad: '' }));
    setCuotas(current => current.length > 0 ? current : [createEmptyCuota(form.socio_carga)]);
  }

  function activatePagoUnico() {
    if (cuotas.length > 0 && !confirm('Esto eliminará el plan de cuotas actual al guardar. ¿Querés continuar con cobro único?')) {
      return;
    }

    setHonorariosEnCuotas(false);
    setCuotas([]);
  }

  async function handleSave() {
    if (!form.cliente_nombre.trim()) {
      showToast('El nombre del cliente es obligatorio', 'error');
      return;
    }
    if (!form.caso_id) {
      showToast('Debes vincular un caso de Casos - Trabajo', 'error');
      return;
    }
    if (!form.estado_caso) {
      showToast('Debes indicar el estado del caso', 'error');
      return;
    }

    const honorarios = parseFloat(form.honorarios) || 0;
    if (honorarios <= 0) {
      showToast('Debes indicar los honorarios del caso', 'error');
      return;
    }

    const cuotasPreparadas = cuotas.map((cuota, index) => ({
      numero: index + 1,
      fecha_vencimiento: cuota.fecha_vencimiento,
      monto: parseFloat(cuota.monto) || 0,
      estado: cuota.pagada ? 'Pagada' : 'Pendiente',
      fecha_pago: cuota.pagada ? (cuota.fecha_pago || new Date().toISOString().split('T')[0]) : null,
      modalidad_pago: cuota.pagada ? (cuota.modalidad_pago || null) : null,
      cobrado_por: cuota.pagada ? (cuota.cobrado_por || form.socio_carga) : null,
      observaciones: cuota.observaciones.trim() || null,
    }));

    if (honorariosEnCuotas) {
      if (cuotasPreparadas.length === 0) {
        showToast('Debes cargar al menos una cuota pactada', 'error');
        return;
      }

      const cuotaInvalida = cuotasPreparadas.find(cuota => !cuota.fecha_vencimiento || cuota.monto <= 0);
      if (cuotaInvalida) {
        showToast('Todas las cuotas deben tener vencimiento y monto válido', 'error');
        return;
      }

      const cuotaPagadaInvalida = cuotasPreparadas.find(cuota => cuota.estado === 'Pagada' && (!cuota.fecha_pago || !cuota.modalidad_pago || !cuota.cobrado_por));
      if (cuotaPagadaInvalida) {
        showToast('Las cuotas pagadas deben indicar fecha, modalidad y quién cobró', 'error');
        return;
      }

      const totalCuotas = cuotasPreparadas.reduce((total, cuota) => total + cuota.monto, 0);
      if (Math.abs(totalCuotas - honorarios) > 0.01) {
        showToast('La suma de cuotas pactadas debe coincidir con los honorarios', 'error');
        return;
      }
    } else {
      const saldoCobrado = parseFloat(form.saldo_monto_real) || 0;
      if (form.saldo_pagado && saldoCobrado <= 0) {
        showToast('Para marcar el cobro como realizado, indicá un monto válido', 'error');
        return;
      }
      if (form.saldo_pagado && !form.saldo_modalidad) {
        showToast('Indicá la modalidad del cobro único', 'error');
        return;
      }
      if (saldoCobrado > honorarios) {
        showToast('El cobro no puede superar los honorarios cargados', 'error');
        return;
      }
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
      fecha_consulta: null,
      hora_consulta: null,
      abogado_asignado: null,
      monto_reserva: 0,
      monto_a_cancelar: 0,
      reserva_pagada: false,
      reserva_modalidad: null,
      consulta_realizada: true,
      resultado_estado: form.estado_caso || null,
      saldo_pagado: honorariosEnCuotas ? false : form.saldo_pagado,
      saldo_monto_real: honorariosEnCuotas ? 0 : (form.saldo_pagado ? (parseFloat(form.saldo_monto_real) || 0) : 0),
      saldo_modalidad: honorariosEnCuotas ? null : (form.saldo_pagado ? (form.saldo_modalidad || null) : null),
      honorarios,
      observaciones: form.observaciones.trim() || null,
    };

    try {
      let casoPagoId = editing?.id || null;

      if (isEditing && editing) {
        const { error } = await supabase.from('casos_pagos').update(payload).eq('id', editing.id);
        if (error) throw error;
        casoPagoId = editing.id;
      } else {
        const { data, error } = await supabase.from('casos_pagos').insert(payload).select('id').single();
        if (error) throw error;
        casoPagoId = data?.id || null;
      }

      if (!casoPagoId) {
        throw new Error('No se pudo identificar el caso de pago guardado');
      }

      const { error: deleteCuotasError } = await supabase.from('casos_pagos_cuotas').delete().eq('caso_pago_id', casoPagoId);
      if (deleteCuotasError) throw deleteCuotasError;

      if (honorariosEnCuotas) {
        const { error: cuotasError } = await supabase.from('casos_pagos_cuotas').insert(
          cuotasPreparadas.map(cuota => ({
            caso_pago_id: casoPagoId,
            numero: cuota.numero,
            fecha_vencimiento: cuota.fecha_vencimiento,
            monto: cuota.monto,
            estado: cuota.estado,
            fecha_pago: cuota.fecha_pago,
            modalidad_pago: cuota.modalidad_pago,
            cobrado_por: cuota.cobrado_por,
            observaciones: cuota.observaciones,
          })),
        );

        if (cuotasError) throw cuotasError;
      }

      showToast(isEditing ? 'Registro actualizado' : 'Registro creado');
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar caso de pago' : 'Nuevo caso de pago'} subtitle="Módulo comercial separado del agendamiento" maxWidth="max-w-4xl">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
        <Section title="Cliente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Nombre *">
              <input type="text" value={form.cliente_nombre} onChange={e => setForm({ ...form, cliente_nombre: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Caso *">
              <select value={form.caso_id} onChange={e => setForm({ ...form, caso_id: e.target.value })} className="select-dark">
                <option value="">Seleccionar caso</option>
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
                {socios.map(socio => <option key={socio} value={socio}>{socio}</option>)}
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

        <Section title="Comercial" badge="Honorarios y cobro">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Honorarios *">
              <input type="number" step="0.01" value={form.honorarios} onChange={e => setForm({ ...form, honorarios: e.target.value })} className="input-dark" />
            </Field>
            <Field label="Modalidad de cobro" full>
              <div className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
                <button
                  type="button"
                  onClick={activatePagoUnico}
                  className={`px-3 py-2 text-sm rounded-lg transition ${!honorariosEnCuotas ? 'bg-white/[0.12] text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <Receipt className="w-4 h-4 inline mr-2" /> Pago único
                </button>
                <button
                  type="button"
                  onClick={activateCuotas}
                  className={`px-3 py-2 text-sm rounded-lg transition ${honorariosEnCuotas ? 'bg-white/[0.12] text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <DollarSign className="w-4 h-4 inline mr-2" /> En cuotas
                </button>
              </div>
            </Field>
            <Field label="Observaciones" full>
              <textarea value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} className="input-dark" rows={2} />
            </Field>
          </div>
        </Section>

        {!honorariosEnCuotas ? (
          <Section title="Cobro único" badge="Ingreso automático a Ingresos">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Monto cobrado">
                <input type="number" step="0.01" value={form.saldo_monto_real} onChange={e => setForm({ ...form, saldo_monto_real: e.target.value })} className="input-dark" />
              </Field>
              <Field label="Modalidad del cobro">
                <select value={form.saldo_modalidad} onChange={e => setForm({ ...form, saldo_modalidad: e.target.value })} className="select-dark">
                  <option value="">—</option>
                  {MODALIDADES.map(modalidad => <option key={modalidad} value={modalidad}>{modalidad}</option>)}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer text-sm text-gray-300">
              <input type="checkbox" checked={form.saldo_pagado} onChange={e => setForm({ ...form, saldo_pagado: e.target.checked })} className="checkbox-dark" />
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Cobro realizado (genera ingreso automático)
            </label>
          </Section>
        ) : (
          <Section title="Plan de cuotas" badge="Cada cuota pagada genera ingreso automático">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider bg-white/[0.06] text-white">Pactadas {cuotasSummary.pactadas}</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider bg-emerald-500/10 text-emerald-400">Pagas {cuotasSummary.pagas}</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider bg-amber-500/10 text-amber-400">Pendientes {cuotasSummary.pendientes}</span>
              <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider bg-sky-500/10 text-sky-400">Total {formatMoney(cuotasSummary.montoPactado)}</span>
              {Math.abs(cuotasSummary.montoPactado - (parseFloat(form.honorarios) || 0)) > 0.01 && (
                <span className="px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider bg-red-500/10 text-red-400">Las cuotas deben coincidir con honorarios</span>
              )}
            </div>

            <div className="space-y-3">
              {cuotas.map((cuota, index) => (
                <div key={`${index}-${cuota.fecha_vencimiento}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Cuota {index + 1}</h4>
                      <p className="text-[11px] text-gray-500">Pactada dentro de Casos - Pagos</p>
                    </div>
                    <button type="button" onClick={() => removeCuota(index)} className="p-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Vencimiento *">
                      <input type="date" value={cuota.fecha_vencimiento} onChange={e => updateCuota(index, { fecha_vencimiento: e.target.value })} className="input-dark" />
                    </Field>
                    <Field label="Monto *">
                      <input type="number" step="0.01" value={cuota.monto} onChange={e => updateCuota(index, { monto: e.target.value })} className="input-dark" />
                    </Field>
                    <Field label="Quién cobró">
                      <select value={cuota.cobrado_por} onChange={e => updateCuota(index, { cobrado_por: e.target.value })} className="select-dark">
                        <option value="">—</option>
                        {socios.map(socio => <option key={socio} value={socio}>{socio}</option>)}
                      </select>
                    </Field>
                    <Field label="Modalidad pago">
                      <select value={cuota.modalidad_pago} onChange={e => updateCuota(index, { modalidad_pago: e.target.value })} className="select-dark">
                        <option value="">—</option>
                        {MODALIDADES.map(modalidad => <option key={modalidad} value={modalidad}>{modalidad}</option>)}
                      </select>
                    </Field>
                    <Field label="Fecha pago">
                      <input type="date" value={cuota.fecha_pago} onChange={e => updateCuota(index, { fecha_pago: e.target.value })} className="input-dark" />
                    </Field>
                    <Field label="Observaciones" full>
                      <textarea value={cuota.observaciones} onChange={e => updateCuota(index, { observaciones: e.target.value })} className="input-dark" rows={2} />
                    </Field>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                    <input type="checkbox" checked={cuota.pagada} onChange={e => updateCuota(index, { pagada: e.target.checked })} className="checkbox-dark" />
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    Cuota pagada (genera ingreso automático)
                  </label>
                </div>
              ))}
            </div>

            <button type="button" onClick={addCuota} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/[0.08] text-sm text-white hover:bg-white/[0.04]">
              <Plus className="w-4 h-4" /> Agregar cuota
            </button>
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