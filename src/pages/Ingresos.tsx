import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download, FileSpreadsheet, Plus, Sigma, Users, FileText, RefreshCw, Rows3, Rows4 } from 'lucide-react';
import { useCaseFinancePipeline, useIngresos } from '../hooks/useFinances';
import { MATERIAS } from '../types/database';
import { useSocios } from '../hooks/useSocios';
import Modal from '../components/Modal';
import FinanceImportModal from '../components/finance/FinanceImportModal';
import { FinanceBars, FinanceDonut, FinanceLineChart, FinanceVerticalBars } from '../components/finance/FinanceCharts';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { exportToExcel } from '../lib/exportExcel';
import { exportToPdf } from '../lib/exportPdf';
import { buildIncomeOverview, aggregateIngresosPorSocio } from '../lib/financeAnalytics';
import { formatMoney, pctChange } from '../lib/financeFormat';
import { usePerfilMap } from '../hooks/usePerfiles';
import { countCaseIncomeLedgerChanges } from '../lib/caseIncomeLedger';
import { stripIncomeReference } from '../lib/financeRefs';
import { resolveOperationalSocio, sameOperationalSocio } from '../lib/operationalSocios';

export default function Ingresos() {
  const { ingresos, loading, refetch, syncWithCases, syncingCases } = useIngresos();
  const { pipeline, loading: loadingPipeline } = useCaseFinancePipeline();
  const socios = useSocios();
  const perfilMap = usePerfilMap();
  const { showToast } = useToast();

  function usePersistedFilter(key: string, fallback = '') {
    const [value, setValue] = useState(() => {
      try { return sessionStorage.getItem(`ingresos_${key}`) || fallback; } catch { return fallback; }
    });
    const set = (v: string) => { setValue(v); try { sessionStorage.setItem(`ingresos_${key}`, v); } catch {} };
    return [value, set] as const;
  }

  const [filtroFechaDesde, setFiltroFechaDesde] = usePersistedFilter('desde');
  const [filtroFechaHasta, setFiltroFechaHasta] = usePersistedFilter('hasta');
  const [filtroSocio, setFiltroSocio] = usePersistedFilter('socio');
  const [filtroFuente, setFiltroFuente] = usePersistedFilter('fuente');
  const [filtroModalidad, setFiltroModalidad] = usePersistedFilter('modalidad');
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [compact, setCompact] = useState(() => sessionStorage.getItem('ingresos_compact') === '1');
  const pageSize = 50;

  const filtered = useMemo(() => ingresos.filter(ingreso => {
    if (filtroFechaDesde && ingreso.fecha < filtroFechaDesde) return false;
    if (filtroFechaHasta && ingreso.fecha > filtroFechaHasta) return false;
    if (filtroSocio && !sameOperationalSocio(ingreso.socio_cobro, filtroSocio)) return false;
    if (filtroModalidad && ingreso.modalidad !== filtroModalidad) return false;
    if (filtroFuente === 'Captadora' && !ingreso.captadora_nombre) return false;
    if (filtroFuente === 'Directo' && ingreso.captadora_nombre) return false;
    return true;
  }), [filtroFechaDesde, filtroFechaHasta, filtroFuente, filtroModalidad, filtroSocio, ingresos]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [filtroFechaDesde, filtroFechaHasta, filtroFuente, filtroModalidad, filtroSocio]);

  const analytics = useMemo(() => buildIncomeOverview(filtered, 6), [filtered]);

  const changes = useMemo(() => {
    const s = analytics.monthlySeries;
    if (s.length < 2) return { net: null, gross: null, commission: null };
    const cur = s[s.length - 1];
    const prev = s[s.length - 2];
    return {
      net: pctChange(cur.net, prev.net),
      gross: pctChange(cur.income, prev.income),
      commission: pctChange(cur.expense, prev.expense),
    };
  }, [analytics.monthlySeries]);

  async function handleExportIngresos() {
    const data = filtered.map(item => ({
      Fecha: item.fecha,
      Cliente: item.cliente_nombre || '',
      Materia: item.materia || '',
      Concepto: item.concepto || '',
      'Monto Total': item.monto_total,
      'Monto CJ NOA': item.monto_cj_noa,
      'Comision Captadora': item.comision_captadora,
      Captadora: item.captadora_nombre || '',
      Socio: resolveOperationalSocio(item.socio_cobro) || '',
      Modalidad: item.modalidad || '',
      Notas: stripIncomeReference(item.notas) || '',
    }));
    await exportToExcel(data, 'Ingresos_CJ_NOA', 'Ingresos');
  }

  function handleExportPdf() {
    exportToPdf({
      title: 'Reporte de Ingresos — CJ NOA',
      columns: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'bruto', label: 'Bruto', align: 'right' },
        { key: 'neto', label: 'Neto CJ NOA', align: 'right' },
        { key: 'socio', label: 'Socio' },
      ],
      rows: filtered.map(i => ({
        fecha: i.fecha,
        cliente: i.cliente_nombre || '',
        concepto: i.concepto || '',
        bruto: formatMoney(i.monto_total || 0),
        neto: formatMoney(i.monto_cj_noa || 0),
        socio: resolveOperationalSocio(i.socio_cobro) || '',
      })),
      summary: [
        { label: 'Total Registros', value: String(filtered.length) },
        { label: 'Neto Total', value: formatMoney(analytics.totals.netIncome) },
        { label: 'Bruto Total', value: formatMoney(analytics.totals.grossIncome) },
      ],
    });
  }

  async function handleSyncCases() {
    try {
      const summary = await syncWithCases();
      const totalChanges = countCaseIncomeLedgerChanges(summary);

      if (totalChanges === 0) {
        showToast('Casos e ingresos ya estaban sincronizados');
        return;
      }

      showToast(`Sincronizados ${totalChanges} movimientos desde casos`);
      await refetch();
    } catch (error: any) {
      showToast(error.message || 'Error al sincronizar cobros desde casos', 'error');
    }
  }

  if (loading || loadingPipeline) {
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
          <h1 className="text-xl sm:text-2xl font-bold text-white">Ingresos</h1>
          <p className="mt-1 text-sm text-gray-500 hidden sm:block">Cobros reales del estudio y cartera pendiente conectada con los casos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleExportIngresos} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar Excel</span>
          </button>
          <button onClick={handleExportPdf} className="btn-secondary flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar PDF</span>
          </button>
          <button onClick={handleSyncCases} disabled={syncingCases} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${syncingCases ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar casos</span>
          </button>
          <button onClick={() => setImportModalOpen(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Importar Excel</span>
          </button>
          <button onClick={() => setManualModalOpen(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Ingreso manual</span>
          </button>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <div>
            <label className="text-xs text-gray-500">Desde</label>
            <input type="date" value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)} className="input-dark mt-1 text-sm py-2" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Hasta</label>
            <input type="date" value={filtroFechaHasta} onChange={e => setFiltroFechaHasta(e.target.value)} className="input-dark mt-1 text-sm py-2" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Socio</label>
            <select value={filtroSocio} onChange={e => setFiltroSocio(e.target.value)} className="select-dark mt-1 text-sm py-2">
              <option value="">Todos</option>
              {socios.map(socio => <option key={socio} value={socio}>{socio}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Fuente</label>
            <select value={filtroFuente} onChange={e => setFiltroFuente(e.target.value)} className="select-dark mt-1 text-sm py-2">
              <option value="">Todas</option>
              <option value="Captadora">Captadora</option>
              <option value="Directo">Directo</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Modalidad</label>
            <select value={filtroModalidad} onChange={e => setFiltroModalidad(e.target.value)} className="select-dark mt-1 text-sm py-2">
              <option value="">Todas</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Ingreso neto CJ NOA" value={formatMoney(analytics.totals.netIncome)} tone="emerald" index={0} change={changes.net} />
        <KpiCard label="Ingreso bruto" value={formatMoney(analytics.totals.grossIncome)} tone="sky" index={1} change={changes.gross} />
        <KpiCard label="Comisiones captadora" value={formatMoney(analytics.totals.commissions)} tone="amber" index={2} change={changes.commission} />
        <KpiCard label="Ticket promedio" value={formatMoney(analytics.totals.averageTicket)} tone="cyan" index={3} />
        <KpiCard label="Registros activos" value={String(analytics.totals.records)} tone="slate" index={4} />
      </div>

      <div className="glass-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Pipeline de cobranzas por casos</p>
            <p className="mt-1 text-xs text-gray-500">Los KPI de esta tarjeta muestran el neto estimado del estudio sobre lo pendiente. El detalle inferior conserva el bruto contractual del caso para no perder la referencia legal/comercial.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-gray-400">
            <span className="badge badge-yellow">{pipeline.summary.activeDebtors} deudores activos</span>
            <span className="badge badge-red">{pipeline.summary.overdueCount} vencidas</span>
            {pipeline.summary.noDueDateAmount > 0 && (
              <span className="badge badge-blue">Sin fecha bruto {formatMoney(pipeline.summary.noDueDateAmount)}</span>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <PipelineKpi label="Acordado bruto" value={formatMoney(pipeline.summary.totalAgreed)} tone="slate" />
          <PipelineKpi label="Acordado neto est." value={formatMoney(pipeline.summary.totalAgreedNet)} tone="sky" />
          <PipelineKpi label="Cobrado neto CJ NOA" value={formatMoney(pipeline.summary.totalCollectedNet)} tone="emerald" />
          <PipelineKpi label="Pendiente neto est." value={formatMoney(pipeline.summary.totalPendingNet)} tone="amber" />
          <PipelineKpi label="Vencido neto est." value={formatMoney(pipeline.summary.overdueNetAmount)} tone="rose" />
          <PipelineKpi label="Prox. 30 dias neto est." value={formatMoney(pipeline.summary.dueNext30DaysNet)} tone="sky" />
        </div>
      </div>

      {/* Distribucion calculada por socio */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users className="h-4 w-4 text-violet-300" />
          Ingreso por socio (calculado)
        </div>
        <div className="mt-1 text-xs text-gray-500">Calculado automaticamente desde los datos cargados (manuales + importados).</div>
        <div className="mt-4 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {(() => {
            const aggregated = aggregateIngresosPorSocio(filtered, socios);
            return socios.map(socio => {
              const totals = aggregated.get(socio) || { ingresoNeto: 0, ingresoBruto: 0, comisiones: 0, registros: 0, clientes: new Set<string>() };
              const participacion = analytics.totals.netIncome > 0 ? (totals.ingresoNeto / analytics.totals.netIncome * 100).toFixed(1) : '0.0';
              return (
                <div key={socio} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <p className="text-sm font-semibold text-white">{socio}</p>
                  <div className="mt-3 space-y-1.5 text-sm text-gray-300">
                    <div className="flex justify-between"><span>Neto</span><span className="font-semibold text-emerald-300">{formatMoney(totals.ingresoNeto)}</span></div>
                    <div className="flex justify-between"><span>Bruto</span><span className="font-semibold text-white">{formatMoney(totals.ingresoBruto)}</span></div>
                    <div className="flex justify-between"><span>Comisiones</span><span className="font-semibold text-amber-300">{formatMoney(totals.comisiones)}</span></div>
                    <div className="flex justify-between"><span>Participacion</span><span className="font-semibold text-sky-300">{participacion}%</span></div>
                    <div className="flex justify-between"><span>Clientes</span><span className="font-semibold text-gray-200">{totals.clientes.size}</span></div>
                    <div className="flex justify-between"><span>Registros</span><span className="font-semibold text-gray-400">{totals.registros}</span></div>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Sigma className="h-4 w-4 text-amber-300" />
            Formulas del modelo de ingresos
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <FormulaBox title="Bruto" description="Monto total cobrado antes de repartir comisiones." value={`${formatMoney(analytics.totals.netIncome)} + ${formatMoney(analytics.totals.commissions)}`} />
            <FormulaBox title="Neto CJ NOA" description="Resultado real para el estudio despues de captadoras." value={`${analytics.totals.collectionRate.toFixed(1)}% del bruto`} />
            <FormulaBox title="Peso captadora" description="Participacion de derivaciones y comisiones sobre el ingreso total." value={`${analytics.totals.captadoraRate.toFixed(1)}% del bruto`} />
          </div>
        </div>

        <div className="glass-card p-5">
          <p className="text-sm font-semibold text-white">Resumen ejecutivo</p>
          <div className="mt-4 space-y-3 text-sm text-gray-300">
            <InsightRow label="Cobros via captadora" value={formatMoney(analytics.sourceBreakdown.find(item => item.label === 'Captadora')?.value || 0)} />
            <InsightRow label="Cobros directos y por cuota" value={formatMoney(analytics.totals.netIncome - (analytics.sourceBreakdown.find(item => item.label === 'Captadora')?.value || 0))} />
            <InsightRow label="Modalidad predominante" value={analytics.paymentBreakdown[0]?.label || 'Sin datos'} />
            <InsightRow label="Socio con mayor cobranza" value={analytics.partnerBreakdown[0]?.label || 'Sin asignar'} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FinanceLineChart
          title="Evolucion de ingresos"
          subtitle="Bruto, comisiones y neto de los ultimos 6 meses"
          series={analytics.monthlySeries}
          labels={{ income: 'Bruto', expense: 'Comision', net: 'Neto CJ NOA' }}
        />
        <FinanceDonut title="Origen del ingreso" subtitle="Mix entre captacion directa, cuotas y captadoras" data={analytics.sourceBreakdown} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FinanceBars title="Top clientes por ingreso neto" subtitle="Clientes que mas aportan al flujo del estudio" data={analytics.topClients} />
        <FinanceVerticalBars title="Rendimiento por socio" subtitle="Cobrado por cada socio filtrado" data={analytics.partnerBreakdown} height={220} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <FinanceBars
          title="Vencimientos netos esperados"
          subtitle="Estimacion neta para el estudio agrupada por mes esperado de cobro"
          data={pipeline.monthlyCollectionsNet.filter(item => item.value > 0)}
        />

        <div className="glass-card overflow-hidden">
          <div className="border-b border-white/5 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Detalle de cartera pendiente</h3>
            <p className="mt-1 text-xs text-gray-500">Casos que todavia no impactan en el libro de ingresos porque siguen pendientes de cobro.</p>
          </div>
          {pipeline.pendingItems.length === 0 ? (
            <div className="px-5 py-10 text-sm text-gray-500">No hay cobros pendientes para mostrar.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Cliente</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Tipo</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Vencimiento</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase text-gray-500">Monto</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase text-gray-500">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.pendingItems.slice(0, 8).map(item => (
                    <tr key={item.id} className="table-row">
                      <td className="px-5 py-3">
                        <div>
                          <p className="text-sm font-medium text-white">{item.clientName}</p>
                          <p className="text-xs text-gray-500">{item.materia} · {item.socio}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-300">
                        {item.type === 'cuota' ? 'Cuota' : item.type === 'consulta' ? 'Consulta' : 'Saldo'}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-300">
                        {item.dueDate ? format(new Date(`${item.dueDate}T12:00:00`), 'dd MMM yyyy', { locale: es }) : 'Sin fecha'}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-medium text-amber-300">{formatMoney(item.amount)}</td>
                      <td className="px-5 py-3">
                        <span className={`badge ${item.overdue ? 'badge-red' : 'badge-yellow'}`}>
                          {item.overdue ? 'Vencido' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-end px-5 py-2 border-b border-white/[0.04]">
          <button
            onClick={() => { const v = !compact; setCompact(v); sessionStorage.setItem('ingresos_compact', v ? '1' : '0'); }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            title={compact ? 'Vista normal' : 'Vista compacta'}
          >
            {compact ? <Rows3 className="w-3.5 h-3.5" /> : <Rows4 className="w-3.5 h-3.5" />}
            {compact ? 'Normal' : 'Compacto'}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className={`w-full ${compact ? 'text-xs' : ''}`}>
            <thead>
              <tr className="border-b border-white/5">
                <th className={`${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500`}>Fecha</th>
                <th className={`${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500`}>Cliente</th>
                <th className={`hidden ${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500 md:table-cell`}>Concepto</th>
                <th className={`${compact ? 'px-3 py-2' : 'px-5 py-3'} text-right text-xs font-medium uppercase text-gray-500`}>Neto CJ NOA</th>
                <th className={`hidden ${compact ? 'px-3 py-2' : 'px-5 py-3'} text-right text-xs font-medium uppercase text-gray-500 lg:table-cell`}>Comision</th>
                <th className={`hidden ${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500 md:table-cell`}>Socio</th>
                <th className={`hidden ${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500 lg:table-cell`}>Modalidad</th>
                <th className={`hidden ${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500 md:table-cell`}>Cargado por</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(page * pageSize, (page + 1) * pageSize).map((ingreso, i) => {
                const cp = compact ? 'px-3 py-1.5' : 'px-5 py-3';
                return (
                <tr key={ingreso.id} className="table-row row-enter" style={{ animationDelay: `${Math.min(i, 15) * 30}ms` }}>
                  <td className={`${cp} text-sm text-gray-300`}>{format(new Date(ingreso.fecha), 'dd MMM yyyy', { locale: es })}</td>
                  <td className={cp}>
                    <div>
                      <span className="text-sm text-white">{ingreso.cliente_nombre || 'Sin cliente'}</span>
                      {ingreso.materia && <span className="ml-1 text-xs text-gray-500">({ingreso.materia})</span>}
                    </div>
                  </td>
                  <td className={`hidden ${cp} text-sm text-gray-400 md:table-cell`}>{ingreso.concepto || 'Ingreso manual'}</td>
                  <td className={`${cp} text-right`}>
                    <span className="text-sm font-medium text-emerald-400">{formatMoney(ingreso.monto_cj_noa)}</span>
                  </td>
                  <td className={`hidden ${cp} text-right lg:table-cell`}>
                    {Number(ingreso.comision_captadora || 0) > 0 ? (
                      <span className="text-sm text-amber-400">{formatMoney(ingreso.comision_captadora)}</span>
                    ) : (
                      <span className="text-sm text-gray-600">-</span>
                    )}
                  </td>
                  <td className={`hidden ${cp} text-sm text-gray-400 md:table-cell`}>{resolveOperationalSocio(ingreso.socio_cobro) || 'Sin asignar'}</td>
                  <td className={`hidden ${cp} lg:table-cell`}>
                    <span className={`badge ${ingreso.modalidad === 'Efectivo' ? 'badge-green' : 'badge-blue'}`}>
                      {ingreso.modalidad || 'Sin definir'}
                    </span>
                  </td>
                  <td className={`hidden ${cp} md:table-cell`}>
                    <div className="text-xs">
                      <span className="text-violet-300 font-medium">{ingreso.created_by ? perfilMap.get(ingreso.created_by) || 'Usuario' : 'Importación'}</span>
                      <span className="block text-gray-500 mt-0.5">{format(new Date(ingreso.created_at), 'dd/MM/yy HH:mm', { locale: es })}</span>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-white/5 bg-white/[0.02] px-4 sm:px-5 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row flex-wrap justify-end gap-3 sm:gap-6 text-sm">
            <div>
              <span className="text-gray-500">Ingreso neto:</span>{' '}
              <span className="font-semibold text-emerald-400">{formatMoney(analytics.totals.netIncome)}</span>
            </div>
            <div>
              <span className="text-gray-500">Comisiones:</span>{' '}
              <span className="font-semibold text-amber-400">{formatMoney(analytics.totals.commissions)}</span>
            </div>
            <div>
              <span className="text-gray-500">Bruto:</span>{' '}
              <span className="font-semibold text-white">{formatMoney(analytics.totals.grossIncome)}</span>
            </div>
          </div>
        </div>

        {filtered.length > pageSize && (
          <div className="border-t border-white/5 bg-white/[0.02] px-4 sm:px-5 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} de {filtered.length}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 text-xs rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 transition">
                Anterior
              </button>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= filtered.length} className="px-3 py-1 text-xs rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 transition">
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <IngresoManualModal open={manualModalOpen} onClose={() => setManualModalOpen(false)} onSaved={refetch} />
      <FinanceImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        target="ingresos"
        existingIngresos={ingresos}
        onImported={async () => { await refetch(); }}
      />
    </div>
  );
}

function KpiCard({ label, value, tone, change, index = 0 }: { label: string; value: string; tone: 'emerald' | 'sky' | 'amber' | 'cyan' | 'slate'; change?: number | null; index?: number }) {
  const accents: Record<string, string> = {
    emerald: 'from-emerald-400 to-emerald-600',
    sky: 'from-sky-400 to-sky-600',
    amber: 'from-amber-400 to-amber-600',
    cyan: 'from-cyan-400 to-cyan-600',
    slate: 'from-gray-400 to-gray-600',
  };
  const valueTones: Record<string, string> = {
    emerald: 'text-emerald-300',
    sky: 'text-sky-300',
    amber: 'text-amber-300',
    cyan: 'text-cyan-300',
    slate: 'text-white',
  };

  return (
    <div className="stat-card hover-lift animate-slide-up" style={{ animationDelay: `${index * 80}ms` }}>
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${accents[tone]}`} />
      <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.12em] sm:tracking-[0.18em] text-gray-500 font-medium">{label}</p>
      <p className={`mt-2 sm:mt-3 text-lg sm:text-2xl font-bold count-up ${valueTones[tone]}`}>{value}</p>
      {change != null && (
        <p className={`mt-1 sm:mt-1.5 text-[10px] sm:text-[11px] font-medium ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs mes ant.
        </p>
      )}
    </div>
  );
}

function PipelineKpi({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'sky' | 'amber' | 'rose' | 'slate' }) {
  const borderTones: Record<'emerald' | 'sky' | 'amber' | 'rose' | 'slate', string> = {
    emerald: 'border-emerald-500/30 text-emerald-300',
    sky: 'border-sky-500/30 text-sky-300',
    amber: 'border-amber-500/30 text-amber-300',
    rose: 'border-rose-500/30 text-rose-300',
    slate: 'border-white/10 text-white',
  };

  return (
    <div className={`rounded-2xl border bg-white/[0.03] p-4 ${borderTones[tone]}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className="mt-2 text-lg font-bold count-up">{value}</p>
    </div>
  );
}

function FormulaBox({ title, description, value }: { title: string; description: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover-lift animate-fade-in transition-all duration-300 hover:border-white/15">
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-2 text-xs text-gray-500">{description}</p>
      <p className="mt-3 text-sm font-semibold text-amber-300 count-up">{value}</p>
    </div>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 hover:bg-white/[0.06] transition-all duration-200 animate-slide-right">
      <span>{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function IngresoManualModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const socios = useSocios();
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [cliente, setCliente] = useState('');
  const [materia, setMateria] = useState('');
  const [concepto, setConcepto] = useState('');
  const [montoTotal, setMontoTotal] = useState('');
  const [montoCjNoa, setMontoCjNoa] = useState('');
  const [comision, setComision] = useState('');
  const [captadora, setCaptadora] = useState('');
  const [modalidad, setModalidad] = useState('Efectivo');
  const [socio, setSocio] = useState(socios[0] || '');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  const montoTotalNum = parseFloat(montoTotal) || 0;
  const comisionNum = parseFloat(comision) || 0;
  const netoAutoCalc = montoTotalNum - comisionNum;

  // Si el usuario no toco el neto, se calcula solo
  const netoFinal = montoCjNoa !== '' ? (parseFloat(montoCjNoa) || 0) : netoAutoCalc;

  async function handleSave() {
    if (montoTotalNum <= 0) {
      showToast('El monto total es obligatorio', 'error');
      return;
    }
    setSaving(true);
    try {
      await supabase.from('ingresos').insert({
        fecha,
        cliente_nombre: cliente || null,
        materia: materia || null,
        concepto: concepto || 'Ingreso manual',
        monto_total: montoTotalNum,
        monto_cj_noa: netoFinal,
        comision_captadora: comisionNum,
        captadora_nombre: captadora || null,
        socio_cobro: socio,
        modalidad,
        notas: notas || null,
        es_manual: true,
      });
      showToast('Ingreso registrado');
      onSaved();
      onClose();
      // Reset
      setCliente(''); setMateria(''); setConcepto(''); setMontoTotal(''); setMontoCjNoa(''); setComision(''); setCaptadora(''); setNotas('');
    } catch (error: any) {
      showToast(error.message || 'Error al registrar ingreso', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo ingreso" subtitle="Registra un cobro con desglose bruto, neto y comisiones" maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input-dark" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Socio que cobra</label>
            <select value={socio} onChange={e => setSocio(e.target.value)} className="select-dark">
              {socios.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Cliente</label>
            <input type="text" value={cliente} onChange={e => setCliente(e.target.value)} className="input-dark" placeholder="Nombre del cliente" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Materia</label>
            <select value={materia} onChange={e => setMateria(e.target.value)} className="select-dark">
              <option value="">Sin especificar</option>
              {MATERIAS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-gray-400">Concepto</label>
          <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)} className="input-dark" placeholder="Ej: Pago de honorarios, consulta, cuota..." />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Desglose de montos</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-sm text-gray-400">Monto total (bruto)</label>
              <input type="number" value={montoTotal} onChange={e => setMontoTotal(e.target.value)} className="input-dark" min="0" placeholder="0" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-gray-400">Comision captadora</label>
              <input type="number" value={comision} onChange={e => setComision(e.target.value)} className="input-dark" min="0" placeholder="0" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-gray-400">Neto CJ NOA</label>
              <input type="number" value={montoCjNoa} onChange={e => setMontoCjNoa(e.target.value)} className="input-dark" min="0" placeholder={String(netoAutoCalc)} />
              <p className="mt-1 text-[10px] text-gray-500">Autocalculado: bruto - comision</p>
            </div>
          </div>
          {montoTotalNum > 0 && (
            <div className="flex gap-4 text-xs text-gray-400 pt-1">
              <span>Bruto: <span className="text-white font-semibold">{formatMoney(montoTotalNum)}</span></span>
              <span>Comision: <span className="text-amber-300 font-semibold">{formatMoney(comisionNum)}</span></span>
              <span>Neto: <span className="text-emerald-300 font-semibold">{formatMoney(netoFinal)}</span></span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Captadora / fuente</label>
            <input type="text" value={captadora} onChange={e => setCaptadora(e.target.value)} className="input-dark" placeholder="Nombre de la captadora (opcional)" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Modalidad</label>
            <select value={modalidad} onChange={e => setModalidad(e.target.value)} className="select-dark">
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-gray-400">Notas / observaciones</label>
          <input type="text" value={notas} onChange={e => setNotas(e.target.value)} className="input-dark" placeholder="Detalle adicional (opcional)" />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleSave} disabled={saving || montoTotalNum <= 0} className="btn-primary flex-1">
            {saving ? 'Guardando...' : 'Registrar ingreso'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
