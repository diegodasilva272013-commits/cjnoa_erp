-- ============================================================================
-- FIX: permitir borrar casos con historial.
-- El trigger historial_caso_inmutable bloqueaba todo DELETE incluso por CASCADE.
-- Ahora sólo bloquea UPDATE (la inmutabilidad real importa para edición).
-- DELETE queda permitido (la FK es ON DELETE CASCADE — sólo se borra cuando se borra el caso padre).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.historial_caso_inmutable()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'historial_caso es inmutable: no se permiten UPDATE';
END;
$$;

-- Reasegurar: trigger sólo en UPDATE, no en DELETE
DROP TRIGGER IF EXISTS historial_caso_no_update ON public.historial_caso;
DROP TRIGGER IF EXISTS historial_caso_no_delete ON public.historial_caso;

CREATE TRIGGER historial_caso_no_update
  BEFORE UPDATE ON public.historial_caso
  FOR EACH ROW EXECUTE FUNCTION public.historial_caso_inmutable();

-- Mismo fix para historial_tareas (si existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'historial_tareas_inmutable') THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.historial_tareas_inmutable()
      RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        RAISE EXCEPTION 'historial_tareas es inmutable: no se permiten UPDATE';
      END;
      $body$;
    $f$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS historial_tareas_no_update ON public.historial_tareas;
DROP TRIGGER IF EXISTS historial_tareas_no_delete ON public.historial_tareas;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'historial_tareas') THEN
    EXECUTE 'CREATE TRIGGER historial_tareas_no_update BEFORE UPDATE ON public.historial_tareas FOR EACH ROW EXECUTE FUNCTION public.historial_tareas_inmutable()';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

