import type { ResponsableFinanza, Socio } from '../types/database';

type ModalidadPago = 'Efectivo' | 'Transferencia' | null;

export type FinanceImportTarget = 'ingresos' | 'egresos' | 'mixto' | 'desconocido';

export interface SheetImportSummary {
  name: string;
  target: FinanceImportTarget;
  rowCount: number;
  formulaCount: number;
  headers: string[];
}

export interface ImportedIngresoRecord {
  fecha: string;
  cliente_nombre: string | null;
  materia: string | null;
  concepto: string;
  monto_total: number;
  monto_cj_noa: number;
  comision_captadora: number;
  captadora_nombre: string | null;
  socio_cobro: string | null;
  modalidad: ModalidadPago;
  notas: string | null;
  es_manual: boolean;
}

export interface ImportedEgresoRecord {
  fecha: string;
  concepto: string;
  concepto_detalle: string | null;
  monto: number;
  modalidad: ModalidadPago;
  responsable: ResponsableFinanza;
  observaciones: string | null;
}

export interface WorkbookFormulaSnapshot {
  formula: string;
  value: string | number | boolean | null;
}

export interface MonthlyWorkbookSummary {
  period: string;
  sheetName: string;
  monthLabel: string;
  metrics: Record<string, unknown>;
  formulas: Record<string, WorkbookFormulaSnapshot>;
}

interface ImportedRowBase<TRecord> {
  target: Exclude<FinanceImportTarget, 'desconocido'>;
  sheetName: string;
  rowNumber: number;
  dedupeKey: string;
  preview: Record<string, string | number | null>;
  record: TRecord;
}

export type ImportedIngresoRow = ImportedRowBase<ImportedIngresoRecord> & { target: 'ingresos' };
export type ImportedEgresoRow = ImportedRowBase<ImportedEgresoRecord> & { target: 'egresos' };

export interface ParsedFinanceWorkbook {
  fileName: string;
  sheets: SheetImportSummary[];
  ingresos: ImportedIngresoRow[];
  egresos: ImportedEgresoRow[];
  monthlySummaries: MonthlyWorkbookSummary[];
  warnings: string[];
}

const ingresoAliases: Record<string, string[]> = {
  fecha: ['fecha', 'dia', 'fecha cobro', 'fecha ingreso', 'fecha pago'],
  cliente: ['cliente', 'cliente nombre', 'nombre', 'nombre cliente'],
  materia: ['materia', 'tipo caso', 'caso'],
  concepto: ['concepto', 'detalle', 'descripcion', 'descripción', 'motivo'],
  montoTotal: ['monto total', 'monto', 'importe', 'ingreso total', 'bruto', 'total'],
  montoCjNoa: ['monto cj noa', 'cj noa', 'neto cj noa', 'monto neto', 'neto'],
  comision: ['comision', 'comisión', 'comision captadora', 'comisión captadora'],
  captadora: ['captadora', 'fuente', 'origen'],
  socio: ['socio', 'socio cobro', 'cobrado por', 'responsable', 'socio que cobro'],
  modalidad: ['modalidad', 'medio de pago', 'forma de pago'],
  notas: ['notas', 'observaciones', 'comentarios'],
};

const egresoAliases: Record<string, string[]> = {
  fecha: ['fecha', 'dia', 'fecha egreso', 'fecha gasto'],
  concepto: ['concepto', 'rubro', 'categoria', 'categoría', 'detalle', 'descripcion', 'descripción'],
  detalle: ['detalle', 'subcategoria', 'subcategoría', 'observacion', 'observación', 'nota', 'notas'],
  monto: ['monto', 'importe', 'egreso', 'gasto', 'total'],
  modalidad: ['modalidad', 'medio de pago', 'forma de pago'],
  responsable: ['responsable', 'pagado por', 'socio', 'autor'],
  observaciones: ['observaciones', 'comentarios', 'notas'],
};

const MONTHLY_INCOME_HEADERS = ['fecha', 'clientes asunto', 'modalidad', 'tipo', 'fuente', 'cliente', 'ingresos caegoria'];

