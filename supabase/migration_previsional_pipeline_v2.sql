-- Migration: actualizar valores del pipeline previsional
-- Fecha: 2026-04-27
-- Nuevos valores: seguimiento | jubi_especiales | ucap | jubi_ordinarias | finalizado | descartado

-- 1. Migrar valores existentes a los nuevos
UPDATE clientes_previsional SET pipeline = 'seguimiento'    WHERE pipeline = 'consulta';
UPDATE clientes_previsional SET pipeline = 'jubi_ordinarias' WHERE pipeline = 'ingreso';
UPDATE clientes_previsional SET pipeline = 'finalizado'     WHERE pipeline = 'cobro';

-- 2. Reemplazar el CHECK constraint
ALTER TABLE clientes_previsional
  DROP CONSTRAINT IF EXISTS clientes_previsional_pipeline_check;

ALTER TABLE clientes_previsional
  ADD CONSTRAINT clientes_previsional_pipeline_check
  CHECK (pipeline IN ('seguimiento', 'jubi_especiales', 'ucap', 'jubi_ordinarias', 'finalizado', 'descartado'));

-- 3. Actualizar el default
ALTER TABLE clientes_previsional
  ALTER COLUMN pipeline SET DEFAULT 'seguimiento';
