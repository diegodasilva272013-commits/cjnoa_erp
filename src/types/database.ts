export type Rol = 'admin' | 'socio' | 'empleado' | 'procurador';

export interface PermisosUsuario {
  dashboard: boolean;
  casos: boolean;
  finanzas: boolean;
  equipo: boolean;
  agenda: boolean;
  previsional: boolean;
  /** Ver montos de honorarios en la ficha de caso. Spec: Procurador NO ve honorarios. */
  ver_honorarios: boolean;
}

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
  activo?: boolean;
  permisos?: PermisosUsuario;
  avatar_url?: string | null;
  created_at: string;
}

export const ROLES: { value: Rol; label: string; description: string }[] = [
  { value: 'admin', label: 'Administrador', description: 'Acceso total + gestión de usuarios' },
  { value: 'socio', label: 'Socio', description: 'Ve todo pero no gestiona usuarios' },
  { value: 'empleado', label: 'Secretaria/Empleado', description: 'Casos y agenda sin finanzas' },
  { value: 'procurador', label: 'Procurador', description: 'Casos/agenda/previsional sin ver honorarios' },
];

export const PERMISOS_DEFAULT: Record<Rol, PermisosUsuario> = {
  admin:     { dashboard: true,  casos: true, finanzas: true,  equipo: true,  agenda: true, previsional: true,  ver_honorarios: true  },
  socio:     { dashboard: true,  casos: true, finanzas: true,  equipo: false, agenda: true, previsional: true,  ver_honorarios: true  },
  empleado:  { dashboard: false, casos: true, finanzas: false, equipo: false, agenda: true, previsional: true,  ver_honorarios: false },
  procurador:{ dashboard: false, casos: true, finanzas: false, equipo: false, agenda: true, previsional: true,  ver_honorarios: false },
};

export const MODULOS: { key: keyof PermisosUsuario; label: string; description: string }[] = [
  { key: 'dashboard', label: 'Panel de Control', description: 'Métricas, alertas y resumen financiero' },
  { key: 'casos', label: 'Casos', description: 'Gestión de clientes y casos' },
  { key: 'finanzas', label: 'Finanzas', description: 'Ingresos, egresos y flujo de caja' },
  { key: 'equipo', label: 'Equipo', description: 'ABM de colaboradores y permisos' },
  { key: 'agenda', label: 'Agenda', description: 'Recordatorios, notas de voz y calendario' },
  { key: 'previsional', label: 'Previsional', description: 'Fichas, seguimiento y tareas previsionales' },
  { key: 'ver_honorarios', label: 'Ver Honorarios', description: 'Permite ver montos de honorarios en casos' },
];