const MONTHLY_PARTNERS: Array<{ index: number; socio: Socio }> = [
  { index: 7, socio: 'Rodrigo' },
  { index: 8, socio: 'Noelia' },
  { index: 9, socio: 'Alejandro' },
  { index: 10, socio: 'Fabricio' },
];

const WORKBOOK_DOCTORS = ['Rodrigo', 'Noelia', 'Alejandro', 'Fabricio'] as const;

const SHEET_MONTHS: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function serializeCellValue(value: unknown): string | number | boolean | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDate(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return normalizeText(value) || null;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseExcelSerialDate(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const utcDays = Math.floor(value - 25569);
  const utcValue = utcDays * 86400;
  const parsed = new Date(utcValue * 1000);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDate(parsed);
}

function parseDateValue(value: unknown): string | null {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value);
  }

  if (typeof value === 'number') {
    return parseExcelSerialDate(value);
  }

  const raw = normalizeText(value);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const slashMatch = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatDate(parsed);

  return null;
}

function parseNumberValue(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const raw = normalizeText(value)
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .replace(/[^0-9,.-]/g, '');

  if (!raw) return null;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;

  if (lastComma > lastDot) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = raw.replace(/,/g, '');
  } else {
    normalized = raw.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseModalidad(value: unknown): ModalidadPago {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;
  if (normalized.includes('transfer')) return 'Transferencia';
  if (normalized.includes('efectivo') || normalized.includes('cash')) return 'Efectivo';
  return null;
}

function getCellSnapshot(sheet: Record<string, any>, address: string) {
  return sheet[address] ?? null;
}

function getCellValue(sheet: Record<string, any>, address: string) {
  return serializeCellValue(getCellSnapshot(sheet, address)?.v);
}

function getCellNumber(sheet: Record<string, any>, address: string) {
  return parseNumberValue(getCellSnapshot(sheet, address)?.v) ?? 0;
}

function extractFormulaSnapshots(sheet: Record<string, any>): Record<string, WorkbookFormulaSnapshot> {
  return Object.keys(sheet)
    .filter(key => !key.startsWith('!') && sheet[key]?.f)
    .sort()
    .reduce<Record<string, WorkbookFormulaSnapshot>>((acc, key) => {
      acc[key] = {
        formula: String(sheet[key].f),
        value: serializeCellValue(sheet[key].v),
      };
      return acc;
    }, {});
}

function buildBreakdownRows(sheet: Record<string, any>, labelColumn: string, dataRowStart: number, dataRowEnd: number) {
  const rows: Array<Record<string, unknown>> = [];

  for (let row = dataRowStart; row <= dataRowEnd; row += 1) {
    const label = normalizeText(getCellValue(sheet, `${labelColumn}${row}`));
    if (!label) continue;

    rows.push({
      label,
      Rodrigo: getCellNumber(sheet, `W${row}`),
      Noelia: getCellNumber(sheet, `X${row}`),
      Alejandro: getCellNumber(sheet, `Y${row}`),
      Fabricio: getCellNumber(sheet, `Z${row}`),
      total: getCellNumber(sheet, `AA${row}`),
      porcentaje: getCellNumber(sheet, `AB${row}`),
    });
  }

  return rows;
}

function resolveMonthlyPeriod(sheetName: string, ingresos: ImportedIngresoRow[], egresos: ImportedEgresoRow[]) {
  const firstDate = ingresos[0]?.record.fecha || egresos[0]?.record.fecha || null;
  if (firstDate) return firstDate.slice(0, 7);

  const normalized = normalizeHeader(sheetName);
  const month = SHEET_MONTHS[normalized];
  if (month) return `${new Date().getFullYear()}-${month}`;
  return `${new Date().getFullYear()}-01`;
}

function extractMonthlyWorkbookSummary(
  sheetName: string,
  sheet: Record<string, any>,
  formulaCount: number,
  ingresos: ImportedIngresoRow[],
  egresos: ImportedEgresoRow[],
): MonthlyWorkbookSummary {
  const period = resolveMonthlyPeriod(sheetName, ingresos, egresos);

  return {
    period,
    sheetName,
    monthLabel: sheetName,
    metrics: {
      period,
      formulasLeidas: formulaCount,
      ingresosDetectados: ingresos.length,
      egresosDetectados: egresos.length,
      totalClientes: getCellNumber(sheet, 'W1'),
      totalIngresos: getCellNumber(sheet, 'O5'),
      totalEgresos: getCellNumber(sheet, 'S4'),
      totalARepartir: getCellNumber(sheet, 'Q7'),
      repartoBasePorPersona: getCellNumber(sheet, 'Q8'),
      reparto65: getCellNumber(sheet, 'S16'),
      reparto35: getCellNumber(sheet, 'S18'),
      ingresoSocios: {
        Rodrigo: getCellNumber(sheet, 'M2'),
        Noelia: getCellNumber(sheet, 'N2'),
        Alejandro: getCellNumber(sheet, 'O2'),
        Fabricio: getCellNumber(sheet, 'P2'),
      },
      metaPersonal: {
        Rodrigo: getCellNumber(sheet, 'M3'),
        Noelia: getCellNumber(sheet, 'N3'),
        Alejandro: getCellNumber(sheet, 'O3'),
        Fabricio: getCellNumber(sheet, 'P3'),
      },
      participacionIngreso: {
        Rodrigo: getCellNumber(sheet, 'M4'),
        Noelia: getCellNumber(sheet, 'N4'),
        Alejandro: getCellNumber(sheet, 'O4'),
        Fabricio: getCellNumber(sheet, 'P4'),
      },
      montoACobrar: {
        Rodrigo: getCellNumber(sheet, 'T19'),
        Noelia: getCellNumber(sheet, 'T20'),
        Alejandro: getCellNumber(sheet, 'T21'),
        Fabricio: getCellNumber(sheet, 'T22'),
      },
      cuentaDoctores: WORKBOOK_DOCTORS.map((doctor, index) => ({
        doctor,
        enCaja: getCellNumber(sheet, `S${11 + index}`),
        transferencias: getCellNumber(sheet, `T${11 + index}`),
        saldo: getCellNumber(sheet, `U${11 + index}`),
      })),
      conteos: {
        tipo: buildBreakdownRows(sheet, 'D', 3, 9),
        fuente: buildBreakdownRows(sheet, 'E', 11, 12),
        cliente: buildBreakdownRows(sheet, 'F', 14, 15),
        categoria: buildBreakdownRows(sheet, 'G', 17, 18),
      },
    },
    formulas: extractFormulaSnapshots(sheet),
  };
}

function parseResponsable(value: unknown): ResponsableFinanza | null {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;
  if (normalized.includes('cj noa')) return 'CJ NOA';
  if (normalized.includes('rodr')) return 'Rodrigo';
  if (normalized.includes('noe') || normalized.includes('noeli')) return 'Noelia';
  if (normalized.includes('ale')) return 'Alejandro';
  if (normalized.includes('fabri')) return 'Fabricio';
  return null;
}

function isMonthlyWorkbookSheet(headerRow: string[]) {
  const normalized = headerRow.map(header => normalizeHeader(header));
  return MONTHLY_INCOME_HEADERS.every((header, index) => normalized[index] === header);
}

function scoreHeaders(headers: string[], aliases: Record<string, string[]>): number {
  return headers.reduce((score, header) => {
    const match = Object.values(aliases).some(values => values.includes(header));
    return score + (match ? 1 : 0);
  }, 0);
}

function detectSheetTarget(sheetName: string, headers: string[]): FinanceImportTarget {
  const normalizedName = normalizeHeader(sheetName);
  const ingresoScore = scoreHeaders(headers, ingresoAliases) + (/ingreso|cobro|entrada/.test(normalizedName) ? 2 : 0);
  const egresoScore = scoreHeaders(headers, egresoAliases) + (/egreso|gasto|salida/.test(normalizedName) ? 2 : 0);

  if (ingresoScore === 0 && egresoScore === 0) return 'desconocido';
  if (ingresoScore === egresoScore) return normalizedName.includes('gasto') ? 'egresos' : 'ingresos';
  return ingresoScore > egresoScore ? 'ingresos' : 'egresos';
}

function getValueByAliases(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const foundKey = Object.keys(row).find(key => normalizeHeader(key) === alias);
    if (foundKey) return row[foundKey];
  }
  return null;
}

