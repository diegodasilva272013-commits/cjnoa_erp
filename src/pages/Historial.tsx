import { useMemo, useState } from 'react';
import { Archive, Eye, Trash2, Calendar, AlertTriangle } from 'lucide-react';
import { useCierresMes, type CierreMes } from '../hooks/useCierresMes';
import { useToast } from '../context/ToastContext';
import { formatMoney } from '../lib/financeFormat';
import Modal from '../components/Modal';
import FinanceMiniCharts from '../components/finance/FinanceMiniCharts';
import { SOCIOS_FINANZAS, type SocioFinanzas } from '../types/finanzas';

type Tone = 'sky' | 'violet' | 'amber' | 'rose' | 'emerald';
const SOCIO_TONE: Record<SocioFinanzas, Tone> = { Rodri: 'sky', Noe: 'violet', Ale: 'amber', Fabri: 'rose' };
const TONE_BG: Record<Tone, string> = {
  sky: 'bg-sky-500/10 border-sky-500/30 text-sky-200',
  violet: 'bg-violet-500/10 border-violet-500/30 text-violet-200',
  amber: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
  rose: 'bg-rose-500/10 border-rose-500/30 text-rose-200',
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
};

export default function Historial() {
  const { items, loading, eliminar } = useCierresMes();
  const { showToast } = useToast();
  const [verCierre, setVerCierre] = useState<CierreMes | null>(null);
  const [confirmDel, setConfirmDel] = useState<CierreMes | null>(null);

  async function handleEliminar() {
    if (!confirmDel) return;
    try {
      await eliminar(confirmDel.id);
      showToast(`Cierre ${confirmDel.periodo} reabierto. Los datos siguen en Ingresos/Egresos.`, 'success');
      setConfirmDel(null);
    } catch (err: any) {
      showToast(err?.message || 'Error', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Archive className="w-6 h-6 text-violet-400" />
          Historial de Cierres
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Reportes mensuales archivados. Los datos quedan congelados al momento del cierre.
        </p>
      </header>

      {loading ? (
        <div className="p-8 text-center text-sm text-zinc-400">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-10 text-center">
          <Archive className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <div className="text-sm text-zinc-400">Todavía no se cerró ningún mes.</div>
          <div className="text-xs text-zinc-500 mt-1">
            Andá a <strong className="text-emerald-400">Flujo de Caja</strong> y tocá <strong>Cerrar mes</strong>.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map(c => {
            const t = c.snapshot?.totales || {};
            return (
              <div key={c.id} className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 hover:border-violet-500/50 transition-all">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-violet-400" />
                    <span className="text-lg font-bold text-white">{c.periodo}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    Cerrado {new Date(c.fecha_cierre).toLocaleDateString('es-AR')}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] text-emerald-300/70 uppercase">Ingresos</div>
                    <div className="text-sm font-semibold text-emerald-200">{formatMoney(t.totalIngresos || 0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-rose-300/70 uppercase">Egresos</div>
                    <div className="text-sm font-semibold text-rose-200">{formatMoney(t.totalEgresos || 0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase">Neto</div>
                    <div className={`text-sm font-semibold ${(t.neto || 0) >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
                      {formatMoney(t.neto || 0)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setVerCierre(c)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs text-white flex items-center justify-center gap-1"
                  >
                    <Eye className="w-3 h-3" /> Ver detalle
                  </button>
                  <button
                    onClick={() => setConfirmDel(c)}
                    className="px-2 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    title="Reabrir mes (eliminar cierre)"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal detalle */}
      <Modal open={!!verCierre} onClose={() => setVerCierre(null)} title={verCierre ? `Cierre ${verCierre.periodo}` : ''} maxWidth="max-w-6xl">
        {verCierre && <DetalleCierre cierre={verCierre} />}
      </Modal>

      {/* Confirmación reabrir */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Reabrir mes">
        {confirmDel && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-200">
                Vas a borrar el snapshot del cierre <strong>{confirmDel.periodo}</strong>. <br />
                Los ingresos, egresos y cambios siguen existiendo en sus tablas — sólo se elimina el archivo histórico para volver a editarlos y cerrar de nuevo.
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDel(null)}
                className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-zinc-300"
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminar}
                className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-sm text-white"
              >
                Reabrir y borrar cierre
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetalleCierre({ cierre }: { cierre: CierreMes }) {
  const snap = cierre.snapshot || {};
  const t = snap.totales || {};
  const ingresos: any[] = snap.ingresos || [];
  const egresos: any[] = snap.egresos || [];
  const movimientos: any[] = snap.movimientos || [];

  const chartIng = useMemo(() => ingresos.map(i => ({
    fecha: i.fecha, monto: Number(i.monto || 0),
    categoria: i.doctor_cobra, subcategoria: i.rama,
  })), [ingresos]);

  const chartEg = useMemo(() => egresos.map(e => ({
    fecha: e.fecha, monto: Number(e.monto || 0),
    categoria: e.modalidad === 'Efectivo' && !e.pagador ? 'Caja CJ' : (e.pagador || 'Sin asignar'),
    subcategoria: e.tipo,
  })), [egresos]);

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>Periodo <strong className="text-white">{cierre.periodo}</strong></span>
        <span>Cerrado {new Date(cierre.fecha_cierre).toLocaleString('es-AR')}</span>
      </div>

      {/* Cards principales */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="Ingresos" value={formatMoney(t.totalIngresos || 0)} tone="emerald" />
        <Stat label="Egresos" value={formatMoney(t.totalEgresos || 0)} tone="rose" />
        <Stat label="Neto" value={formatMoney(t.neto || 0)} tone={(t.neto || 0) >= 0 ? 'emerald' : 'rose'} />
        <Stat label="Caja Efectivo" value={formatMoney(t.cajaEfectivo || 0)} tone="amber" />
        <Stat label="Caja Transferencia" value={formatMoney(t.cajaTransfer || 0)} tone="sky" />
      </div>

      {/* Por socio */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {SOCIOS_FINANZAS.map(s => {
          const efe = t.efectivoSocioFinal?.[s] ?? t.ingEfectivoSocio?.[s] ?? 0;
          const tr = t.transferSocioNeto?.[s] ?? 0;
          const total = efe + tr;
          return (
            <div key={s} className={`rounded-lg border p-3 ${TONE_BG[SOCIO_TONE[s]]}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">{s}</div>
                <div className="text-xs opacity-80">{formatMoney(total)}</div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
                  <div className="text-amber-300/80 text-[9px] uppercase">Efectivo</div>
                  <div className="text-amber-100 font-semibold">{formatMoney(efe)}</div>
                </div>
                <div className="bg-sky-500/10 border border-sky-500/30 rounded px-2 py-1">
                  <div className="text-sky-300/80 text-[9px] uppercase">Transfer</div>
                  <div className="text-sky-100 font-semibold">{formatMoney(tr)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      {ingresos.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-emerald-300 mb-2 uppercase tracking-wider">Ingresos</h3>
          <FinanceMiniCharts items={chartIng} pieTitle="Por doctor" lineTitle="Diario" barTitle="Por rama" accent="emerald" />
        </div>
      )}
      {egresos.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-rose-300 mb-2 uppercase tracking-wider">Egresos</h3>
          <FinanceMiniCharts items={chartEg} pieTitle="Por pagador" lineTitle="Diario" barTitle="Por tipo" accent="rose" />
        </div>
      )}

      {/* Tablas resumen */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SimpleTable title={`Ingresos (${ingresos.length})`} rows={ingresos.slice(0, 100).map(i => [
          i.fecha, i.cliente_nombre, i.doctor_cobra, i.modalidad, formatMoney(Number(i.monto)),
        ])} headers={['Fecha', 'Cliente', 'Doctor', 'Modal.', 'Monto']} />
        <SimpleTable title={`Egresos (${egresos.length})`} rows={egresos.slice(0, 100).map(e => [
          e.fecha, e.concepto, e.pagador || 'Caja CJ', e.modalidad, formatMoney(Number(e.monto)),
        ])} headers={['Fecha', 'Concepto', 'Pagador', 'Modal.', 'Monto']} />
      </div>

      {movimientos.length > 0 && (
        <SimpleTable title={`Cambios de caja (${movimientos.length})`} rows={movimientos.map(m => [
          m.fecha, m.socio_origen, m.tipo_origen, '→', m.socio_destino, m.tipo_destino, formatMoney(Number(m.monto)),
        ])} headers={['Fecha', 'Origen', 'Entrega', '', 'Destino', 'Recibe', 'Monto']} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className={`rounded-lg border p-3 ${TONE_BG[tone]}`}>
      <div className="text-[10px] uppercase opacity-80">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function SimpleTable({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 text-xs text-zinc-300 font-medium">{title}</div>
      <div className="overflow-auto max-h-80">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-zinc-500 bg-white/[0.02] sticky top-0">
            <tr>{headers.map((h, i) => <th key={i} className="text-left px-2 py-1.5">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="text-center py-4 text-zinc-500">Sin datos</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="text-zinc-300">
                {r.map((c, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
