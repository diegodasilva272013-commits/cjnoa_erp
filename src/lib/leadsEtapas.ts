/** Etapas de un lead. Las primeras cinco las asigna solo el sistema según lo que hizo el agente;
 *  las demás las mueve el equipo a mano y el sistema nunca las pisa. */
export const ETAPAS_LEAD = [
  { id: 'nuevo', label: 'Nuevo', color: 'bg-zinc-700/50 text-zinc-300 border-zinc-600/40', auto: true },
  { id: 'calificacion_a_medias', label: 'Calificación a medias', color: 'bg-amber-900/40 text-amber-300 border-amber-700/40', auto: true },
  { id: 'califico_sin_horario', label: 'Calificó sin horario', color: 'bg-orange-900/40 text-orange-300 border-orange-700/40', auto: true },
  { id: 'agendado', label: 'Agendado', color: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40', auto: true },
  { id: 'fuera_de_avatar', label: 'Fuera de avatar', color: 'bg-red-900/40 text-red-300 border-red-700/40', auto: true },
  { id: 'consulta_realizada', label: 'Consulta realizada', color: 'bg-sky-900/40 text-sky-300 border-sky-700/40', auto: false },
  { id: 'cliente', label: 'Cliente', color: 'bg-violet-900/40 text-violet-300 border-violet-700/40', auto: false },
  { id: 'no_califica', label: 'No califica', color: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/40', auto: false },
] as const;

export function etapaDe(id: string) {
  return ETAPAS_LEAD.find(e => e.id === id) ?? { id, label: id, color: 'bg-zinc-700/50 text-zinc-300 border-zinc-600/40', auto: false };
}

export const ETIQUETAS_CALIFICACION: Record<string, string> = {
  alto_valor: 'Alto valor', estandar: 'Estándar', fuera_avatar: 'Fuera de avatar',
};
