import { useMemo, useState } from 'react';
import { Plus, Pencil, Search, Download } from 'lucide-react';
import { useIngresosOperativos } from '../hooks/useIngresosOperativos';
import {
  SOCIOS_FINANZAS, MODALIDADES, TIPOS_CLIENTE, RAMAS, FUENTES, CONCEPTOS_INGRESO,
  type IngresoOperativo, type SocioFinanzas, type ModalidadPago,
  type TipoClienteIngreso, type RamaLegal, type FuenteIngreso, type ConceptoIngreso,
} from '../types/finanzas';
import Modal from '../components/Modal';
import FinanceMiniCharts from '../components/finance/FinanceMiniCharts';
import { useToast } from '../context/ToastContext';
import { formatMoney } from '../lib/financeFormat';
import { exportToExcel } from '../lib/exportExcel';

const HOY = () => new Date().toISOString().slice(0, 10);
const INICIO_MES = () => new Date().toISOString().slice(0, 7) + '-01';

interface FormState {
  fecha: string;
  cliente_nombre: string;
  tipo_cliente: TipoClienteIngreso;
  monto: string;
  modalidad: ModalidadPago;
  doctor_cobra: SocioFinanzas;
  receptor_transfer: SocioFinanzas | '';
  rama: RamaLegal;
  fuente: FuenteIngreso;
  concepto: ConceptoIngreso;
  observaciones: string;
}

const FORM_VACIO: FormState = {
  fecha: HOY(),
  cliente_nombre: '',
  tipo_cliente: 'Nuevo',
  monto: '',
  modalidad: 'Transferencia',
  doctor_cobra: 'Rodri',
  receptor_transfer: 'Rodri',
  rama: 'Jubilaciones',
  fuente: 'Derivado',
  concepto: 'Honorarios',
  observaciones: '',
};