export interface Cliente {
  id: string;
  nombre_apellido: string;
  telefono: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Caso {
  id: string;
  cliente_id: string;
  materia: 'Jubilaciones' | 'Sucesorios' | 'Reajuste' | 'Otro';
  materia_otro: string | null;
  estado: 'Vino a consulta' | 'Trámite no judicial' | 'Cliente Judicial';
  socio: Socio;
  fecha: string | null;
  interes: 'Muy interesante' | 'Interesante' | 'Poco interesante' | null;
  interes_porque: string | null;
  fuente: 'Derivado' | 'Campaña' | 'Captadora' | null;
  captadora: 'Milagros - La Quiaca' | 'Hilda - Norte' | null;
  honorarios_monto: number;
  modalidad_pago: 'Único' | 'En cuotas' | null;
  pago_unico_pagado: boolean | null;
  pago_unico_monto: number | null;
  pago_unico_fecha: string | null;
  observaciones: string | null;
  tiene_nota_voz: boolean;
  nota_voz_path: string | null;
  // Extensión spec ficha ultra completa
  expediente: string | null;
  radicado: string | null;
  sistema: 'Provincial' | 'Federal' | null;
  personeria: 'Patrocinante' | 'Apoderado' | 'Personería de urgencia' | null;
  prioridad: 'Alta' | 'Media' | 'Sin prioridad';
  archivado: boolean;
  url_drive: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface CasoCompleto extends Caso {
  nombre_apellido: string;
  telefono: string | null;
  total_acordado: number;
  total_cobrado: number;
  saldo_pendiente: number;
  creado_por_nombre: string | null;
  editado_por_nombre: string | null;
}

export interface Cuota {
  id: string;
  caso_id: string;
  fecha: string;
  monto: number;
  estado: 'Pagado' | 'Pendiente';
  fecha_pago: string | null;
  cobrado_por: Socio | null;
  modalidad_pago: 'Efectivo' | 'Transferencia' | null;
  notas: string | null;
  created_at: string;
}

export interface Ingreso {
  id: string;
  caso_id: string | null;
  fecha: string;
  cliente_nombre: string | null;
  materia: string | null;
  concepto: string | null;
  monto_total: number;
  monto_cj_noa: number;
  comision_captadora: number;
  captadora_nombre: string | null;
  socio_cobro: string | null;
  modalidad: 'Efectivo' | 'Transferencia' | null;
  notas: string | null;
  es_manual: boolean;
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface Egreso {
  id: string;
  fecha: string;
  concepto: string;
  concepto_detalle: string | null;
  caso_id: string | null;
  monto: number;
  modalidad: 'Efectivo' | 'Transferencia';
  responsable: string;
  observaciones: string | null;
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface FinanzaExcelResumen {
  id: string;
  periodo: string;
  hoja: string;
  metricas: Record<string, any>;
  formulas: Record<string, { formula: string; value: string | number | boolean | null }>;
  created_at: string;
  updated_at: string;
}

export interface Documento {
  id: string;
  caso_id: string;
  nombre: string;
  nombre_archivo: string;
  tipo: string;
  tamano: number;
  storage_path: string;
  subido_por: string | null;
  created_at: string;
}

export interface MovimientoCaso {
  id: string;
  caso_id: string;
  tipo: 'deposito' | 'gasto';
  monto: number;
  moneda: 'ARS' | 'USD';
  concepto: string;
  fecha: string;
  observaciones: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Recordatorio {
  id: string;
  usuario_id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  hora: string;
  color: string;
  completado: boolean;
  caso_id: string | null;
  tiene_audio: boolean;
  audio_path: string | null;
  created_at: string;
  updated_at: string;
}

export type Socio = 'Rodrigo' | 'Noelia' | 'Fabricio' | 'Alejandro';

export type ResponsableFinanza = string;

export type Materia = 'Jubilaciones' | 'Sucesorios' | 'Reajuste' | 'Otro';

export type EstadoCaso = 'Vino a consulta' | 'Trámite no judicial' | 'Cliente Judicial';

export const SOCIOS: Socio[] = ['Rodrigo', 'Noelia', 'Fabricio', 'Alejandro'];

export const MATERIAS: Materia[] = ['Jubilaciones', 'Sucesorios', 'Reajuste', 'Otro'];

export const ESTADOS_CASO: EstadoCaso[] = ['Vino a consulta', 'Trámite no judicial', 'Cliente Judicial'];

export type SistemaJudicial = 'Provincial' | 'Federal';
export const SISTEMAS_JUDICIALES: SistemaJudicial[] = ['Provincial', 'Federal'];

export type TipoPersoneria = 'Patrocinante' | 'Apoderado' | 'Personería de urgencia';
export const PERSONERIAS: TipoPersoneria[] = ['Patrocinante', 'Apoderado', 'Personería de urgencia'];

export type PrioridadCaso = 'Alta' | 'Media' | 'Sin prioridad';
export const PRIORIDADES_CASO: PrioridadCaso[] = ['Alta', 'Media', 'Sin prioridad'];

export const CONCEPTOS_EGRESO = {
  'Sueldos': ['Kari', 'Melani', 'Álvaro'],
  'Alquileres': ['Yrigoyen', 'Newbery', 'La Quiaca'],
  'Servicios': ['EJESA Yrigoyen', 'EJESA Newbery', 'GAS Yrigoyen', 'LIMSA', 'MACRO (Visa/impresora/sillas)', 'Wi-Fi nuevo', 'Wifi Yrigoyen'],
  'Cultura': [],
  'Gastos Judiciales': [],
  'Otro': [],
} as const;

export type CategoriaEgreso = keyof typeof CONCEPTOS_EGRESO;

export interface FilterState {
  busqueda: string;
  materias: Materia[];
  estados: EstadoCaso[];
  socios: string[];
  interes: string[];
  soloDeudores: boolean;
  soloCuotasVencidas: boolean;
  fechaDesde: string;
  fechaHasta: string;
}
