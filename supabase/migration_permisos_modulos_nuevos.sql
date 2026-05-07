-- Agrega los nuevos modulos al JSONB de permisos:
--   casos_generales, agendamiento, casos_pagos, tareas, mi_dia, chat,
--   audiencias, calendario, cargos_hora, control_tareas, timeline
--
-- Estrategia: para cada perfil existente, hacer un MERGE (||) entre el permisos actual
-- y el set de defaults segun el rol. Asi:
--   - Los toggles que el admin ya configuro siguen tal cual.
--   - Las nuevas claves quedan en true por defecto (excepto procurador en pagos/agendamiento).

-- 1) Defaults por rol (JSONB) que vamos a usar para backfill.
WITH defaults AS (
  SELECT 'admin'::text AS rol, jsonb_build_object(
    'dashboard', true, 'casos', true, 'finanzas', true, 'equipo', true, 'agenda', true, 'previsional', true,
    'honorarios', true, 'ver_honorarios', true,
    'casos_generales', true, 'agendamiento', true, 'casos_pagos', true,
    'tareas', true, 'mi_dia', true, 'chat', true,
    'audiencias', true, 'calendario', true, 'cargos_hora', true,
    'control_tareas', true, 'timeline', true
  ) AS p
  UNION ALL SELECT 'socio', jsonb_build_object(
    'dashboard', true, 'casos', true, 'finanzas', true, 'equipo', false, 'agenda', true, 'previsional', true,
    'honorarios', true, 'ver_honorarios', true,
    'casos_generales', true, 'agendamiento', true, 'casos_pagos', true,
    'tareas', true, 'mi_dia', true, 'chat', true,
    'audiencias', true, 'calendario', true, 'cargos_hora', true,
    'control_tareas', true, 'timeline', true
  )
  UNION ALL SELECT 'abogado', jsonb_build_object(
    'dashboard', true, 'casos', true, 'finanzas', true, 'equipo', false, 'agenda', true, 'previsional', true,
    'honorarios', true, 'ver_honorarios', true,
    'casos_generales', true, 'agendamiento', false, 'casos_pagos', false,
    'tareas', true, 'mi_dia', true, 'chat', true,
    'audiencias', true, 'calendario', true, 'cargos_hora', true,
    'control_tareas', true, 'timeline', true
  )
  UNION ALL SELECT 'empleado', jsonb_build_object(
    'dashboard', true, 'casos', true, 'finanzas', true, 'equipo', false, 'agenda', true, 'previsional', true,
    'honorarios', true, 'ver_honorarios', true,
    'casos_generales', true, 'agendamiento', true, 'casos_pagos', false,
    'tareas', true, 'mi_dia', true, 'chat', true,
    'audiencias', true, 'calendario', true, 'cargos_hora', true,
    'control_tareas', true, 'timeline', true
  )
  UNION ALL SELECT 'procurador', jsonb_build_object(
    'dashboard', false, 'casos', true, 'finanzas', false, 'equipo', false, 'agenda', true, 'previsional', true,
    'honorarios', false, 'ver_honorarios', false,
    'casos_generales', true, 'agendamiento', false, 'casos_pagos', false,
    'tareas', true, 'mi_dia', true, 'chat', true,
    'audiencias', true, 'calendario', true, 'cargos_hora', true,
    'control_tareas', true, 'timeline', true
  )
)
-- 2) Backfill: defaults || permisos_actuales (los actuales prevalecen sobre los defaults).
--    Asi solo se agregan las claves NUEVAS que faltaban; las existentes no se pisan.
UPDATE public.perfiles p
SET permisos = d.p || COALESCE(p.permisos, '{}'::jsonb)
FROM defaults d
WHERE d.rol = p.rol;

-- 3) Cambiar el DEFAULT de la columna para nuevos perfiles (admin como base, igual se setea segun rol al insertar).
ALTER TABLE public.perfiles
  ALTER COLUMN permisos SET DEFAULT jsonb_build_object(
    'dashboard', true, 'casos', true, 'finanzas', true, 'equipo', false, 'agenda', true, 'previsional', true,
    'honorarios', true, 'ver_honorarios', true,
    'casos_generales', true, 'agendamiento', true, 'casos_pagos', false,
    'tareas', true, 'mi_dia', true, 'chat', true,
    'audiencias', true, 'calendario', true, 'cargos_hora', true,
    'control_tareas', true, 'timeline', true
  );
