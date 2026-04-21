-- =====================================================================
-- Migration: flujo de roles para Tareas + historial de tareas archivadas
-- Spec sección 5.3 (flujo) y 10 (historial permanente para métricas)
-- =====================================================================
-- Reglas:
--   * SELECT: cualquier usuario autenticado y activo.
--   * INSERT (cargar tarea): solo admin / socio / empleado (secretaria).
--   * UPDATE:
--       - admin / socio / empleado: pueden modificar cualquier campo.
--       - procurador: SOLO si es el responsable, y SOLO sobre los campos
--         de ejecución (culminacion, observaciones_demora, estado,
--         adjunto_path, adjunto_nombre, fecha_completada, updated_at,
--         updated_by). El control fino se hace en trigger BEFORE UPDATE.
--   * DELETE / archivado: solo admin / socio / empleado.
--   * Antes de eliminar o archivar, snapshot a historial_tareas.
-- =====================================================================

-- 1. Tabla de historial de tareas (permanente) -----------------------
CREATE TABLE IF NOT EXISTS public.historial_tareas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id        uuid,
  titulo          text NOT NULL,
  caso_id         uuid,
  cliente_nombre  text,
  expediente      text,
  responsable_id  uuid,
  responsable_nombre text,
  prioridad       text,
  fecha_limite    date,
  cargo_hora      text,
  estado_final    text NOT NULL,
  motivo_cierre   text NOT NULL CHECK (motivo_cierre IN ('archivada','eliminada','completada_archivada')),
  fecha_creacion  timestamptz NOT NULL,
  fecha_completada timestamptz,
  fecha_cierre    timestamptz NOT NULL DEFAULT now(),
  cerrado_por     uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  cerrado_por_nombre text,
  descripcion     text,
  culminacion     text,
  observaciones_demora text
);

CREATE INDEX IF NOT EXISTS idx_historial_tareas_responsable ON public.historial_tareas (responsable_id);
CREATE INDEX IF NOT EXISTS idx_historial_tareas_caso ON public.historial_tareas (caso_id);
CREATE INDEX IF NOT EXISTS idx_historial_tareas_fecha ON public.historial_tareas (fecha_cierre DESC);

ALTER TABLE public.historial_tareas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS historial_tareas_select ON public.historial_tareas;
CREATE POLICY historial_tareas_select ON public.historial_tareas
  FOR SELECT TO authenticated USING (true);

-- Solo trigger inserta. Sin INSERT/UPDATE/DELETE manual.

-- Trigger inmutable: prohibir UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.historial_tareas_inmutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'historial_tareas es inmutable';
END;
$$;

DROP TRIGGER IF EXISTS historial_tareas_no_update ON public.historial_tareas;
CREATE TRIGGER historial_tareas_no_update BEFORE UPDATE ON public.historial_tareas
  FOR EACH ROW EXECUTE FUNCTION public.historial_tareas_inmutable();

DROP TRIGGER IF EXISTS historial_tareas_no_delete ON public.historial_tareas;
CREATE TRIGGER historial_tareas_no_delete BEFORE DELETE ON public.historial_tareas
  FOR EACH ROW EXECUTE FUNCTION public.historial_tareas_inmutable();

-- 2. Función helper: rol del usuario actual --------------------------
CREATE OR REPLACE FUNCTION public.current_rol()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(rol, 'empleado') FROM public.perfiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.current_rol() TO authenticated;