function defaultResponsable(value: unknown): ResponsableFinanza {
  return parseResponsable(value) ?? 'Rodrigo';
}

export function buildIngresoImportKey(record: ImportedIngresoRecord): string {
  return [
    record.fecha,
    normalizeHeader(record.cliente_nombre),
    normalizeHeader(record.concepto),
    record.monto_total.toFixed(2),
    record.monto_cj_noa.toFixed(2),
    normalizeHeader(record.socio_cobro),
  ].join('|');
}

export function buildEgresoImportKey(record: ImportedEgresoRecord): string {
  return [
    record.fecha,
    normalizeHeader(record.concepto),
    record.monto.toFixed(2),
    normalizeHeader(record.responsable),
  ].join('|');
}

function buildMonthlyIncomeNotes(sheetName: string, fuente: string, clienteTipo: string, extraNotes: string, splitValues: Array<{ socio: Socio; amount: number }>) {
  const notes: string[] = [`Hoja: ${sheetName}`];
  if (fuente) notes.push(`Fuente: ${fuente}`);
  if (clienteTipo) notes.push(`Cliente: ${clienteTipo}`);
  if (splitValues.length > 1) {
    notes.push(`Distribucion: ${splitValues.map(item => `${item.socio} ${item.amount}`).join(', ')}`);
  }
  if (extraNotes) notes.push(extraNotes);
  return notes.join(' | ');
}

