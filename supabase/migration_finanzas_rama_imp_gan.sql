-- Agrega "Reajuste Imp Gan" al ENUM rama_legal usado por ingresos / egresos / planilla.
-- Idempotente: si ya existe, no hace nada.
ALTER TYPE rama_legal ADD VALUE IF NOT EXISTS 'Reajuste Imp Gan';

-- Refresca el cache de PostgREST para que el nuevo valor sea visible vía API.
NOTIFY pgrst, 'reload schema';
