-- Fix: el trigger BEFORE DELETE en consultas_agendadas borraba el ingreso relacionado,
-- pero la FK consultas_agendadas.ingreso_reserva_id tiene ON DELETE SET NULL,
-- lo cual modifica la misma fila que está siendo borrada → error "tuple to be deleted
-- was already modified by an operation triggered by the current command".
--
-- Solución: cambiar el trigger a AFTER DELETE (la fila ya no existe, no hay conflicto).

DROP TRIGGER IF EXISTS trg_consultas_agendadas_cleanup ON public.consultas_agendadas;

CREATE OR REPLACE FUNCTION public.consultas_agendadas_cleanup_ingresos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.ingreso_reserva_id IS NOT NULL THEN
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_reserva_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_consultas_agendadas_cleanup
  AFTER DELETE ON public.consultas_agendadas
  FOR EACH ROW EXECUTE FUNCTION public.consultas_agendadas_cleanup_ingresos();

NOTIFY pgrst, 'reload schema';
