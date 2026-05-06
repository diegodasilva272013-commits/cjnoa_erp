-- ============================================================================
-- Migration: Sincronizar tareas_previsional -> tareas (tabla global)
-- Cada tarea previsional se replica como una fila en `tareas` para que aparezca
-- en /tareas, /control-tareas y dispare las alarmas (tarea_proxima/vencida).
-- - Columna previsional_id en tareas (FK)
-- - Trigger AFTER INSERT/UPDATE/DELETE en tareas_previsional
-- - Backfill de existentes
-- Idempotente.
-- ============================================================================

-- 1) Columna y unique index
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS previsional_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tareas_previsional_id_fkey'
  ) THEN
    ALTER TABLE public.tareas
      ADD CONSTRAINT tareas_previsional_id_fkey
      FOREIGN KEY (previsional_id) REFERENCES public.tareas_previsional(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tareas_previsional_id
  ON public.tareas (previsional_id) WHERE previsional_id IS NOT NULL;

-- 2) Funcion de sync: mapea tareas_previsional -> tareas
CREATE OR REPLACE FUNCTION public.sync_tarea_previsional_to_tareas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_estado text;
  v_titulo text;
  v_existing_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM tareas WHERE previsional_id = OLD.id;
    RETURN OLD;
  END IF;

  -- Map estado: tareas_previsional usa pendiente/en_curso/completada
  -- tareas usa en_curso/completada
  v_estado := CASE WHEN NEW.estado = 'completada' THEN 'completada' ELSE 'en_curso' END;
  v_titulo := '[Previsional] ' || NEW.titulo;

  SELECT id INTO v_existing_id FROM tareas WHERE previsional_id = NEW.id;

  IF v_existing_id IS NULL THEN
    INSERT INTO tareas (
      previsional_id, titulo, descripcion, estado, prioridad, fecha_limite,
      responsable_id, cargo_hora, observaciones_demora, archivada,
      fecha_completada, created_by, updated_by, created_at, updated_at
    ) VALUES (
      NEW.id, v_titulo, NEW.descripcion, v_estado, NEW.prioridad, NEW.fecha_limite,
      NEW.responsable_id, NEW.cargo_hora, NEW.observaciones_demora, false,
      NEW.fecha_completada, NEW.created_by, NEW.created_by, NEW.created_at, NEW.updated_at
    );
  ELSE
    UPDATE tareas SET
      titulo = v_titulo,
      descripcion = NEW.descripcion,
      estado = v_estado,
      prioridad = NEW.prioridad,
      fecha_limite = NEW.fecha_limite,
      responsable_id = NEW.responsable_id,
      cargo_hora = NEW.cargo_hora,
      observaciones_demora = NEW.observaciones_demora,
      fecha_completada = NEW.fecha_completada,
      updated_at = NEW.updated_at
    WHERE id = v_existing_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_tarea_previsional ON public.tareas_previsional;
CREATE TRIGGER trg_sync_tarea_previsional
  AFTER INSERT OR UPDATE OR DELETE ON public.tareas_previsional
  FOR EACH ROW EXECUTE FUNCTION public.sync_tarea_previsional_to_tareas();

-- 3) Backfill: crear filas en tareas para previsionales que aun no tienen
INSERT INTO public.tareas (
  previsional_id, titulo, descripcion, estado, prioridad, fecha_limite,
  responsable_id, cargo_hora, observaciones_demora, archivada,
  fecha_completada, created_by, updated_by, created_at, updated_at
)
SELECT
  tp.id,
  '[Previsional] ' || tp.titulo,
  tp.descripcion,
  CASE WHEN tp.estado = 'completada' THEN 'completada' ELSE 'en_curso' END,
  tp.prioridad,
  tp.fecha_limite,
  tp.responsable_id,
  tp.cargo_hora,
  tp.observaciones_demora,
  false,
  tp.fecha_completada,
  tp.created_by,
  tp.created_by,
  tp.created_at,
  tp.updated_at
FROM public.tareas_previsional tp
WHERE NOT EXISTS (SELECT 1 FROM public.tareas t WHERE t.previsional_id = tp.id);