function parseMonthlyIngresoRow(row: unknown[], sheetName: string, rowNumber: number): ImportedIngresoRow[] {
  const fecha = parseDateValue(row[0]);
  if (!fecha) return [];

  const splitValues = MONTHLY_PARTNERS
    .map(partner => ({ socio: partner.socio, amount: parseNumberValue(row[partner.index]) ?? 0 }))
    .filter(item => item.amount > 0);

  if (splitValues.length === 0) return [];

  const fuente = normalizeText(row[4]);
  const clienteTipo = normalizeText(row[5]);
  const concepto = normalizeText(row[6]) || 'Ingreso importado';
  const cliente = normalizeText(row[1]) || null;
  const materia = normalizeText(row[3]) || null;
  const modalidad = parseModalidad(row[2]);
  const extraNotes = normalizeText(row[11]);

  // Emit one ingreso per socio share so the per-socio attribution is preserved at the
  // row level. Each share keeps the original notes for auditability.
  return splitValues.map(item => {
    const record: ImportedIngresoRecord = {
      fecha,
      cliente_nombre: cliente,
      materia,
      concepto,
      monto_total: item.amount,
      monto_cj_noa: item.amount,
      comision_captadora: 0,
      captadora_nombre: null,
      socio_cobro: item.socio,
      modalidad,
      notas: buildMonthlyIncomeNotes(sheetName, fuente, clienteTipo, extraNotes, [item]) || null,
      es_manual: false,
    };

    return {
      target: 'ingresos',
      sheetName,
      rowNumber,
      dedupeKey: buildIngresoImportKey(record),
      preview: {
        Fecha: record.fecha,
        Cliente: record.cliente_nombre,
        Concepto: record.concepto,
        Socio: record.socio_cobro,
        'Monto CJ NOA': record.monto_cj_noa,
      },
      record,
    };
  });
}

