-- Fix: cuando una tarea_previsional tiene `derivada_a` seteado, el trigger que
-- la sincroniza a `tareas` debe usar derivada_a como responsable_id, así la
-- persona derivada la ve en su Mi Día. Antes solo usaba NEW.responsable_id.

CREATE OR REPLACE FUNCTION public.sync_tarea_previsional_to_tareas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_estado text;
  v_titulo text;
  v_existing_id uuid;
  v_responsable uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM tareas WHERE previsional_id = OLD.id;
    RETURN OLD;
  END IF;

  v_estado := CASE WHEN NEW.estado = 'completada' THEN 'completada' ELSE 'en_curso' END;
  v_titulo := '[Previsional] ' || NEW.titulo;
  v_responsable := COALESCE(NEW.derivada_a, NEW.responsable_id);

  SELECT id INTO v_existing_id FROM tareas WHERE previsional_id = NEW.id;

  IF v_existing_id IS NULL THEN
    INSERT INTO tareas (
      previsional_id, titulo, descripcion, estado, prioridad, fecha_limite,
      responsable_id, cargo_hora, cargo_hora_favor, cargo_hora_favor_fecha,
      observaciones_demora, archivada,
      fecha_completada, created_by, updated_by, created_at, updated_at
    ) VALUES (
      NEW.id, v_titulo, NEW.descripcion, v_estado, NEW.prioridad, NEW.fecha_limite,
      v_responsable, NEW.cargo_hora, NEW.cargo_hora_favor, NEW.cargo_hora_favor_fecha,
      NEW.observaciones_demora, false,
      NEW.fecha_completada, NEW.created_by, NEW.created_by, NEW.created_at, NEW.updated_at
    );
  ELSE
    UPDATE tareas SET
      titulo = v_titulo,
      descripcion = NEW.descripcion,
      estado = v_estado,
      prioridad = NEW.prioridad,
      fecha_limite = NEW.fecha_limite,
      responsable_id = v_responsable,
      cargo_hora = NEW.cargo_hora,
      cargo_hora_favor = NEW.cargo_hora_favor,
      cargo_hora_favor_fecha = NEW.cargo_hora_favor_fecha,
      observaciones_demora = NEW.observaciones_demora,
      fecha_completada = NEW.fecha_completada,
      updated_at = NEW.updated_at
    WHERE id = v_existing_id;
  END IF;
  RETURN NEW;
END $$;

-- Backfill: re-sincroniza las tareas existentes que tienen derivada_a
-- para que el responsable_id en `tareas` apunte a la persona derivada.
UPDATE public.tareas t
SET responsable_id = tp.derivada_a,
    updated_at = now()
FROM public.tareas_previsional tp
WHERE t.previsional_id = tp.id
  AND tp.derivada_a IS NOT NULL
  AND t.responsable_id IS DISTINCT FROM tp.derivada_a;
