-- ============================================================================
-- Migration: vincular audiencias a casos_generales (no solo casos legales)
-- - Agrega columna caso_general_id en audiencias_general
-- - Reemplaza la view audiencias_general_completas para incluir caso_general_titulo
-- ============================================================================

ALTER TABLE public.audiencias_general
  ADD COLUMN IF NOT EXISTS caso_general_id uuid
    REFERENCES public.casos_generales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audiencias_general_caso_general
  ON public.audiencias_general (caso_general_id);

DROP VIEW IF EXISTS public.audiencias_general_completas CASCADE;
CREATE OR REPLACE VIEW public.audiencias_general_completas AS
SELECT
  a.*,
  cl.nombre_apellido       AS cliente_nombre,
  p.nombre                 AS abogado_nombre,
  cg.titulo                AS caso_general_titulo,
  cg.expediente            AS caso_general_expediente
FROM public.audiencias_general a
LEFT JOIN public.casos             c  ON c.id  = a.caso_id
LEFT JOIN public.clientes          cl ON cl.id = c.cliente_id
LEFT JOIN public.perfiles          p  ON p.id  = a.abogado_id
LEFT JOIN public.casos_generales   cg ON cg.id = a.caso_general_id;

GRANT SELECT ON public.audiencias_general_completas TO authenticated;
