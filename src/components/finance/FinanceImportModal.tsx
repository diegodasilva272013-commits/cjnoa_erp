import { useMemo, useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, WandSparkles } from 'lucide-react';
import Modal from '../Modal';
import { supabase } from '../../lib/supabase';
import {
  buildEgresoImportKey,
  buildIngresoImportKey,
  parseFinanceWorkbook,
  type ImportedEgresoRow,
  type ImportedIngresoRow,
  type ParsedFinanceWorkbook,
} from '../../lib/financeImport';
import type { Egreso, Ingreso } from '../../types/database';
import { useToast } from '../../context/ToastContext';

const DEFAULT_FINANCE_WORKBOOK = '/Copia de 2026 INGRESOS Y GASTOS.XLS.xlsx';
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type FinanceImportScope = 'ingresos' | 'egresos' | 'todos';

interface FinanceImportModalProps {
  open: boolean;
  onClose: () => void;
  target?: FinanceImportScope;
  existingIngresos?: Ingreso[];
  existingEgresos?: Egreso[];
  onImported: () => Promise<void> | void;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function uniqueRows<T extends { dedupeKey: string }>(rows: T[], existingKeys: Set<string>) {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (existingKeys.has(row.dedupeKey)) return false;
    if (seen.has(row.dedupeKey)) return false;
    seen.add(row.dedupeKey);
    return true;
  });
}

