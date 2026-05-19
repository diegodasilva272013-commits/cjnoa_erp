-- ============================================================================
-- Agregar valor 'judiciales' al enum public.tipo_egreso
-- Idempotente: solo agrega si no existe.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tipo_egreso' AND e.enumlabel = 'judiciales'
  ) THEN
    ALTER TYPE public.tipo_egreso ADD VALUE 'judiciales';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
