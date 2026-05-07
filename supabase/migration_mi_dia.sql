-- ============================================================
-- Migration: "Mi Día" — campos para gestión personal de tareas
-- Cada empleado/procurador organiza, prioriza y mide sus tareas
-- ============================================================

-- 1. Campos nuevos en public.tareas ----------------------------
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS orden_dia integer;
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS fecha_orden date;
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS tiempo_estimado_min integer;
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS tiempo_real_min integer NOT NULL DEFAULT 0;
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS started_at timestamptz; -- ultima vez que se inicio (para cronometro activo)
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS estado_dia text
  CHECK (estado_dia IN ('pendiente','en_progreso','pausada','completada')) DEFAULT 'pendiente';

CREATE INDEX IF NOT EXISTS idx_tareas_fecha_orden ON public.tareas (fecha_orden);
CREATE INDEX IF NOT EXISTS idx_tareas_estado_dia ON public.tareas (estado_dia);

-- 2. RLS: cada usuario ve y modifica solo sus tareas en estos campos --
-- (la policy global de tareas ya permite SELECT a todos los autenticados;
--  acá no la tocamos porque rompería Tareas/ControlTareas)

-- 3. Habilitar UPDATE de los campos de Mi Día también para procurador/empleado
--    sobre sus propias tareas. El trigger tareas_before_update_gate ya lo permite
--    para procurador siempre que sea el responsable; lo extendemos para que
--    pueda tocar los campos del Mi Día.
CREATE OR REPLACE FUNCTION public.tareas_before_update_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rol text := public.current_rol();
BEGIN
  -- Procurador: solo si es responsable
  IF v_rol = 'procurador' THEN
    IF OLD.responsable_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'No tenés permiso para modificar esta tarea (no sos el responsable)';
    END IF;

    -- Procurador NO puede archivar / cambiar metadatos clave
    IF NEW.archivada IS DISTINCT FROM OLD.archivada
       OR NEW.titulo IS DISTINCT FROM OLD.titulo
       OR NEW.caso_id IS DISTINCT FROM OLD.caso_id
       OR NEW.responsable_id IS DISTINCT FROM OLD.responsable_id
       OR NEW.prioridad IS DISTINCT FROM OLD.prioridad
       OR NEW.fecha_limite IS DISTINCT FROM OLD.fecha_limite
       OR NEW.cargo_hora IS DISTINCT FROM OLD.cargo_hora
       OR NEW.descripcion IS DISTINCT FROM OLD.descripcion THEN
      RAISE EXCEPTION 'Procurador solo puede actualizar avance (culminación, observaciones, estado, adjunto, mi-día)';
    END IF;
  END IF;

  -- Marcar fecha_completada automáticamente
  IF NEW.estado = 'completada' AND OLD.estado <> 'completada' THEN
    NEW.fecha_completada := now();
  ELSIF NEW.estado <> 'completada' AND OLD.estado = 'completada' THEN
    NEW.fecha_completada := NULL;
  END IF;

  -- Sincronizar estado_dia con estado canónico cuando se completa
  IF NEW.estado = 'completada' AND COALESCE(NEW.estado_dia,'') <> 'completada' THEN
    NEW.estado_dia := 'completada';
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := auth.uid();

  -- Si pasa a archivada=true, registrar en historial
  IF NEW.archivada = true AND COALESCE(OLD.archivada, false) = false THEN
    PERFORM public.snapshot_tarea_a_historial(
      NEW,
      CASE WHEN NEW.estado = 'completada' THEN 'completada_archivada' ELSE 'archivada' END
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Vista de stats por usuario --------------------------------
CREATE OR REPLACE VIEW public.mi_dia_stats AS
SELECT
  responsable_id,
  COUNT(*)                                                                    AS total,
  COUNT(*) FILTER (WHERE estado_dia = 'completada' OR estado = 'completada')  AS completadas,
  COUNT(*) FILTER (WHERE estado_dia = 'en_progreso')                          AS en_progreso,
  COUNT(*) FILTER (WHERE estado_dia = 'pendiente')                            AS pendientes,
  COALESCE(SUM(tiempo_real_min), 0)                                           AS minutos_trabajados,
  COALESCE(SUM(tiempo_estimado_min), 0)                                       AS minutos_estimados,
  COALESCE(SUM(GREATEST(tiempo_real_min - COALESCE(tiempo_estimado_min,0), 0)), 0) AS minutos_excedidos
FROM public.tareas
WHERE archivada = false
GROUP BY responsable_id;
