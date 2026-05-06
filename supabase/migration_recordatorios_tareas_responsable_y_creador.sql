-- ============================================================================
-- Migration: Notificar tambien al creador de la tarea (no solo al responsable)
-- y agregar tipo 'tarea_proxima' / 'tarea_vencida' (idempotente).
-- Reemplaza la funcion revisar_recordatorios_tareas para insertar 1 notif
-- por (user, tarea, dia) tanto para responsable como para created_by.
-- ============================================================================

-- Asegurar que el CHECK acepte los tipos (idempotente)
ALTER TABLE public.notificaciones_app DROP CONSTRAINT IF EXISTS notificaciones_app_tipo_check;
ALTER TABLE public.notificaciones_app ADD CONSTRAINT notificaciones_app_tipo_check
  CHECK (tipo IN (
    'tarea_asignada','tarea_vista','tarea_estado','nota_caso',
    'tarea_proxima','tarea_vencida',
    'generico'
  ));

-- Indice unico parcial: una notificacion por (user_id, tipo, related_id, dia)
-- para evitar duplicados aunque haya mas de un destinatario por tarea.
DROP INDEX IF EXISTS uq_notif_tarea_recordatorio_dia;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_tarea_recordatorio_user_dia
  ON public.notificaciones_app (user_id, tipo, related_id, (created_at::date))
  WHERE tipo IN ('tarea_proxima','tarea_vencida');

CREATE OR REPLACE FUNCTION public.revisar_recordatorios_tareas()
RETURNS TABLE(creadas integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  v_creadas integer := 0;
  v_dias_restantes integer;
  v_caso_titulo text;
  v_destino uuid;
  v_destinos uuid[];
BEGIN
  FOR rec IN
    SELECT t.id, t.titulo, t.fecha_limite, t.responsable_id, t.created_by, t.cargo_hora,
           t.caso_general_id, t.caso_id
    FROM tareas t
    WHERE t.fecha_limite IS NOT NULL
      AND t.archivada = false
      AND t.estado NOT IN ('completada','finalizada')
      AND t.fecha_limite::date <= (current_date + INTERVAL '2 days')::date
  LOOP
    v_dias_restantes := (rec.fecha_limite::date - current_date);
    SELECT titulo INTO v_caso_titulo FROM casos_generales WHERE id = rec.caso_general_id;

    -- Armar lista de destinatarios unicos (responsable + creador, si difieren y no son null)
    v_destinos := ARRAY[]::uuid[];
    IF rec.responsable_id IS NOT NULL THEN v_destinos := array_append(v_destinos, rec.responsable_id); END IF;
    IF rec.created_by IS NOT NULL AND rec.created_by <> COALESCE(rec.responsable_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      v_destinos := array_append(v_destinos, rec.created_by);
    END IF;

    FOREACH v_destino IN ARRAY v_destinos LOOP
      BEGIN
        IF v_dias_restantes < 0 THEN
          INSERT INTO notificaciones_app (user_id, tipo, titulo, mensaje, link, related_id, related_caso_general_id)
          VALUES (
            v_destino,
            'tarea_vencida',
            'Tarea VENCIDA: ' || rec.titulo,
            'La tarea "' || rec.titulo || '"' ||
              CASE WHEN rec.cargo_hora IS NOT NULL AND length(trim(rec.cargo_hora))>0 THEN ' (cargo de hora: ' || rec.cargo_hora || ')' ELSE '' END ||
              ' vencio hace ' || abs(v_dias_restantes) || ' dia(s).' ||
              CASE WHEN v_caso_titulo IS NOT NULL THEN ' Caso: ' || v_caso_titulo ELSE '' END,
            '/tareas?focus=' || rec.id::text,
            rec.id,
            rec.caso_general_id
          );
          v_creadas := v_creadas + 1;
        ELSE
          INSERT INTO notificaciones_app (user_id, tipo, titulo, mensaje, link, related_id, related_caso_general_id)
          VALUES (
            v_destino,
            'tarea_proxima',
            CASE WHEN v_dias_restantes = 0 THEN 'Tarea VENCE HOY: ' || rec.titulo
                 WHEN v_dias_restantes = 1 THEN 'Tarea vence MANANA: ' || rec.titulo
                 ELSE 'Tarea vence en 2 dias: ' || rec.titulo END,
            'Recordatorio: la tarea "' || rec.titulo || '"' ||
              CASE WHEN rec.cargo_hora IS NOT NULL AND length(trim(rec.cargo_hora))>0 THEN ' (cargo de hora: ' || rec.cargo_hora || ')' ELSE '' END ||
              CASE WHEN v_dias_restantes = 0 THEN ' vence HOY.'
                   WHEN v_dias_restantes = 1 THEN ' vence manana.'
                   ELSE ' vence en 2 dias.' END ||
              CASE WHEN v_caso_titulo IS NOT NULL THEN ' Caso: ' || v_caso_titulo ELSE '' END,
            '/tareas?focus=' || rec.id::text,
            rec.id,
            rec.caso_general_id
          );
          v_creadas := v_creadas + 1;
        END IF;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_creadas;
END $$;

GRANT EXECUTE ON FUNCTION public.revisar_recordatorios_tareas() TO authenticated;
