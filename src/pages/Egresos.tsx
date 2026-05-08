import { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Pencil, Search, Download, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  SOCIOS_FINANZAS, MODALIDADES, TIPOS_EGRESO,
  SUELDOS_NOMBRES, SERVICIOS_NOMBRES, VENCIMIENTOS_NOMBRES,
  type EgresoV2, type SocioFinanzas, type ModalidadPago, type TipoEgreso,
} from '../types/finanzas';
import Modal from '../components/Modal';
import { formatMoney } from '../lib/financeFormat';
import { exportToExcel } from '../lib/exportExcel';

const HOY = () => new Date().toISOString().slice(0, 10);

interface FormState {
  fecha: string;
  tipo: TipoEgreso;
  concepto: string;
  detalle: string;
  monto: string;
  modalidad: ModalidadPago;
  pagador: SocioFinanzas | '';
  beneficiario: string;
  observaciones: string;
}

const FORM_VACIO: FormState = {
  fecha: HOY(),
  tipo: 'eventual',
  concepto: '',
  detalle: '',
  monto: '',
  modalidad: 'Transferencia',
  pagador: 'Rodri',
  beneficiario: '',
  observaciones: '',
};

function sugerenciasConcepto(tipo: TipoEgreso): string[] {
  switch (tipo) {
    case 'sueldo': return SUELDOS_NOMBRES;
    case 'servicio': return SERVICIOS_NOMBRES;
    case 'vencimiento': return VENCIMIENTOS_NOMBRES;
    case 'tarjeta': return [...SOCIOS_FINANZAS];
    default: return [];
  }
}