export default function FinanceImportModal({
  open,
  onClose,
  target = 'todos',
  existingIngresos = [],
  existingEgresos = [],
  onImported,
}: FinanceImportModalProps) {
  const { showToast } = useToast();
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [workbook, setWorkbook] = useState<ParsedFinanceWorkbook | null>(null);

  const existingIngresoKeys = useMemo(
    () => new Set(existingIngresos.map(item => buildIngresoImportKey({
      fecha: item.fecha,
      cliente_nombre: item.cliente_nombre,
      materia: item.materia,
      concepto: item.concepto || 'Importado desde Excel',
      monto_total: Number(item.monto_total || 0),
      monto_cj_noa: Number(item.monto_cj_noa || 0),
      comision_captadora: Number(item.comision_captadora || 0),
      captadora_nombre: item.captadora_nombre,
      socio_cobro: item.socio_cobro,
      modalidad: item.modalidad,
      notas: item.notas,
      es_manual: item.es_manual,
    }))),
    [existingIngresos],
  );

  const existingEgresoKeys = useMemo(
    () => new Set(existingEgresos.map(item => buildEgresoImportKey({
      fecha: item.fecha,
      concepto: item.concepto,
      concepto_detalle: item.concepto_detalle,
      monto: Number(item.monto || 0),
      modalidad: item.modalidad,
      responsable: item.responsable,
      observaciones: item.observaciones,
    }))),
    [existingEgresos],
  );

  const parsedIngresos = useMemo(() => {
    if (!workbook || target === 'egresos') return [] as ImportedIngresoRow[];
    return uniqueRows(workbook.ingresos, existingIngresoKeys);
  }, [existingIngresoKeys, target, workbook]);

  const parsedEgresos = useMemo(() => {
    if (!workbook || target === 'ingresos') return [] as ImportedEgresoRow[];
    return uniqueRows(workbook.egresos, existingEgresoKeys);
  }, [existingEgresoKeys, target, workbook]);

  const hasImportableData = Boolean(workbook) && (parsedIngresos.length > 0 || parsedEgresos.length > 0 || (workbook?.monthlySummaries.length || 0) > 0);

  function getImportPayload(parsed: ParsedFinanceWorkbook) {
    const ingresos = target === 'egresos' ? [] : uniqueRows(parsed.ingresos, existingIngresoKeys);
    const egresos = target === 'ingresos' ? [] : uniqueRows(parsed.egresos, existingEgresoKeys);

    return {
      ingresos,
      egresos,
      summaries: parsed.monthlySummaries,
      hasData: ingresos.length > 0 || egresos.length > 0 || parsed.monthlySummaries.length > 0,
    };
  }

  async function loadWorkbook(file: File) {
    setReading(true);
    try {
      const parsed = await parseFinanceWorkbook(file);
      setWorkbook(parsed);
      if (parsed.ingresos.length === 0 && parsed.egresos.length === 0 && parsed.monthlySummaries.length === 0) {
        showToast('No detecte filas financieras validas en ese archivo.', 'error');
      }
    } catch (error: any) {
      showToast(error.message || 'No se pudo leer el Excel.', 'error');
    } finally {
      setReading(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast(`El archivo supera el limite de ${MAX_FILE_SIZE_MB} MB.`, 'error');
      event.target.value = '';
      return;
    }

    await loadWorkbook(file);
    event.target.value = '';
  }

  async function handleDefaultWorkbookLoad() {
    try {
      const response = await fetch(encodeURI(DEFAULT_FINANCE_WORKBOOK));
      if (!response.ok) throw new Error('No se encontro la planilla base en public.');
      const blob = await response.blob();
      const file = new File([blob], 'Copia de 2026 INGRESOS Y GASTOS.XLS.xlsx', { type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      await loadWorkbook(file);
    } catch (error: any) {
      showToast(error.message || 'No se pudo cargar la planilla base.', 'error');
    }
  }

  async function importRows(table: 'ingresos' | 'egresos', rows: unknown[], onProgress: (done: number, total: number) => void) {
    const batches = chunkArray(rows, 150);
    let done = 0;
    for (const batch of batches) {
      const { error } = await supabase.from(table).insert(batch);
      if (error) throw error;
      done += batch.length;
      onProgress(done, rows.length);
    }
  }

  async function importMonthlySummaries(parsed: ParsedFinanceWorkbook) {
    if (parsed.monthlySummaries.length === 0) return;

    const rows = parsed.monthlySummaries.map(summary => ({
      periodo: summary.period,
      hoja: summary.sheetName,
      metricas: summary.metrics,
      formulas: summary.formulas,
    }));

    const { error } = await supabase.from('finanzas_excel_resumenes').upsert(rows, { onConflict: 'periodo' });
    if (error) throw error;
  }

  async function runImport(parsed: ParsedFinanceWorkbook) {
    const payload = getImportPayload(parsed);

    if (!payload.hasData) {
      showToast('No hay filas nuevas para importar.', 'info');
      return;
    }

    setImporting(true);
    setImportProgress(0);
    try {
      const totalRows = payload.ingresos.length + payload.egresos.length;
      let importedSoFar = 0;

      if (payload.ingresos.length > 0) {
        await importRows('ingresos', payload.ingresos.map(item => item.record), (done) => {
          importedSoFar = done;
          setImportProgress(totalRows > 0 ? Math.round((importedSoFar / totalRows) * 100) : 0);
        });
        importedSoFar = payload.ingresos.length;
      }
      if (payload.egresos.length > 0) {
        await importRows('egresos', payload.egresos.map(item => item.record), (done) => {
          setImportProgress(totalRows > 0 ? Math.round(((importedSoFar + done) / totalRows) * 100) : 0);
        });
      }
      await importMonthlySummaries(parsed);
      await onImported();
      showToast(`Importacion completa: ${payload.ingresos.length} ingresos, ${payload.egresos.length} egresos y ${payload.summaries.length} resumenes mensuales.`, 'success');
      setWorkbook(null);
      onClose();
    } catch (error: any) {
      showToast(error.message || 'No se pudo importar el archivo.', 'error');
    } finally {
      setImporting(false);
    }
  }

  async function handleDirectBaseImport() {
    try {
      setReading(true);
      const response = await fetch(encodeURI(DEFAULT_FINANCE_WORKBOOK));
      if (!response.ok) throw new Error('No se encontro la planilla base en public.');
      const blob = await response.blob();
      const file = new File([blob], 'Copia de 2026 INGRESOS Y GASTOS.XLS.xlsx', { type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const parsed = await parseFinanceWorkbook(file);
      await runImport(parsed);
    } catch (error: any) {
      showToast(error.message || 'No se pudo importar la planilla base.', 'error');
    } finally {
      setReading(false);
    }
  }

  async function handleImport() {
    if (!workbook) return;
    await runImport(workbook);
  }

  const totalFormulas = workbook?.sheets.reduce((sum, sheet) => sum + sheet.formulaCount, 0) || 0;
  const title = target === 'ingresos' ? 'Importar ingresos desde Excel' : target === 'egresos' ? 'Importar egresos desde Excel' : 'Importar planilla financiera';
  const subtitle = target === 'todos'
    ? 'Lee el libro completo, usa valores calculados y separa ingresos y egresos automaticamente'
    : 'Lee formulas guardadas, muestra vista previa y evita duplicados';

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} maxWidth="max-w-6xl">
      <div className="space-y-5">
        <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.08),_transparent_55%),linear-gradient(135deg,_rgba(255,255,255,0.05),_rgba(255,255,255,0.02))] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Carga integral de planillas financieras</p>
              <p className="mt-1 max-w-3xl text-sm text-gray-400">
                El importador revisa cada hoja del workbook, detecta formulas, toma el valor visible ya calculado y lo lleva al modelo financiero del ERP.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleDirectBaseImport} disabled={reading || importing} className="inline-flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm font-medium text-sky-100 hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60">
                <CheckCircle2 className="h-4 w-4" />
                Cargar todo ahora
              </button>
              <button type="button" onClick={handleDefaultWorkbookLoad} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15">
                <FileSpreadsheet className="h-4 w-4" />
                Cargar planilla base
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white hover:bg-white/10">
                <Upload className="h-4 w-4" />
                Seleccionar Excel
                <input type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
          </div>

          {workbook && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {workbook.fileName}
            </div>
          )}
        </div>

        {reading && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Leyendo hojas, encabezados y formulas del archivo...
          </div>
        )}

        {workbook && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard label="Archivo" value={workbook.fileName} accent="text-sky-300" compact />
              <MetricCard label="Hojas detectadas" value={String(workbook.sheets.length)} accent="text-violet-300" />
              <MetricCard label="Formulas leidas" value={String(totalFormulas)} accent="text-amber-300" />
              <MetricCard label="Filas nuevas" value={String(parsedIngresos.length + parsedEgresos.length)} accent="text-emerald-300" />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <WandSparkles className="h-4 w-4 text-amber-300" />
                  Lectura del workbook
                </div>
                <div className="mt-4 space-y-3">
                  {workbook.sheets.map(sheet => (
                    <div key={sheet.name} className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{sheet.name}</p>
                          <p className="text-xs text-gray-500">{sheet.rowCount} filas · {sheet.formulaCount} formulas</p>
                        </div>
                        <span className={`badge ${sheet.target === 'ingresos' ? 'badge-green' : sheet.target === 'egresos' ? 'badge-red' : sheet.target === 'mixto' ? 'badge-blue' : 'badge-yellow'}`}>
                          {sheet.target}
                        </span>
                      </div>
                      {sheet.headers.length > 0 && (
                        <p className="mt-3 text-xs text-gray-400">Columnas: {sheet.headers.filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    Resultado de importacion
                  </div>
                  <div className="mt-4 space-y-3 text-sm text-gray-300">
                    <SummaryLine label="Ingresos detectados" value={workbook.ingresos.length} />
                    <SummaryLine label="Ingresos nuevos" value={parsedIngresos.length} />
                    <SummaryLine label="Egresos detectados" value={workbook.egresos.length} />
                    <SummaryLine label="Egresos nuevos" value={parsedEgresos.length} />
                    <SummaryLine label="Resumenes mensuales" value={workbook.monthlySummaries.length} />
                  </div>
                  <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-200">
                    Se usa el valor calculado que el Excel trae guardado. Si la planilla tiene formulas, el ERP toma ese resultado y no la formula como texto.
                  </div>
                </div>

                {workbook.warnings.length > 0 && (
                  <div className="glass-card p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <AlertTriangle className="h-4 w-4 text-yellow-300" />
                      Avisos de lectura
                    </div>
                    <div className="mt-4 space-y-2 text-xs text-gray-400">
                      {workbook.warnings.slice(0, 8).map(warning => (
                        <p key={warning} className="rounded-lg bg-white/[0.03] px-3 py-2">{warning}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <PreviewTable
                title="Vista previa de ingresos"
                rows={parsedIngresos.slice(0, 6).map(item => [
                  item.record.fecha,
                  item.record.cliente_nombre || 'Sin cliente',
                  item.record.concepto,
                  String(item.record.monto_cj_noa),
                ])}
                emptyLabel="No se detectaron ingresos nuevos"
              />
              <PreviewTable
                title="Vista previa de egresos"
                rows={parsedEgresos.slice(0, 6).map(item => [
                  item.record.fecha,
                  item.record.concepto,
                  item.record.concepto_detalle || 'Sin detalle',
                  String(item.record.monto),
                ])}
                emptyLabel="No se detectaron egresos nuevos"
              />
            </div>
          </>
        )}

        {!workbook && !reading && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-gray-500" />
            <p className="mt-3 text-sm font-medium text-white">Todavia no hay archivo cargado</p>
            <p className="mt-1 text-sm text-gray-500">Podes cargar la planilla base del sistema o subir otro Excel para previsualizarlo antes de grabarlo.</p>
          </div>
        )}

        {importing && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between text-sm text-gray-300 mb-2">
              <span>Importando registros...</span>
              <span className="font-semibold text-white">{importProgress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-300" style={{ width: `${importProgress}%` }} />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cerrar</button>
          <button onClick={handleImport} disabled={!workbook || importing || !hasImportableData} className="btn-primary flex-1">
            {importing ? 'Importando...' : 'Importar al modulo financiero'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MetricCard({ label, value, accent, compact = false }: { label: string; value: string; accent: string; compact?: boolean }) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-gray-500">{label}</p>
      <p className={`mt-3 ${compact ? 'text-sm break-all' : 'text-2xl'} font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
      <span>{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function PreviewTable({ title, rows, emptyLabel }: { title: string; rows: string[][]; emptyLabel: string }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="border-b border-white/5 px-5 py-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`} className="table-row">
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${index}-${cellIndex}`} className="px-4 py-3 text-sm text-gray-300">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
