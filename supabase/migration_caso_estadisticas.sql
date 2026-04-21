-- ============================================================================
-- MIGRATION: Campos "Estadísticas" y "Actualización" en casos (spec §4.1)
-- ============================================================================
-- estadisticas: texto libre con estado general del caso
--   (ej: "al día", "con deuda de aportes")
-- actualizacion: resumen semanal que carga abogado o secretaria
-- actualizacion_fecha: cuándo se hizo el último update (para alertar si pasa mucho)
-- actualizacion_por: quién lo escribió
-- ============================================================================

ALTER TABLE public.casos
  ADD COLUMN IF NOT EXISTS estadisticas text,
  ADD COLUMN IF NOT EXISTS actualizacion text,
  ADD COLUMN IF NOT EXISTS actualizacion_fecha timestamptz,
  ADD COLUMN IF NOT EXISTS actualizacion_por uuid REFERENCES public.perfiles(id);

-- Trigger: cuando cambia "actualizacion", set fecha y autor
CREATE OR REPLACE FUNCTION public.casos_actualizacion_set_meta()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.actualizacion IS DISTINCT FROM OLD.actualizacion THEN
    NEW.actualizacion_fecha := now();
    NEW.actualizacion_por := auth.uid();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_casos_actualizacion_meta ON public.casos;
CREATE TRIGGER trg_casos_actualizacion_meta
  BEFORE UPDATE OF actualizacion ON public.casos
  FOR EACH ROW EXECUTE FUNCTION public.casos_actualizacion_set_meta();
