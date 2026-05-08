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
                <strong>OJO:</strong> los datos del periodo ya fueron borrados de las tablas activas al hacer el cierre. Si eliminás este snapshot, perdés esa información para siempre. Sólo hacelo si tenés que rehacer todo el mes desde cero.
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
  const fondosMov: any[] = snap.fondos_movimientos || [];

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

      {/* Meta y cumplimiento */}
      {(snap.meta_recaudacion || 0) > 0 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase text-emerald-300/80">Meta del periodo</div>
            <div className="text-sm text-white font-semibold">{formatMoney(snap.meta_recaudacion)}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-emerald-200">{(snap.cumplimiento_pct || 0).toFixed(0)}%</div>
            <div className="text-[10px] uppercase text-emerald-300/80">cumplimiento</div>
          </div>
        </div>
      )}

      {/* Conteos rapidos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label={`Ingresos (${t.cantIngresos || 0})`} value={formatMoney(t.totalIngresos || 0)} tone="emerald" />
        <Stat label={`Egresos (${t.cantEgresos || 0})`} value={formatMoney(t.totalEgresos || 0)} tone="rose" />
        <Stat label={`Cambios (${t.cantCambios || 0})`} value={`+/- ${formatMoney(Math.abs(t.cambiosEfectivoNet || 0) + Math.abs(t.cambiosTransferNet || 0))}`} tone="amber" />
        <Stat label={`Clientes distintos`} value={String(t.clientesDistintos || 0)} tone="violet" />
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
        <SimpleTable title={`Ingresos (${ingresos.length})`} rows={ingresos.map(i => [
          i.fecha, i.cliente_nombre, i.tipo_cliente || '-', i.doctor_cobra,
          i.modalidad === 'Transferencia' ? `${i.modalidad} → ${i.receptor_transfer || '-'}` : i.modalidad,
          i.rama, i.fuente, i.concepto, formatMoney(Number(i.monto)), i.observaciones || '—',
        ])} headers={['Fecha', 'Cliente', 'Tipo', 'Doctor', 'Modalidad', 'Rama', 'Fuente', 'Concepto', 'Monto', 'Obs.']} />
        <SimpleTable title={`Egresos (${egresos.length})`} rows={egresos.map(e => [
          e.fecha, e.tipo, e.concepto, e.beneficiario || '—',
          e.pagador || 'Caja CJ', e.modalidad, formatMoney(Number(e.monto)), e.detalle || '—', e.observaciones || '—',
        ])} headers={['Fecha', 'Tipo', 'Concepto', 'Beneficiario', 'Pagador', 'Modalidad', 'Monto', 'Detalle', 'Obs.']} />
      </div>

      {movimientos.length > 0 && (
        <SimpleTable title={`Cambios de caja (${movimientos.length})`} rows={movimientos.map(m => [
          m.fecha, m.socio_origen, m.tipo_origen, '→', m.socio_destino, m.tipo_destino, formatMoney(Number(m.monto)), m.observaciones || '—',
        ])} headers={['Fecha', 'Origen', 'Entrega', '', 'Destino', 'Recibe', 'Monto', 'Obs.']} />
      )}

      {/* Por rama */}
      {t.porRama && Object.keys(t.porRama).length > 0 && (
        <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 text-xs text-zinc-300 font-medium">Ingresos por rama</div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-white/5">
              {Object.entries(t.porRama).map(([rama, monto]) => {
                const m = Number(monto || 0);
                const pct = (t.totalIngresos || 0) > 0 ? (m / t.totalIngresos) * 100 : 0;
                return (
                  <tr key={rama}>
                    <td className="px-3 py-1.5 text-zinc-300">{rama}</td>
                    <td className="px-3 py-1.5 w-1/2">
                      <div className="h-1.5 bg-white/5 rounded"><div className="h-1.5 bg-emerald-500/60 rounded" style={{ width: `${pct}%` }} /></div>
                    </td>
                    <td className="px-3 py-1.5 text-right text-white font-medium whitespace-nowrap">{formatMoney(m)}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-400 w-12">{pct.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Desgloses adicionales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {t.cantPorConcepto && Object.keys(t.cantPorConcepto).length > 0 && (
          <BreakdownBox title="Por concepto (ingresos)" entries={Object.entries(t.cantPorConcepto).map(([k, v]) => ({
            label: k, count: Number(v), monto: t.montoPorConcepto?.[k] || 0,
          }))} />
        )}
        {t.cantPorFuente && Object.keys(t.cantPorFuente).length > 0 && (
          <BreakdownBox title="Por fuente" entries={Object.entries(t.cantPorFuente).map(([k, v]) => ({
            label: k, count: Number(v), monto: t.montoPorFuente?.[k] || 0,
          }))} />
        )}
        {t.cantPorTipoEgreso && Object.keys(t.cantPorTipoEgreso).length > 0 && (
          <BreakdownBox title="Por tipo (egresos)" entries={Object.entries(t.cantPorTipoEgreso).map(([k, v]) => ({
            label: k, count: Number(v), monto: t.montoPorTipoEgreso?.[k] || 0,
          }))} />
        )}
        {t.cantPorTipoCliente && Object.keys(t.cantPorTipoCliente).length > 0 && (
          <BreakdownBox title="Tipo de cliente" entries={Object.entries(t.cantPorTipoCliente).map(([k, v]) => ({
            label: k, count: Number(v), monto: 0,
          }))} hideMonto />
        )}
      </div>

      {fondosMov.length > 0 && (
        <SimpleTable title={`Gastos sobre fondos en custodia (${fondosMov.length})`} rows={fondosMov.map(f => [
          f.fecha, f.nombre_gasto, formatMoney(Number(f.monto)), f.observaciones || '—',
        ])} headers={['Fecha', 'Concepto', 'Monto', 'Obs.']} />
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
      <div className="px-3 py-2 border-b border-white/10 text-xs text-zinc-300 font-medium flex items-center justify-between">
        <span>{title}</span>
        <span className="text-[10px] text-zinc-500">{rows.length} filas</span>
      </div>
      <div className="overflow-auto max-h-96">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-zinc-500 bg-white/[0.02] sticky top-0">
            <tr>{headers.map((h, i) => <th key={i} className="text-left px-2 py-1.5">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="text-center py-4 text-zinc-500">Sin datos</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="text-zinc-300 hover:bg-white/[0.02]">
                {r.map((c, j) => <td key={j} className="px-2 py-1 whitespace-nowrap">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BreakdownBox({ title, entries, hideMonto }: { title: string; entries: { label: string; count: number; monto: number }[]; hideMonto?: boolean }) {
  const total = entries.reduce((s, e) => s + e.count, 0);
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 text-xs text-zinc-300 font-medium">{title}</div>
      <div className="divide-y divide-white/5">
        {entries.map(e => {
          const pct = total > 0 ? (e.count / total) * 100 : 0;
          return (
            <div key={e.label} className="px-3 py-2 flex items-center justify-between text-xs">
              <span className="text-zinc-300">{e.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-zinc-400">{e.count} ({pct.toFixed(0)}%)</span>
                {!hideMonto && <span className="text-white font-medium">{formatMoney(e.monto)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
