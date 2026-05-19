// ============================================
// TYPES: Módulo Casos Federales
// Centro Jurídico NOA - ERP
// ============================================

export type PipelineFederal =
  | 'activo'
  | 'esperando_audiencia'
  | 'esperando_sentencia'
  | 'analisis_sin_directivas'
  | 'sin_pago'
  | 'seguimiento';

export type SexoCliente = 'HOMBRE' | 'MUJER';

export type TipoCasoFederal =
  | 'reajuste_movilidad'
  | 'reajuste_base_inicial'
  | 'articulo_9'
  | 'impuesto_ganancias'
  | 'otros';

export interface ClienteFederal {
  id: string;
  apellido_nombre: string;
  cuil: string | null;
  clave_social: string | null;
  clave_fiscal: string | null;
  fecha_nacimiento: string | null;
  sexo: SexoCliente | null;
  direccion: string | null;
  telefono: string | null;

  numero_expediente: string | null;
  tipo_caso: TipoCasoFederal[];
  tipo_caso_otros: string | null;

  resumen_informe: string | null;
  conclusion: string | null;
  fecha_ultimo_contacto: string | null;
  situacion_actual: string | null;
  captado_por: string | null;

  pipeline: PipelineFederal;
  pipeline_fecha_ingreso: string | null;

  cobro_total: number;
  monto_cobrado: number;

  url_drive: string | null;
  caso_id: string | null;
  cliente_id: string | null;

  visible_para: string[] | null;

  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface NotaFederal {
  id: string;
  cliente_fed_id: string;
  contenido: string;
  tarea_federal_id: string | null;
  audio_path: string | null;
  editado: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type EstadoTareaFederal = 'pendiente' | 'en_curso' | 'completada';
export type PrioridadTareaFederal = 'alta' | 'media' | 'sin_prioridad';

export interface TareaFederal {
  id: string;
  cliente_fed_id: string | null;
  titulo: string;
  descripcion: string | null;
  avance: string | null;
  estado: EstadoTareaFederal;
  prioridad: PrioridadTareaFederal;
  fecha_limite: string | null;
  responsable_id: string | null;
  responsable_nombre: string | null;
  derivada_a: string | null;
  observaciones_demora: string | null;
  archivos: Array<{ url: string; nombre: string }> | null;
  fecha_completada: string | null;
  completada_por: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

// ── Constantes UI ──
export const PIPELINE_FEDERAL_ORDERED: PipelineFederal[] = [
  'activo',
  'esperando_audiencia',
  'esperando_sentencia',
  'analisis_sin_directivas',
  'sin_pago',
  'seguimiento',
];

export const PIPELINE_FEDERAL_LABELS: Record<PipelineFederal, string> = {
  activo: 'Activo',
  esperando_audiencia: 'Esperando audiencia',
  esperando_sentencia: 'Esperando sentencia',
  analisis_sin_directivas: 'En análisis sin directivas',
  sin_pago: 'Sin pago',
  seguimiento: 'Seguimiento',
};

export const PIPELINE_FEDERAL_COLORS: Record<PipelineFederal, string> = {
  activo: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  esperando_audiencia: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  esperando_sentencia: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  analisis_sin_directivas: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  sin_pago: 'bg-red-500/10 text-red-400 border-red-500/20',
  seguimiento: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
};

export const TIPO_CASO_FEDERAL_LABELS: Record<TipoCasoFederal, string> = {
  reajuste_movilidad: 'Reajuste por Movilidad',
  reajuste_base_inicial: 'Reajuste por Recálculo de la Base Inicial',
  articulo_9: 'Artículo 9',
  impuesto_ganancias: 'Impuesto a las Ganancias',
  otros: 'Otros',
};

export const TIPO_CASO_FEDERAL_ORDERED: TipoCasoFederal[] = [
  'reajuste_movilidad',
  'reajuste_base_inicial',
  'articulo_9',
  'impuesto_ganancias',
  'otros',
];
