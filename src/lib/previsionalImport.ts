// ============================================
// Importador de Fichas Previsionales desde Excel
// Formato: "FICHA ULTRA COMPLETA" (1 archivo = 1 cliente)
// ============================================
import * as XLSX from 'xlsx';
import { ClientePrevisional, AporteLaboral, SexoCliente, SubEstadoPrevisional } from '../types/previsional';

export interface ParsedAporte {
  empleador: string | null;
  fecha_desde: string;
  fecha_hasta: string;
  total_meses: number;
  es_antes_0993: boolean;
  es_simultaneo: boolean;
  observaciones: string | null;
}

export interface ParsedFicha {
  cliente: Partial<ClientePrevisional>;
  aportes: ParsedAporte[];
  warnings: string[];
}

// ── Helpers ──
function toIsoDate(v: any): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number') {
    // Fecha serial Excel
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    // dd/mm/yyyy
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      let yyyy = m[3];
      if (yyyy.length === 2) yyyy = (parseInt(yyyy, 10) > 30 ? '19' : '20') + yyyy;
      return `${yyyy}-${mm}-${dd}`;
    }
    // yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  }
  return null;
}

function parseAniosMeses(v: any): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  const s = String(v);
  const am = s.match(/(\d+)\s*a[ñn]os?/i);
  const mm = s.match(/(\d+)\s*meses?/i);
  const dm = s.match(/(\d+)\s*d[ií]as?/i);
  const anios = am ? parseInt(am[1], 10) : 0;
  const meses = mm ? parseInt(mm[1], 10) : 0;
  const dias = dm ? parseInt(dm[1], 10) : 0;
  return anios * 12 + meses + (dias > 15 ? 1 : 0);
}

function toStr(v: any): string | null {
  if (v == null || v === '') return null;
  return String(v).trim() || null;
}

