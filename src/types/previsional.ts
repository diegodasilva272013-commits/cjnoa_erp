// ============================================
// TYPES: Módulo Previsional
// Centro Jurídico NOA - ERP
// ============================================

export type PipelinePrevisional = 'seguimiento' | 'jubi_especiales' | 'ucap' | 'jubi_ordinarias' | 'finalizado' | 'descartado';

export type SubEstadoPrevisional =
  | 'EN PROCESO'
  | 'EN ESPERA'
  | 'EN PROCESO - SEGUIMIENTO EXPTE'
  | 'EN PROCESO - REALIZAR TAREA'
  | 'FINALIZADO'
  | 'COBRADO';

export type PrioridadTarea = 'alta' | 'media' | 'sin_prioridad';
export type EstadoTarea = 'pendiente' | 'en_curso' | 'completada';
export type SexoCliente = 'HOMBRE' | 'MUJER';

// ── Ficha del cliente previsional ──
export interface ClientePrevisional {
  id: string;
  apellido_nombre: string;
  cuil: string | null;
  clave_social: string | null;
  clave_fiscal: string | null;
  fecha_nacimiento: string | null;
  sexo: SexoCliente | null;
  direccion: string | null;
  telefono: string | null;
  hijos: number;

  // Moratorias
  meses_moratoria_24476: number;
  meses_moratoria_27705: number;
  fecha_edad_jubilatoria: string | null;

  // Informe
  resumen_informe: string | null;
  conclusion: string | null;

  // Seguimiento
  fecha_ultimo_contacto: string | null;
  situacion_actual: string | null;
  captado_por: string | null;

  // Pipeline
  pipeline: PipelinePrevisional;
  sub_estado: SubEstadoPrevisional | null;

  // Cobro
  cobro_total: number;
  monto_cobrado: number;
  saldo_pendiente: number;

  // Drive
  url_drive: string | null;

  // Vinculación con módulos existentes
  caso_id: string | null;
  cliente_id: string | null;

