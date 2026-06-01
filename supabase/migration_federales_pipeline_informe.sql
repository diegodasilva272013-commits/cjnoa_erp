-- ============================================================
-- MIGRATION: agregar estado 'informe' al pipeline de casos federales.
-- Idempotente.
-- ============================================================

-- 1) Quitar el CHECK actual de pipeline (cualquiera sea su nombre)
DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'public.clientes_federales'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%pipeline%';
  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.clientes_federales DROP CONSTRAINT %I', cons_name);
  END IF;
END $$;

-- 2) Recrear el CHECK incluyendo 'informe'
ALTER TABLE public.clientes_federales
  ADD CONSTRAINT clientes_federales_pipeline_check
  CHECK (pipeline IN (
    'activo',
    'esperando_audiencia',
    'esperando_sentencia',
    'analisis_sin_directivas',
    'informe',
    'en_ejecucion',
    'seguimiento',
    'archivado'
  ));

-- 3) Refrescar cache de PostgREST
NOTIFY pgrst, 'reload schema';
