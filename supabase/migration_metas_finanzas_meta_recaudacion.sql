-- ============================================================================
-- Agregar columna meta_recaudacion a metas_finanzas
-- (usada por FlujoCaja para guardar la meta global del periodo)
-- ============================================================================

ALTER TABLE public.metas_finanzas
  ADD COLUMN IF NOT EXISTS meta_recaudacion numeric(14,2) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
