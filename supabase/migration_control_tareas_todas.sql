-- ============================================================================
-- Migration: Control de Tareas debe mostrar TODAS las tareas (no solo cargo_hora)
-- Redefine la vista control_tareas_v sin el filtro de cargo_hora.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================================

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
WHERE t.archivada = false;

GRANT SELECT ON public.control_tareas_v TO authenticated;
