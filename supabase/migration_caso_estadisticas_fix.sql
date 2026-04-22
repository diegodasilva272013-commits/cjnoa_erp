-- ============================================================================
-- FIX: trigger de actualizacion ahora corre en INSERT y UPDATE,
-- y la FK de actualizacion_por se relaja para no romper si auth.uid()
-- no esta en perfiles (ej. service_role o usuario sin perfil cargado).
-- ============================================================================

-- 1) Quitar FK estricta (mantener la columna uuid)
ALTER TABLE public.casos
  DROP CONSTRAINT IF EXISTS casos_actualizacion_por_fkey;

-- 2) Trigger seguro: INSERT + UPDATE, no falla si auth.uid() es null
CREATE OR REPLACE FUNCTION public.casos_actualizacion_set_meta()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.actualizacion IS NOT NULL AND length(trim(NEW.actualizacion)) > 0 THEN
      NEW.actualizacion_fecha := COALESCE(NEW.actualizacion_fecha, now());
      NEW.actualizacion_por   := COALESCE(NEW.actualizacion_por, auth.uid());
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.actualizacion IS DISTINCT FROM OLD.actualizacion THEN
      NEW.actualizacion_fecha := now();
      NEW.actualizacion_por   := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_casos_actualizacion_meta ON public.casos;
CREATE TRIGGER trg_casos_actualizacion_meta
  BEFORE INSERT OR UPDATE ON public.casos
  FOR EACH ROW EXECUTE FUNCTION public.casos_actualizacion_set_meta();
