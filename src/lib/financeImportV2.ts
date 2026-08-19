// Importación masiva de Ingresos/Egresos desde Excel — carga de datos
// históricos (meses anteriores, incluida la recuperación de junio 2026)
// directo a las tablas actuales (ingresos_operativos / egresos_v2).
//
// Flujo: el usuario descarga una plantilla con las columnas exactas,
// la completa, la sube, se valida fila por fila ANTES de tocar la base
// (nada se inserta hasta que el usuario confirma el preview), y recién
// ahí se insertan en lotes con el login normal del usuario (respeta RLS,
// no requiere Service Role Key).
import {
  SOCIOS_FINANZAS, MODALIDADES, TIPOS_CLIENTE, RAMAS, FUENTES, CONCEPTOS_INGRESO, TIPOS_EGRESO,
  type SocioFinanzas, type ModalidadPago, type TipoClienteIngreso, type RamaLegal,
  type FuenteIngreso, type ConceptoIngreso, type TipoEgreso,
} from '../types/finanzas';

let xlsxLoader: Promise<typeof import('xlsx')> | null = null;
function loadXlsx() {
  if (!xlsxLoader) xlsxLoader = import('xlsx');
  return xlsxLoader;
}

export type FilaError = { fila: number; mensaje: string };

export interface IngresoImportado {
  fecha: string; cliente_nombre: string; tipo_cliente: TipoClienteIngreso; monto: number;
  modalidad: ModalidadPago; doctor_cobra: SocioFinanzas; receptor_transfer: SocioFinanzas | null;
  rama: RamaLegal; fuente: FuenteIngreso; concepto: ConceptoIngreso; observaciones: string | null;
}

export interface EgresoImportado {
  fecha: string; tipo: TipoEgreso; concepto: string; detalle: string | null; monto: number;
  modalidad: ModalidadPago; pagador: SocioFinanzas | null; beneficiario: string | null; observaciones: string | null;
}

const HEADERS_INGRESOS = ['Fecha', 'Cliente', 'Tipo Cliente', 'Monto', 'Modalidad', 'Doctor', 'Receptor Transferencia', 'Rama', 'Fuente', 'Concepto', 'Observaciones'];
const HEADERS_EGRESOS = ['Fecha', 'Tipo', 'Concepto', 'Detalle', 'Monto', 'Modalidad', 'Pagador', 'Beneficiario', 'Observaciones'];

async function descargarPlantilla(headers: string[], ejemplo: Record<string, string | number>, hojaDatos: string, valoresValidos: [string, readonly string[]][]) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const wsDatos = XLSX.utils.json_to_sheet([ejemplo], { header: headers });
  XLSX.utils.book_append_sheet(wb, wsDatos, hojaDatos);

  const filasValores: Record<string, string>[] = [];
  const maxLen = Math.max(...valoresValidos.map(([, v]) => v.length));
  for (let i = 0; i < maxLen; i++) {
    const fila: Record<string, string> = {};
    valoresValidos.forEach(([col, vals]) => { fila[col] = vals[i] || ''; });
    filasValores.push(fila);
  }
  const wsValores = XLSX.utils.json_to_sheet(filasValores, { header: valoresValidos.map(([c]) => c) });
  XLSX.utils.book_append_sheet(wb, wsValores, 'Valores válidos');

  XLSX.writeFile(wb, `plantilla_${hojaDatos.toLowerCase()}.xlsx`);
}

export function descargarPlantillaIngresos() {
  return descargarPlantilla(
    HEADERS_INGRESOS,
    {
      'Fecha': '15/06/2026', 'Cliente': 'Juan Pérez', 'Tipo Cliente': 'Nuevo', 'Monto': 50000,
      'Modalidad': 'Transferencia', 'Doctor': 'Rodri', 'Receptor Transferencia': 'Rodri',
      'Rama': 'Jubilaciones', 'Fuente': 'Derivado', 'Concepto': 'Honorarios', 'Observaciones': '',
    },
    'Ingresos',
    [
      ['Modalidad', MODALIDADES], ['Tipo Cliente', TIPOS_CLIENTE], ['Doctor / Receptor', SOCIOS_FINANZAS],
      ['Rama', RAMAS], ['Fuente', FUENTES], ['Concepto', CONCEPTOS_INGRESO],
    ],
  );
}

export function descargarPlantillaEgresos() {
  return descargarPlantilla(
    HEADERS_EGRESOS,
    {
      'Fecha': '15/06/2026', 'Tipo': 'eventual', 'Concepto': 'Marketing IG', 'Detalle': '',
      'Monto': 15000, 'Modalidad': 'Transferencia', 'Pagador': 'Rodri', 'Beneficiario': '', 'Observaciones': '',
    },
    'Egresos',
    [['Modalidad', MODALIDADES], ['Pagador', SOCIOS_FINANZAS], ['Tipo', TIPOS_EGRESO]],
  );
}

// ── Lectura del archivo subido ──────────────────────────────────────
export async function leerExcel(file: File): Promise<Record<string, any>[]> {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { defval: '' });
}

// ── Normalización ───────────────────────────────────────────────────
function normFecha(v: any): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function normEnum<T extends string>(v: any, valores: readonly T[]): T | null {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return null;
  const match = valores.find(x => x.toLowerCase() === s);
  return match ?? null;
}