-- 3. Snapshot a historial_tareas -------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_tarea_a_historial(
  p_tarea public.tareas,
  p_motivo text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cliente text;
  v_expediente text;
  v_resp text;
  v_user text;
BEGIN
  SELECT cl.nombre_apellido, c.expediente
    INTO v_cliente, v_expediente
    FROM public.casos c
    LEFT JOIN public.clientes cl ON cl.id = c.cliente_id
   WHERE c.id = p_tarea.caso_id;

  SELECT nombre INTO v_resp FROM public.perfiles WHERE id = p_tarea.responsable_id;
  SELECT nombre INTO v_user FROM public.perfiles WHERE id = auth.uid();

  INSERT INTO public.historial_tareas (
    tarea_id, titulo, caso_id, cliente_nombre, expediente,
    responsable_id, responsable_nombre, prioridad, fecha_limite, cargo_hora,
    estado_final, motivo_cierre, fecha_creacion, fecha_completada,
    cerrado_por, cerrado_por_nombre, descripcion, culminacion, observaciones_demora
  ) VALUES (
    p_tarea.id, p_tarea.titulo, p_tarea.caso_id, v_cliente, v_expediente,
    p_tarea.responsable_id, v_resp, p_tarea.prioridad, p_tarea.fecha_limite, p_tarea.cargo_hora,
    p_tarea.estado, p_motivo, p_tarea.created_at, p_tarea.fecha_completada,
    auth.uid(), v_user, p_tarea.descripcion, p_tarea.culminacion, p_tarea.observaciones_demora
  );
END;
$$;

-- 4. Trigger BEFORE UPDATE: gate por rol + snapshot al archivar ------
CREATE OR REPLACE FUNCTION public.tareas_before_update_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rol text := public.current_rol();
BEGIN
  -- Procurador: solo puede tocar la tarea si es responsable
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
      RAISE EXCEPTION 'Procurador solo puede actualizar avance (culminación, observaciones, estado, adjunto)';
    END IF;
  END IF;

  -- Marcar fecha_completada automáticamente
  IF NEW.estado = 'completada' AND OLD.estado <> 'completada' THEN
    NEW.fecha_completada := now();
  ELSIF NEW.estado <> 'completada' AND OLD.estado = 'completada' THEN
    NEW.fecha_completada := NULL;
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

DROP TRIGGER IF EXISTS trg_tareas_before_update ON public.tareas;
CREATE TRIGGER trg_tareas_before_update
  BEFORE UPDATE ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.tareas_before_update_gate();

-- 5. Trigger BEFORE DELETE: snapshot ---------------------------------
CREATE OR REPLACE FUNCTION public.tareas_before_delete_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.snapshot_tarea_a_historial(OLD, 'eliminada');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_tareas_before_delete ON public.tareas;
CREATE TRIGGER trg_tareas_before_delete
  BEFORE DELETE ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.tareas_before_delete_snapshot();

-- 6. Reemplazo de RLS de tareas con políticas por rol ----------------
DROP POLICY IF EXISTS "tareas_all_authenticated" ON public.tareas;
DROP POLICY IF EXISTS tareas_select ON public.tareas;
DROP POLICY IF EXISTS tareas_insert ON public.tareas;
DROP POLICY IF EXISTS tareas_update ON public.tareas;
DROP POLICY IF EXISTS tareas_delete ON public.tareas;

-- SELECT: todos los autenticados activos
CREATE POLICY tareas_select ON public.tareas
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND COALESCE(p.activo,true) = true)
  );

-- INSERT: solo admin/socio/empleado
CREATE POLICY tareas_insert ON public.tareas
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.activo,true) = true
        AND COALESCE(p.rol,'empleado') IN ('admin','socio','empleado')
    )
  );

-- UPDATE: admin/socio/empleado o procurador responsable (trigger filtra columnas)
CREATE POLICY tareas_update ON public.tareas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.activo,true) = true
        AND (
          COALESCE(p.rol,'empleado') IN ('admin','socio','empleado')
          OR (COALESCE(p.rol,'empleado') = 'procurador' AND public.tareas.responsable_id = auth.uid())
        )
    )
  )
  WITH CHECK (true);

-- DELETE: solo admin/socio/empleado
CREATE POLICY tareas_delete ON public.tareas
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.activo,true) = true
        AND COALESCE(p.rol,'empleado') IN ('admin','socio','empleado')
    )
  );

-- 7. Vista de historial enriquecida ----------------------------------
CREATE OR REPLACE VIEW public.historial_tareas_completo AS
SELECT
  h.*,
  EXTRACT(EPOCH FROM (h.fecha_cierre - h.fecha_creacion)) / 86400.0 AS dias_total,
  CASE
    WHEN h.fecha_completada IS NOT NULL
      THEN EXTRACT(EPOCH FROM (h.fecha_completada - h.fecha_creacion)) / 86400.0
    ELSE NULL
  END AS dias_hasta_completar
FROM public.historial_tareas h;
