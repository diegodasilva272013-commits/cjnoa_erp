-- ============================================
-- Migración: Pipeline Previsional v3
-- Restaura los 9 estados completos del pipeline
-- (consulta, seguimiento, ingreso, cobro,
--  jubi_especiales, ucap, jubi_ordinarias,
--  finalizado, descartado).
-- Fecha: 2026-05
-- ============================================

ALTER TABLE clientes_previsional
  DROP CONSTRAINT IF EXISTS clientes_previsional_pipeline_check;

ALTER TABLE clientes_previsional
  ADD CONSTRAINT clientes_previsional_pipeline_check
  CHECK (pipeline IN (
    'consulta', 'seguimiento', 'ingreso', 'cobro',
    'jubi_especiales', 'ucap', 'jubi_ordinarias',
    'finalizado', 'descartado'
  ));

ALTER TABLE clientes_previsional
  ALTER COLUMN pipeline SET DEFAULT 'consulta';