function toNum(v: any): number {
  if (v == null || v === '') return 0;
  if (v instanceof Date) return 0; // nunca convertir fechas a número
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Limita a numeric(12,2): hasta 9_999_999_999.99
function clampMoney(n: number): number {
  if (!isFinite(n)) return 0;
  const max = 9_999_999_999.99;
  if (n > max) return max;
  if (n < -max) return -max;
  return Math.round(n * 100) / 100;
}

function clampInt(n: number, min: number, max: number): number {
  if (!isFinite(n)) return min;
  const v = Math.round(n);
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function toSexo(v: any): SexoCliente | null {
  if (!v) return null;
  const s = String(v).trim().toUpperCase();
  if (s.startsWith('M') && !s.startsWith('MU')) return 'HOMBRE'; // M = Masculino → Hombre
  if (s === 'H' || s.startsWith('HOM') || s.startsWith('MASC')) return 'HOMBRE';
  if (s === 'M' || s.startsWith('MUJ') || s.startsWith('FEM')) return 'MUJER';
  return null;
}

function toSubEstado(v: any): SubEstadoPrevisional | null {
  if (!v) return null;
  const s = String(v).trim().toUpperCase();
  if (s.includes('SEGUIMIENTO EXPTE')) return 'EN PROCESO - SEGUIMIENTO EXPTE';
  if (s.includes('REALIZAR TAREA')) return 'EN PROCESO - REALIZAR TAREA';
  if (s.includes('FINALIZ')) return 'FINALIZADO';
  if (s.includes('COBRAD')) return 'COBRADO';
  if (s.includes('ESPERA')) return 'EN ESPERA';
  if (s.includes('PROCESO')) return 'EN PROCESO';
  return null;
}

function getCell(ws: XLSX.WorkSheet, ref: string): any {
  const cell = ws[ref];
  return cell ? (cell.v ?? null) : null;
}

// ── Parser principal ──
export function parseFichaWorkbook(buffer: ArrayBuffer): ParsedFicha {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.find(n => n.toUpperCase().includes('CLIENTE')) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const warnings: string[] = [];

  // Helper: ubica la fila que sigue a un header buscando texto en la col A
  const findRowAfter = (headerText: string, fallback: number): number => {
    const upper = headerText.toUpperCase();
    for (let r = 1; r <= 30; r++) {
      const v = getCell(ws, `A${r}`);
      if (v && String(v).toUpperCase().includes(upper)) return r + 1;
    }
    return fallback;
  };

  // ── Datos personales: header fila 1, datos fila 2 ──
  const rowPers = findRowAfter('APELLIDO', 2);
  const apellido_nombre = toStr(getCell(ws, `A${rowPers}`)) || '';
  if (!apellido_nombre) warnings.push('No se encontró APELLIDO Y NOMBRE.');

  const cuilRaw = getCell(ws, `B${rowPers}`);
  let cuil: string | null = null;
  if (cuilRaw != null && cuilRaw !== '') {
    const onlyDigits = String(cuilRaw).replace(/\D/g, '');
    if (onlyDigits.length === 11) {
      cuil = `${onlyDigits.slice(0, 2)}-${onlyDigits.slice(2, 10)}-${onlyDigits.slice(10)}`;
    } else {
      cuil = String(cuilRaw).trim();
    }
  }
  const clave_social = toStr(getCell(ws, `C${rowPers}`));
  const clave_fiscal = toStr(getCell(ws, `D${rowPers}`));
  const fecha_nacimiento = toIsoDate(getCell(ws, `E${rowPers}`));
  const sexo = toSexo(getCell(ws, `G${rowPers}`));
  const direccion = toStr(getCell(ws, `H${rowPers}`));
  const hijos = Math.max(0, Math.min(99, Math.round(toNum(getCell(ws, `I${rowPers}`)))));

  // ── Moratorias: header "MESES MORATORIA 24.476", datos en la fila siguiente ──
  const rowMor = findRowAfter('MESES MORATORIA', 5);
  const meses_moratoria_24476 = Math.min(9999, parseAniosMeses(getCell(ws, `A${rowMor}`)));
  const meses_moratoria_27705 = Math.min(9999, parseAniosMeses(getCell(ws, `B${rowMor}`)));
  const fecha_edad_jubilatoria = toIsoDate(getCell(ws, `C${rowMor}`));
  const resumen_informe = toStr(getCell(ws, `D${rowMor}`));
  const conclusion: string | null = null;

  // ── Seguimiento: header "FECHA ÚLTIMO CONTACTO", datos en la fila siguiente ──
  const rowSeg = findRowAfter('FECHA', 8);
  const fecha_ultimo_contacto = toIsoDate(getCell(ws, `A${rowSeg}`));
  const telRaw = getCell(ws, `C${rowSeg}`);
  let telefono: string | null = null;
  if (telRaw != null && telRaw !== '') {
    telefono = String(telRaw).replace(/[^\d+]/g, '') || null;
  }
  const situacion_actual = toStr(getCell(ws, `D${rowSeg}`));

  // ── Cobro: header "COBRO TOTAL", datos en la fila siguiente ──
  const rowCobro = findRowAfter('COBRO TOTAL', 11);
  const cobroRaw = getCell(ws, `A${rowCobro}`);
  const cobradoRaw = getCell(ws, `B${rowCobro}`);
  // Solo numeric: si la celda no es un número parseable a algo razonable, queda 0
  const cobro_total = clampMoney(toNum(cobroRaw));
  const monto_cobrado = clampMoney(toNum(cobradoRaw));
  const sub_estado = toSubEstado(getCell(ws, `D${rowCobro}`));

  // ── Drive: header "LINK", url en la fila siguiente ──
  const rowDrive = findRowAfter('LINK', 14);
  const url_drive = toStr(getCell(ws, `A${rowDrive}`));

  // ── Aportes: header "HISTORIAL DE APORTES" ──
  const rowAportesHeader = findRowAfter('HISTORIAL DE APORTES', 17) - 1;
  const aportes: ParsedAporte[] = [];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  let blanks = 0;
  for (let row = rowAportesHeader + 1; row <= Math.min(range.e.r + 1, 250); row++) {
    const empleador = toStr(getCell(ws, `A${row}`));
    const desde = toIsoDate(getCell(ws, `B${row}`));
    const hasta = toIsoDate(getCell(ws, `C${row}`));
    if (!empleador && !desde && !hasta) {
      blanks++;
      if (blanks >= 5) break;
      continue;
    }
    blanks = 0;
    if (!desde || !hasta) continue;
    const meses_calc = parseAniosMeses(getCell(ws, `D${row}`)) || calcMeses(desde, hasta);
    aportes.push({
      empleador,
      fecha_desde: desde,
      fecha_hasta: hasta,
      total_meses: Math.min(9999, meses_calc),
      es_antes_0993: !!getCell(ws, `E${row}`),
      es_simultaneo: !!getCell(ws, `F${row}`),
      observaciones: null,
    });
  }

  const cliente: Partial<ClientePrevisional> = {
    apellido_nombre,
    cuil,
    clave_social,
    clave_fiscal,
    fecha_nacimiento,
    sexo,
    direccion,
    telefono,
    hijos: clampInt(hijos, 0, 99),
    meses_moratoria_24476: clampInt(meses_moratoria_24476, 0, 9999),
    meses_moratoria_27705: clampInt(meses_moratoria_27705, 0, 9999),
    fecha_edad_jubilatoria,
    resumen_informe,
    conclusion,
    fecha_ultimo_contacto,
    situacion_actual,
    pipeline: 'consulta',
    sub_estado,
    cobro_total,
    monto_cobrado,
    url_drive,
  };

  return { cliente, aportes, warnings };
}

function calcMeses(desde: string, hasta: string): number {
  const d = new Date(desde), h = new Date(hasta);
  return Math.max(0, (h.getFullYear() - d.getFullYear()) * 12 + (h.getMonth() - d.getMonth()) + (h.getDate() - d.getDate() > 15 ? 1 : 0));
}
