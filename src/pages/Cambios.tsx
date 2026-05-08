import { useMemo, useState } from 'react';
import { ArrowLeftRight, Plus, Banknote, CreditCard } from 'lucide-react';
import { useMovimientosCaja } from '../hooks/useMovimientosCaja';
import {
  SOCIOS_FINANZAS, MODALIDADES,
  type SocioFinanzas, type ModalidadPago,
} from '../types/finanzas';
import { useToast } from '../context/ToastContext';
import { formatMoney } from '../lib/financeFormat';
import Modal from '../components/Modal';

const periodoActual = () => new Date().toISOString().slice(0, 7);
const hoyISO = () => new Date().toISOString().slice(0, 10);

type Tone = 'sky' | 'violet' | 'amber' | 'rose';
const SOCIO_TONE: Record<SocioFinanzas, Tone> = { Rodri: 'sky', Noe: 'violet', Ale: 'amber', Fabri: 'rose' };
const SOCIO_BG: Record<Tone, string> = {
  sky: 'bg-sky-500/10 text-sky-200 border-sky-500/30',
  violet: 'bg-violet-500/10 text-violet-200 border-violet-500/30',
  amber: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
  rose: 'bg-rose-500/10 text-rose-200 border-rose-500/30',
};

interface FormState {
  fecha: string;
  socio_origen: SocioFinanzas;
  socio_destino: SocioFinanzas;
  monto: string;
  tipo_origen: ModalidadPago;
  tipo_destino: ModalidadPago;
  observaciones: string;
}

const FORM_INICIAL: FormState = {
  fecha: hoyISO(),
  socio_origen: 'Rodri',
  socio_destino: 'Rodri',
  monto: '',
  tipo_origen: 'Efectivo',
  tipo_destino: 'Transferencia',
  observaciones: '',
};

