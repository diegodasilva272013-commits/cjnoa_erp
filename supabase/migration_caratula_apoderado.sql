-- Migration: agregar campos caratula y apoderado a la tabla casos
-- Fecha: 2026-04-27

ALTER TABLE casos
  ADD COLUMN IF NOT EXISTS caratula text,
  ADD COLUMN IF NOT EXISTS apoderado text;

COMMENT ON COLUMN casos.caratula IS 'Carátula del expediente judicial';
COMMENT ON COLUMN casos.apoderado IS 'Apoderado o patrocinante asignado al caso';
