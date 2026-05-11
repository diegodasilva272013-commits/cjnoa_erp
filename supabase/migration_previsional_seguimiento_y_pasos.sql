-- ============================================================================
-- PREVISIONAL: Seguimiento (notas) + Tareas con pasos compartidos
-- Replica para `clientes_previsional` + `tareas_previsional` la funcionalidad
-- de `casos_generales` + `tareas` (NotasFeedPanel + tarea_pasos).
--
-- Crea:
--   1. clientes_previsional_notas             (feed de notas con autor)
--   2. tarea_pasos_previsional                (pasos asignables por responsable)
--   3. Vistas con joins (perfiles, tarea)
--   4. Triggers:
--      - touch updated_at
--      - sync estado de la tarea madre cuando todos los pasos están completos
--      - notify siguiente paso
--      - al finalizar todos los pasos: NOTA AUTOMÁTICA en seguimiento + push
--   5. RLS y realtime
-- ============================================================================

-- ─── 1. NOTAS DE SEGUIMIENTO POR CLIENTE PREVISIONAL ────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes_previsional_notas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_prev_id       uuid NOT NULL REFERENCES public.clientes_previsional(id) ON DELETE CASCADE,
  contenido             text NOT NULL CHECK (length(trim(contenido)) > 0),
  tarea_previsional_id  uuid REFERENCES public.tareas_previsional(id) ON DELETE SET NULL,
  audio_path            text,
  created_by            uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  editado               boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_cli_prev_notas_cliente
  ON public.clientes_previsional_notas (cliente_prev_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cli_prev_notas_tarea
  ON public.clientes_previsional_notas (tarea_previsional_id);

-- Touch updated_at + marcar editado
CREATE OR REPLACE FUNCTION public.clientes_previsional_notas_marcar_editado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.contenido IS DISTINCT FROM NEW.contenido THEN
    NEW.editado := true;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cli_prev_notas_editado ON public.clientes_previsional_notas;
CREATE TRIGGER trg_cli_prev_notas_editado
  BEFORE UPDATE ON public.clientes_previsional_notas
  FOR EACH ROW EXECUTE FUNCTION public.clientes_previsional_notas_marcar_editado();

ALTER TABLE public.clientes_previsional_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cli_prev_notas_all ON public.clientes_previsional_notas;
CREATE POLICY cli_prev_notas_all ON public.clientes_previsional_notas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 2. PASOS POR TAREA PREVISIONAL ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tarea_pasos_previsional (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_previsional_id  uuid NOT NULL REFERENCES public.tareas_previsional(id) ON DELETE CASCADE,
  orden                 int NOT NULL DEFAULT 1,
  descripcion           text NOT NULL,
  responsable_id        uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  completado            boolean NOT NULL DEFAULT false,
  completado_at         timestamptz,
  completado_por        uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarea_pasos_prev_tarea       ON public.tarea_pasos_previsional (tarea_previsional_id);
CREATE INDEX IF NOT EXISTS idx_tarea_pasos_prev_responsable ON public.tarea_pasos_previsional (responsable_id);
CREATE INDEX IF NOT EXISTS idx_tarea_pasos_prev_orden       ON public.tarea_pasos_previsional (tarea_previsional_id, orden);

-- Touch updated_at
CREATE OR REPLACE FUNCTION public.tarea_pasos_previsional_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tarea_pasos_prev_touch ON public.tarea_pasos_previsional;
CREATE TRIGGER trg_tarea_pasos_prev_touch
  BEFORE UPDATE ON public.tarea_pasos_previsional
  FOR EACH ROW EXECUTE FUNCTION public.tarea_pasos_previsional_touch();

ALTER TABLE public.tarea_pasos_previsional ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tarea_pasos_prev_all ON public.tarea_pasos_previsional;
CREATE POLICY tarea_pasos_prev_all ON public.tarea_pasos_previsional
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 3. VISTAS CON JOINS ────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.clientes_previsional_notas_completo CASCADE;
CREATE OR REPLACE VIEW public.clientes_previsional_notas_completo AS
SELECT
  n.id,
  n.cliente_prev_id,
  n.contenido,
  n.tarea_previsional_id,
  n.audio_path,
  n.created_by,
  n.created_at,
  n.updated_at,
  n.editado,
  pa.nombre        AS autor_nombre,
  pa.avatar_url    AS autor_avatar,
  -- datos de la tarea asociada (si hay)
  t.titulo         AS tarea_titulo,
  t.estado         AS tarea_estado,
  t.fecha_limite   AS tarea_fecha_limite,
  t.responsable_id AS tarea_responsable_id,
  t.prioridad      AS tarea_prioridad,
  t.descripcion    AS tarea_descripcion,
  pr.nombre        AS tarea_responsable_nombre,
  pr.avatar_url    AS tarea_responsable_avatar
FROM public.clientes_previsional_notas n
LEFT JOIN public.perfiles pa            ON pa.id = n.created_by
LEFT JOIN public.tareas_previsional t   ON t.id  = n.tarea_previsional_id
LEFT JOIN public.perfiles pr            ON pr.id = t.responsable_id;

GRANT SELECT ON public.clientes_previsional_notas_completo TO authenticated;

DROP VIEW IF EXISTS public.tarea_pasos_previsional_completos CASCADE;
CREATE OR REPLACE VIEW public.tarea_pasos_previsional_completos AS
SELECT
  tp.*,
  p_resp.nombre     AS responsable_nombre,
  p_resp.avatar_url AS responsable_avatar,
  p_done.nombre     AS completado_por_nombre
FROM public.tarea_pasos_previsional tp
LEFT JOIN public.perfiles p_resp ON p_resp.id = tp.responsable_id
LEFT JOIN public.perfiles p_done ON p_done.id = tp.completado_por;

GRANT SELECT ON public.tarea_pasos_previsional_completos TO authenticated;

-- ─── 4. SYNC ESTADO TAREA MADRE ────────────────────────────────────────────
-- Cuando todos los pasos están completos -> marcar la tarea_previsional como completada
-- Cuando se desmarca alguno -> volver la tarea a 'en_curso'
CREATE OR REPLACE FUNCTION public.tarea_pasos_previsional_sync_estado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tarea_id uuid;
  v_total int;
  v_completos int;
BEGIN
  v_tarea_id := COALESCE(NEW.tarea_previsional_id, OLD.tarea_previsional_id);
  IF v_tarea_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE completado)
    INTO v_total, v_completos
  FROM public.tarea_pasos_previsional
  WHERE tarea_previsional_id = v_tarea_id;

  IF v_total > 0 AND v_completos = v_total THEN
    UPDATE public.tareas_previsional
       SET estado = 'completada',
           fecha_completada = COALESCE(fecha_completada, now())
     WHERE id = v_tarea_id AND estado <> 'completada';
  ELSE
    UPDATE public.tareas_previsional
       SET estado = 'en_curso',
           fecha_completada = NULL
     WHERE id = v_tarea_id AND estado = 'completada';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_tarea_pasos_prev_sync_estado ON public.tarea_pasos_previsional;
CREATE TRIGGER trg_tarea_pasos_prev_sync_estado
  AFTER INSERT OR UPDATE OR DELETE ON public.tarea_pasos_previsional
  FOR EACH ROW EXECUTE FUNCTION public.tarea_pasos_previsional_sync_estado();

-- ─── 5. NOTIFY SIGUIENTE PASO + NOTA AUTOMÁTICA AL FINALIZAR ───────────────
CREATE OR REPLACE FUNCTION public.tarea_pasos_previsional_notify_siguiente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_siguiente record;
  v_tarea_titulo text;
  v_quien text;
  v_total int;
  v_completos int;
  v_cliente_prev_id uuid;
  v_reporte text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_dur_min int;
  v_dur_txt text;
  v_resp_id uuid;
  v_creador_id uuid;
  v_completador uuid;
  has_notifs_app boolean;
BEGIN
  IF NOT (NEW.completado IS TRUE AND (OLD.completado IS NULL OR OLD.completado = FALSE)) THEN
    RETURN NEW;
  END IF;

  v_completador := COALESCE(NEW.completado_por, '00000000-0000-0000-0000-000000000000'::uuid);

  SELECT t.titulo, t.cliente_prev_id, t.responsable_id, t.created_by
    INTO v_tarea_titulo, v_cliente_prev_id, v_resp_id, v_creador_id
    FROM public.tareas_previsional t
   WHERE t.id = NEW.tarea_previsional_id;

  SELECT COALESCE(nombre, 'Alguien') INTO v_quien
    FROM public.perfiles WHERE id = NEW.completado_por;

  -- Existe notificaciones_app?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'notificaciones_app'
  ) INTO has_notifs_app;

  -- ───── Siguiente paso ─────
  SELECT * INTO v_siguiente
  FROM public.tarea_pasos_previsional
  WHERE tarea_previsional_id = NEW.tarea_previsional_id
    AND completado = false
    AND responsable_id IS NOT NULL
    AND orden > NEW.orden
  ORDER BY orden ASC
  LIMIT 1;

  IF v_siguiente.id IS NOT NULL
     AND v_siguiente.responsable_id <> v_completador
     AND has_notifs_app THEN
    BEGIN
      INSERT INTO public.notificaciones_app
        (user_id, tipo, titulo, mensaje, link, related_id, related_user_id)
      VALUES (
        v_siguiente.responsable_id,
        'tarea_paso_siguiente',
        '⚡ Te toca continuar: ' || COALESCE(v_tarea_titulo, 'tarea'),
        COALESCE(v_quien, 'Alguien') || ' completó "' || COALESCE(NEW.descripcion, '(sin descripción)') ||
        '". Ahora te toca: ' || COALESCE(v_siguiente.descripcion, '(sin descripción)'),
        '/mi-dia',
        NEW.tarea_previsional_id,
        NEW.completado_por
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- ───── Finalización total ─────
  SELECT COUNT(*), COUNT(*) FILTER (WHERE completado)
    INTO v_total, v_completos
  FROM public.tarea_pasos_previsional
  WHERE tarea_previsional_id = NEW.tarea_previsional_id;

  IF v_total > 0 AND v_completos = v_total THEN

    -- 1) Notificar a responsable y creador (sin auto-notificar al completador)
    IF has_notifs_app THEN
      BEGIN
        INSERT INTO public.notificaciones_app
          (user_id, tipo, titulo, mensaje, link, related_id, related_user_id)
        SELECT DISTINCT u.uid,
               'tarea_compartida_completa',
               '🎉 Tarea finalizada: ' || COALESCE(v_tarea_titulo, '(sin título)'),
               'Todos los pasos están completos. ' || COALESCE(v_quien, 'Alguien') ||
               ' cerró el último paso. Reporte automático cargado en el seguimiento.',
               CASE WHEN v_cliente_prev_id IS NOT NULL
                    THEN '/previsional?ficha=' || v_cliente_prev_id::text
                    ELSE '/tareas' END,
               NEW.tarea_previsional_id,
               NEW.completado_por
          FROM (
            SELECT v_resp_id    AS uid WHERE v_resp_id    IS NOT NULL
            UNION
            SELECT v_creador_id AS uid WHERE v_creador_id IS NOT NULL
          ) u
          WHERE u.uid IS NOT NULL
            AND u.uid <> v_completador;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- 2) Generar REPORTE y guardar NOTA en SEGUIMIENTO del cliente previsional
    IF v_cliente_prev_id IS NOT NULL THEN
      BEGIN
        SELECT MIN(tp.completado_at), MAX(tp.completado_at)
          INTO v_inicio, v_fin
          FROM public.tarea_pasos_previsional tp
         WHERE tp.tarea_previsional_id = NEW.tarea_previsional_id
           AND tp.completado_at IS NOT NULL;

        IF v_inicio IS NOT NULL AND v_fin IS NOT NULL THEN
          v_dur_min := GREATEST(0, EXTRACT(EPOCH FROM (v_fin - v_inicio))::int / 60);
          IF v_dur_min < 60 THEN
            v_dur_txt := v_dur_min::text || ' min';
          ELSIF v_dur_min < 60*24 THEN
            v_dur_txt := (v_dur_min/60)::text || 'h ' || (v_dur_min%60)::text || 'min';
          ELSE
            v_dur_txt := (v_dur_min/1440)::text || 'd ' || ((v_dur_min%1440)/60)::text || 'h';
          END IF;
        ELSE
          v_dur_txt := '—';
        END IF;

        SELECT STRING_AGG(
          '• Paso ' || tp.orden::text || ': ' ||
          COALESCE(tp.descripcion, '(sin descripción)') ||
          E'\n   ✓ Hecho por ' || COALESCE(p.nombre, '—') ||
          COALESCE(' el ' || TO_CHAR(tp.completado_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'), ''),
          E'\n'
          ORDER BY tp.orden
        )
        INTO v_reporte
        FROM public.tarea_pasos_previsional tp
        LEFT JOIN public.perfiles p ON p.id = tp.completado_por
        WHERE tp.tarea_previsional_id = NEW.tarea_previsional_id;

        INSERT INTO public.clientes_previsional_notas
          (cliente_prev_id, contenido, tarea_previsional_id, created_by)
        VALUES (
          v_cliente_prev_id,
          '✅ TAREA FINALIZADA: ' || COALESCE(v_tarea_titulo, '(sin título)') || E'\n' ||
          '🕒 Duración total: ' || v_dur_txt || E'\n' ||
          '👥 Pasos: ' || v_total::text || E'\n\n' ||
          'Reporte automático:' || E'\n' ||
          COALESCE(v_reporte, '(sin pasos registrados)'),
          NEW.tarea_previsional_id,
          NEW.completado_por
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tarea_pasos_prev_notify_siguiente ON public.tarea_pasos_previsional;
CREATE TRIGGER trg_tarea_pasos_prev_notify_siguiente
  AFTER UPDATE ON public.tarea_pasos_previsional
  FOR EACH ROW EXECUTE FUNCTION public.tarea_pasos_previsional_notify_siguiente();

-- ─── 6. REALTIME ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes_previsional_notas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tarea_pasos_previsional;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- ─── FIN ─────────────────────────────────────────────────────────────────────
