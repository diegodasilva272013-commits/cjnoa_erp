import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download, FileSpreadsheet, Plus, Sigma, Users, FileText, Rows3, Rows4 } from 'lucide-react';
import { useEgresos } from '../hooks/useFinances';
import { CONCEPTOS_EGRESO, CategoriaEgreso } from '../types/database';
import { useSocios } from '../hooks/useSocios';
import Modal from '../components/Modal';
import FinanceImportModal from '../components/finance/FinanceImportModal';
import { FinanceBars, FinanceDonut, FinanceLineChart, FinanceVerticalBars } from '../components/finance/FinanceCharts';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { exportToExcel } from '../lib/exportExcel';
import { exportToPdf } from '../lib/exportPdf';
import { buildExpenseOverview, getExpenseCategory } from '../lib/financeAnalytics';
import { formatMoney, pctChange } from '../lib/financeFormat';
import { usePerfilMap } from '../hooks/usePerfiles';

export default function Egresos() {
  const { egresos, egresosCombinados, loading, refetch } = useEgresos();
  const socios = useSocios();
  const perfilMap = usePerfilMap();
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  function usePersistedFilter(key: string, fallback = '') {
    const [value, setValue] = useState(() => {
      try { return sessionStorage.getItem(`egresos_${key}`) || fallback; } catch { return fallback; }
    });
    const set = (v: string) => { setValue(v); try { sessionStorage.setItem(`egresos_${key}`, v); } catch {} };
    return [value, set] as const;
  }

  const [filtroFechaDesde, setFiltroFechaDesde] = usePersistedFilter('desde');
  const [filtroFechaHasta, setFiltroFechaHasta] = usePersistedFilter('hasta');
  const [filtroConcepto, setFiltroConcepto] = usePersistedFilter('concepto');
  const [filtroResponsable, setFiltroResponsable] = usePersistedFilter('responsable');
  const [filtroModalidad, setFiltroModalidad] = usePersistedFilter('modalidad');
  const [page, setPage] = useState(0);
  const [compact, setCompact] = useState(() => sessionStorage.getItem('egresos_compact') === '1');
  const pageSize = 50;

  const categoryOptions = useMemo(
    () => Array.from(new Set(egresosCombinados.map(item => getExpenseCategory(item.concepto)))).sort(),
    [egresosCombinados],
  );

  const responsableOptions = useMemo(
    () => Array.from(new Set(egresosCombinados.map(item => item.responsable).filter(Boolean) as string[])).sort(),
    [egresosCombinados],
  );

  const filtered = useMemo(() => egresosCombinados.filter(egreso => {
    if (filtroFechaDesde && egreso.fecha < filtroFechaDesde) return false;
    if (filtroFechaHasta && egreso.fecha > filtroFechaHasta) return false;
    if (filtroConcepto && getExpenseCategory(egreso.concepto) !== filtroConcepto) return false;
    if (filtroResponsable && egreso.responsable !== filtroResponsable) return false;
    if (filtroModalidad && egreso.modalidad !== filtroModalidad) return false;
    return true;
  }), [egresosCombinados, filtroConcepto, filtroFechaDesde, filtroFechaHasta, filtroModalidad, filtroResponsable]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [filtroConcepto, filtroFechaDesde, filtroFechaHasta, filtroModalidad, filtroResponsable]);

  const analytics = useMemo(() => buildExpenseOverview(filtered, 6), [filtered]);

  const changes = useMemo(() => {
    const s = analytics.monthlySeries;
    if (s.length < 2) return { total: null, operativo: null, casos: null };
    const cur = s[s.length - 1];
    const prev = s[s.length - 2];
    return {
      total: pctChange(cur.net, prev.net),
      operativo: pctChange(cur.income, prev.income),
      casos: pctChange(cur.expense, prev.expense),
    };
  }, [analytics.monthlySeries]);

  function handleExportEgresos() {
    const data = filtered.map(item => ({
      Fecha: item.fecha,
      Origen: item.source === 'caso' ? 'Gasto del caso' : 'Operativo',
      Categoria: getExpenseCategory(item.concepto),
      Concepto: item.concepto,
      Detalle: item.concepto_detalle || '',
      Cliente: item.cliente_nombre || '',
      Monto: item.monto,
      Modalidad: item.modalidad || '',
      Responsable: item.responsable || '',
      Observaciones: item.observaciones || '',
    }));
    exportToExcel(data, 'Egresos_CJ_NOA', 'Egresos');
  }

  function handleExportPdf() {
    exportToPdf({
      title: 'Reporte de Egresos — CJ NOA',
      columns: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'origen', label: 'Origen' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'detalle', label: 'Detalle' },
        { key: 'monto', label: 'Monto', align: 'right' },
      ],
      rows: filtered.map(e => ({
        fecha: e.fecha,
        origen: e.source === 'caso' ? 'Caso' : 'Operativo',
        concepto: e.concepto,
        detalle: e.concepto_detalle || '',
        monto: formatMoney(e.monto || 0),
      })),
      summary: [
        { label: 'Total Registros', value: String(filtered.length) },
        { label: 'Total Egresos', value: formatMoney(analytics.totals.total) },
      ],
    });
  }

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
          <h1 className="text-2xl font-bold text-white">Egresos</h1>
          <p className="mt-1 text-sm text-gray-500">Vista consolidada de gastos operativos y gastos de caso dentro del mismo modelo financiero</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleExportEgresos} className="btn-secondary flex items-center gap-2">
            <Download className="h-4 w-4" />
            Exportar Excel
          </button>
          <button onClick={handleExportPdf} className="btn-secondary flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Exportar PDF
          </button>
          <button onClick={() => setImportModalOpen(true)} className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Importar Excel
          </button>
          <button onClick={() => setModalOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Nuevo egreso
          </button>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <label className="text-xs text-gray-500">Desde</label>
            <input type="date" value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)} className="input-dark mt-1 text-sm py-2" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Hasta</label>
            <input type="date" value={filtroFechaHasta} onChange={e => setFiltroFechaHasta(e.target.value)} className="input-dark mt-1 text-sm py-2" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Categoria</label>
            <select value={filtroConcepto} onChange={e => setFiltroConcepto(e.target.value)} className="select-dark mt-1 text-sm py-2">
              <option value="">Todas</option>
              {categoryOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Responsable</label>
            <select value={filtroResponsable} onChange={e => setFiltroResponsable(e.target.value)} className="select-dark mt-1 text-sm py-2">
              <option value="">Todos</option>
              {responsableOptions.map(responsable => <option key={responsable} value={responsable}>{responsable}</option>)}
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total egresos" value={formatMoney(analytics.totals.total)} tone="rose" index={0} change={changes.total} />
        <KpiCard label="Operativos" value={formatMoney(analytics.totals.operativo)} tone="amber" index={1} change={changes.operativo} />
        <KpiCard label="Gastos de caso" value={formatMoney(analytics.totals.casos)} tone="sky" index={2} change={changes.casos} />
        <KpiCard label="Ticket promedio" value={formatMoney(analytics.totals.averageTicket)} tone="cyan" index={3} />
        <KpiCard label="Mayor egreso" value={formatMoney(analytics.totals.highestExpense)} tone="slate" index={4} />
      </div>

      {/* Distribucion de egresos por responsable (calculado) */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users className="h-4 w-4 text-rose-300" />
          Egresos por responsable (calculado)
        </div>
        <div className="mt-1 text-xs text-gray-500">Calculado desde los egresos operativos y gastos de caso cargados en el sistema.</div>
        <div className="mt-4 grid gap-4 xl:grid-cols-4">
          {[...socios, 'CJ NOA'].map((resp, i) => {
            const respEgresos = filtered.filter(e => e.responsable === resp);
            const total = respEgresos.reduce((s, e) => s + Number(e.monto || 0), 0);
            const operativo = respEgresos.filter(e => e.source === 'operativo').reduce((s, e) => s + Number(e.monto || 0), 0);
            const caso = respEgresos.filter(e => e.source === 'caso').reduce((s, e) => s + Number(e.monto || 0), 0);
            const participacion = analytics.totals.total > 0 ? (total / analytics.totals.total * 100).toFixed(1) : '0.0';
            const categorias = new Set(respEgresos.map(e => getExpenseCategory(e.concepto))).size;
            if (total === 0 && respEgresos.length === 0) return null;
            return (
              <div key={resp} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 hover-lift animate-slide-up transition-all duration-300 hover:border-white/15" style={{ animationDelay: `${i * 100}ms` }}>
                <p className="text-sm font-semibold text-white">{resp}</p>
                <div className="mt-3 space-y-1.5 text-sm text-gray-300">
                  <div className="flex justify-between"><span>Total</span><span className="font-semibold text-rose-300">{formatMoney(total)}</span></div>
                  <div className="flex justify-between"><span>Operativos</span><span className="font-semibold text-amber-300">{formatMoney(operativo)}</span></div>
                  <div className="flex justify-between"><span>Casos</span><span className="font-semibold text-sky-300">{formatMoney(caso)}</span></div>
                  <div className="flex justify-between"><span>Participacion</span><span className="font-semibold text-white">{participacion}%</span></div>
                  <div className="flex justify-between"><span>Categorias</span><span className="font-semibold text-gray-400">{categorias}</span></div>
                  <div className="flex justify-between"><span>Registros</span><span className="font-semibold text-gray-400">{respEgresos.length}</span></div>
                </div>
              </div>
            );
          })}
          {(() => {
            const sinResp = filtered.filter(e => !e.responsable || (e.responsable !== 'Rodrigo' && e.responsable !== 'Noelia' && e.responsable !== 'Fabricio' && e.responsable !== 'Alejandro' && e.responsable !== 'CJ NOA'));
            const total = sinResp.reduce((s, e) => s + Number(e.monto || 0), 0);
            if (total === 0) return null;
            return (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">Gastos de caso</p>
                <div className="mt-3 space-y-1.5 text-sm text-gray-300">
                  <div className="flex justify-between"><span>Total</span><span className="font-semibold text-rose-300">{formatMoney(total)}</span></div>
                  <div className="flex justify-between"><span>Registros</span><span className="font-semibold text-gray-400">{sinResp.length}</span></div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Sigma className="h-4 w-4 text-amber-300" />
            Formulas del modelo de egresos
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <FormulaBox title="Total" description="El gasto consolidado suma operativos y gastos imputados a casos." value={`${formatMoney(analytics.totals.operativo)} + ${formatMoney(analytics.totals.casos)}`} />
            <FormulaBox title="Peso de casos" description="Participacion de gastos judiciales sobre el total del egreso." value={`${analytics.totals.caseShare.toFixed(1)}% del total`} />
            <FormulaBox title="Registro mas alto" description="Mayor impacto individual encontrado en el periodo filtrado." value={formatMoney(analytics.totals.highestExpense)} />
          </div>
        </div>

        <div className="glass-card p-5">
          <p className="text-sm font-semibold text-white">Resumen ejecutivo</p>
          <div className="mt-4 space-y-3 text-sm text-gray-300">
            <InsightRow label="Categoria principal" value={analytics.categoryBreakdown[0]?.label || 'Sin datos'} />
            <InsightRow label="Responsable principal" value={analytics.responsibleBreakdown[0]?.label || 'Sin asignar'} />
            <InsightRow label="Participacion gastos caso" value={`${analytics.totals.caseShare.toFixed(1)}%`} />
            <InsightRow label="Registros consolidados" value={String(analytics.totals.records)} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FinanceLineChart
          title="Evolucion de egresos"
          subtitle="Comparacion entre gastos operativos, gastos de caso y total mensual"
          series={analytics.monthlySeries}
          labels={{ income: 'Operativos', expense: 'Casos', net: 'Total' }}
        />
        <FinanceDonut title="Origen del egreso" subtitle="Peso relativo entre estructura operativa y casos" data={analytics.sourceBreakdown} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FinanceVerticalBars title="Categorias de egreso" subtitle="Rubros con mayor impacto en el periodo filtrado" data={analytics.categoryBreakdown} height={220} />
        <FinanceBars title="Responsables / origen" subtitle="Quien concentra mayor volumen de gasto" data={analytics.responsibleBreakdown} />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-end px-5 py-2 border-b border-white/[0.04]">
          <button
            onClick={() => { const v = !compact; setCompact(v); sessionStorage.setItem('egresos_compact', v ? '1' : '0'); }}
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
                <th className={`${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500`}>Origen</th>
                <th className={`${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500`}>Concepto</th>
                <th className={`hidden ${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500 lg:table-cell`}>Cliente / caso</th>
                <th className={`${compact ? 'px-3 py-2' : 'px-5 py-3'} text-right text-xs font-medium uppercase text-gray-500`}>Monto</th>
                <th className={`hidden ${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500 md:table-cell`}>Responsable</th>
                <th className={`hidden ${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500 lg:table-cell`}>Modalidad</th>
                <th className={`hidden ${compact ? 'px-3 py-2' : 'px-5 py-3'} text-left text-xs font-medium uppercase text-gray-500 md:table-cell`}>Cargado por</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(page * pageSize, (page + 1) * pageSize).map((egreso, i) => {
                const cp = compact ? 'px-3 py-1.5' : 'px-5 py-3';
                return (
                <tr key={egreso.id} className="table-row row-enter" style={{ animationDelay: `${Math.min(i, 15) * 30}ms` }}>
                  <td className={`${cp} text-sm text-gray-300`}>{format(new Date(egreso.fecha), 'dd MMM yyyy', { locale: es })}</td>
                  <td className={cp}>
                    <span className={`badge ${egreso.source === 'caso' ? 'badge-blue' : 'badge-red'}`}>
                      {egreso.source === 'caso' ? 'Caso' : 'Operativo'}
                    </span>
                  </td>
                  <td className={cp}>
                    <span className="text-sm text-white">{egreso.concepto}</span>
                    {egreso.concepto_detalle && <span className="block text-xs text-gray-500">{egreso.concepto_detalle}</span>}
                  </td>
                  <td className={`hidden ${cp} text-sm text-gray-400 lg:table-cell`}>{egreso.cliente_nombre || '-'}</td>
                  <td className={`${cp} text-right`}>
                    <span className="text-sm font-medium text-rose-400">{formatMoney(egreso.monto)}</span>
                  </td>
                  <td className={`hidden ${cp} text-sm text-gray-400 md:table-cell`}>{egreso.responsable || 'Caso'}</td>
                  <td className={`hidden ${cp} lg:table-cell`}>
                    <span className={`badge ${egreso.modalidad === 'Efectivo' ? 'badge-green' : 'badge-blue'}`}>
                      {egreso.modalidad || 'Sin definir'}
                    </span>
                  </td>
                  <td className={`hidden ${cp} md:table-cell`}>
                    <div className="text-xs">
                      <span className="text-violet-300 font-medium">{egreso.created_by ? perfilMap.get(egreso.created_by) || 'Usuario' : 'Importación'}</span>
                      <span className="block text-gray-500 mt-0.5">{format(new Date(egreso.created_at), 'dd/MM/yy HH:mm', { locale: es })}</span>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-white/5 bg-white/[0.02] px-5 py-4">
          <div className="flex flex-wrap justify-end gap-6 text-sm">
            <div>
              <span className="text-gray-500">Operativos:</span>{' '}
              <span className="font-semibold text-amber-300">{formatMoney(analytics.totals.operativo)}</span>
            </div>
            <div>
              <span className="text-gray-500">Gastos caso:</span>{' '}
              <span className="font-semibold text-sky-300">{formatMoney(analytics.totals.casos)}</span>
            </div>
            <div>
              <span className="text-gray-500">Total:</span>{' '}
              <span className="font-semibold text-rose-400">{formatMoney(analytics.totals.total)}</span>
            </div>
          </div>
        </div>

        {filtered.length > pageSize && (
          <div className="border-t border-white/5 bg-white/[0.02] px-5 py-3 flex items-center justify-between">
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

      <EgresoModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={refetch} />
      <FinanceImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        target="egresos"
        existingEgresos={egresos}
        onImported={async () => { await refetch(); }}
      />
    </div>
  );
}

function KpiCard({ label, value, tone, change, index = 0 }: { label: string; value: string; tone: 'rose' | 'amber' | 'sky' | 'cyan' | 'slate'; change?: number | null; index?: number }) {
  const accents: Record<string, string> = {
    rose: 'from-rose-400 to-rose-600',
    amber: 'from-amber-400 to-amber-600',
    sky: 'from-sky-400 to-sky-600',
    cyan: 'from-cyan-400 to-cyan-600',
    slate: 'from-gray-400 to-gray-600',
  };
  const valueTones: Record<string, string> = {
    rose: 'text-rose-300',
    amber: 'text-amber-300',
    sky: 'text-sky-300',
    cyan: 'text-cyan-300',
    slate: 'text-white',
  };

  return (
    <div className="stat-card hover-lift animate-slide-up" style={{ animationDelay: `${index * 80}ms` }}>
      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${accents[tone]}`} />
      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500 font-medium">{label}</p>
      <p className={`mt-3 text-2xl font-bold count-up ${valueTones[tone]}`}>{value}</p>
      {change != null && (
        <p className={`mt-1.5 text-[11px] font-medium ${change <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {change <= 0 ? '▼' : '▲'} {Math.abs(change).toFixed(1)}% vs mes anterior
        </p>
      )}
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

function EgresoModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const socios = useSocios();
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [categoria, setCategoria] = useState<CategoriaEgreso>('Sueldos');
  const [subcategoria, setSubcategoria] = useState('');
  const [conceptoLibre, setConceptoLibre] = useState('');
  const [casoDesc, setCasoDesc] = useState('');
  const [monto, setMonto] = useState('');
  const [modalidad, setModalidad] = useState('Efectivo');
  const [responsable, setResponsable] = useState(socios[0] || '');
  const [observaciones, setObservaciones] = useState('');
  const [saving, setSaving] = useState(false);

  const subcategorias = CONCEPTOS_EGRESO[categoria] || [];

  let conceptoFinal: string = categoria;
  if (subcategoria) conceptoFinal = `${categoria}: ${subcategoria}`;
  else if (categoria === 'Otro') conceptoFinal = conceptoLibre || 'Otro';

  async function handleSave() {
    setSaving(true);
    try {
      await supabase.from('egresos').insert({
        fecha,
        concepto: conceptoFinal,
        concepto_detalle: categoria === 'Gastos Judiciales' ? casoDesc : (categoria === 'Otro' ? conceptoLibre : null),
        monto: parseFloat(monto) || 0,
        modalidad,
        responsable,
        observaciones: observaciones || null,
      });
      showToast('Egreso registrado');
      onSaved();
      onClose();
    } catch (error: any) {
      showToast(error.message || 'Error al registrar egreso', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo egreso" maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-gray-400">Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input-dark" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-gray-400">Concepto</label>
          <select value={categoria} onChange={e => { setCategoria(e.target.value as CategoriaEgreso); setSubcategoria(''); }} className="select-dark">
            {Object.keys(CONCEPTOS_EGRESO).map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        {subcategorias.length > 0 && (
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Detalle</label>
            <select value={subcategoria} onChange={e => setSubcategoria(e.target.value)} className="select-dark">
              <option value="">Seleccionar...</option>
              {subcategorias.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        )}

        {categoria === 'Gastos Judiciales' && (
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Descripcion del caso</label>
            <input type="text" value={casoDesc} onChange={e => setCasoDesc(e.target.value)} className="input-dark" placeholder="Referencia del caso" />
          </div>
        )}

        {categoria === 'Otro' && (
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Describir concepto</label>
            <input type="text" value={conceptoLibre} onChange={e => setConceptoLibre(e.target.value)} className="input-dark" placeholder="Concepto del egreso" />
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm text-gray-400">Monto</label>
          <input type="number" value={monto} onChange={e => setMonto(e.target.value)} className="input-dark" min="0" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Modalidad</label>
            <select value={modalidad} onChange={e => setModalidad(e.target.value)} className="select-dark">
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-gray-400">Responsable</label>
            <select value={responsable} onChange={e => setResponsable(e.target.value)} className="select-dark">
              {[...socios, 'CJ NOA'].map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-gray-400">Observaciones</label>
          <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)} className="input-dark" />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Guardando...' : 'Registrar egreso'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
