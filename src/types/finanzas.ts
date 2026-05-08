// ============================================================
// Tipos finanzas v2 — alineados con migration_finanzas_v2.sql
// ============================================================

export const SOCIOS_FINANZAS = ['Rodri', 'Noe', 'Ale', 'Fabri'] as const;
export type SocioFinanzas = typeof SOCIOS_FINANZAS[number];

export const MODALIDADES = ['Transferencia', 'Efectivo'] as const;
export type ModalidadPago = typeof MODALIDADES[number];

export const TIPOS_CLIENTE = ['Nuevo', 'Viejo'] as const;
export type TipoClienteIngreso = typeof TIPOS_CLIENTE[number];

export const RAMAS = [
  'Jubilaciones', 'UCAP', 'Reajuste', 'Reajuste Art 9',
  'Sucesorios', 'Reales', 'Familia', 'Otros',
] as const;
export type RamaLegal = typeof RAMAS[number];

export const FUENTES = ['Derivado', 'Campaña', 'Redes'] as const;
export type FuenteIngreso = typeof FUENTES[number];

export const CONCEPTOS_INGRESO = ['Honorarios', 'Consulta'] as const;
export type ConceptoIngreso = typeof CONCEPTOS_INGRESO[number];

export const TIPOS_EGRESO = [
  'fijo', 'eventual', 'tarjeta', 'vencimiento', 'sueldo', 'servicio', 'permuta',
] as const;
export type TipoEgreso = typeof TIPOS_EGRESO[number];

// Catálogos sugeridos (para selects)
export const SUELDOS_NOMBRES = ['Karina', 'Melani', 'Alvaro', 'Matias'];
export const SERVICIOS_NOMBRES = ['Alquiler', 'Ejesa', 'Limsa', 'Internet'];
export const VENCIMIENTOS_NOMBRES = ['Cuturel', 'Jauregui', 'Otros'];

// ── Entidades ──
export interface IngresoOperativo {
  id: string;
  fecha: string;                  // YYYY-MM-DD
  cliente_nombre: string;
  tipo_cliente: TipoClienteIngreso;
  monto: number;
  modalidad: ModalidadPago;
  doctor_cobra: SocioFinanzas;
  receptor_transfer: SocioFinanzas | null;
  rama: RamaLegal;
  fuente: FuenteIngreso;
  concepto: ConceptoIngreso;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface FondoCliente {
  id: string;
  cliente_nombre: string;
  fecha_ingreso: string;
  monto_inicial: number;
  observaciones: string | null;
  finalizado: boolean;
  created_at: string;
  updated_at: string;
}

export interface FondoSaldo extends FondoCliente {
  gastos_totales: number;
  saldo: number;
}

export interface FondoMovimiento {
  id: string;
  fondo_id: string;
  fecha: string;
  nombre_gasto: string;
  monto: number;
  observaciones: string | null;
  created_at: string;
}

export interface EgresoV2 {
  id: string;
  fecha: string;
  tipo: TipoEgreso;
  concepto: string;
  detalle: string | null;
  monto: number;
  modalidad: ModalidadPago;
  pagador: SocioFinanzas | null;
  beneficiario: string | null;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovimientoCaja {
  id: string;
  fecha: string;
  socio_origen: SocioFinanzas;
  socio_destino: SocioFinanzas;
  monto: number;
  tipo_origen: ModalidadPago;
  tipo_destino: ModalidadPago;
  observaciones: string | null;
  created_at: string;
}

export interface CuentaSocio {
  socio: SocioFinanzas;
  saldo_digital: number;
  saldo_efectivo: number;
  updated_at: string;
}

export interface MetaPeriodo {
  id: string;
  periodo: string;                // 'YYYY-MM'
  meta_individual: number;
  meta_grupal: number;
  meta_individual_socio: Record<SocioFinanzas, number> | null;
  observaciones: string | null;
}

export interface RepartoCalculo {
  periodo: string;
  ingresos_totales: number;
  egresos_totales: number;
  utilidad: number;
  parte_por_socio: number;
  saldos: Record<SocioFinanzas, {
    digital: number;
    efectivo: number;
    total: number;
    meta: number;
    diferencia: number;
  }>;
  transferencias_sugeridas: Array<{ from: SocioFinanzas; to: SocioFinanzas; monto: number }>;
}
