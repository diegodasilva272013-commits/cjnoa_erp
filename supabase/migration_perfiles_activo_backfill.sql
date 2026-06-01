-- ============================================================================
-- FIX: perfiles.activo no debe ser NULL nunca
-- ----------------------------------------------------------------------------
-- Bug: la columna se agrego en migration_roles.sql con DEFAULT true, pero las
-- filas creadas ANTES de esa migracion quedaron con activo = NULL.
-- El backend lo tolera (COALESCE(p.activo,true)), pero los selects del frontend
-- filtraban con .eq('activo', true), lo cual EXCLUYE NULL.
-- Resultado: usuarios "viejos" (ej. Melani) no aparecian en el dropdown de
-- responsables, por lo que nadie les podia asignar tareas, y ellos mismos no
-- se veian para autoderivarse.
--
-- Solucion permanente: backfill + NOT NULL + DEFAULT true.
-- 100% idempotente.
-- ============================================================================

UPDATE public.perfiles SET activo = true WHERE activo IS NULL;

ALTER TABLE public.perfiles
  ALTER COLUMN activo SET DEFAULT true;

ALTER TABLE public.perfiles
  ALTER COLUMN activo SET NOT NULL;
