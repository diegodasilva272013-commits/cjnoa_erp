-- Columnas para override manual de meses antes 09/93 y simultáneos
-- Si son NULL se usa el valor calculado automáticamente desde las fechas
ALTER TABLE aportes_laborales
  ADD COLUMN IF NOT EXISTS meses_antes_0993 integer,
  ADD COLUMN IF NOT EXISTS meses_simultaneo integer;
