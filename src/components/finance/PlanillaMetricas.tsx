import { useMemo } from 'react';
import { SOCIOS_FINANZAS, type IngresoOperativo, type SocioFinanzas } from '../../types/finanzas';
import { formatMoney } from '../../lib/financeFormat';

interface Props {
  ingresos: IngresoOperativo[];
  metaGrupal: number;
  totalIngresos: number;
  totalEgresos: number;
  cajaEfectivo: number;
  // Transferencias COBRADAS por cada socio (mérito comercial: doctor_cobra)
  ingTransferGeneradoSocio: Record<SocioFinanzas, number>;
  // Transferencias que entraron a la CUENTA de cada socio (receptor_transfer)
  ingTransferRecibidoSocio: Record<SocioFinanzas, number>;
  // Egresos por transferencia: gastos pagados desde la cuenta de cada socio
  egTransferSocio: Record<SocioFinanzas, number>;
  // Ajustes por cambios efectivo↔transferencia (movimientos de caja)
  deltaTransferSocio: Record<SocioFinanzas, number>;
  // Saldo final por socio en cuentas (recibido - pagado + ajustes)
  transferSocioNeto: Record<SocioFinanzas, number>;
  // Efectivo final por socio (resumen de cobro)
  efectivoSocioFinal: Record<SocioFinanzas, number>;
}

const SOCIO_COLOR: Record<SocioFinanzas, string> = {
  Rodri: 'text-sky-300',
  Noe: 'text-violet-300',
  Ale: 'text-amber-300',
  Fabri: 'text-rose-300',
};

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

