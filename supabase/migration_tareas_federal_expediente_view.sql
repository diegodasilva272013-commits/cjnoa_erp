-- ============================================================
-- Agrega el número de expediente del cliente federal a la vista
-- tareas_completas_v2, para que una tarea vinculada a un caso
-- Federal muestre expediente igual que Provincial (CasoInfoBar en
-- Tareas.tsx). Solo agrega UNA columna al final de la vista — no
-- borra ni reordena nada de lo existente.
-- ============================================================

CREATE OR REPLACE VIEW public.tareas_completas_v2 AS
SELECT
  t.*,
  cl.nombre_apellido     AS cliente_nombre,
  c.expediente           AS expediente_caso,
  cg.titulo              AS caso_general_titulo,
  cg.expediente          AS caso_general_expediente,
  cf.apellido_nombre     AS cliente_federal_nombre,
  cf.tipo_caso           AS cliente_federal_tipo,
  p_resp.nombre          AS responsable_nombre,
  p_resp.avatar_url      AS responsable_avatar,
  p_create.nombre        AS creado_por_nombre,
  p_create.avatar_url    AS creado_por_avatar,
  cf.numero_expediente   AS cliente_federal_expediente
FROM public.tareas t
LEFT JOIN public.casos              c        ON c.id  = t.caso_id
LEFT JOIN public.clientes           cl       ON cl.id = c.cliente_id
LEFT JOIN public.casos_generales    cg       ON cg.id = t.caso_general_id
LEFT JOIN public.clientes_federales cf       ON cf.id = t.cliente_federal_id
LEFT JOIN public.perfiles           p_resp   ON p_resp.id   = t.responsable_id
LEFT JOIN public.perfiles           p_create ON p_create.id = t.created_by;

NOTIFY pgrst, 'reload schema';
