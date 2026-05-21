-- ============================================================
-- MIGRATION: Pipeline Federales
--   - Renombrar estado 'sin_pago' -> 'en_ejecucion'
--   - Agregar nuevo estado 'archivado'
-- Idempotente: se puede correr varias veces sin romper.
-- ============================================================

-- 1) Quitar el CHECK constraint vigente (si existe con el nombre por defecto)
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

-- 2) Renombrar valores existentes
UPDATE public.clientes_federales
SET pipeline = 'en_ejecucion'
WHERE pipeline = 'sin_pago';

-- 3) Recrear el CHECK con los nuevos valores
ALTER TABLE public.clientes_federales
  ADD CONSTRAINT clientes_federales_pipeline_check
  CHECK (pipeline IN (
    'activo',
    'esperando_audiencia',
    'esperando_sentencia',
    'analisis_sin_directivas',
    'en_ejecucion',
    'seguimiento',
    'archivado'
  ));

-- 4) Adjuntos de documentación en notas de seguimiento
ALTER TABLE public.clientes_federales_notas
  ADD COLUMN IF NOT EXISTS documento_path text,
  ADD COLUMN IF NOT EXISTS documento_nombre text;