export default function Cambios() {
  const { items, loading, crear } = useMovimientosCaja();
  const { showToast } = useToast();
  const [periodo, setPeriodo] = useState(periodoActual());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_INICIAL);
  const [saving, setSaving] = useState(false);

  const itemsPeriodo = useMemo(
    () => items.filter(m => m.fecha.startsWith(periodo)),
    [items, periodo],
  );

  const totalPeriodo = useMemo(
    () => itemsPeriodo.reduce((s, m) => s + Number(m.monto || 0), 0),
    [itemsPeriodo],
  );

  const cantPeriodo = itemsPeriodo.length;

  function abrirNuevo() {
    setForm(f => ({ ...FORM_INICIAL, fecha: f.fecha || hoyISO() }));
    setOpen(true);
  }

  async function guardar() {
    const monto = Number(form.monto);
    if (!monto || monto <= 0) { showToast('Monto inválido', 'error'); return; }
    if (form.tipo_origen === form.tipo_destino) {
      showToast('El tipo de origen y destino deben ser distintos', 'error'); return;
    }
    setSaving(true);
    try {
      await crear({
        fecha: form.fecha,
        socio_origen: form.socio_origen,
        socio_destino: form.socio_destino,
        monto,
        tipo_origen: form.tipo_origen,
        tipo_destino: form.tipo_destino,
        observaciones: form.observaciones || null,
      });
      showToast('Cambio registrado', 'success');
      setOpen(false);
      setForm(FORM_INICIAL);
    } catch (err: any) {
      showToast(err?.message || 'Error al registrar', 'error');
    } finally {
      setSaving(false);
    }
  }

  function invertir() {
    setForm(f => ({
      ...f,
      tipo_origen: f.tipo_destino,
      tipo_destino: f.tipo_origen,
    }));
  }

  const mismoSocio = form.socio_origen === form.socio_destino;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-amber-400" />
            Cambios de Caja
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Convertí efectivo en transferencia (o al revés). Mismo socio = depósito/retiro propio. Distintos socios = canje cruzado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
          />
          <button
            onClick={abrirNuevo}
            className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-sm text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo cambio
          </button>
        </div>
      </header>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MiniStat label="Cambios del periodo" value={String(cantPeriodo)} accent="sky" />
        <MiniStat label="Volumen movido" value={formatMoney(totalPeriodo)} accent="amber" />
        <MiniStat label="Total histórico" value={String(items.length)} accent="violet" />
      </div>

      {/* Tabla */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 text-sm text-zinc-300 font-medium flex items-center justify-between">
          <span>Historial del periodo ({periodo})</span>
          <span className="text-xs text-zinc-500">{cantPeriodo} mov.</span>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-zinc-400 text-center">Cargando…</div>
        ) : itemsPeriodo.length === 0 ? (
          <div className="p-8 text-sm text-zinc-500 text-center">
            No hay cambios registrados en este periodo. Tocá <strong className="text-amber-400">Nuevo cambio</strong> para empezar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase text-zinc-500 bg-white/[0.02]">
                <tr>
                  <th className="text-left px-4 py-2">Fecha</th>
                  <th className="text-left px-4 py-2">Origen</th>
                  <th className="text-left px-4 py-2">Entrega</th>
                  <th className="text-center px-4 py-2"></th>
                  <th className="text-left px-4 py-2">Destino</th>
                  <th className="text-left px-4 py-2">Recibe</th>
                  <th className="text-right px-4 py-2">Monto</th>
                  <th className="text-left px-4 py-2">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {itemsPeriodo.map(m => (
                  <tr key={m.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2 text-zinc-300 whitespace-nowrap">{m.fecha}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] border ${SOCIO_BG[SOCIO_TONE[m.socio_origen]]}`}>{m.socio_origen}</span>
                    </td>
                    <td className="px-4 py-2 text-zinc-300">
                      <ModalidadBadge modalidad={m.tipo_origen} variant="out" />
                    </td>
                    <td className="px-4 py-2 text-amber-400 text-center">→</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] border ${SOCIO_BG[SOCIO_TONE[m.socio_destino]]}`}>
                        {m.socio_destino}
                        {m.socio_origen === m.socio_destino && <span className="ml-1 text-[9px] text-zinc-500">(mismo)</span>}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-300">
                      <ModalidadBadge modalidad={m.tipo_destino} variant="in" />
                    </td>
                    <td className="px-4 py-2 text-right text-white font-medium whitespace-nowrap">{formatMoney(Number(m.monto))}</td>
                    <td className="px-4 py-2 text-zinc-400 text-xs">{m.observaciones || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal nuevo */}
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo cambio de caja">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400">Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full px-3 py-2 mt-1 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400">Monto</label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={form.monto}
                onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                className="w-full px-3 py-2 mt-1 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
                placeholder="0"
              />
            </div>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-3">
            <div className="text-xs uppercase tracking-wider text-amber-300/80 flex items-center justify-between">
              <span>Quién entrega → Quién recibe</span>
              <button
                type="button"
                onClick={invertir}
                className="text-[11px] text-amber-300 hover:text-amber-200 underline-offset-2 hover:underline"
              >
                ⇄ invertir tipos
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Origen */}
              <div className="space-y-2">
                <div className="text-[11px] text-zinc-400 uppercase">Origen (entrega)</div>
                <select
                  value={form.socio_origen}
                  onChange={e => setForm(f => ({ ...f, socio_origen: e.target.value as SocioFinanzas }))}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
                >
                  {SOCIOS_FINANZAS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  value={form.tipo_origen}
                  onChange={e => setForm(f => ({ ...f, tipo_origen: e.target.value as ModalidadPago }))}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
                >
                  {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Destino */}
              <div className="space-y-2">
                <div className="text-[11px] text-zinc-400 uppercase">Destino (recibe)</div>
                <select
                  value={form.socio_destino}
                  onChange={e => setForm(f => ({ ...f, socio_destino: e.target.value as SocioFinanzas }))}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
                >
                  {SOCIOS_FINANZAS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  value={form.tipo_destino}
                  onChange={e => setForm(f => ({ ...f, tipo_destino: e.target.value as ModalidadPago }))}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
                >
                  {MODALIDADES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {form.tipo_origen === form.tipo_destino && (
              <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded p-2">
                Los tipos deben ser distintos (Efectivo ↔ Transferencia).
              </div>
            )}

            <div className="text-[11px] text-zinc-400 leading-relaxed">
              {mismoSocio
                ? <>📌 <strong>{form.socio_origen}</strong> convierte ${form.monto || '0'} de <strong>{form.tipo_origen}</strong> a <strong>{form.tipo_destino}</strong> (depósito o retiro propio).</>
                : <>📌 <strong>{form.socio_origen}</strong> entrega ${form.monto || '0'} en <strong>{form.tipo_origen}</strong> y <strong>{form.socio_destino}</strong> le devuelve el equivalente en <strong>{form.tipo_destino}</strong>.</>
              }
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400">Observaciones</label>
            <input
              value={form.observaciones}
              onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))}
              placeholder="Opcional"
              className="w-full px-3 py-2 mt-1 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || form.tipo_origen === form.tipo_destino || !Number(form.monto)}
              onClick={guardar}
              className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-sm text-white disabled:opacity-40"
            >
              {saving ? 'Guardando…' : 'Registrar cambio'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ModalidadBadge({ modalidad, variant }: { modalidad: ModalidadPago; variant: 'in' | 'out' }) {
  const isEf = modalidad === 'Efectivo';
  const baseTone = isEf
    ? 'bg-amber-500/10 text-amber-200 border-amber-500/30'
    : 'bg-sky-500/10 text-sky-200 border-sky-500/30';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${baseTone}`}>
      {isEf ? <Banknote className="w-3 h-3" /> : <CreditCard className="w-3 h-3" />}
      {modalidad}
      <span className="text-[9px] opacity-70">{variant === 'out' ? '−' : '+'}</span>
    </span>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: 'sky' | 'amber' | 'violet' }) {
  const tones: Record<string, string> = {
    sky: 'bg-sky-500/10 border-sky-500/30 text-sky-200',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
    violet: 'bg-violet-500/10 border-violet-500/30 text-violet-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[accent]}`}>
      <div className="text-xs uppercase opacity-80">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
