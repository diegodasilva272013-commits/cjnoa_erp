import { supabase } from './supabase';

/**
 * Cuando se completa un paso de una tarea compartida, busca el siguiente
 * paso pendiente y le inserta una notificación al responsable, para que
 * la campana + sonido se disparen al instante (no depende del trigger de
 * Supabase). Usa el tipo 'tarea_asignada' que ya existe en el CHECK
 * constraint original de notificaciones_app.
 */
export async function notificarSiguientePaso(
  tareaId: string,
  pasoCompletadoOrden: number,
  pasoCompletadoDescripcion: string,
  completadoPor: string,
  completadoPorNombre: string
): Promise<void> {
  try {
    const { data: pasos } = await supabase
      .from('tarea_pasos')
      .select('id, orden, descripcion, responsable_id, completado')
      .eq('tarea_id', tareaId)
      .order('orden', { ascending: true });

    const lista = (pasos || []) as Array<{ orden: number; descripcion: string; responsable_id: string | null; completado: boolean }>;
    const todosCompletos = lista.length > 0 && lista.every(p => p.completado);

    const { data: tareaRow } = await supabase
      .from('tareas')
      .select('titulo, responsable_id, created_by, caso_general_id')
      .eq('id', tareaId)
      .maybeSingle();
    const tareaTitulo = (tareaRow as any)?.titulo || 'tarea';
    const respPrincipal = (tareaRow as any)?.responsable_id as string | null;
    const creador = (tareaRow as any)?.created_by as string | null;
    const casoGeneral = (tareaRow as any)?.caso_general_id as string | null;

    if (todosCompletos) {
      const destinatarios = new Set<string>();
      if (respPrincipal && respPrincipal !== completadoPor) destinatarios.add(respPrincipal);
      if (creador && creador !== completadoPor) destinatarios.add(creador);
      if (destinatarios.size > 0) {
        const link = casoGeneral ? `/seguimiento?caso=${casoGeneral}` : '/tareas';
        const rows = Array.from(destinatarios).map(uid => ({
          user_id: uid,
          tipo: 'tarea_asignada',
          titulo: '🎉 Tarea finalizada: ' + tareaTitulo,
          mensaje: `${completadoPorNombre || 'Alguien'} cerró el último paso. Reporte automático cargado en el caso.`,
          link,
          related_id: tareaId,
          related_user_id: completadoPor,
        }));
        await supabase.from('notificaciones_app').insert(rows);
      }
      // Reporte IA + nota en seguimiento (best-effort, no bloquea)
      if (casoGeneral) {
        generarReporteIaYNota(tareaId, tareaTitulo, casoGeneral, completadoPor).catch(() => { /* silent */ });
      }
      return;
    }

    const siguiente = lista.find(
      p => !p.completado && p.responsable_id && p.orden > pasoCompletadoOrden
    );
    if (!siguiente || !siguiente.responsable_id) return;
    if (siguiente.responsable_id === completadoPor) return;

    await supabase.from('notificaciones_app').insert({
      user_id: siguiente.responsable_id,
      tipo: 'tarea_asignada',
      titulo: '⚡ Te toca continuar: ' + tareaTitulo,
      mensaje: `${completadoPorNombre || 'Alguien'} completó "${pasoCompletadoDescripcion}". Ahora te toca: ${siguiente.descripcion}`,
      link: '/mi-dia',
      related_id: tareaId,
      related_user_id: completadoPor,
    });
  } catch {
    // silent: it's a best-effort enhancement
  }
}

/**
 * Notifica al responsable de un paso recién asignado para que vea su tarea
 * apenas se la asignan (no espera a que el paso anterior se complete).
 */