export default function PlanillaMetricas({
  ingresos, metaGrupal, totalIngresos, totalEgresos, cajaEfectivo,
  ingTransferGeneradoSocio, ingTransferRecibidoSocio, egTransferSocio,
  deltaTransferSocio, transferSocioNeto, efectivoSocioFinal,
}: Props) {
  const metaPersonal = metaGrupal > 0 ? metaGrupal / 4 : 0;

  const porSocio = useMemo(() => {
    const init = (): { clientes: Set<string>; consultas: number; honorarios: number } =>
      ({ clientes: new Set<string>(), consultas: 0, honorarios: 0 });
    const acc: Record<SocioFinanzas, { clientes: Set<string>; consultas: number; honorarios: number }> = {
      Rodri: init(), Noe: init(), Ale: init(), Fabri: init(),
    };
    ingresos.forEach(i => {
      const s = i.doctor_cobra;
      if (!acc[s]) return;
      const monto = Number(i.monto || 0);
      if (i.cliente_nombre) acc[s].clientes.add(norm(i.cliente_nombre));
      if (i.concepto === 'Consulta') acc[s].consultas += monto;
      else if (i.concepto === 'Honorarios') acc[s].honorarios += monto;
    });
    return acc;
  }, [ingresos]);

  const saldoARepartir = totalIngresos - totalEgresos;

  return (
    <div className="space-y-5">
      {/* ─── Metas + Visualización de métricas ─── */}
      <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02]">
        {/* Header metas */}
        <div className="grid grid-cols-2 border-b border-white/10">
          <div className="bg-violet-500/10 border-r border-white/10 px-4 py-3">
            <div className="text-[10px] uppercase text-violet-300/80 tracking-wider">Meta Personal</div>
            <div className="text-lg font-bold text-violet-200 mt-0.5">{formatMoney(metaPersonal)}</div>
          </div>
          <div className="bg-violet-500/15 px-4 py-3">
            <div className="text-[10px] uppercase text-violet-300/80 tracking-wider">Meta Grupal</div>
            <div className="text-lg font-bold text-violet-200 mt-0.5">{formatMoney(metaGrupal)}</div>
          </div>
        </div>

        {/* Tabla métricas */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-emerald-500/10 border-b border-white/10">
                <th colSpan={5} className="px-4 py-2 text-center text-emerald-300 font-semibold uppercase text-xs tracking-wider">
                  Visualización de Métricas
                </th>
              </tr>
              <tr className="bg-emerald-500/5 border-b border-white/10">
                <th className="px-4 py-2 text-left text-emerald-300/80 text-xs uppercase font-medium">Doctores</th>
                {SOCIOS_FINANZAS.map(s => (
                  <th key={s} className={`px-4 py-2 text-right text-xs uppercase font-bold ${SOCIO_COLOR[s]}`}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <Row label="Clientes" values={SOCIOS_FINANZAS.map(s => String(porSocio[s].clientes.size))} />
              <Row label="Monto Consultas" values={SOCIOS_FINANZAS.map(s => formatMoney(porSocio[s].consultas))} />
              <Row label="Monto Honorarios" values={SOCIOS_FINANZAS.map(s => formatMoney(porSocio[s].honorarios))} />
              <Row
                label="Monto Generado"
                values={SOCIOS_FINANZAS.map(s => formatMoney(porSocio[s].consultas + porSocio[s].honorarios))}
                accent
              />
              <Row
                label="% Meta Personal"
                values={SOCIOS_FINANZAS.map(s => {
                  const gen = porSocio[s].consultas + porSocio[s].honorarios;
                  return metaPersonal > 0 ? `${(gen / metaPersonal * 100).toFixed(2)}%` : '—';
                })}
                muted
              />
              <Row
                label="% Meta Grupal"
                values={SOCIOS_FINANZAS.map(s => {
                  const gen = porSocio[s].consultas + porSocio[s].honorarios;
                  return metaGrupal > 0 ? `${(gen / metaGrupal * 100).toFixed(2)}%` : '—';
                })}
                muted
              />
              <Row
                label="% Total Ingreso"
                values={SOCIOS_FINANZAS.map(s => {
                  const gen = porSocio[s].consultas + porSocio[s].honorarios;
                  return totalIngresos > 0 ? `${(gen / totalIngresos * 100).toFixed(2)}%` : '—';
                })}
                muted
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Transferencia ─── */}
      <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sky-500/10 border-b border-white/10">
                <th colSpan={SOCIOS_FINANZAS.length + 2} className="px-4 py-2 text-center text-sky-300 font-semibold uppercase text-xs tracking-wider">
                  Transferencia — quién cobra, quién recibe, qué queda en cuenta
                </th>
              </tr>
              <tr className="bg-sky-500/5 border-b border-white/10">
                <th className="px-4 py-2 text-left text-sky-300/80 text-xs uppercase font-medium"></th>
                {SOCIOS_FINANZAS.map(s => (
                  <th key={s} className={`px-4 py-2 text-right text-xs uppercase font-bold ${SOCIO_COLOR[s]}`}>{s}</th>
                ))}
                <th className="px-4 py-2 text-right text-xs uppercase font-bold text-sky-300">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <RowT label="Generó por transferencia (cobro)" hint="doctor_cobra" values={SOCIOS_FINANZAS.map(s => ingTransferGeneradoSocio[s] || 0)} />
              <RowT label="Recibió en su cuenta" hint="receptor de la transferencia" values={SOCIOS_FINANZAS.map(s => ingTransferRecibidoSocio[s] || 0)} />
              <RowT label="Pagó desde su cuenta (gastos)" hint="pagador del egreso" values={SOCIOS_FINANZAS.map(s => egTransferSocio[s] || 0)} />
              <RowT
                label="Ajustes entre cuentas (cambios)"
                hint="movimientos efectivo↔transfer"
                values={SOCIOS_FINANZAS.map(s => deltaTransferSocio[s] || 0)}
                muted
              />
              <RowT
                label="Saldo final en cuenta"
                hint="recibido − pagado + ajustes"
                values={SOCIOS_FINANZAS.map(s => transferSocioNeto[s] || 0)}
                accent
              />
              <RowT
                label="Liquidación (a favor / debe)"
                hint="generó − recibió. Positivo: le deben. Negativo: debe."
                values={SOCIOS_FINANZAS.map(s => (ingTransferGeneradoSocio[s] || 0) - (ingTransferRecibidoSocio[s] || 0))}
                signed
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Footer summary ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <SummaryCell label="Total Ingreso" value={formatMoney(totalIngresos)} tone="emerald" />
        <SummaryCell label="Total Egreso" value={formatMoney(totalEgresos)} tone="rose" />
        <SummaryCell label="Saldo a Repartir" value={formatMoney(saldoARepartir)} tone="amber" highlight />
        <div className="hidden md:block" />
        <SummaryCell label="Total Caja Efectivo" value={formatMoney(cajaEfectivo)} tone="violet" />
      </div>

      {/* Resumen de cobro (efectivo por socio) */}
      <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-amber-500/10 border-b border-white/10">
                <th className="px-4 py-2 text-left text-amber-300/80 text-xs uppercase font-medium">Resumen de Cobro</th>
                {SOCIOS_FINANZAS.map(s => (
                  <th key={s} className={`px-4 py-2 text-right text-xs uppercase font-bold ${SOCIO_COLOR[s]}`}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row
                label="Efectivo neto"
                values={SOCIOS_FINANZAS.map(s => formatMoney(efectivoSocioFinal[s] || 0))}
                accent
              />
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-[10px] text-zinc-500 border-t border-white/5">
          La meta personal se calcula automáticamente como Meta Grupal ÷ 4. Para editarla, cambiá la Meta del periodo arriba.<br/>
          <strong>Transferencia:</strong> distinguimos <em>quien generó el cobro</em> (doctor_cobra) de <em>quien recibió en su cuenta</em> (receptor). Los <em>ajustes</em> incluyen movimientos entre cuentas. La <em>liquidación</em> muestra cuánto le deben (positivo) o cuánto debe (negativo) a la caja del grupo.<br/>
          <strong>Efectivo neto:</strong> por doctor que generó el cobro.
        </div>
      </div>
    </div>
  );
}

function Row({ label, values, accent, muted }: { label: string; values: string[]; accent?: boolean; muted?: boolean }) {
  return (
    <tr className={accent ? 'bg-emerald-500/5' : ''}>
      <td className={`px-4 py-2 text-xs font-medium ${accent ? 'text-emerald-200' : 'text-zinc-300'}`}>{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-4 py-2 text-right whitespace-nowrap font-mono text-xs ${
            accent ? 'text-emerald-200 font-bold' : muted ? 'text-zinc-400' : 'text-white'
          }`}
        >
          {v}
        </td>
      ))}
    </tr>
  );
}

// Row para tablas con columna Total al final. Acepta números crudos para que
// podamos sumar el total y colorear signos cuando corresponda.
function RowT({ label, hint, values, accent, muted, signed }: {
  label: string; hint?: string; values: number[]; accent?: boolean; muted?: boolean; signed?: boolean;
}) {
  const total = values.reduce((s, v) => s + v, 0);
  const fmt = (n: number) => signed && n !== 0
    ? `${n > 0 ? '+' : ''}${formatMoney(n)}`
    : formatMoney(n);
  const colorFor = (n: number) => {
    if (signed) return n > 0 ? 'text-emerald-300' : n < 0 ? 'text-rose-300' : 'text-zinc-400';
    if (accent) return 'text-emerald-200 font-bold';
    if (muted) return 'text-zinc-400';
    return 'text-white';
  };
  return (
    <tr className={accent ? 'bg-emerald-500/5' : ''}>
      <td className={`px-4 py-2 text-xs font-medium ${accent ? 'text-emerald-200' : 'text-zinc-300'}`}>
        <div>{label}</div>
        {hint && <div className="text-[9px] text-zinc-500 font-normal normal-case">{hint}</div>}
      </td>
      {values.map((v, i) => (
        <td key={i} className={`px-4 py-2 text-right whitespace-nowrap font-mono text-xs ${colorFor(v)}`}>
          {fmt(v)}
        </td>
      ))}
      <td className={`px-4 py-2 text-right whitespace-nowrap font-mono text-xs border-l border-white/10 ${colorFor(total)}`}>
        {fmt(total)}
      </td>
    </tr>
  );
}

function SummaryCell({ label, value, tone, highlight }: {
  label: string; value: string; tone: 'emerald' | 'rose' | 'amber' | 'violet'; highlight?: boolean;
}) {
  const styles: Record<string, string> = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
    rose: 'bg-rose-500/10 border-rose-500/30 text-rose-200',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
    violet: 'bg-violet-500/10 border-violet-500/30 text-violet-200',
  };
  return (
    <div className={`rounded-xl border px-3 py-3 ${styles[tone]} ${highlight ? 'ring-1 ring-amber-400/40' : ''}`}>
      <div className="text-[10px] uppercase opacity-80 tracking-wider">{label}</div>
      <div className="text-base font-bold mt-1 font-mono">{value}</div>
    </div>
  );
}
