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

  // Calcular duración
  const tiemposCompletado = pasos
    .map(p => p.completado_at ? new Date(p.completado_at).getTime() : null)
    .filter((x): x is number => x != null);
  let durTxt = '—';
  let durMin = 0;
  if (tiemposCompletado.length > 0) {
    const min = Math.min(...tiemposCompletado);
    const max = Math.max(...tiemposCompletado);
    durMin = Math.max(0, Math.floor((max - min) / 60000));
    if (durMin < 60) durTxt = `${durMin} min`;
    else if (durMin < 60 * 24) durTxt = `${Math.floor(durMin / 60)}h ${durMin % 60}min`;
    else durTxt = `${Math.floor(durMin / 1440)}d ${Math.floor((durMin % 1440) / 60)}h`;
  }

  const pasosTxt = pasos
    .map(p => `• Paso ${p.orden}: ${p.descripcion || '(sin descripción)'}\n   ✓ Hecho por ${nombres[p.completado_por] || '—'}` +
      (p.completado_at ? ` el ${new Date(p.completado_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : ''))
    .join('\n');

  // Llamar IA (best-effort)
  let bloqueIa = '';
  try {
    const resp = await fetch('/api/copiloto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'reporte_tarea_finalizada',
        datos: {
          titulo: tarea?.titulo || tareaTitulo,
          descripcion: tarea?.descripcion || '',
          caso_titulo: caso?.titulo || caso?.cliente_nombre || '',
          duracion_min: durMin,
          total_pasos: pasos.length,
          pasos: pasos.map(p => ({
            orden: p.orden,
            descripcion: p.descripcion,
            hecho_por: nombres[p.completado_por] || null,
            hecho_at: p.completado_at,
          })),
        },
      }),
    });
    if (resp.ok) {
      const j = await resp.json();
      const lineas: string[] = [];
      lineas.push('🤖 ANÁLISIS IA');
      if (j.resumen) lineas.push(`\n📋 Resumen: ${j.resumen}`);
      if (j.analisis) lineas.push(`\n🔍 Análisis: ${j.analisis}`);
      if (Array.isArray(j.proximos_pasos) && j.proximos_pasos.length > 0) {
        lineas.push('\n⚡ Próximos pasos sugeridos:');
        j.proximos_pasos.forEach((p: string, i: number) => lineas.push(`   ${i + 1}. ${p}`));
      }
      if (Array.isArray(j.observaciones) && j.observaciones.length > 0) {
        lineas.push('\n💡 Observaciones:');
        j.observaciones.forEach((o: string) => lineas.push(`   • ${o}`));
      }
      bloqueIa = lineas.join('\n');
    }
  } catch {
    // sin IA: la nota se inserta igual con el reporte básico
  }

  const contenido =
    `✅ TAREA FINALIZADA: ${tarea?.titulo || tareaTitulo}\n` +
    `🕒 Duración total: ${durTxt}\n` +
    `👥 Pasos: ${pasos.length}\n\n` +
    `Reporte automático:\n${pasosTxt}` +
    (bloqueIa ? `\n\n${bloqueIa}` : '');

  await supabase.from('caso_general_notas').insert({
    caso_id: casoGeneralId,
    contenido,
    tarea_id: tareaId,
    created_by: completadoPor,
  });
}