  // Auditoría
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

// ── Aporte laboral (período de trabajo) ──
export interface AporteLaboral {
  id: string;
  cliente_prev_id: string;
  empleador: string | null;
  fecha_desde: string;
  fecha_hasta: string;
  total_meses: number;
  es_antes_0993: boolean;
  es_simultaneo: boolean;
  meses_antes_0993: number | null;   // override manual; null = usar cálculo automático
  meses_simultaneo: number | null;   // override manual; null = usar cálculo automático
  observaciones: string | null;
  created_at: string;
}

// ── Historial de avances (inmutable) ──
export interface HistorialAvance {
  id: string;
  cliente_prev_id: string;
  titulo: string;
  descripcion: string | null;
  tarea_siguiente: string | null;
  usuario_id: string | null;
  usuario_nombre: string | null;
  created_at: string;
}

// ── Tarea previsional ──
export interface TareaPrevisional {
  id: string;
  cliente_prev_id: string | null;
  titulo: string;
  descripcion: string | null;
  avance: string | null;
  cargo_hora: string | null;
  cargo_hora_fecha: string | null;
  estado: EstadoTarea;
  prioridad: PrioridadTarea;
  fecha_limite: string | null;
  responsable_id: string | null;
  responsable_nombre: string | null;
  observaciones_demora: string | null;
  archivo_url: string | null;
  archivo_nombre: string | null;
  fecha_completada: string | null;
  completada_por: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  // Join fields
  cliente_nombre?: string;
}

// ── Audiencia ──
export interface Audiencia {
  id: string;
  cliente_prev_id: string | null;
  fecha: string;
  hora: string | null;
  juzgado: string | null;
  tipo: string | null;
  abogado_cargo: string | null;
  notas: string | null;
  created_at: string;
  created_by: string | null;
  // Join fields
  cliente_nombre?: string;
}

// ── Cálculos de moratorias ──
export interface CalculoMoratoria {
  meses24476: number;
  anios24476: number;
  mesesRestantes24476: number;
  meses27705: number;
  anios27705: number;
  mesesRestantes27705: number;
  fechaEdadJubilatoria: Date | null;
  edadActual: number;
}

export interface ResumenAportes {
  totalMeses: number;
  totalAnios: number;
  mesesSimultaneos: number;
  mesesAntes0993: number;
  mesesHijos: number;
  meses24476: number;
  meses24476Net: number;
  totalServicios: number;
  totalAniosServicios: number;
  faltanMeses: number;
  faltanAnios: number;
  costoMensual27705: number;
  costoTotal27705: number;
}

// ── Constantes ──
export const PIPELINE_LABELS: Record<PipelinePrevisional, string> = {
  seguimiento: 'Seguimiento',
  jubi_especiales: 'Jubilaciones Especiales',
  ucap: 'UCAP',
  jubi_ordinarias: 'Jubi Ordinarias',
  finalizado: 'Finalizado',
  descartado: 'Descartado',
};

export const PIPELINE_COLORS: Record<PipelinePrevisional, string> = {
  seguimiento: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  jubi_especiales: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  ucap: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  jubi_ordinarias: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  finalizado: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  descartado: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export const PIPELINE_GRADIENT: Record<PipelinePrevisional, string> = {
  seguimiento: 'from-amber-500 to-amber-600',
  jubi_especiales: 'from-purple-500 to-purple-600',
  ucap: 'from-cyan-500 to-cyan-600',
  jubi_ordinarias: 'from-blue-500 to-blue-600',
  finalizado: 'from-gray-500 to-gray-600',
  descartado: 'from-red-500 to-red-600',
};

export const PRIORIDAD_LABELS: Record<PrioridadTarea, string> = {
  alta: 'Alta',
  media: 'Media',
  sin_prioridad: 'Sin Prioridad',
};

export const PRIORIDAD_COLORS: Record<PrioridadTarea, string> = {
  alta: 'bg-red-500/10 text-red-400 border-red-500/20',
  media: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  sin_prioridad: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

export const ESTADO_TAREA_LABELS: Record<EstadoTarea, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En Curso',
  completada: 'Completada',
};

export const COSTO_MENSUAL_27705_DEFAULT = 37146.52;

// Permite ajustar el costo mensual de la cuota Ley 27.705 (cambia con frecuencia).
// Persiste en localStorage para no requerir migración de DB.
const COSTO_27705_LS_KEY = 'previsional.costo_mensual_27705';

export function getCostoMensual27705(): number {
  if (typeof window === 'undefined') return COSTO_MENSUAL_27705_DEFAULT;
  const raw = window.localStorage.getItem(COSTO_27705_LS_KEY);
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : COSTO_MENSUAL_27705_DEFAULT;
}

export function setCostoMensual27705(value: number): void {
  if (typeof window === 'undefined') return;
  if (Number.isFinite(value) && value > 0) {
    window.localStorage.setItem(COSTO_27705_LS_KEY, String(value));
  } else {
    window.localStorage.removeItem(COSTO_27705_LS_KEY);
  }
}

// Compat: mantener constante para imports existentes (lee el valor configurado)
export const COSTO_MENSUAL_27705 = COSTO_MENSUAL_27705_DEFAULT;

// Formatea una fecha ISO (YYYY-MM-DD) como dd/mm/aaaa sin desfase de zona horaria.
export function formatFechaLocal(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR');
}

// ── Funciones de cálculo ──
export function calcularMoratoria(fechaNacimiento: string, sexo: SexoCliente): CalculoMoratoria {
  // Parsear como fecha LOCAL para evitar el desfase de zona horaria
  // (new Date("YYYY-MM-DD") interpreta como UTC y en AR resta 1 día).
  const isoMatch = fechaNacimiento.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const nacimiento = isoMatch
    ? new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10))
    : new Date(fechaNacimiento);
  const hoy = new Date();

  // Edad actual
  let edadActual = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edadActual--;

  // Fecha desde los 18 años
  const desde18 = new Date(nacimiento);
  desde18.setFullYear(desde18.getFullYear() + 18);

  // 24.476: desde 18 años hasta 30/09/1993
  const limite24476 = new Date(1993, 8, 30); // Sep 30, 1993
  let meses24476 = 0;
  if (desde18 < limite24476) {
    const diff = (limite24476.getFullYear() - desde18.getFullYear()) * 12 +
      (limite24476.getMonth() - desde18.getMonth());
    meses24476 = Math.max(0, diff);
  }

  // 27.705: desde 18 años hasta 31/03/2012
  const limite27705 = new Date(2012, 2, 31); // Mar 31, 2012
  let meses27705 = 0;
  if (desde18 < limite27705) {
    const diff = (limite27705.getFullYear() - desde18.getFullYear()) * 12 +
      (limite27705.getMonth() - desde18.getMonth());
    meses27705 = Math.max(0, diff);
  }

  // Edad jubilatoria
  const edadJub = sexo === 'HOMBRE' ? 65 : 60;
  const fechaEdadJub = new Date(nacimiento);
  fechaEdadJub.setFullYear(fechaEdadJub.getFullYear() + edadJub);

