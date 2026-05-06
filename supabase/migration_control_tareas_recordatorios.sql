-- ============================================================================
-- Migration: Recordatorios automaticos de tareas con cargo de hora
-- - Tipo de notificacion: tarea_proxima
-- - Funcion idempotente que recorre tareas con cargo_hora + fecha_limite
--   <= now() + 2 dias, no completadas/finalizadas, y crea notificacion
--   para el responsable (una sola por tarea/dia).
-- - Tambien crea una notificacion 'tarea_vencida' cuando ya paso la fecha.
-- - La funcion se invoca desde el frontend al cargar el bell y la pagina
--   Control de Tareas (no requiere pg_cron).
-- ============================================================================

-- 1. Ampliar el CHECK de tipos de notificaciones_app
ALTER TABLE public.notificaciones_app DROP CONSTRAINT IF EXISTS notificaciones_app_tipo_check;
ALTER TABLE public.notificaciones_app ADD CONSTRAINT notificaciones_app_tipo_check
  CHECK (tipo IN (
    'tarea_asignada','tarea_vista','tarea_estado','nota_caso',
    'tarea_proxima','tarea_vencida',
    'generico'
  ));

-- Indice unico parcial: una notificacion por (tipo, related_id, dia) para evitar duplicados
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_tarea_recordatorio_dia
  ON public.notificaciones_app (tipo, related_id, (created_at::date))
  WHERE tipo IN ('tarea_proxima','tarea_vencida');

-- 2. Funcion principal: revisar recordatorios
CREATE OR REPLACE FUNCTION public.revisar_recordatorios_tareas()
RETURNS TABLE(creadas integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  v_creadas integer := 0;
  v_dias_restantes integer;
  v_caso_titulo text;
BEGIN
  FOR rec IN
    SELECT t.id, t.titulo, t.fecha_limite, t.responsable_id, t.cargo_hora,
           t.caso_general_id, t.caso_id
    FROM tareas t
    WHERE t.fecha_limite IS NOT NULL
      AND t.cargo_hora IS NOT NULL AND length(trim(t.cargo_hora)) > 0
      AND t.responsable_id IS NOT NULL
      AND t.archivada = false
      AND t.estado NOT IN ('completada','finalizada')
      AND t.fecha_limite::date <= (current_date + INTERVAL '2 days')::date
  LOOP
    v_dias_restantes := (rec.fecha_limite::date - current_date);

    SELECT titulo INTO v_caso_titulo FROM casos_generales WHERE id = rec.caso_general_id;

    IF v_dias_restantes < 0 THEN
      -- ya vencida
      BEGIN
        INSERT INTO notificaciones_app (user_id, tipo, titulo, mensaje, link, related_id, related_caso_general_id)
        VALUES (
          rec.responsable_id,
          'tarea_vencida',
          'Tarea VENCIDA: ' || rec.titulo,
          'La tarea "' || rec.titulo || '" (cargo de hora: ' || rec.cargo_hora || ') venci\u00f3 hace ' || abs(v_dias_restantes) || ' d\u00eda(s).' ||
            CASE WHEN v_caso_titulo IS NOT NULL THEN ' Caso: ' || v_caso_titulo ELSE '' END,
          '/control-tareas',
          rec.id,
          rec.caso_general_id
        );
        v_creadas := v_creadas + 1;
      EXCEPTION WHEN unique_violation THEN
        -- ya existe la notificacion de hoy para esta tarea
        NULL;
      END;
    ELSE
      -- proxima a vencer (0, 1 o 2 dias)
      BEGIN
        INSERT INTO notificaciones_app (user_id, tipo, titulo, mensaje, link, related_id, related_caso_general_id)
        VALUES (
          rec.responsable_id,
          'tarea_proxima',
          CASE WHEN v_dias_restantes = 0 THEN 'Tarea VENCE HOY: ' || rec.titulo
               WHEN v_dias_restantes = 1 THEN 'Tarea vence MA\u00d1ANA: ' || rec.titulo
               ELSE 'Tarea vence en 2 d\u00edas: ' || rec.titulo END,
          'Recordatorio: la tarea "' || rec.titulo || '" (cargo de hora: ' || rec.cargo_hora || ') ' ||
            CASE WHEN v_dias_restantes = 0 THEN 'vence HOY.'
                 WHEN v_dias_restantes = 1 THEN 'vence ma\u00f1ana.'
                 ELSE 'vence en 2 d\u00edas.' END ||
            CASE WHEN v_caso_titulo IS NOT NULL THEN ' Caso: ' || v_caso_titulo ELSE '' END,
          '/control-tareas',
          rec.id,
          rec.caso_general_id
        );
        v_creadas := v_creadas + 1;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_creadas;
END $$;

GRANT EXECUTE ON FUNCTION public.revisar_recordatorios_tareas() TO authenticated;

-- 3. Vista util para Control de Tareas (tareas con cargo_hora + estado de tiempo)
DROP VIEW IF EXISTS public.control_tareas_v CASCADE;
CREATE OR REPLACE VIEW public.control_tareas_v AS
SELECT
  t.*,
  cg.titulo                AS caso_general_titulo,
  cg.expediente            AS caso_general_expediente,
  cl.nombre_apellido       AS cliente_nombre,
  c.expediente             AS expediente_caso,
  p_resp.nombre            AS responsable_nombre,
  p_resp.avatar_url        AS responsable_avatar,
  p_create.nombre          AS creado_por_nombre,
  p_create.avatar_url      AS creado_por_avatar,
  CASE
    WHEN t.estado IN ('completada','finalizada') THEN 'realizada'
    WHEN t.fecha_limite IS NULL THEN 'sin_fecha'
    WHEN t.fecha_limite::date < current_date THEN 'vencida'
    WHEN t.fecha_limite::date = current_date THEN 'hoy'
    WHEN t.fecha_limite::date <= current_date + INTERVAL '2 days' THEN 'proxima'
    ELSE 'futura'
  END AS estado_tiempo,
  (t.fecha_limite::date - current_date) AS dias_restantes
FROM public.tareas t
LEFT JOIN public.casos_generales cg ON cg.id = t.caso_general_id
LEFT JOIN public.casos           c  ON c.id  = t.caso_id
LEFT JOIN public.clientes        cl ON cl.id = c.cliente_id
LEFT JOIN public.perfiles    p_resp   ON p_resp.id   = t.responsable_id
LEFT JOIN public.perfiles    p_create ON p_create.id = t.created_by
WHERE t.archivada = false
  AND t.cargo_hora IS NOT NULL
  AND length(trim(t.cargo_hora)) > 0;

GRANT SELECT ON public.control_tareas_v TO authenticated;

-- ============================================================================
-- FIN
-- ============================================================================
