-- ============================================================================
-- Agrega campo "derivada_a" en tareas_previsional para asignar a un usuario
-- (perfil) además del responsable de texto libre.
-- Seguro de correr múltiples veces.
-- ============================================================================

ALTER TABLE public.tareas_previsional
  ADD COLUMN IF NOT EXISTS derivada_a uuid REFERENCES public.perfiles(id);

CREATE INDEX IF NOT EXISTS idx_tareas_previsional_derivada_a
  ON public.tareas_previsional(derivada_a);
