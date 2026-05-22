import { supabase } from './supabase';

/**
 * Espejo de tareaPasosNotify.ts pero para tareas_federales.
 * - Notifica al siguiente paso pendiente con responsable cuando se completa uno.
 * - Si se completaron TODOS los pasos: marca la tarea como 'completada',
 *   notifica a todos los participantes (excepto quien cerró) y deja un
 *   registro automático en clientes_federales_notas (el "seguimiento" del federal).
 */
export async function notificarSiguientePasoFederal(
  tareaFederalId: string,
  pasoCompletadoOrden: number,
  pasoCompletadoDescripcion: string,
  completadoPor: string,
  completadoPorNombre: string
): Promise<void> {
  try {
    const { data: pasos } = await supabase
      .from('tarea_federal_pasos')
      .select('id, orden, descripcion, responsable_id, completado, completado_por')
      .eq('tarea_federal_id', tareaFederalId)
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
      .from('tareas_federales')
      .select('titulo, responsable_id, created_by, cliente_fed_id')
      .eq('id', tareaFederalId)
      .maybeSingle();
    const tareaTitulo = (tareaRow as any)?.titulo || 'tarea';
    const respPrincipal = (tareaRow as any)?.responsable_id as string | null;
    const creador = (tareaRow as any)?.created_by as string | null;
    const clienteFed = (tareaRow as any)?.cliente_fed_id as string | null;

    if (todosCompletos) {
      const participantes = new Set<string>();
      for (const p of lista) {
        if (p.completado_por) participantes.add(p.completado_por);
        if (p.responsable_id) participantes.add(p.responsable_id);
      }
      if (respPrincipal) participantes.add(respPrincipal);
      if (creador) participantes.add(creador);

      // 1) Marcar la tarea como completada (el trigger ya lo hace, pero por las dudas)
      await supabase
        .from('tareas_federales')
        .update({ estado: 'completada', fecha_completada: new Date().toISOString(), completada_por: completadoPor })
        .eq('id', tareaFederalId);

      // 2) Notificación a TODOS los participantes (excepto quien cerró)
      const destinatarios = Array.from(participantes).filter(uid => uid !== completadoPor);
      if (destinatarios.length > 0) {
        const link = '/casos-federales';
        const rows = destinatarios.map(uid => ({
          user_id: uid,
          tipo: 'tarea_asignada',
          titulo: '🎉 Tarea finalizada: ' + tareaTitulo,
          mensaje: `${completadoPorNombre || 'Alguien'} cerró el último paso.`,
          link,
          related_id: tareaFederalId,
          related_user_id: completadoPor,
        }));
        await supabase.from('notificaciones_app').insert(rows);
      }

      // 3) Registro automático en el seguimiento del cliente federal
      if (clienteFed) {
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
        await supabase.from('clientes_federales_notas').insert({
          cliente_fed_id: clienteFed,
          contenido: partes.join('\n'),
          tarea_federal_id: tareaFederalId,
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
      link: '/casos-federales',
      related_id: tareaFederalId,
      related_user_id: completadoPor,
    });
  } catch {
    // silent: best-effort
  }
}

export async function notificarAsignacionPasoFederal(
  tareaFederalId: string,
  responsableId: string,
  pasoDescripcion: string,
  asignadoPor: string,
  asignadoPorNombre: string
): Promise<void> {
  try {
    if (!responsableId || responsableId === asignadoPor) return;
    const { data: tareaRow } = await supabase
      .from('tareas_federales')
      .select('titulo')
      .eq('id', tareaFederalId)
      .maybeSingle();
    const tareaTitulo = (tareaRow as any)?.titulo || 'tarea';
    await supabase.from('notificaciones_app').insert({
      user_id: responsableId,
      tipo: 'tarea_asignada',
      titulo: '🚀 Nuevo paso asignado: ' + tareaTitulo,
      mensaje: `${asignadoPorNombre || 'Alguien'} te asignó un paso: ${pasoDescripcion}. Aparece en tu Mi Día.`,
      link: '/casos-federales',
      related_id: tareaFederalId,
      related_user_id: asignadoPor,
    });
  } catch {
    // silent
  }
}
