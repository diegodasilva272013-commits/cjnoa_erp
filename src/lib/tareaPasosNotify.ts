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
      .select('id, orden, descripcion, responsable_id, completado, completado_por')
      .eq('tarea_id', tareaId)
      .order('orden', { ascending: true });

    const lista = (pasos || []) as Array<{
      orden: number;
      descripcion: string;
      responsable_id: string | null;
      completado: boolean;
      completado_por: string | null;
    }>;
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
      // Conjunto de TODOS los participantes: responsables de cada paso,
      // quienes efectivamente lo marcaron, el responsable principal y el
      // creador de la tarea.
      const participantes = new Set<string>();
      for (const p of lista) {
        if (p.completado_por) participantes.add(p.completado_por);
        if (p.responsable_id) participantes.add(p.responsable_id);
      }
      if (respPrincipal) participantes.add(respPrincipal);
      if (creador) participantes.add(creador);

      // 1) Marcar la tarea como finalizada → se despinea para todos.
      await supabase
        .from('tareas')
        .update({ estado: 'finalizada' })
        .eq('id', tareaId);

      // 2) Notificación a TODOS los participantes (excepto quien cerró).
      const destinatarios = Array.from(participantes).filter(uid => uid !== completadoPor);
      if (destinatarios.length > 0) {
        const link = casoGeneral ? `/seguimiento?caso=${casoGeneral}` : '/tareas';
        const rows = destinatarios.map(uid => ({
          user_id: uid,
          tipo: 'tarea_asignada',
          titulo: '🎉 Tarea finalizada: ' + tareaTitulo,
          mensaje: `${completadoPorNombre || 'Alguien'} cerró el último paso.`,
          link,
          related_id: tareaId,
          related_user_id: completadoPor,
        }));
        await supabase.from('notificaciones_app').insert(rows);
      }

      // 3) Registro en el seguimiento del caso con el resumen y la lista
      //    de participantes (si la tarea está vinculada a un caso provincial).
      if (casoGeneral) {
        const ids = Array.from(participantes);
        let nombres = '';
        if (ids.length > 0) {
          const { data: perfs } = await supabase
            .from('perfiles')
            .select('id, nombre')
            .in('id', ids);
          const byId = new Map((perfs || []).map((p: any) => [p.id, p.nombre as string]));
          nombres = ids.map(id => byId.get(id) || 'Usuario').join(', ');
        }
        const partes = [
          `🎉 Tarea completada: ${tareaTitulo}`,
          `Cerrada por ${completadoPorNombre || 'Alguien'} (último paso: "${pasoCompletadoDescripcion}").`,
          nombres ? `Participaron: ${nombres}.` : '',
        ].filter(Boolean);
        await supabase.from('caso_general_notas').insert({
          caso_id: casoGeneral,
          contenido: partes.join('\n'),
          created_by: completadoPor,
        });
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
