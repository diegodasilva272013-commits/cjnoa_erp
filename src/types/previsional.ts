// ============================================
// TYPES: Módulo Previsional
// Centro Jurídico NOA - ERP
// ============================================

export type PipelinePrevisional = 'consulta' | 'seguimiento' | 'ingreso' | 'cobro' | 'jubi_especiales' | 'ucap' | 'jubi_ordinarias' | 'finalizado' | 'descartado';

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
  derivada_a: string | null;
  derivada_a_nombre?: string | null;
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
  consulta: 'Consulta',
  seguimiento: 'Seguimiento',
  ingreso: 'Ingreso',
  cobro: 'Cobro',
  jubi_especiales: 'Jubilaciones Especiales',
  ucap: 'UCAP',
  jubi_ordinarias: 'Jubi Ordinarias',
  finalizado: 'Finalizado',
  descartado: 'Descartado',
};

export const PIPELINE_COLORS: Record<PipelinePrevisional, string> = {
  consulta: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  seguimiento: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  ingreso: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  cobro: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  jubi_especiales: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  ucap: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  jubi_ordinarias: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  finalizado: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  descartado: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export const PIPELINE_GRADIENT: Record<PipelinePrevisional, string> = {
  consulta: 'from-blue-500 to-blue-600',
  seguimiento: 'from-amber-500 to-amber-600',
  ingreso: 'from-purple-500 to-purple-600',
  cobro: 'from-emerald-500 to-emerald-600',
  jubi_especiales: 'from-violet-500 to-violet-600',
  ucap: 'from-cyan-500 to-cyan-600',
  jubi_ordinarias: 'from-sky-500 to-sky-600',
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

// Carga el costo desde DB (configuracion_estudio.costo_mensual_27705) y lo
// cachea en localStorage para que getCostoMensual27705() (sync) lo use.
// Llamar en el arranque/al abrir módulos previsional.
export async function loadCostoMensual27705FromDB(): Promise<number> {
  try {
    const { supabase } = await import('../lib/supabase');
    const { data } = await supabase
      .from('configuracion_estudio')
      .select('costo_mensual_27705')
      .limit(1)
      .single();
    const v = data?.costo_mensual_27705 != null ? Number(data.costo_mensual_27705) : NaN;
    if (Number.isFinite(v) && v > 0) {
      setCostoMensual27705(v);
      return v;
    }
  } catch { /* noop */ }
  return getCostoMensual27705();
}

// Guarda el costo en DB y en localStorage.
export async function saveCostoMensual27705ToDB(value: number): Promise<void> {
  setCostoMensual27705(value);
  try {
    const { supabase } = await import('../lib/supabase');
    await supabase
      .from('configuracion_estudio')
      .update({ costo_mensual_27705: value })
      .not('id', 'is', null);
  } catch { /* noop */ }
}

// ── Overrides de fechas-límite de moratoria por cliente ──
// Permite ajustar manualmente el corte de cada ley para clientes especiales
// (ej: pre-1993, casos de excepción). Se persisten en localStorage para
// no requerir migración de DB.
export interface MoratoriaOverrides {
  hasta24476?: string | null; // YYYY-MM-DD
  hasta27705?: string | null; // YYYY-MM-DD
}
const MOR_OVR_KEY = (clienteId: string) => `previsional.cliente.${clienteId}.moratoria_overrides`;

export function getMoratoriaOverrides(clienteId: string): MoratoriaOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(MOR_OVR_KEY(clienteId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function setMoratoriaOverrides(clienteId: string, ovr: MoratoriaOverrides): void {
  if (typeof window === 'undefined') return;
  const clean: MoratoriaOverrides = {};
  if (ovr.hasta24476) clean.hasta24476 = ovr.hasta24476;
  if (ovr.hasta27705) clean.hasta27705 = ovr.hasta27705;
  if (Object.keys(clean).length === 0) {
    window.localStorage.removeItem(MOR_OVR_KEY(clienteId));
  } else {
    window.localStorage.setItem(MOR_OVR_KEY(clienteId), JSON.stringify(clean));
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
export function calcularMoratoria(
  fechaNacimiento: string,
  sexo: SexoCliente,
  overrides?: { hasta24476?: string | null; hasta27705?: string | null }
): CalculoMoratoria {
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

  // Helper: parsea YYYY-MM-DD a Date local; devuelve null si inválido
  const parseLocal = (s?: string | null): Date | null => {
    if (!s) return null;
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m2) return null;
    return new Date(parseInt(m2[1], 10), parseInt(m2[2], 10) - 1, parseInt(m2[3], 10));
  };

  // 24.476: desde 18 años hasta override (default 30/09/1993)
  const limite24476 = parseLocal(overrides?.hasta24476) || new Date(1993, 8, 30);
  let meses24476 = 0;
  if (desde18 < limite24476) {
    const diff = (limite24476.getFullYear() - desde18.getFullYear()) * 12 +
      (limite24476.getMonth() - desde18.getMonth());
    meses24476 = Math.max(0, diff);
  }

  // 27.705: desde 18 años hasta override (default 31/03/2012)
  const limite27705 = parseLocal(overrides?.hasta27705) || new Date(2012, 2, 31);
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

  // Simultáneos: usar override manual si existe. Para los aportes sin override,
  // calcular usando unión de intervalos: total_auto - union(fechas) = meses doble-contados.
  // Esto evita que el aporte LARGO también sea marcado como simultáneo por el CORTO.
  const mesesSimultaneos = (() => {
    const manualTotal = aportes.reduce((acc, a) =>
      a.meses_simultaneo != null ? acc + a.meses_simultaneo : acc, 0);

    const autoAportes = aportes.filter(a => a.meses_simultaneo == null && a.fecha_desde && a.fecha_hasta);
    if (autoAportes.length <= 1) return manualTotal;

    const autoTotal = autoAportes.reduce((acc, a) => acc + (a.total_meses || 0), 0);

    // Unión de intervalos para calcular cuántos meses únicos hay
    const intervals = autoAportes
      .map(a => ({ start: a.fecha_desde, end: a.fecha_hasta }))
      .sort((a, b) => a.start.localeCompare(b.start));

    const monthsBetween = (s: string, e: string) => {
      const d = new Date(s), h = new Date(e);
      return Math.max(0, (h.getFullYear() - d.getFullYear()) * 12 + (h.getMonth() - d.getMonth()) + 1);
    };

    let unionMonths = 0;
    let cur = intervals[0];
    for (let i = 1; i < intervals.length; i++) {
      const nxt = intervals[i];
      if (nxt.start <= cur.end) {
        cur = { start: cur.start, end: nxt.end > cur.end ? nxt.end : cur.end };
      } else {
        unionMonths += monthsBetween(cur.start, cur.end);
        cur = nxt;
      }
    }
    unionMonths += monthsBetween(cur.start, cur.end);

    return manualTotal + Math.max(0, autoTotal - unionMonths);
  })();

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