export async function notificarAsignacionPaso(
  tareaId: string,
  responsableId: string,
  pasoDescripcion: string,
  asignadoPor: string,
  asignadoPorNombre: string
): Promise<void> {
  try {
    if (!responsableId || responsableId === asignadoPor) return;
    const { data: tareaRow } = await supabase
      .from('tareas')
      .select('titulo')
      .eq('id', tareaId)
      .maybeSingle();
    const tareaTitulo = (tareaRow as any)?.titulo || 'tarea';
    await supabase.from('notificaciones_app').insert({
      user_id: responsableId,
      tipo: 'tarea_asignada',
      titulo: '🚀 Nuevo paso asignado: ' + tareaTitulo,
      mensaje: `${asignadoPorNombre || 'Alguien'} te asignó un paso: ${pasoDescripcion}. Aparece en tu Mi Día.`,
      link: '/mi-dia',
      related_id: tareaId,
      related_user_id: asignadoPor,
    });
  } catch {
    // silent
  }
}

/**
 * Genera un reporte automático de la tarea finalizada (con análisis IA si
 * está disponible), arma una nota linda y la inserta en el seguimiento del
 * caso para que todos lo vean sin tener que cargarlo a mano.
 */
async function generarReporteIaYNota(
  tareaId: string,
  tareaTitulo: string,
  casoGeneralId: string,
  completadoPor: string
): Promise<void> {
  // Datos detallados de la tarea + pasos
  const { data: tarea } = await supabase
    .from('tareas')
    .select('titulo, descripcion, caso_general_id')
    .eq('id', tareaId)
    .maybeSingle();

  const { data: caso } = await supabase
    .from('casos_generales')
    .select('titulo, expediente, cliente_nombre')
    .eq('id', casoGeneralId)
    .maybeSingle();

  const { data: pasosFull } = await supabase
    .from('tarea_pasos')
    .select('orden, descripcion, completado, completado_at, completado_por, responsable_id')
    .eq('tarea_id', tareaId)
    .order('orden', { ascending: true });

  const pasos = (pasosFull || []) as any[];
  if (pasos.length === 0) return;

  // Resolver nombres
  const userIds = Array.from(new Set(
    pasos.flatMap(p => [p.completado_por, p.responsable_id]).filter(Boolean)
  )) as string[];
  let nombres: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: perfiles } = await supabase
      .from('perfiles')
      .select('id, nombre')
      .in('id', userIds);
    nombres = Object.fromEntries((perfiles || []).map((p: any) => [p.id, p.nombre]));
  }

  // Helper formato corto
  const fmtMin = (m: number) => {
    if (m < 1) return '<1 min';
    if (m < 60) return `${m} min`;
    if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}min`;
    return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  };

  // Duración total = max(completado_at) - min(completado_at)
  const tiempos = pasos
    .map(p => p.completado_at ? new Date(p.completado_at).getTime() : null)
    .filter((x): x is number => x != null);
  let durTotal = 0;
  if (tiempos.length > 0) {
    durTotal = Math.max(0, Math.floor((Math.max(...tiempos) - Math.min(...tiempos)) / 60000));
  }

  // Por paso: tiempo desde el paso anterior (o "—" en el primero)
  let prev: number | null = null;
  const lineas = pasos.map(p => {
    const t = p.completado_at ? new Date(p.completado_at).getTime() : null;
    let dur = '—';
    if (t != null && prev != null) {
      const m = Math.max(0, Math.floor((t - prev) / 60000));
      dur = fmtMin(m);
    }
    if (t != null) prev = t;
    const quien = nombres[p.completado_por] || '—';
    return `• Paso ${p.orden} (${p.descripcion || 's/d'}) — ${quien}: ${dur}`;
  });

  const contenido =
    `✅ ${tarea?.titulo || tareaTitulo} — finalizada\n` +
    `🕒 Total: ${fmtMin(durTotal)}  ·  Pasos: ${pasos.length}\n\n` +
    lineas.join('\n');

  await supabase.from('caso_general_notas').insert({
    caso_id: casoGeneralId,
    contenido,
    tarea_id: tareaId,
    created_by: completadoPor,
  });
}
