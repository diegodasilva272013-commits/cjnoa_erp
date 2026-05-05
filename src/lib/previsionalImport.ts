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
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
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

  // ── Datos personales (fila 2) ──
  const apellido_nombre = toStr(getCell(ws, 'A2')) || '';
  if (!apellido_nombre) {
    warnings.push('No se encontró APELLIDO Y NOMBRE en A2.');
  }

  // CUIL puede venir como número o texto
  const cuilRaw = getCell(ws, 'B2');
  let cuil: string | null = null;
  if (cuilRaw != null && cuilRaw !== '') {
    const onlyDigits = String(cuilRaw).replace(/\D/g, '');
    if (onlyDigits.length === 11) {
      cuil = `${onlyDigits.slice(0, 2)}-${onlyDigits.slice(2, 10)}-${onlyDigits.slice(10)}`;
    } else {
      cuil = String(cuilRaw).trim();
    }
  }

  const clave_social = toStr(getCell(ws, 'C2'));
  const clave_fiscal = toStr(getCell(ws, 'D2'));
  const fecha_nacimiento = toIsoDate(getCell(ws, 'E2'));
  const sexo = toSexo(getCell(ws, 'G2'));
  const direccion = toStr(getCell(ws, 'H2'));
  const hijos = Math.max(0, Math.round(toNum(getCell(ws, 'I2'))));

  // Teléfono - puede venir como número grande
  const telRaw = getCell(ws, 'C6');
  let telefono: string | null = null;
  if (telRaw != null && telRaw !== '') {
    telefono = String(telRaw).replace(/[^\d+]/g, '') || null;
  }

  // ── Moratorias / informe (fila 4) ──
  const meses_moratoria_24476 = parseAniosMeses(getCell(ws, 'A4'));
  const meses_moratoria_27705 = parseAniosMeses(getCell(ws, 'B4'));
  const fecha_edad_jubilatoria = toIsoDate(getCell(ws, 'C4'));
  const resumen_informe = toStr(getCell(ws, 'D4'));
  // F4 suele ser la etiqueta lateral "APORTES"; ignoramos.
  const conclusion: string | null = null;

  // ── Seguimiento (fila 6) ──
  const fecha_ultimo_contacto = toIsoDate(getCell(ws, 'A6'));
  const situacion_actual = toStr(getCell(ws, 'D6'));

  // ── Cobro (fila 8) ──
  const cobro_total = toNum(getCell(ws, 'A8'));
  const monto_cobrado = toNum(getCell(ws, 'B8'));
  // saldo_pendiente es columna GENERATED en la DB, no se inserta
  const sub_estado = toSubEstado(getCell(ws, 'D8'));

  // ── Drive ──
  const url_drive = toStr(getCell(ws, 'A10'));

  // ── Aportes (desde fila 13, header en fila 12) ──
  const aportes: ParsedAporte[] = [];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = 12; r <= Math.min(range.e.r, 200); r++) {
    const row = r + 1; // 1-based
    const empleador = toStr(getCell(ws, `A${row}`));
    const desde = toIsoDate(getCell(ws, `B${row}`));
    const hasta = toIsoDate(getCell(ws, `C${row}`));
    if (!empleador && !desde && !hasta) {
      // fin de tabla (puede haber celdas residuales en col G+)
      // si las próximas 3 filas también están vacías, salir
      const next1 = toStr(getCell(ws, `A${row + 1}`)) || toIsoDate(getCell(ws, `B${row + 1}`));
      const next2 = toStr(getCell(ws, `A${row + 2}`)) || toIsoDate(getCell(ws, `B${row + 2}`));
      if (!next1 && !next2) break;
      continue;
    }
    if (!desde || !hasta) continue;
    const totalText = getCell(ws, `D${row}`);
    const meses_calc = parseAniosMeses(totalText) || calcMeses(desde, hasta);
    const antes = !!getCell(ws, `E${row}`);
    const sim = !!getCell(ws, `F${row}`);
    aportes.push({
      empleador,
      fecha_desde: desde,
      fecha_hasta: hasta,
      total_meses: meses_calc,
      es_antes_0993: antes,
      es_simultaneo: sim,
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
    hijos,
    meses_moratoria_24476,
    meses_moratoria_27705,
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
