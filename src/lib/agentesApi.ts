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
