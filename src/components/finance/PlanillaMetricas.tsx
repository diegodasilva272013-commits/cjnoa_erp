import { useMemo } from 'react';
import { SOCIOS_FINANZAS, type IngresoOperativo, type SocioFinanzas } from '../../types/finanzas';
import { formatMoney } from '../../lib/financeFormat';

interface Props {
  ingresos: IngresoOperativo[];
  metaGrupal: number;
  totalIngresos: number;
  totalEgresos: number;
  cajaEfectivo: number;
  // ingresos transferencia por socio (ya calculado por FlujoCaja)
  ingTransferSocio: Record<SocioFinanzas, number>;
  // egresos transferencia por socio
  egTransferSocio: Record<SocioFinanzas, number>;
  // efectivo final por socio (resumen de cobro)
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
  ingTransferSocio, egTransferSocio, efectivoSocioFinal,
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
                <th colSpan={5} className="px-4 py-2 text-center text-sky-300 font-semibold uppercase text-xs tracking-wider">
                  Transferencia
                </th>
              </tr>
              <tr className="bg-sky-500/5 border-b border-white/10">
                <th className="px-4 py-2 text-left text-sky-300/80 text-xs uppercase font-medium"></th>
                {SOCIOS_FINANZAS.map(s => (
                  <th key={s} className={`px-4 py-2 text-right text-xs uppercase font-bold ${SOCIO_COLOR[s]}`}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <Row label="Transferencias" values={SOCIOS_FINANZAS.map(s => formatMoney(ingTransferSocio[s] || 0))} />
              <Row label="Gastos en Transf." values={SOCIOS_FINANZAS.map(s => formatMoney(egTransferSocio[s] || 0))} />
              <Row
                label="Total Transferencia"
                values={SOCIOS_FINANZAS.map(s => formatMoney((ingTransferSocio[s] || 0) - (egTransferSocio[s] || 0)))}
                accent
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
          La meta personal se calcula automáticamente como Meta Grupal ÷ 4. Para editarla, cambiá la Meta del periodo arriba.
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
