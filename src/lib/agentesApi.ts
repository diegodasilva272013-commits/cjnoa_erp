import { supabase } from './supabase';

/** Pide una acción a los agentes (analizar, pausar, aplicar un prompt…). El servidor valida que sea admin o socio. */
export async function llamarAgentes<T = any>(accion: string, datos: Record<string, unknown> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('La sesión venció: volvé a ingresar.');
  const r = await fetch('/api/turnos/agentes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ accion, ...datos }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as any)?.error || `Error ${r.status}`);
  return j as T;
}

export type EstadoAgente = {
  agente: 'analista' | 'redactor' | 'tester' | 'auditor';
  nombre: string;
  rol: string;
  estado: 'inactivo' | 'trabajando' | 'pausado' | 'error';
  tarea: string | null;
  progreso: number;
  actualizado_at: string;
};

export type RegistroAgente = {
  id: number;
  at: string;
  agente: string;
  run_id: string | null;
  nivel: 'info' | 'aviso' | 'error';
  accion: string;
  detalle: Record<string, unknown>;
};

export const ORDEN_AGENTES: EstadoAgente['agente'][] = ['analista', 'redactor', 'tester', 'auditor'];

/** "hace 3 min", "hace 2 h"… */
export function hace(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 10) return 'ahora';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}

/** Todo lo que se sabe de una persona que cuenta en las métricas (con su teléfono real y el número para abrir su WhatsApp). */
export type FilaPersona = {
  nombre: string; telefono: string; whatsapp: string; primer_mensaje: string; ultimo_mensaje: string;
  recibidos: number; enviados: number; contesto: boolean; estado: 'agendada' | 'en_curso' | 'abandonada'; etapa: string; se_enfrio_despues_de: string | null; esperando_respuesta: boolean;
  audios: number; fotos: number; documentos: number; recibos: string[]; comprobantes: string[];
  datos_de_pago: boolean; link_mp: boolean; importe_asignado: boolean; reserva_mp: boolean;
  cita: { fecha: string; hora: string | null; abogado: string | null; reserva_pagada: boolean; reprogramada: boolean; cancelacion: boolean } | null;
  campana: string | null; rama: string | null; errores: string[];
};

/** De dónde sale cada número, con nombres y teléfonos completos, para poder comprobarlo. */
export type DetalleConteo = {
  filas_en_periodo: number; de_noa: number; agente_anterior: number; fichas_en_periodo: number;
  excluidas: { nombre: string; tel: string; motivo: 'equipo' | 'prueba' | 'excluida' }[];
  fichas_sin_conversacion: { nombre: string; tel: string; creada: string }[];
};

/** Métricas del agente de WhatsApp (las calcula el servidor: ver calcularMetricasAgente). */
export type MetricasAgente = {
  generado_at: string;
  dias: number | null;
  personas: number;
  mensajes: { recibidos: number; enviados: number; audios: number; fotos: number; documentos: number; no_leidos: number };
  primer_contacto: { contestaron: number; no_contestaron: number; pct_contestaron: number };
  estados: { agendadas: number; en_curso: number; abandonadas: number };
  embudo: { etapa: string; alcanzaron: number; pct_del_total: number; pct_del_paso_anterior: number }[];
  se_quedaron_en: { etapa: string; cantidad: number }[];
  donde_mueren: { categoria: string; cantidad: number; pct: number }[];
  sin_respuesta_del_agente: number;
  pagos: { personas_con_datos_enviados: number; links_mp_enviados: number; importes_unicos_asignados: number; reservas_confirmadas: number };
  recibos: { total: number; sin_cargo: number; con_cargo: number; sin_descuento: number; sin_importe: number; ilegibles: number };
  comprobantes: { total: number; validados: number; pendientes_mp: number; insuficientes: number; otro_titular: number; ilegibles: number };
  turnos: { agendados: number; con_reserva_pagada: number; reprogramados: number; cancelaciones_solicitadas: number };
  derivaciones: number;
  errores: Record<string, number>;
  por_dia: { fecha: string; nuevas: number; agendadas: number }[];
  actividad_reciente: { nombre: string; hace_ms: number; estado: 'agendada' | 'en_curso' | 'abandonada'; etapa: string; esperando_al_agente: boolean }[];
  confianza: 'baja' | 'media' | 'alta';
  detalle: DetalleConteo | null;
  personas_detalle: FilaPersona[];
};

export type Optimizacion = { id: string; titulo: string; evidencia: string; cambio: string; impacto: 'alto' | 'medio' | 'bajo'; afectadas: number; fuente: 'reglas' | 'ia' };
export type InformeMejoras = { id: string; creado_at: string; resumen: string; fuente: 'reglas' | 'ia'; personas: number; mejoras: Optimizacion[] };
