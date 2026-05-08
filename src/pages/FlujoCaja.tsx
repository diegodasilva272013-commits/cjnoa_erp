import { useEffect, useMemo, useState } from 'react';
import { Calculator, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useIngresosOperativos } from '../hooks/useIngresosOperativos';
import {
  SOCIOS_FINANZAS, RAMAS,
  type IngresoOperativo, type SocioFinanzas, type RamaLegal,
  type RepartoCalculo, type EgresoV2,
} from '../types/finanzas';
import { useToast } from '../context/ToastContext';
import { formatMoney } from '../lib/financeFormat';
import Modal from '../components/Modal';
import FinanceMiniCharts from '../components/finance/FinanceMiniCharts';

const periodoActual = () => new Date().toISOString().slice(0, 7); // YYYY-MM

export default function FlujoCaja() {
  const { items, loading } = useIngresosOperativos();
  const { showToast } = useToast();
  const [periodo, setPeriodo] = useState(periodoActual());
  const [meta, setMeta] = useState<number>(0);
  const [calculandoReparto, setCalculandoReparto] = useState(false);
  const [reparto, setReparto] = useState<RepartoCalculo | null>(null);
  const [modalReparto, setModalReparto] = useState(false);
  const [egresos, setEgresos] = useState<EgresoV2[]>([]);

  // Cargar egresos del periodo
  useEffect(() => {
    (async () => {
      const [y, m] = periodo.split('-').map(Number);
      const inicio = `${periodo}-01`;
      const finExclusivo = m === 12
        ? `${y + 1}-01-01`
        : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const { data, error } = await supabase
        .from('egresos_v2')
        .select('*')
        .gte('fecha', inicio)
        .lt('fecha', finExclusivo)
        .order('fecha', { ascending: false });
      if (error) { showToast('Error al cargar egresos: ' + error.message, 'error'); return; }
      setEgresos((data || []) as EgresoV2[]);
    })();
  }, [periodo, showToast]);

  // Cargar meta del periodo
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('metas_finanzas')
        .select('meta_recaudacion')
        .eq('periodo', periodo)
        .maybeSingle();
      setMeta(Number(data?.meta_recaudacion || 0));
    })();
  }, [periodo]);

  const ingresosPeriodo = useMemo(
    () => items.filter((i: IngresoOperativo) => i.fecha.startsWith(periodo)),
    [items, periodo],
  );

  const totales = useMemo(() => {
    const total = ingresosPeriodo.reduce((s, i) => s + Number(i.monto || 0), 0);
    const porSocio: Record<SocioFinanzas, number> = { Rodri: 0, Noe: 0, Ale: 0, Fabri: 0 };
    const porRama: Record<string, number> = {};
    let efectivoIn = 0, transferIn = 0;
    ingresosPeriodo.forEach(i => {
      porSocio[i.doctor_cobra] = (porSocio[i.doctor_cobra] || 0) + Number(i.monto || 0);
      porRama[i.rama] = (porRama[i.rama] || 0) + Number(i.monto || 0);
      if (i.modalidad === 'Efectivo') efectivoIn += Number(i.monto || 0);
      else if (i.modalidad === 'Transferencia') transferIn += Number(i.monto || 0);
    });
    const totalEgresos = egresos.reduce((s, e) => s + Number(e.monto || 0), 0);
    let efectivoOut = 0, transferOut = 0;
    const egresosPorSocio: Record<SocioFinanzas, number> = { Rodri: 0, Noe: 0, Ale: 0, Fabri: 0 };
    egresos.forEach(e => {
      if (e.modalidad === 'Efectivo') efectivoOut += Number(e.monto || 0);
      else if (e.modalidad === 'Transferencia') transferOut += Number(e.monto || 0);
      if (e.pagador) egresosPorSocio[e.pagador] = (egresosPorSocio[e.pagador] || 0) + Number(e.monto || 0);
    });
    const neto = total - totalEgresos;
    const cajaEfectivo = efectivoIn - efectivoOut;
    const cajaTransfer = transferIn - transferOut;
    return { total, porSocio, porRama, totalEgresos, neto, cajaEfectivo, cajaTransfer, egresosPorSocio };
  }, [ingresosPeriodo, egresos]);

  const chartItemsIngresos = useMemo(() => ingresosPeriodo.map((i: IngresoOperativo) => ({
    fecha: i.fecha,
    monto: Number(i.monto || 0),
    categoria: i.doctor_cobra,
    subcategoria: i.rama,
  })), [ingresosPeriodo]);

  const chartItemsEgresos = useMemo(() => egresos.map(e => ({
    fecha: e.fecha,
    monto: Number(e.monto || 0),
    categoria: e.modalidad === 'Efectivo' && !e.pagador ? 'Caja CJ' : (e.pagador || 'Sin asignar'),
    subcategoria: e.tipo,
  })), [egresos]);

  const chartItemsFlujo = useMemo(() => {
    const dias = new Map<string, number>();
    ingresosPeriodo.forEach(i => dias.set(i.fecha, (dias.get(i.fecha) || 0) + Number(i.monto || 0)));
    egresos.forEach(e => dias.set(e.fecha, (dias.get(e.fecha) || 0) - Number(e.monto || 0)));
    return Array.from(dias.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, monto]) => ({ fecha, monto, categoria: monto >= 0 ? 'Positivo' : 'Negativo', subcategoria: fecha.slice(8) }));
  }, [ingresosPeriodo, egresos]);

  const cumplimiento = meta > 0 ? (totales.total / meta) * 100 : 0;
  const semaforo: 'rojo' | 'amarillo' | 'verde' =
    cumplimiento >= 100 ? 'verde' : cumplimiento >= 60 ? 'amarillo' : 'rojo';
  const colorSem =
    semaforo === 'verde' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
    : semaforo === 'amarillo' ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
    : 'bg-rose-500/20 border-rose-500/40 text-rose-300';

  async function guardarMeta(nueva: number) {
    const { error } = await supabase.from('metas_finanzas').upsert({
      periodo, meta_recaudacion: nueva,
    }, { onConflict: 'periodo' });
    if (error) showToast(error.message, 'error');
    else { setMeta(nueva); showToast('Meta actualizada', 'success'); }
  }

  async function calcularReparto() {
    setCalculandoReparto(true);
    try {
      const { data, error } = await supabase.rpc('calcular_reparto_periodo', { p_periodo: periodo });
      if (error) throw error;
      setReparto(data as RepartoCalculo);
      setModalReparto(true);
    } catch (err: any) {
      showToast(err?.message || 'Error al calcular reparto', 'error');
    } finally {
      setCalculandoReparto(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Tablero financiero</h1>
          <p className="text-sm text-zinc-400 mt-1">Resumen del periodo y reparto sugerido entre los 4 socios.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-white"
          />
          <button
            onClick={calcularReparto}
            disabled={calculandoReparto}
            className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm text-white flex items-center gap-2 disabled:opacity-50"
          >
            {calculandoReparto ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
            Calcular reparto
          </button>
        </div>
      </header>

      {/* Meta + semáforo */}
      <div className={`rounded-xl border p-4 ${colorSem}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase opacity-80">Meta del periodo</div>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                value={meta || ''}
                onChange={e => setMeta(Number(e.target.value))}
                onBlur={e => guardarMeta(Number(e.target.value))}
                placeholder="Definí la meta"
                className="bg-black/30 px-2 py-1 rounded text-sm text-white w-40 outline-none border border-white/10"
              />
              <span className="text-sm">→ Recaudado: <strong>{formatMoney(totales.total)}</strong></span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{cumplimiento.toFixed(0)}%</div>
            <div className="text-xs uppercase opacity-80">cumplimiento</div>
          </div>
        </div>
      </div>

      {/* Cards principales */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Ingresos del periodo" value={formatMoney(totales.total)} tone="emerald" highlight />
        <MetricCard label="Egresos del periodo" value={formatMoney(totales.totalEgresos)} tone="rose" highlight />
        <MetricCard label="Neto (In - Out)" value={formatMoney(totales.neto)} tone={totales.neto >= 0 ? 'emerald' : 'rose'} highlight />
        <MetricCard label="Caja Efectivo" value={formatMoney(totales.cajaEfectivo)} tone="amber" />
        <MetricCard label="Caja Transferencia" value={formatMoney(totales.cajaTransfer)} tone="sky" />
      </div>

      {/* Cards por socio (ingresos vs egresos) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SOCIOS_FINANZAS.map(s => {
          const ing = totales.porSocio[s];
          const eg = totales.egresosPorSocio[s];
          const neto = ing - eg;
          return (
            <MetricCard
              key={s}
              tone={SOCIO_TONE[s]}
              label={s}
              value={formatMoney(neto)}
              sub={`+${formatMoney(ing)} · -${formatMoney(eg)}`}
            />
          );
        })}
      </div>

      {/* Gráficos de Ingresos */}
      <div>
        <h2 className="text-sm font-semibold text-emerald-300 mb-2 uppercase tracking-wider">Ingresos del periodo</h2>
        <FinanceMiniCharts
          items={chartItemsIngresos}
          pieTitle="Ingresos por doctor"
          lineTitle="Evolución diaria"
          barTitle="Top ramas"
          accent="emerald"
        />
      </div>

      {/* Gráficos de Egresos */}
      <div>
        <h2 className="text-sm font-semibold text-rose-300 mb-2 uppercase tracking-wider">Egresos del periodo</h2>
        <FinanceMiniCharts
          items={chartItemsEgresos}
          pieTitle="Egresos por pagador"
          lineTitle="Evolución diaria"
          barTitle="Top tipos"
          accent="rose"
        />
      </div>

      {/* Flujo neto diario */}
      <div>
        <h2 className="text-sm font-semibold text-sky-300 mb-2 uppercase tracking-wider">Flujo neto diario (Ingresos - Egresos)</h2>
        <FinanceMiniCharts
          items={chartItemsFlujo}
          pieTitle="Saldo positivo / negativo"
          lineTitle="Saldo neto por día"
          barTitle="Mejores días"
          accent="sky"
        />
      </div>

      {/* Por rama */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 text-sm text-zinc-300 font-medium">Por rama</div>
        {loading ? (
          <div className="p-6 text-sm text-zinc-400 text-center">Cargando…</div>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/5">
              {RAMAS.map((r: RamaLegal) => {
                const monto = totales.porRama[r] || 0;
                const pct = totales.total > 0 ? (monto / totales.total) * 100 : 0;
                return (
                  <tr key={r}>
                    <td className="px-4 py-2 text-zinc-300">{r}</td>
                    <td className="px-4 py-2 w-1/2">
                      <div className="h-2 bg-white/5 rounded">
                        <div className="h-2 bg-emerald-500/60 rounded" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-white font-medium whitespace-nowrap">{formatMoney(monto)}</td>
                    <td className="px-4 py-2 text-right text-zinc-400 w-16">{pct.toFixed(0)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal reparto */}
      <Modal open={modalReparto} onClose={() => setModalReparto(false)} title={`Reparto sugerido — ${reparto?.periodo || periodo}`}>
        {reparto && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Ingresos" value={formatMoney(reparto.ingresos_totales)} />
              <Stat label="Egresos" value={formatMoney(reparto.egresos_totales)} />
              <Stat label="Utilidad" value={formatMoney(reparto.utilidad)} highlight />
              <Stat label="Parte por socio (÷4)" value={formatMoney(reparto.parte_por_socio)} />
            </div>
            <div>
              <h4 className="text-sm text-zinc-300 font-medium mb-2">Saldos actuales en cuenta</h4>
              <div className="grid grid-cols-2 gap-2">
                {SOCIOS_FINANZAS.map(s => (
                  <div key={s} className="flex justify-between bg-black/30 rounded px-3 py-2 text-sm">
                    <span className="text-zinc-400">{s}</span>
                    <span className="text-white">{formatMoney(reparto.saldos?.[s]?.total ?? 0)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm text-zinc-300 font-medium mb-2">Transferencias sugeridas</h4>
              {(!reparto.transferencias_sugeridas || reparto.transferencias_sugeridas.length === 0) ? (
                <div className="text-xs text-zinc-500">Sin movimientos necesarios — ya está parejo.</div>
              ) : (
                <ul className="space-y-1">
                  {reparto.transferencias_sugeridas.map((t, idx) => (
                    <li key={idx} className="text-sm bg-emerald-500/5 border border-emerald-500/20 rounded px-3 py-2 text-emerald-200">
                      <strong>{t.from}</strong> → <strong>{t.to}</strong>: {formatMoney(t.monto)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/[0.02] border-white/10'}`}>
      <div className="text-[10px] uppercase text-zinc-400">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${highlight ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
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

function MetricCard({ label, value, sub, highlight, tone = 'zinc' }: { label: string; value: string; sub?: string; highlight?: boolean; tone?: Tone }) {
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
        {sub && <div className="text-[10px] text-zinc-400 mt-1">{sub}</div>}
      </div>
    </div>
  );
}