  return {
    meses24476,
    anios24476: Math.floor(meses24476 / 12),
    mesesRestantes24476: meses24476 % 12,
    meses27705,
    anios27705: Math.floor(meses27705 / 12),
    mesesRestantes27705: meses27705 % 12,
    fechaEdadJubilatoria: fechaEdadJub,
    edadActual,
  };
}

export function calcularResumenAportes(
  aportes: AporteLaboral[],
  hijos: number,
  sexo: SexoCliente,
  mesesAntes0993Moratoria: number,
  meses24476: number = 0
): ResumenAportes {
  const totalMeses = aportes.reduce((acc, a) => acc + (a.total_meses || 0), 0);

  // Simultáneos: usar override manual si existe, sino detectar por superposición de fechas.
  // Al auto-detectar, solo cuenta overlaps contra aportes que NO están marcados
  // explícitamente como NO simultáneos (meses_simultaneo === 0).
  const mesesSimultaneos = aportes.reduce((acc, a) => {
    if (a.meses_simultaneo != null) return acc + a.meses_simultaneo;
    const esSimult = aportes.some(o =>
      o.id !== a.id &&
      o.meses_simultaneo !== 0 && // no contar contra aportes marcados como no-simult
      o.fecha_desde <= a.fecha_hasta && o.fecha_hasta >= a.fecha_desde
    );
    return acc + (esSimult ? (a.total_meses || 0) : 0);
  }, 0);

  // Antes 09/93: usar override manual si existe, sino calcular desde fechas
  const calcMesesAntes = (desde: string, hasta: string): number => {
    if (!desde || !hasta) return 0;
    const limite = new Date(1993, 8, 30);
    const d = new Date(desde); const h = new Date(hasta);
    if (d > limite) return 0;
    const hEf = h < limite ? h : limite;
    return Math.max(0, (hEf.getFullYear() - d.getFullYear()) * 12 + (hEf.getMonth() - d.getMonth()));
  };
  const mesesAntes0993 = aportes.reduce((acc, a) => {
    return acc + (a.meses_antes_0993 ?? calcMesesAntes(a.fecha_desde, a.fecha_hasta));
  }, 0);

  // Hijos solo para mujeres (1 año = 12 meses por hijo)
  const mesesHijos = sexo === 'MUJER' ? hijos * 12 : 0;

  // Moratoria 24.476 NETA = lo calculado - lo que ya tiene como aportes reales antes del 09/93
  const meses24476Net = Math.max(0, meses24476 - mesesAntes0993);

  // Total real = total - simultáneos + moratoria 24476 NETA + hijos (mujer)
  const totalReal = totalMeses - mesesSimultaneos;
  const totalServicios = totalReal + meses24476Net + mesesHijos;

  // Faltan para 30 años (360 meses)
  const faltanMeses = Math.max(0, 360 - totalServicios);

  return {
    totalMeses,
    totalAnios: Math.floor(totalMeses / 12),
    mesesSimultaneos,
    mesesAntes0993,
    mesesHijos,
    meses24476,
    meses24476Net,
    totalServicios,
    totalAniosServicios: Math.floor(totalServicios / 12),
    faltanMeses,
    faltanAnios: Math.floor(faltanMeses / 12),
    costoMensual27705: getCostoMensual27705(),
    costoTotal27705: faltanMeses * getCostoMensual27705(),
  };
}

// Semáforo de contacto
export type SemaforoContacto = 'verde' | 'amarillo' | 'rojo' | 'gris';

export function calcularSemaforo(fechaUltimoContacto: string | null): SemaforoContacto {
  if (!fechaUltimoContacto) return 'gris';
  const hoy = new Date();
  const ultimo = new Date(fechaUltimoContacto);
  const dias = Math.floor((hoy.getTime() - ultimo.getTime()) / (1000 * 60 * 60 * 24));
  if (dias <= 7) return 'verde';
  if (dias <= 15) return 'amarillo';
  return 'rojo';
}

export const SEMAFORO_LABELS: Record<SemaforoContacto, string> = {
  verde: '0-7 días',
  amarillo: '8-15 días',
  rojo: '>15 días',
  gris: 'Sin contacto',
};

export const SEMAFORO_COLORS: Record<SemaforoContacto, string> = {
  verde: 'bg-emerald-500',
  amarillo: 'bg-amber-500',
  rojo: 'bg-red-500',
  gris: 'bg-gray-600',
};