function normMonto(v: any): number | null {
  if (typeof v === 'number') return v > 0 ? v : null;
  const s = String(v || '').trim().replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normTexto(v: any): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

// ── Validación fila por fila ────────────────────────────────────────
export function parsearFilasIngresos(rows: Record<string, any>[]): { validas: IngresoImportado[]; errores: FilaError[] } {
  const validas: IngresoImportado[] = [];
  const errores: FilaError[] = [];
  rows.forEach((r, idx) => {
    const fila = idx + 2; // +2: fila 1 son headers, y los arrays son 0-based
    const vacia = Object.values(r).every(v => String(v ?? '').trim() === '');
    if (vacia) return;

    const fecha = normFecha(r['Fecha']);
    const cliente_nombre = normTexto(r['Cliente']);
    const tipo_cliente = normEnum(r['Tipo Cliente'] || 'Nuevo', TIPOS_CLIENTE);
    const monto = normMonto(r['Monto']);
    const modalidad = normEnum(r['Modalidad'], MODALIDADES);
    const doctor_cobra = normEnum(r['Doctor'], SOCIOS_FINANZAS);
    const receptor_transfer = normEnum(r['Receptor Transferencia'], SOCIOS_FINANZAS);
    const rama = normEnum(r['Rama'], RAMAS);
    const fuente = normEnum(r['Fuente'], FUENTES);
    const concepto = normEnum(r['Concepto'], CONCEPTOS_INGRESO);
    const observaciones = normTexto(r['Observaciones']);

    const faltantes: string[] = [];
    if (!fecha) faltantes.push('Fecha inválida (usá DD/MM/AAAA)');
    if (!cliente_nombre) faltantes.push('Cliente vacío');
    if (!tipo_cliente) faltantes.push(`Tipo Cliente inválido (${TIPOS_CLIENTE.join('/')})`);
    if (!monto) faltantes.push('Monto inválido (debe ser mayor a 0)');
    if (!modalidad) faltantes.push(`Modalidad inválida (${MODALIDADES.join('/')})`);
    if (!doctor_cobra) faltantes.push(`Doctor inválido (${SOCIOS_FINANZAS.join('/')})`);
    if (!rama) faltantes.push('Rama inválida (ver hoja "Valores válidos")');
    if (!fuente) faltantes.push(`Fuente inválida (${FUENTES.join('/')})`);
    if (!concepto) faltantes.push(`Concepto inválido (${CONCEPTOS_INGRESO.join('/')})`);
    if (modalidad === 'Transferencia' && !receptor_transfer) faltantes.push('Falta "Receptor Transferencia" (obligatorio si Modalidad = Transferencia)');
    if (modalidad === 'Efectivo' && receptor_transfer) faltantes.push('"Receptor Transferencia" debe quedar vacío si Modalidad = Efectivo');

    if (faltantes.length > 0) { errores.push({ fila, mensaje: faltantes.join(' · ') }); return; }

    validas.push({
      fecha: fecha!, cliente_nombre: cliente_nombre!, tipo_cliente: tipo_cliente!, monto: monto!,
      modalidad: modalidad!, doctor_cobra: doctor_cobra!,
      receptor_transfer: modalidad === 'Transferencia' ? receptor_transfer! : null,
      rama: rama!, fuente: fuente!, concepto: concepto!, observaciones,
    });
  });
  return { validas, errores };
}

export function parsearFilasEgresos(rows: Record<string, any>[]): { validas: EgresoImportado[]; errores: FilaError[] } {
  const validas: EgresoImportado[] = [];
  const errores: FilaError[] = [];
  rows.forEach((r, idx) => {
    const fila = idx + 2;
    const vacia = Object.values(r).every(v => String(v ?? '').trim() === '');
    if (vacia) return;

    const fecha = normFecha(r['Fecha']);
    const tipo = normEnum(r['Tipo'], TIPOS_EGRESO);
    const concepto = normTexto(r['Concepto']);
    const detalle = normTexto(r['Detalle']);
    const monto = normMonto(r['Monto']);
    const modalidad = normEnum(r['Modalidad'], MODALIDADES);
    const pagadorRaw = normTexto(r['Pagador']);
    const pagador = pagadorRaw ? normEnum(pagadorRaw, SOCIOS_FINANZAS) : null;
    const beneficiario = normTexto(r['Beneficiario']);
    const observaciones = normTexto(r['Observaciones']);

    const faltantes: string[] = [];
    if (!fecha) faltantes.push('Fecha inválida (usá DD/MM/AAAA)');
    if (!tipo) faltantes.push(`Tipo inválido (${TIPOS_EGRESO.join('/')})`);
    if (!concepto) faltantes.push('Concepto vacío');
    if (!monto) faltantes.push('Monto inválido (debe ser mayor a 0)');
    if (!modalidad) faltantes.push(`Modalidad inválida (${MODALIDADES.join('/')})`);
    if (pagadorRaw && !pagador) faltantes.push(`Pagador inválido (${SOCIOS_FINANZAS.join('/')}, o dejalo vacío)`);

    if (faltantes.length > 0) { errores.push({ fila, mensaje: faltantes.join(' · ') }); return; }

    validas.push({ fecha: fecha!, tipo: tipo!, concepto: concepto!, detalle, monto: monto!, modalidad: modalidad!, pagador, beneficiario, observaciones });
  });
  return { validas, errores };
}
