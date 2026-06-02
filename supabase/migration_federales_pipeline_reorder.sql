-- ============================================================
-- MIGRATION: reorganizar pipeline de casos federales (jun-2026).
--
-- Cambios:
--   • Renombre de columnas (solo a nivel UI; los keys se mantienen):
--       esperando_sentencia      →  "Cierre Llamada"
--       analisis_sin_directivas  →  "Armado Demanda"
--       esperando_audiencia      →  "Esperando Sentencia"
--   • Nuevos estados (4):
--       informe_control, control_demanda, apelacion_activo, cautelar_otorgada
--
-- Idempotente: corre múltiples veces sin romper nada.
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

-- 2) Recrear el CHECK con todos los estados (existentes + 4 nuevos)
ALTER TABLE public.clientes_federales
  ADD CONSTRAINT clientes_federales_pipeline_check
  CHECK (pipeline IN (
    'activo',
    'esperando_audiencia',
    'esperando_sentencia',
    'analisis_sin_directivas',
    'informe',
    'informe_control',
    'control_demanda',
    'apelacion_activo',
    'cautelar_otorgada',
    'en_ejecucion',
    'seguimiento',
    'archivado'
  ));

-- 3) Refrescar cache de PostgREST
NOTIFY pgrst, 'reload schema';