function parseMonthlyEgresoRow(row: unknown[], sheetName: string, rowNumber: number): ImportedEgresoRow | null {
  const fecha = parseDateValue(row[12]);
  if (!fecha) return null;

  const monto = parseNumberValue(row[17]) ?? parseNumberValue(row[18]);
  if (monto == null || monto <= 0) return null;

  const record: ImportedEgresoRecord = {
    fecha,
    concepto: normalizeText(row[16]) || 'Egreso importado',
    concepto_detalle: normalizeText(row[13]) || null,
    monto,
    modalidad: parseModalidad(row[14]) ?? 'Transferencia',
    responsable: parseResponsable(row[15]) ?? 'CJ NOA',
    observaciones: `Hoja: ${sheetName}`,
  };

  return {
    target: 'egresos',
    sheetName,
    rowNumber,
    dedupeKey: buildEgresoImportKey(record),
    preview: {
      Fecha: record.fecha,
      Concepto: record.concepto,
      Detalle: record.concepto_detalle,
      Monto: record.monto,
      Responsable: record.responsable,
    },
    record,
  };
}

function parseMonthlyWorkbookSheet(sheetName: string, rows: unknown[][], formulaCount: number, sheet: Record<string, any>) {
  const ingresos: ImportedIngresoRow[] = [];
  const egresos: ImportedEgresoRow[] = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const rowNumber = index + 1;

    const ingresoRows = parseMonthlyIngresoRow(row, sheetName, rowNumber);
    ingresoRows.forEach(item => ingresos.push(item));

    const egreso = parseMonthlyEgresoRow(row, sheetName, rowNumber);
    if (egreso) egresos.push(egreso);
  }

  return {
    summary: {
      name: sheetName,
      target: 'mixto' as const,
      rowCount: Math.max(rows.length - 1, 0),
      formulaCount,
      headers: (rows[0] || []).map(cell => normalizeText(cell)),
    },
    ingresos,
    egresos,
    monthlySummary: extractMonthlyWorkbookSummary(sheetName, sheet, formulaCount, ingresos, egresos),
  };
}

function parseIngresoRow(row: Record<string, unknown>, sheetName: string, rowNumber: number): ImportedIngresoRow | null {
  const fecha = parseDateValue(getValueByAliases(row, ingresoAliases.fecha));
  const montoTotal = parseNumberValue(getValueByAliases(row, ingresoAliases.montoTotal));
  const montoCjNoa = parseNumberValue(getValueByAliases(row, ingresoAliases.montoCjNoa));
  const comision = parseNumberValue(getValueByAliases(row, ingresoAliases.comision)) ?? 0;

  if (!fecha || montoTotal == null) return null;

  const record: ImportedIngresoRecord = {
    fecha,
    cliente_nombre: normalizeText(getValueByAliases(row, ingresoAliases.cliente)) || null,
    materia: normalizeText(getValueByAliases(row, ingresoAliases.materia)) || null,
    concepto: normalizeText(getValueByAliases(row, ingresoAliases.concepto)) || 'Importado desde Excel',
    monto_total: montoTotal,
    monto_cj_noa: montoCjNoa ?? Math.max(montoTotal - comision, 0),
    comision_captadora: comision,
    captadora_nombre: normalizeText(getValueByAliases(row, ingresoAliases.captadora)) || null,
    socio_cobro: normalizeText(getValueByAliases(row, ingresoAliases.socio)) || null,
    modalidad: parseModalidad(getValueByAliases(row, ingresoAliases.modalidad)),
    notas: normalizeText(getValueByAliases(row, ingresoAliases.notas)) || null,
    es_manual: false,
  };

  return {
    target: 'ingresos',
    sheetName,
    rowNumber,
    dedupeKey: buildIngresoImportKey(record),
    preview: {
      Fecha: record.fecha,
      Cliente: record.cliente_nombre,
      Concepto: record.concepto,
      'Monto Total': record.monto_total,
      'Monto CJ NOA': record.monto_cj_noa,
    },
    record,
  };
}