export default function Egresos() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState<EgresoV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [saving, setSaving] = useState(false);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoEgreso | ''>('');
  const [filtroPagador, setFiltroPagador] = useState<SocioFinanzas | ''>('');
  const [filtroModalidad, setFiltroModalidad] = useState<ModalidadPago | ''>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('egresos_v2')
      .select('*')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) showToast(`Error al cargar egresos: ${error.message}`, 'error');
    else setItems((data || []) as EgresoV2[]);
    setLoading(false);
  }, [showToast]);

  useEffect(() => { cargar(); }, [cargar]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel('egresos_v2_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'egresos_v2' }, () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cargar]);

  const filtrados = useMemo(() => {
    return items.filter(e => {
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!e.concepto.toLowerCase().includes(q) && !(e.beneficiario || '').toLowerCase().includes(q)) return false;
      }
      if (filtroTipo && e.tipo !== filtroTipo) return false;
      if (filtroPagador && e.pagador !== filtroPagador) return false;
      if (filtroModalidad && e.modalidad !== filtroModalidad) return false;
      if (desde && e.fecha < desde) return false;
      if (hasta && e.fecha > hasta) return false;
      return true;
    });
  }, [items, busqueda, filtroTipo, filtroPagador, filtroModalidad, desde, hasta]);

  const totales = useMemo(() => {
    const total = filtrados.reduce((s, e) => s + Number(e.monto || 0), 0);
    const porPagador: Record<SocioFinanzas, number> = { Rodri: 0, Noe: 0, Ale: 0, Fabri: 0 };
    const porTipo: Record<string, number> = {};
    filtrados.forEach(e => {
      if (e.pagador) porPagador[e.pagador] = (porPagador[e.pagador] || 0) + Number(e.monto || 0);
      porTipo[e.tipo] = (porTipo[e.tipo] || 0) + Number(e.monto || 0);
    });
    return { total, porPagador, porTipo };
  }, [filtrados]);

  function abrirNuevo() {
    setEditId(null);
    setForm(FORM_VACIO);
    setModalOpen(true);
  }

  function abrirEditar(e: EgresoV2) {
    setEditId(e.id);
    setForm({
      fecha: e.fecha,
      tipo: e.tipo,
      concepto: e.concepto,
      detalle: e.detalle || '',
      monto: String(e.monto),
      modalidad: e.modalidad,
      pagador: e.pagador || '',
      beneficiario: e.beneficiario || '',
      observaciones: e.observaciones || '',
    });
    setModalOpen(true);
  }

  async function guardar() {
    if (!form.concepto.trim()) {
      showToast('Falta el concepto', 'error');
      return;
    }
    const monto = Number(form.monto);
    if (!monto || monto <= 0) {
      showToast('Monto inválido', 'error');
      return;
    }
    if (form.modalidad !== 'Efectivo' && !form.pagador) {
      showToast('Indicá quién paga', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fecha: form.fecha,
        tipo: form.tipo,
        concepto: form.concepto.trim(),
        detalle: form.detalle.trim() || null,
        monto,
        modalidad: form.modalidad,
        pagador: form.modalidad === 'Efectivo' ? null : (form.pagador as SocioFinanzas),
        beneficiario: form.beneficiario.trim() || null,
        observaciones: form.observaciones.trim() || null,
        updated_by: user?.id,
      };
      if (editId) {
        const { error } = await supabase.from('egresos_v2').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editId);
        if (error) throw error;
        showToast('Egreso actualizado', 'success');
      } else {
        const { error } = await supabase.from('egresos_v2').insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        showToast('Egreso registrado', 'success');
      }
      setModalOpen(false);
      await cargar();
    } catch (err: any) {
      showToast(err?.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este egreso? Se revierte el movimiento de la cuenta del pagador.')) return;
    const { error } = await supabase.from('egresos_v2').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
    else { showToast('Egreso eliminado', 'success'); await cargar(); }
  }

  function exportar() {
    const rows = filtrados.map(e => ({
      Fecha: e.fecha,
      Tipo: e.tipo,
      Concepto: e.concepto,
      Detalle: e.detalle || '',
      Monto: Number(e.monto),
      Modalidad: e.modalidad,
      Pagador: e.pagador || '',
      Beneficiario: e.beneficiario || '',
      Observaciones: e.observaciones || '',
    }));
    exportToExcel(rows, `egresos-${HOY()}`);
  }

  const sugerencias = sugerenciasConcepto(form.tipo);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Egresos</h1>
          <p className="text-sm text-zinc-400 mt-1">Sueldos, servicios, vencimientos, tarjetas y eventuales — descuentan de la cuenta del pagador.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportar} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10 flex items-center gap-2">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={abrirNuevo} className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm text-white flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nuevo egreso
          </button>
        </div>
      </header>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Total filtrado" value={formatMoney(totales.total)} tone="rose" highlight />
        {SOCIOS_FINANZAS.map(s => (
          <MetricCard key={s} label={`Pagó ${s}`} value={formatMoney(totales.porPagador[s])} tone={SOCIO_TONE[s]} />
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por concepto o beneficiario…"
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-500"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <SelectFilter label="Tipo" value={filtroTipo} onChange={v => setFiltroTipo(v as TipoEgreso | '')} options={TIPOS_EGRESO} />
          <SelectFilter label="Pagador" value={filtroPagador} onChange={v => setFiltroPagador(v as SocioFinanzas | '')} options={SOCIOS_FINANZAS} />
          <SelectFilter label="Modalidad" value={filtroModalidad} onChange={v => setFiltroModalidad(v as ModalidadPago | '')} options={MODALIDADES} />
          <DateFilter label="Desde" value={desde} onChange={setDesde} />
          <DateFilter label="Hasta" value={hasta} onChange={setHasta} />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-400">Cargando…</div>
        ) : filtrados.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-400">No hay egresos para mostrar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Concepto</th>
                  <th className="px-3 py-2 text-left">Beneficiario</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2 text-left">Modalidad</th>
                  <th className="px-3 py-2 text-left">Pagador</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtrados.map(e => (
                  <tr key={e.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{e.fecha}</td>
                    <td className="px-3 py-2 text-zinc-300 capitalize">{e.tipo}</td>
                    <td className="px-3 py-2 text-white">{e.concepto}</td>
                    <td className="px-3 py-2 text-zinc-300">{e.beneficiario || '—'}</td>
                    <td className="px-3 py-2 text-right text-white font-medium">{formatMoney(Number(e.monto))}</td>
                    <td className="px-3 py-2 text-zinc-300">{e.modalidad}</td>
                    <td className="px-3 py-2 text-zinc-300">{e.modalidad === 'Efectivo' && !e.pagador ? <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-xs">Caja CJ</span> : (e.pagador || '—')}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => abrirEditar(e)} className="text-zinc-400 hover:text-white mr-2">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => eliminar(e.id)} className="text-zinc-400 hover:text-rose-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar egreso' : 'Nuevo egreso'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Tipo">
              <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as TipoEgreso, concepto: '' })} className={inputCls}>
                {TIPOS_EGRESO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Concepto">
            {sugerencias.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                <select value={sugerencias.includes(form.concepto) ? form.concepto : ''} onChange={e => setForm({ ...form, concepto: e.target.value })} className={inputCls + ' flex-1'}>
                  <option value="">— elegí —</option>
                  {sugerencias.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} className={inputCls + ' flex-1'} placeholder="o escribilo libre" />
              </div>
            ) : (
              <input value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} className={inputCls} placeholder="Concepto" />
            )}
          </Field>
          <Field label="Detalle">
            <input value={form.detalle} onChange={e => setForm({ ...form, detalle: e.target.value })} className={inputCls} placeholder="Opcional" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto">
              <input type="number" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} className={inputCls} placeholder="0" />
            </Field>
            <Field label="Modalidad">
              <select value={form.modalidad} onChange={e => setForm({ ...form, modalidad: e.target.value as ModalidadPago, pagador: e.target.value === 'Efectivo' ? '' : (form.pagador || 'Rodri') })} className={inputCls}>
                {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pagador">
              {form.modalidad === 'Efectivo' ? (
                <div className={inputCls + ' flex items-center gap-2 opacity-90'}>
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-xs font-medium">Caja CJ</span>
                  <span className="text-xs text-zinc-400">(automático para efectivo)</span>
                </div>
              ) : (
                <select value={form.pagador} onChange={e => setForm({ ...form, pagador: e.target.value as SocioFinanzas | '' })} className={inputCls}>
                  <option value="">—</option>
                  {SOCIOS_FINANZAS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </Field>
            <Field label="Beneficiario">
              <input value={form.beneficiario} onChange={e => setForm({ ...form, beneficiario: e.target.value })} className={inputCls} placeholder="Opcional" />
            </Field>
          </div>
          <Field label="Observaciones">
            <textarea value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} className={inputCls} rows={2} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-3 py-2 rounded-lg bg-white/5 text-sm text-white">Cancelar</button>
            <button onClick={guardar} disabled={saving} className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm text-white disabled:opacity-50">
              {saving ? 'Guardando…' : editId ? 'Actualizar' : 'Registrar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white outline-none focus:border-rose-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function MetricCard({ label, value, highlight, tone = 'zinc' }: { label: string; value: string; highlight?: boolean; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <div
      className={`group relative rounded-xl border p-4 overflow-hidden cursor-default transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-lg ${t.bg} ${t.border} ${t.shadow} ${highlight ? 'ring-1 ring-inset ' + t.ring : ''}`}
    >
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br ${t.gradient} pointer-events-none`} />
      <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-300 ${t.glow}`} />
      <div className="relative">
        <div className={`text-xs ${t.label}`}>{label}</div>
        <div className={`text-lg font-semibold mt-1 transition-transform duration-300 group-hover:scale-105 origin-left ${t.value}`}>{value}</div>
      </div>
    </div>
  );
}

type Tone = 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'zinc';

const TONES: Record<Tone, { bg: string; border: string; ring: string; gradient: string; glow: string; label: string; value: string; shadow: string }> = {
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', ring: 'ring-emerald-400/40', gradient: 'from-emerald-500/20 to-transparent', glow: 'bg-emerald-400', label: 'text-emerald-300/80', value: 'text-emerald-200', shadow: 'hover:shadow-emerald-500/20' },
  sky:     { bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     ring: 'ring-sky-400/40',     gradient: 'from-sky-500/20 to-transparent',     glow: 'bg-sky-400',     label: 'text-sky-300/80',     value: 'text-sky-100',     shadow: 'hover:shadow-sky-500/20' },
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  ring: 'ring-violet-400/40',  gradient: 'from-violet-500/20 to-transparent',  glow: 'bg-violet-400',  label: 'text-violet-300/80',  value: 'text-violet-100',  shadow: 'hover:shadow-violet-500/20' },
  amber:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   ring: 'ring-amber-400/40',   gradient: 'from-amber-500/20 to-transparent',   glow: 'bg-amber-400',   label: 'text-amber-300/80',   value: 'text-amber-100',   shadow: 'hover:shadow-amber-500/20' },
  rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    ring: 'ring-rose-400/40',    gradient: 'from-rose-500/20 to-transparent',    glow: 'bg-rose-400',    label: 'text-rose-300/80',    value: 'text-rose-100',    shadow: 'hover:shadow-rose-500/20' },
  zinc:    { bg: 'bg-white/[0.02]',   border: 'border-white/10',       ring: 'ring-white/20',       gradient: 'from-white/10 to-transparent',       glow: 'bg-white',       label: 'text-zinc-400',       value: 'text-white',       shadow: 'hover:shadow-white/10' },
};

const SOCIO_TONE: Record<SocioFinanzas, Tone> = { Rodri: 'sky', Noe: 'violet', Ale: 'amber', Fabri: 'rose' };

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase text-zinc-500 mb-1">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white">
        <option value="">Todos</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase text-zinc-500 mb-1">{label}</span>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white" />
    </label>
  );
}
