-- ============================================================================
-- ARREGLO: la vista casos_completos tiene que incluir TODAS las columnas actuales de casos.
--
-- Qué pasó: al volver a correr migration_ficha_caso_extendida.sql, la vista se recreó con una definición
-- más vieja y le faltan caratula, apoderado, estadisticas, actualizacion, actualizacion_fecha y actualizacion_por.
--
-- SEGURO: no modifica ni borra datos (las vistas no guardan datos). Mantiene todas las columnas actuales en el
-- mismo orden y solo AGREGA las que faltan al final. Se puede correr más de una vez.
-- ============================================================================
CREATE OR REPLACE VIEW public.casos_completos AS
SELECT
  c.id,
  cl.nombre_apellido,
  cl.telefono,
  cl.id AS cliente_id,
  c.materia,
  c.materia_otro,
  c.estado,
  c.socio,
  c.fecha,
  c.interes,
  c.interes_porque,
  c.fuente,
  c.captadora,
  c.honorarios_monto,
  c.modalidad_pago,
  c.pago_unico_pagado,
  c.pago_unico_monto,
  c.pago_unico_fecha,
  c.observaciones,
  c.tiene_nota_voz,
  c.nota_voz_path,
  c.expediente,
  c.radicado,
  c.sistema,
  c.personeria,
  c.prioridad,
  c.archivado,
  c.url_drive,
  c.created_at,
  c.updated_at,
  c.created_by,
  c.updated_by,
  COALESCE(c.honorarios_monto, 0) AS total_acordado,
  COALESCE(
    CASE
      WHEN c.modalidad_pago = 'Único' AND c.pago_unico_pagado = true THEN c.pago_unico_monto
      ELSE (SELECT COALESCE(SUM(cu.monto), 0) FROM public.cuotas cu WHERE cu.caso_id = c.id AND cu.estado = 'Pagado')
    END, 0
  ) AS total_cobrado,
  COALESCE(c.honorarios_monto, 0) - COALESCE(
    CASE
      WHEN c.modalidad_pago = 'Único' AND c.pago_unico_pagado = true THEN c.pago_unico_monto
      ELSE (SELECT COALESCE(SUM(cu.monto), 0) FROM public.cuotas cu WHERE cu.caso_id = c.id AND cu.estado = 'Pagado')
    END, 0
  ) AS saldo_pendiente,
  p_created.nombre AS creado_por_nombre,
  p_updated.nombre AS editado_por_nombre,
  -- columnas que faltaban (se agregan al final)
  c.caratula,
  c.apoderado,
  c.estadisticas,
  c.actualizacion,
  c.actualizacion_fecha,
  c.actualizacion_por
FROM public.casos c
JOIN public.clientes cl ON cl.id = c.cliente_id
LEFT JOIN public.perfiles p_created ON p_created.id = c.created_by
LEFT JOIN public.perfiles p_updated ON p_updated.id = c.updated_by;

NOTIFY pgrst, 'reload schema';