export default function Ingresos() {
  const { items: ingresos, loading, crear, actualizar } = useIngresosOperativos();
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [saving, setSaving] = useState(false);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroDoctor, setFiltroDoctor] = useState<SocioFinanzas | ''>('');
  const [filtroRama, setFiltroRama] = useState<RamaLegal | ''>('');
  const [filtroFuente, setFiltroFuente] = useState<FuenteIngreso | ''>('');
  const [filtroModalidad, setFiltroModalidad] = useState<ModalidadPago | ''>('');
  const [desde, setDesde] = useState(INICIO_MES());
  const [hasta, setHasta] = useState('');

  const filtrados = useMemo(() => {
    return ingresos.filter((i: IngresoOperativo) => {
      if (busqueda && !i.cliente_nombre.toLowerCase().includes(busqueda.toLowerCase())) return false;
      if (filtroDoctor && i.doctor_cobra !== filtroDoctor) return false;
      if (filtroRama && i.rama !== filtroRama) return false;
      if (filtroFuente && i.fuente !== filtroFuente) return false;
      if (filtroModalidad && i.modalidad !== filtroModalidad) return false;
      if (desde && i.fecha < desde) return false;
      if (hasta && i.fecha > hasta) return false;
      return true;
    });
  }, [ingresos, busqueda, filtroDoctor, filtroRama, filtroFuente, filtroModalidad, desde, hasta]);

  const totales = useMemo(() => {
    const total = filtrados.reduce((s: number, i: IngresoOperativo) => s + Number(i.monto || 0), 0);
    const porSocio: Record<SocioFinanzas, number> = { Rodri: 0, Noe: 0, Ale: 0, Fabri: 0 };
    let efectivo = 0;
    let transferencia = 0;
    filtrados.forEach((i: IngresoOperativo) => {
      porSocio[i.doctor_cobra] = (porSocio[i.doctor_cobra] || 0) + Number(i.monto || 0);
      if (i.modalidad === 'Efectivo') efectivo += Number(i.monto || 0);
      else if (i.modalidad === 'Transferencia') transferencia += Number(i.monto || 0);
    });
    return { total, porSocio, efectivo, transferencia };
  }, [filtrados]);

  const chartItems = useMemo(() => filtrados.map((i: IngresoOperativo) => ({
    fecha: i.fecha,
    monto: Number(i.monto || 0),
    categoria: i.doctor_cobra,
    subcategoria: i.rama,
    modalidad: i.modalidad,
  })), [filtrados]);

  function abrirNuevo() {
    setEditId(null);
    setForm(FORM_VACIO);
    setModalOpen(true);
  }

  function abrirEditar(i: IngresoOperativo) {
    setEditId(i.id);
    setForm({
      fecha: i.fecha,
      cliente_nombre: i.cliente_nombre,
      tipo_cliente: i.tipo_cliente,
      monto: String(i.monto),
      modalidad: i.modalidad,
      doctor_cobra: i.doctor_cobra,
      receptor_transfer: i.receptor_transfer || '',
      rama: i.rama,
      fuente: i.fuente,
      concepto: i.concepto,
      observaciones: i.observaciones || '',
    });
    setModalOpen(true);
  }

  async function guardar() {
    if (!form.cliente_nombre.trim()) {
      showToast('Falta el nombre del cliente', 'error');
      return;
    }
    const montoNum = Number(form.monto);
    if (!montoNum || montoNum <= 0) {
      showToast('Monto inválido', 'error');
      return;
    }
    if (form.modalidad === 'Transferencia' && !form.receptor_transfer) {
      showToast('Indicá quién recibe la transferencia', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fecha: form.fecha,
        cliente_nombre: form.cliente_nombre.trim(),
        tipo_cliente: form.tipo_cliente,
        monto: montoNum,
        modalidad: form.modalidad,
        doctor_cobra: form.doctor_cobra,
        receptor_transfer: form.modalidad === 'Transferencia' ? (form.receptor_transfer as SocioFinanzas) : null,
        rama: form.rama,
        fuente: form.fuente,
        concepto: form.concepto,
        observaciones: form.observaciones.trim() || null,
      };
      if (editId) {
        await actualizar(editId, payload);
        showToast('Ingreso actualizado', 'success');
      } else {
        await crear(payload);
        showToast('Ingreso registrado', 'success');
      }
      setModalOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  function exportar() {
    const rows = filtrados.map((i: IngresoOperativo) => ({
      Fecha: i.fecha,
      Cliente: i.cliente_nombre,
      Tipo: i.tipo_cliente,
      Monto: Number(i.monto),
      Modalidad: i.modalidad,
      'Doctor cobra': i.doctor_cobra,
      'Receptor transfer': i.receptor_transfer || '',
      Rama: i.rama,
      Fuente: i.fuente,
      Concepto: i.concepto,
      Observaciones: i.observaciones || '',
    }));
    exportToExcel(rows, `ingresos-operativos-${HOY()}`);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Ingresos Operativos</h1>
          <p className="text-sm text-zinc-400 mt-1">Honorarios y consultas — entran a la cuenta del receptor.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportar} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10 flex items-center gap-2">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={abrirNuevo} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nuevo ingreso
          </button>
        </div>
      </header>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        <MetricCard label="Total filtrado" value={formatMoney(totales.total)} tone="emerald" highlight />
        {SOCIOS_FINANZAS.map(s => (
          <MetricCard key={s} label={s} value={formatMoney(totales.porSocio[s] || 0)} tone={SOCIO_TONE[s]} />
        ))}
        <MetricCard label="Caja Efectivo" value={formatMoney(totales.efectivo)} tone="amber" />
        <MetricCard label="Caja Transferencia" value={formatMoney(totales.transferencia)} tone="sky" />
      </div>

      {/* Gráficos */}
      <FinanceMiniCharts
        items={chartItems}
        pieTitle="Ingresos por doctor"
        lineTitle="Evolución diaria de ingresos"
        barTitle="Top ramas"
        barLabel="Ingresos"
        accent="emerald"
      />

      {/* Filtros */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente…"
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-500"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <SelectFilter label="Doctor" value={filtroDoctor} onChange={v => setFiltroDoctor(v as SocioFinanzas | '')} options={SOCIOS_FINANZAS} />
          <SelectFilter label="Rama" value={filtroRama} onChange={v => setFiltroRama(v as RamaLegal | '')} options={RAMAS} />
          <SelectFilter label="Fuente" value={filtroFuente} onChange={v => setFiltroFuente(v as FuenteIngreso | '')} options={FUENTES} />
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
          <div className="p-8 text-center text-sm text-zinc-400">No hay ingresos para mostrar.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase text-zinc-400">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2 text-left">Modalidad</th>
                  <th className="px-3 py-2 text-left">Cobra</th>
                  <th className="px-3 py-2 text-left">Recibe</th>
                  <th className="px-3 py-2 text-left">Rama</th>
                  <th className="px-3 py-2 text-left">Fuente</th>
                  <th className="px-3 py-2 text-left">Concepto</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtrados.map((i: IngresoOperativo) => (
                  <tr key={i.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">{i.fecha}</td>
                    <td className="px-3 py-2 text-white">{i.cliente_nombre}</td>
                    <td className="px-3 py-2 text-zinc-300">{i.tipo_cliente}</td>
                    <td className="px-3 py-2 text-right text-white font-medium">{formatMoney(Number(i.monto))}</td>
                    <td className="px-3 py-2 text-zinc-300">{i.modalidad}</td>
                    <td className="px-3 py-2 text-zinc-300">{i.doctor_cobra}</td>
                    <td className="px-3 py-2 text-zinc-300">{i.receptor_transfer || '—'}</td>
                    <td className="px-3 py-2 text-zinc-300">{i.rama}</td>
                    <td className="px-3 py-2 text-zinc-300">{i.fuente}</td>
                    <td className="px-3 py-2 text-zinc-300">{i.concepto}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => abrirEditar(i)} className="text-zinc-400 hover:text-white">
                        <Pencil className="w-4 h-4" />
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Editar ingreso' : 'Nuevo ingreso'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Tipo cliente">
              <select value={form.tipo_cliente} onChange={e => setForm({ ...form, tipo_cliente: e.target.value as TipoClienteIngreso })} className={inputCls}>
                {TIPOS_CLIENTE.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Cliente">
            <input value={form.cliente_nombre} onChange={e => setForm({ ...form, cliente_nombre: e.target.value })} className={inputCls} placeholder="Nombre y apellido" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto">
              <input type="number" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} className={inputCls} placeholder="0" />
            </Field>
            <Field label="Modalidad">
              <select value={form.modalidad} onChange={e => setForm({ ...form, modalidad: e.target.value as ModalidadPago })} className={inputCls}>
                {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Doctor que cobra">
              <select value={form.doctor_cobra} onChange={e => setForm({ ...form, doctor_cobra: e.target.value as SocioFinanzas })} className={inputCls}>
                {SOCIOS_FINANZAS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Recibe transferencia">
              <select
                value={form.receptor_transfer}
                onChange={e => setForm({ ...form, receptor_transfer: e.target.value as SocioFinanzas | '' })}
                disabled={form.modalidad === 'Efectivo'}
                className={inputCls + (form.modalidad === 'Efectivo' ? ' opacity-40' : '')}
              >
                {SOCIOS_FINANZAS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Rama">
              <select value={form.rama} onChange={e => setForm({ ...form, rama: e.target.value as RamaLegal })} className={inputCls}>
                {RAMAS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Fuente">
              <select value={form.fuente} onChange={e => setForm({ ...form, fuente: e.target.value as FuenteIngreso })} className={inputCls}>
                {FUENTES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Concepto">
              <select value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value as ConceptoIngreso })} className={inputCls}>
                {CONCEPTOS_INGRESO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Observaciones">
            <textarea value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} className={inputCls} rows={2} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-3 py-2 rounded-lg bg-white/5 text-sm text-white">Cancelar</button>
            <button onClick={guardar} disabled={saving} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white disabled:opacity-50">
              {saving ? 'Guardando…' : editId ? 'Actualizar' : 'Registrar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white outline-none focus:border-emerald-500';

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
