-- Reverse-sync: cuando una `tarea` proveniente de `tareas_previsional` se
-- marca como completada (en Mi Día / Tareas / ControlTareas), propagar el
-- cambio a la fila origen en `tareas_previsional` para que Seguimiento /
-- Control de Tareas / Previsional muestren todo unificado.

CREATE OR REPLACE FUNCTION public.sync_tarea_to_previsional()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Solo si la tarea proviene de previsional
  IF NEW.previsional_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cambio de completada
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    UPDATE public.tareas_previsional
       SET estado = CASE WHEN NEW.estado = 'completada' THEN 'completada' ELSE 'en_curso' END,
           fecha_completada = NEW.fecha_completada,
           updated_at = now()
     WHERE id = NEW.previsional_id
       AND (estado IS DISTINCT FROM CASE WHEN NEW.estado = 'completada' THEN 'completada' ELSE 'en_curso' END
            OR fecha_completada IS DISTINCT FROM NEW.fecha_completada);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_tarea_to_previsional ON public.tareas;
CREATE TRIGGER trg_sync_tarea_to_previsional
AFTER UPDATE OF estado, fecha_completada ON public.tareas
FOR EACH ROW EXECUTE FUNCTION public.sync_tarea_to_previsional();
