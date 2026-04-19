import { useMemo, useState } from 'react';
import { BarChart3, FileSpreadsheet, PieChart, TrendingUp, Users } from 'lucide-react';
import FinanceImportModal from '../components/finance/FinanceImportModal';
import { FinanceBars, FinanceDonut, FinanceGroupedBars, FinanceLineChart, FinanceVerticalBars } from '../components/finance/FinanceCharts';
import { useEgresos, useExcelFinanceSummaries, useIngresos } from '../hooks/useFinances';
import { useSocios } from '../hooks/useSocios';
import { useConfigEstudio } from '../hooks/useConfigEstudio';
import { buildFinanceOverview, buildRepartoOverview } from '../lib/financeAnalytics';
import { formatMoney, pctChange } from '../lib/financeFormat';

type PeriodOption = 6 | 12 | 18;
type BarView = 'resultado' | 'categorias' | 'clientes';
type DonutView = 'ingresos' | 'egresos' | 'modalidades';

export default function FlujoCaja() {
  const { ingresos, loading: loadingIngresos, refetch: refetchIngresos } = useIngresos();
  const { egresos, egresosCombinados, loading: loadingEgresos, refetch: refetchEgresos } = useEgresos();
  const { summaries: excelSummaries, loading: loadingSummaries, refetch: refetchSummaries } = useExcelFinanceSummaries();
  const [period, setPeriod] = useState<PeriodOption>(6);
  const [barView, setBarView] = useState<BarView>('resultado');
  const [donutView, setDonutView] = useState<DonutView>('ingresos');
  const [importModalOpen, setImportModalOpen] = useState(false);

  const socios = useSocios();
  const { config: repartoConfig } = useConfigEstudio();
  const repartoCfg = useMemo(() => ({
    basePct: repartoConfig.reparto_base_pct,
    rendimientoPct: repartoConfig.reparto_rendimiento_pct,
  }), [repartoConfig]);

  const overview = useMemo(() => buildFinanceOverview(ingresos, egresosCombinados, period), [egresosCombinados, ingresos, period]);
  const reparto = useMemo(() => buildRepartoOverview(ingresos, egresosCombinados, period, socios, repartoCfg), [egresosCombinados, ingresos, period, socios, repartoCfg]);

  const changes = useMemo(() => {
    const s = overview.monthlySeries;
    if (s.length < 2) return { income: null, expense: null, net: null };
    const cur = s[s.length - 1];
    const prev = s[s.length - 2];
    return {
      income: pctChange(cur.income, prev.income),
      expense: pctChange(cur.expense, prev.expense),
      net: pctChange(cur.net, prev.net),
    };
  }, [overview.monthlySeries]);

  const barData = useMemo(() => {
    if (barView === 'categorias') return overview.expenseCategoryBreakdown;
    if (barView === 'clientes') return overview.topClients;
    return overview.monthlySeries.map((item, index) => ({
      label: item.label,
      value: item.net,
      color: item.net >= 0 ? '#34d399' : ['#fb7185', '#f97316'][index % 2],
    }));
  }, [barView, overview]);

  const donutData = useMemo(() => {
    if (donutView === 'egresos') return overview.expenseCategoryBreakdown;
    if (donutView === 'modalidades') return overview.paymentBreakdown;
    return overview.incomeSourceBreakdown;
  }, [donutView, overview]);

  const loading = loadingIngresos || loadingEgresos || loadingSummaries;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Flujo de caja</h1>
          <p className="mt-1 text-sm text-gray-500 hidden sm:block">Panel dinamico del resultado financiero con linea, barras y torta sobre la misma base operativa</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {[6, 12, 18].map(option => (
              <button
                key={option}
                onClick={() => setPeriod(option as PeriodOption)}
                className={`rounded-lg px-3 py-2 text-sm transition ${period === option ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
              >
                {option} meses
              </button>
            ))}
          </div>
          <button onClick={() => setImportModalOpen(true)} className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Importar Excel
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard label="Ingresos netos" value={formatMoney(overview.totals.netIncome)} tone="emerald" index={0} change={changes.income} />
        <MetricCard label="Egresos totales" value={formatMoney(overview.totals.totalExpenses)} tone="rose" index={1} change={changes.expense} invertColor />
        <MetricCard label="Resultado neto" value={formatMoney(overview.totals.netFlow)} tone={overview.totals.netFlow >= 0 ? 'emerald' : 'rose'} index={2} change={changes.net} />
        <MetricCard label="Margen" value={`${overview.totals.profitMargin.toFixed(1)}%`} tone="sky" index={3} />
        <MetricCard label="Cobertura de gastos" value={`${overview.totals.expenseCoverage.toFixed(1)}%`} tone="amber" index={4} />
      </div>

      <div className="glass-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Motor financiero unificado</p>
            <p className="mt-1 text-sm text-gray-500">Neto = ingresos CJ NOA - egresos consolidados. El flujo incluye gastos operativos y gastos de caso.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-gray-400">
            <span className="badge badge-green">Ingresos con formulas del Excel</span>
            <span className="badge badge-red">Egresos operativos y judiciales</span>
            <span className="badge badge-blue">Vista ERP consolidada</span>
          </div>
        </div>
      </div>

      {/* Reparto calculado desde la base de datos */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users className="h-4 w-4 text-violet-300" />
          Reparto y distribucion por socio (calculado)
        </div>
        <div className="mt-2 text-xs text-gray-500">Calculado automaticamente desde todos los ingresos y egresos cargados en el sistema.</div>
        <div className="mt-4 grid gap-3 sm:gap-3 grid-cols-2 md:grid-cols-4">
          <MiniKpi label="A repartir" value={formatMoney(reparto.global.totalARepartir)} tone="emerald" index={0} />
          <MiniKpi label="Base por socio" value={formatMoney(reparto.global.basePorPersona)} tone="sky" index={1} />
          <MiniKpi label="Reparto 65%" value={formatMoney(reparto.global.reparto65)} tone="violet" index={2} />
          <MiniKpi label="Reparto 35%" value={formatMoney(reparto.global.reparto35)} tone="amber" index={3} />
        </div>
        <div className="mt-4 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {reparto.socios.map((s, i) => (
            <div key={s.socio} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover-lift animate-slide-up transition-all duration-300 hover:border-white/15" style={{ animationDelay: `${i * 100 + 300}ms` }}>
              <p className="text-sm font-semibold text-white">{s.socio}</p>
              <div className="mt-3 space-y-1.5 text-sm text-gray-300">
                <div className="flex justify-between"><span>Ingreso neto</span><span className="font-semibold text-emerald-300">{formatMoney(s.ingresoNeto)}</span></div>
                <div className="flex justify-between"><span>Comisiones</span><span className="font-semibold text-amber-300">{formatMoney(s.comisiones)}</span></div>
                <div className="flex justify-between"><span>Participacion</span><span className="font-semibold text-sky-300">{(s.participacion * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span>Egresos resp.</span><span className="font-semibold text-rose-300">{formatMoney(s.egresosResponsable)}</span></div>
                <div className="flex justify-between"><span>Clientes</span><span className="font-semibold text-white">{s.casosAtendidos}</span></div>
                <div className="mt-2 rounded-lg bg-white/[0.06] px-3 py-2">
                  <span className="text-xs text-gray-400">Monto a cobrar</span>
                  <p className="text-lg font-bold text-violet-300">{formatMoney(s.montoACobrar)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detalle mensual del reparto */}
      <div className="glass-card overflow-hidden">
        <div className="border-b border-white/5 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Reparto mensual calculado</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Mes</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Ingresos</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Egresos</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">A repartir</th>
                {reparto.socios.map(s => (
                  <th key={s.socio} className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">{s.socio}</th>
                ))}
                <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Clientes</th>
              </tr>
            </thead>
            <tbody>
              {reparto.mensual.filter(m => m.totalIngresos > 0 || m.totalEgresos > 0).map((m, i) => (
                <tr key={m.mes} className="table-row row-enter" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                  <td className="px-5 py-3 text-sm font-medium text-white">{m.label}</td>
                  <td className="px-5 py-3 text-right text-sm text-emerald-400">{formatMoney(m.totalIngresos)}</td>
                  <td className="px-5 py-3 text-right text-sm text-rose-400">{formatMoney(m.totalEgresos)}</td>
                  <td className="px-5 py-3 text-right text-sm font-semibold text-violet-300">{formatMoney(m.totalARepartir)}</td>
                  {m.socios.map(s => (
                    <td key={s.socio} className="px-5 py-3 text-right text-sm text-sky-300">{formatMoney(s.ingresoNeto)}</td>
                  ))}
                  <td className="px-5 py-3 text-right text-sm text-gray-400">{m.clientesUnicos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {excelSummaries.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileSpreadsheet className="h-4 w-4 text-emerald-300" />
            Referencia importada desde Excel
          </div>
          <p className="mt-1 text-xs text-gray-500">Estos datos vienen de la planilla Excel importada. Usan los valores que el Excel tenia guardados para comparar con los datos del ERP.</p>
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            {excelSummaries.slice(0, 3).map(summary => (
              <WorkbookSummaryCard key={summary.id} summary={summary} />
            ))}
          </div>
        </div>
      )}

      <FinanceLineChart
        title="Evolucion mensual del flujo"
        subtitle="Ingreso neto CJ NOA, egreso consolidado y resultado mensual"
        series={overview.monthlySeries}
        projectionMonths={3}
      />

      {/* Barras agrupadas ingreso vs egreso mensual */}
      <FinanceGroupedBars
        title="Ingreso vs Egreso mensual"
        subtitle="Comparacion directa mes a mes entre flujo de entrada y salida"
        series={overview.monthlySeries}
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="glass-card p-4 mb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <BarChart3 className="h-4 w-4 text-cyan-300" />
                Barras dinamicas
              </div>
              <select value={barView} onChange={e => setBarView(e.target.value as BarView)} className="select-dark w-[220px] py-2 text-sm">
                <option value="resultado">Resultado mensual</option>
                <option value="categorias">Categorias de egreso</option>
                <option value="clientes">Top clientes</option>
              </select>
            </div>
          </div>
          {barView === 'resultado' ? (
            <FinanceVerticalBars
              title="Resultado mensual"
              subtitle="Meses con mejor y peor rendimiento"
              data={barData}
              height={240}
            />
          ) : (
            <FinanceBars
              title={barView === 'categorias' ? 'Categorias de egreso' : 'Clientes con mayor aporte'}
              subtitle={barView === 'categorias' ? 'Rubros que presionan la caja' : 'Ingresos mas fuertes para el estudio'}
              data={barData}
            />
          )}
        </div>

        <div className="glass-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <PieChart className="h-4 w-4 text-amber-300" />
              Torta dinamica
            </div>
            <select value={donutView} onChange={e => setDonutView(e.target.value as DonutView)} className="select-dark w-[220px] py-2 text-sm">
              <option value="ingresos">Origen de ingresos</option>
              <option value="egresos">Composicion de egresos</option>
              <option value="modalidades">Modalidades de cobro</option>
            </select>
          </div>
          <FinanceDonut
            title={donutView === 'ingresos' ? 'Mix de ingresos' : donutView === 'egresos' ? 'Mix de egresos' : 'Modalidades de cobro'}
            subtitle={donutView === 'ingresos' ? 'Directo, cuota, manual y captadora' : donutView === 'egresos' ? 'Categorias con mas peso en la estructura' : 'Como entra el dinero a caja'}
            data={donutData}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SummaryPanel title="Ingresos y estructura" tone="emerald" rows={[
          { label: 'Ingreso bruto', value: formatMoney(overview.totals.grossIncome) },
          { label: 'Comisiones', value: formatMoney(overview.totals.commissions) },
          { label: 'Ingreso neto', value: formatMoney(overview.totals.netIncome) },
        ]} />
        <SummaryPanel title="Gastos y cobertura" tone="rose" rows={[
          { label: 'Egresos totales', value: formatMoney(overview.totals.totalExpenses) },
          { label: 'Cobertura', value: `${overview.totals.expenseCoverage.toFixed(1)}%` },
          { label: 'Margen final', value: `${overview.totals.profitMargin.toFixed(1)}%` },
        ]} />
        <SummaryPanel title="Lectura rapida" tone="sky" rows={[
          { label: 'Top cliente', value: overview.topClients[0]?.label || 'Sin datos' },
          { label: 'Top categoria egreso', value: overview.expenseCategoryBreakdown[0]?.label || 'Sin datos' },
          { label: 'Origen principal ingreso', value: overview.incomeSourceBreakdown[0]?.label || 'Sin datos' },
        ]} />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="border-b border-white/5 px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Detalle mensual</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Mes</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Ingresos</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Egresos</th>
                <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Neto</th>
              </tr>
            </thead>
            <tbody>
              {overview.monthlySeries.map(item => (
                <tr key={item.label} className="table-row">
                  <td className="px-5 py-3 text-sm font-medium text-white">{item.label}</td>
                  <td className="px-5 py-3 text-right text-sm text-emerald-400">{formatMoney(item.income)}</td>
                  <td className="px-5 py-3 text-right text-sm text-rose-400">{formatMoney(item.expense)}</td>
                  <td className={`px-5 py-3 text-right text-sm font-semibold ${item.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {formatMoney(item.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FinanceImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        target="todos"
        existingIngresos={ingresos}
        existingEgresos={egresos}
        onImported={async () => {
          await Promise.all([refetchIngresos(), refetchEgresos(), refetchSummaries()]);
        }}
      />
    </div>
  );
}

function WorkbookSummaryCard({ summary }: { summary: { hoja: string; metricas: Record<string, any> } }) {
  const ingresoSocios = summary.metricas?.ingresoSocios || {};

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{summary.hoja}</p>
        <span className="badge badge-green">Workbook</span>
      </div>
      <div className="mt-4 space-y-2 text-sm text-gray-300">
        <div className="flex items-center justify-between"><span>Clientes</span><span className="font-semibold text-white">{summary.metricas?.totalClientes || 0}</span></div>
        <div className="flex items-center justify-between"><span>Ingresos</span><span className="font-semibold text-emerald-300">{formatMoney(Number(summary.metricas?.totalIngresos || 0))}</span></div>
        <div className="flex items-center justify-between"><span>Egresos</span><span className="font-semibold text-rose-300">{formatMoney(Number(summary.metricas?.totalEgresos || 0))}</span></div>
        <div className="flex items-center justify-between"><span>A repartir</span><span className="font-semibold text-sky-300">{formatMoney(Number(summary.metricas?.totalARepartir || 0))}</span></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-400">
        {Object.entries(ingresoSocios).map(([doctor, value]) => (
          <div key={doctor} className="rounded-lg bg-white/[0.04] px-3 py-2">
            <p>{doctor}</p>
            <p className="mt-1 text-sm font-semibold text-white">{formatMoney(Number(value || 0))}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone, change, invertColor, index = 0 }: { label: string; value: string; tone: 'emerald' | 'rose' | 'sky' | 'amber'; change?: number | null; invertColor?: boolean; index?: number }) {
  const accents: Record<string, string> = {
    emerald: 'from-emerald-400 to-emerald-600',
    rose: 'from-rose-400 to-rose-600',
    sky: 'from-sky-400 to-sky-600',
    amber: 'from-amber-400 to-amber-600',
  };
  const valueTones: Record<string, string> = {
    emerald: 'text-emerald-300',
    rose: 'text-rose-300',
    sky: 'text-sky-300',
    amber: 'text-amber-300',
  };

  const changeColor = change != null
    ? invertColor
      ? (change <= 0 ? 'text-emerald-400' : 'text-rose-400')
      : (change >= 0 ? 'text-emerald-400' : 'text-rose-400')
    : '';

  return (
    <div className="stat-card hover-lift animate-slide-up" style={{ animationDelay: `${index * 80}ms` }}>
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${accents[tone]}`} />
      <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.12em] sm:tracking-[0.18em] text-gray-500 font-medium">{label}</p>
      <p className={`mt-2 sm:mt-3 text-lg sm:text-2xl font-bold count-up ${valueTones[tone]}`}>{value}</p>
      {change != null && (
        <p className={`mt-1 sm:mt-1.5 text-[10px] sm:text-[11px] font-medium ${changeColor}`}>
          {(invertColor ? change <= 0 : change >= 0) ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs mes ant.
        </p>
      )}
    </div>
  );
}

function MiniKpi({ label, value, tone, index = 0 }: { label: string; value: string; tone: 'emerald' | 'sky' | 'violet' | 'amber'; index?: number }) {
  const tones = {
    emerald: 'text-emerald-300 glow-emerald',
    sky: 'text-sky-300 glow-sky',
    violet: 'text-violet-300 glow-violet',
    amber: 'text-amber-300 glow-amber',
  };
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3 hover-lift animate-scale-in transition-all duration-300 hover:border-white/15" style={{ animationDelay: `${index * 70}ms` }}>
      <p className="text-[10px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`mt-1.5 sm:mt-2 text-base sm:text-xl font-bold count-up ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function SummaryPanel({ title, rows, tone }: { title: string; rows: Array<{ label: string; value: string }>; tone: 'emerald' | 'rose' | 'sky' }) {
  const toneClass = tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : 'text-sky-300';
  const icon = tone === 'emerald' ? <TrendingUp className="h-4 w-4" /> : tone === 'rose' ? <PieChart className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />;

  return (
    <div className="glass-card p-5 animate-fade-in">
      <div className={`flex items-center gap-2 text-sm font-semibold ${toneClass}`}>
        {icon}
        {title}
      </div>
      <div className="mt-4 space-y-3 text-sm text-gray-300">
        {rows.map((row, i) => (
          <div key={row.label} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 hover:bg-white/[0.06] transition-all duration-200 animate-slide-right" style={{ animationDelay: `${i * 50}ms` }}>
            <span>{row.label}</span>
            <span className="font-semibold text-white">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
