-- ============================================
-- MIGRATION: Campos adicionales en ficha de caso
-- Alinea la tabla public.casos con las especificaciones
-- del documento "especificaciones_app_centro_juridico_noa".
--
-- Campos agregados:
--   expediente        text        Numero/identificador de expediente
--   radicado          text        Juzgado/dependencia donde esta radicado
--   sistema           text        'Provincial' | 'Federal'
--   personeria        text        'Patrocinante' | 'Apoderado' | 'Personería de urgencia'
--   prioridad         text        'Alta' | 'Media' | 'Sin prioridad' (default 'Sin prioridad')
--   archivado         boolean     true si el caso fue archivado (default false)
--   url_drive         text        Link a la carpeta del caso en Google Drive
--
-- Todos los campos son nullable/seguros (con default) para no romper filas existentes.
-- ============================================

alter table public.casos
  add column if not exists expediente text,
  add column if not exists radicado   text,
  add column if not exists sistema    text check (sistema in ('Provincial','Federal') or sistema is null),
  add column if not exists personeria text check (personeria in ('Patrocinante','Apoderado','Personería de urgencia') or personeria is null),
  add column if not exists prioridad  text not null default 'Sin prioridad' check (prioridad in ('Alta','Media','Sin prioridad')),
  add column if not exists archivado  boolean not null default false,
  add column if not exists url_drive  text;

create index if not exists idx_casos_archivado on public.casos (archivado);
create index if not exists idx_casos_prioridad on public.casos (prioridad);
create index if not exists idx_casos_expediente on public.casos (expediente);

-- ============================================
-- Refrescar vista casos_completos para incluir los campos nuevos
-- ============================================
DROP VIEW IF EXISTS public.casos_completos;
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
  p_updated.nombre AS editado_por_nombre
FROM public.casos c
JOIN public.clientes cl ON cl.id = c.cliente_id
LEFT JOIN public.perfiles p_created ON p_created.id = c.created_by
LEFT JOIN public.perfiles p_updated ON p_updated.id = c.updated_by;