function parseEgresoRow(row: Record<string, unknown>, sheetName: string, rowNumber: number): ImportedEgresoRow | null {
  const fecha = parseDateValue(getValueByAliases(row, egresoAliases.fecha));
  const monto = parseNumberValue(getValueByAliases(row, egresoAliases.monto));

  if (!fecha || monto == null) return null;

  const record: ImportedEgresoRecord = {
    fecha,
    concepto: normalizeText(getValueByAliases(row, egresoAliases.concepto)) || 'Egreso importado',
    concepto_detalle: normalizeText(getValueByAliases(row, egresoAliases.detalle)) || null,
    monto,
    modalidad: parseModalidad(getValueByAliases(row, egresoAliases.modalidad)) ?? 'Transferencia',
    responsable: defaultResponsable(getValueByAliases(row, egresoAliases.responsable)),
    observaciones: normalizeText(getValueByAliases(row, egresoAliases.observaciones)) || null,
  };

  return {
    target: 'egresos',
    sheetName,
    rowNumber,
    dedupeKey: buildEgresoImportKey(record),
    preview: {
      Fecha: record.fecha,
      Concepto: record.concepto,
      Detalle: record.concepto_detalle,
      Monto: record.monto,
      Responsable: record.responsable,
    },
    record,
  };
}

function countFormulas(sheet: Record<string, any>): number {
  return Object.keys(sheet).reduce((total, key) => {
    if (key.startsWith('!')) return total;
    return total + (sheet[key]?.f ? 1 : 0);
  }, 0);
}

export async function parseFinanceWorkbook(file: File): Promise<ParsedFinanceWorkbook> {
  const XLSX = await import('xlsx');
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, {
    type: 'array',
    cellDates: true,
    cellFormula: true,
    raw: true,
  });

  const sheets: SheetImportSummary[] = [];
  const ingresos: ImportedIngresoRow[] = [];
  const egresos: ImportedEgresoRow[] = [];
  const monthlySummaries: MonthlyWorkbookSummary[] = [];
  const warnings: string[] = [];

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });

    const headerRow = (rows[0] || []).map(cell => normalizeText(cell));
    const formulaCount = countFormulas(sheet);

    if (isMonthlyWorkbookSheet(headerRow)) {
      const parsed = parseMonthlyWorkbookSheet(sheetName, rows, formulaCount, sheet);
      sheets.push(parsed.summary);
      ingresos.push(...parsed.ingresos);
      egresos.push(...parsed.egresos);
      monthlySummaries.push(parsed.monthlySummary);
      return;
    }

    const normalizedHeaders = headerRow.map(header => normalizeHeader(header));
    const target = detectSheetTarget(sheetName, normalizedHeaders);

    sheets.push({
      name: sheetName,
      target,
      rowCount: Math.max(rows.length - 1, 0),
      formulaCount,
      headers: headerRow,
    });

    if (target === 'desconocido' || rows.length <= 1) return;

    for (let index = 1; index < rows.length; index += 1) {
      const values = rows[index] || [];
      const rowNumber = index + 1;
      const rowObject = headerRow.reduce<Record<string, unknown>>((acc, header, headerIndex) => {
        if (header) acc[header] = values[headerIndex];
        return acc;
      }, {});

      const hasContent = Object.values(rowObject).some(value => normalizeText(value) !== '');
      if (!hasContent) continue;

      if (target === 'ingresos') {
        const parsed = parseIngresoRow(rowObject, sheetName, rowNumber);
        if (parsed) ingresos.push(parsed);
        else warnings.push(`Se omitió la fila ${rowNumber} de ${sheetName} por datos insuficientes para ingreso.`);
      }

      if (target === 'egresos') {
        const parsed = parseEgresoRow(rowObject, sheetName, rowNumber);
        if (parsed) egresos.push(parsed);
        else warnings.push(`Se omitió la fila ${rowNumber} de ${sheetName} por datos insuficientes para egreso.`);
      }
    }
  });

  return {
    fileName: file.name,
    sheets,
    ingresos,
    egresos,
    monthlySummaries,
    warnings,
  };
}