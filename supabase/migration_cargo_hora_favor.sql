-- ============================================================================
-- Migration: Cargo de horas A FAVOR (vencimiento del plazo de la contraparte)
-- Cuando llega esa fecha, el sistema avisa que hay que presentar el ESCRITO
-- (la demandada/contraparte ya venció su plazo, hay que dejar la causa al dia).
--
-- Cambios:
-- - Columnas en tareas: cargo_hora_favor text, cargo_hora_favor_fecha date
-- - Mismas columnas en tareas_previsional para mantener paridad
-- - Nuevo tipo de notificacion: 'presentar_escrito'
-- - Funcion revisar_recordatorios_tareas() extendida: ademas de las
--   notificaciones por fecha_limite, ahora genera 'presentar_escrito' cuando
--   cargo_hora_favor_fecha llega (hoy o ayer/anteayer si quedo sin marcar)
-- - Recrea vistas tareas_completas_v2 y caso_general_notas_completo para
--   exponer las nuevas columnas
-- - Recrea trigger sync_tarea_previsional_to_tareas para mapear los campos
-- Idempotente.
-- ============================================================================

-- 1) Columnas en tareas
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS cargo_hora_favor text,
  ADD COLUMN IF NOT EXISTS cargo_hora_favor_fecha date;

-- 2) Columnas en tareas_previsional (paridad)
ALTER TABLE public.tareas_previsional
  ADD COLUMN IF NOT EXISTS cargo_hora_favor text,
  ADD COLUMN IF NOT EXISTS cargo_hora_favor_fecha date;

-- 3) Permitir nuevo tipo de notificacion
ALTER TABLE public.notificaciones_app DROP CONSTRAINT IF EXISTS notificaciones_app_tipo_check;
ALTER TABLE public.notificaciones_app ADD CONSTRAINT notificaciones_app_tipo_check
  CHECK (tipo IN (
    'tarea_asignada','tarea_vista','tarea_estado','nota_caso',
    'tarea_proxima','tarea_vencida','presentar_escrito',
    'generico'
  ));

-- 4) Indice unico para no repetir notificacion 'presentar_escrito' por dia/tarea/usuario
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_presentar_escrito_user_dia
  ON public.notificaciones_app (user_id, tipo, related_id, dedupe_day)
  WHERE tipo = 'presentar_escrito';

-- 5) Funcion extendida
CREATE OR REPLACE FUNCTION public.revisar_recordatorios_tareas()
RETURNS TABLE(creadas integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  v_creadas integer := 0;
  v_dias_restantes integer;
  v_dias_vencido_favor integer;
  v_caso_titulo text;
  v_destino uuid;
  v_destinos uuid[];
BEGIN
  -- ── Bloque A: recordatorios por fecha_limite (existente) ────────────────
  FOR rec IN
    SELECT t.id, t.titulo, t.fecha_limite, t.responsable_id, t.created_by, t.cargo_hora,
           t.caso_general_id, t.caso_id
    FROM tareas t
    WHERE t.fecha_limite IS NOT NULL
      AND t.archivada = false
      AND t.estado NOT IN ('completada','finalizada')
      AND t.fecha_limite::date <= (current_date + INTERVAL '2 days')::date
  LOOP
    v_dias_restantes := (rec.fecha_limite::date - current_date);
    SELECT titulo INTO v_caso_titulo FROM casos_generales WHERE id = rec.caso_general_id;

    v_destinos := ARRAY[]::uuid[];
    IF rec.responsable_id IS NOT NULL THEN
      v_destinos := array_append(v_destinos, rec.responsable_id);
    END IF;
    IF rec.created_by IS NOT NULL
       AND rec.created_by <> COALESCE(rec.responsable_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      v_destinos := array_append(v_destinos, rec.created_by);
    END IF;

    FOREACH v_destino IN ARRAY v_destinos LOOP
      BEGIN
        IF v_dias_restantes < 0 THEN
          INSERT INTO notificaciones_app (user_id, tipo, titulo, mensaje, link, related_id, related_caso_general_id)
          VALUES (
            v_destino,
            'tarea_vencida',
            'Tarea VENCIDA: ' || rec.titulo,
            'La tarea "' || rec.titulo || '"' ||
              CASE WHEN rec.cargo_hora IS NOT NULL AND length(trim(rec.cargo_hora))>0
                   THEN ' (cargo de hora: ' || rec.cargo_hora || ')' ELSE '' END ||
              ' vencio hace ' || abs(v_dias_restantes) || ' dia(s).' ||
              CASE WHEN v_caso_titulo IS NOT NULL THEN ' Caso: ' || v_caso_titulo ELSE '' END,
            '/tareas?focus=' || rec.id::text,
            rec.id,
            rec.caso_general_id
          );
          v_creadas := v_creadas + 1;
        ELSE
          INSERT INTO notificaciones_app (user_id, tipo, titulo, mensaje, link, related_id, related_caso_general_id)
          VALUES (
            v_destino,
            'tarea_proxima',
            CASE WHEN v_dias_restantes = 0 THEN 'Tarea VENCE HOY: ' || rec.titulo
                 WHEN v_dias_restantes = 1 THEN 'Tarea vence MANANA: ' || rec.titulo
                 ELSE 'Tarea vence en 2 dias: ' || rec.titulo END,
            'Recordatorio: la tarea "' || rec.titulo || '"' ||
              CASE WHEN rec.cargo_hora IS NOT NULL AND length(trim(rec.cargo_hora))>0
                   THEN ' (cargo de hora: ' || rec.cargo_hora || ')' ELSE '' END ||
              CASE WHEN v_dias_restantes = 0 THEN ' vence HOY.'
                   WHEN v_dias_restantes = 1 THEN ' vence manana.'
                   ELSE ' vence en 2 dias.' END ||
              CASE WHEN v_caso_titulo IS NOT NULL THEN ' Caso: ' || v_caso_titulo ELSE '' END,
            '/tareas?focus=' || rec.id::text,
            rec.id,
            rec.caso_general_id
          );
          v_creadas := v_creadas + 1;
        END IF;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  -- ── Bloque B: PRESENTAR ESCRITO (vencio el plazo de la contraparte) ─────
  -- Cuando cargo_hora_favor_fecha es HOY o ya paso (ultimos 5 dias),
  -- avisar que hay que presentar el escrito.
  FOR rec IN
    SELECT t.id, t.titulo, t.cargo_hora_favor, t.cargo_hora_favor_fecha,
           t.responsable_id, t.created_by, t.caso_general_id, t.caso_id
    FROM tareas t
    WHERE t.cargo_hora_favor_fecha IS NOT NULL
      AND t.archivada = false
      AND t.estado NOT IN ('completada','finalizada')
      AND t.cargo_hora_favor_fecha <= current_date
      AND t.cargo_hora_favor_fecha >= (current_date - INTERVAL '5 days')::date
  LOOP
    v_dias_vencido_favor := (current_date - rec.cargo_hora_favor_fecha);
    SELECT titulo INTO v_caso_titulo FROM casos_generales WHERE id = rec.caso_general_id;

    v_destinos := ARRAY[]::uuid[];
    IF rec.responsable_id IS NOT NULL THEN
      v_destinos := array_append(v_destinos, rec.responsable_id);
    END IF;
    IF rec.created_by IS NOT NULL
       AND rec.created_by <> COALESCE(rec.responsable_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      v_destinos := array_append(v_destinos, rec.created_by);
    END IF;

    FOREACH v_destino IN ARRAY v_destinos LOOP
      BEGIN
        INSERT INTO notificaciones_app (user_id, tipo, titulo, mensaje, link, related_id, related_caso_general_id)
        VALUES (
          v_destino,
          'presentar_escrito',
          CASE WHEN v_dias_vencido_favor = 0
               THEN 'PRESENTAR ESCRITO HOY: ' || rec.titulo
               ELSE 'PRESENTAR ESCRITO (' || v_dias_vencido_favor || ' dia(s) atrasado): ' || rec.titulo
          END,
          'Vencio el plazo de la contraparte (cargo de hora a favor' ||
            CASE WHEN rec.cargo_hora_favor IS NOT NULL AND length(trim(rec.cargo_hora_favor))>0
                 THEN ': ' || rec.cargo_hora_favor ELSE '' END ||
            '). Hay que presentar el escrito para dejar la causa al dia.' ||
            CASE WHEN v_caso_titulo IS NOT NULL THEN ' Caso: ' || v_caso_titulo ELSE '' END,
          '/tareas?focus=' || rec.id::text,
          rec.id,
          rec.caso_general_id
        );
        v_creadas := v_creadas + 1;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_creadas;
END $$;

GRANT EXECUTE ON FUNCTION public.revisar_recordatorios_tareas() TO authenticated;

-- 6) Recrear vistas para exponer las nuevas columnas
DROP VIEW IF EXISTS public.caso_general_notas_completo CASCADE;
DROP VIEW IF EXISTS public.tareas_completas_v2 CASCADE;

CREATE OR REPLACE VIEW public.caso_general_notas_completo AS
SELECT
  n.id,
  n.caso_id,
  n.contenido,
  n.tarea_id,
  n.audio_path,
  n.created_by,
  n.created_at,
  n.updated_at,
  n.editado,
  pa.nombre        AS autor_nombre,
  pa.avatar_url    AS autor_avatar,
  t.titulo                  AS tarea_titulo,
  t.estado                  AS tarea_estado,
  t.fecha_limite            AS tarea_fecha_limite,
  t.responsable_id          AS tarea_responsable_id,
  t.visto_por_asignado      AS tarea_visto,
  t.visto_at                AS tarea_visto_at,
  t.prioridad               AS tarea_prioridad,
  t.descripcion             AS tarea_descripcion,
  t.culminacion             AS tarea_culminacion,
  t.cargo_hora              AS tarea_cargo_hora,
  t.cargo_hora_favor        AS tarea_cargo_hora_favor,
  t.cargo_hora_favor_fecha  AS tarea_cargo_hora_favor_fecha,
  t.adjunto_path            AS tarea_adjunto_path,
  t.adjunto_nombre          AS tarea_adjunto_nombre,
  pr.nombre                 AS tarea_responsable_nombre,
  pr.avatar_url             AS tarea_responsable_avatar
FROM public.caso_general_notas n
LEFT JOIN public.perfiles pa ON pa.id = n.created_by
LEFT JOIN public.tareas    t  ON t.id  = n.tarea_id
LEFT JOIN public.perfiles pr ON pr.id = t.responsable_id;

CREATE OR REPLACE VIEW public.tareas_completas_v2 AS
SELECT
  t.*,
  cl.nombre_apellido      AS cliente_nombre,
  c.expediente            AS expediente_caso,
  cg.titulo               AS caso_general_titulo,
  cg.expediente           AS caso_general_expediente,
  p_resp.nombre           AS responsable_nombre,
  p_resp.avatar_url       AS responsable_avatar,
  p_create.nombre         AS creado_por_nombre,
  p_create.avatar_url     AS creado_por_avatar
FROM public.tareas t
LEFT JOIN public.casos              c        ON c.id  = t.caso_id
LEFT JOIN public.clientes           cl       ON cl.id = c.cliente_id
LEFT JOIN public.casos_generales    cg       ON cg.id = t.caso_general_id
LEFT JOIN public.perfiles           p_resp   ON p_resp.id   = t.responsable_id
LEFT JOIN public.perfiles           p_create ON p_create.id = t.created_by;

-- 7) Recrear trigger de sync para mapear los nuevos campos
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

  v_estado := CASE WHEN NEW.estado = 'completada' THEN 'completada' ELSE 'en_curso' END;
  v_titulo := '[Previsional] ' || NEW.titulo;

  SELECT id INTO v_existing_id FROM tareas WHERE previsional_id = NEW.id;

  IF v_existing_id IS NULL THEN
    INSERT INTO tareas (
      previsional_id, titulo, descripcion, estado, prioridad, fecha_limite,
      responsable_id, cargo_hora, cargo_hora_favor, cargo_hora_favor_fecha,
      observaciones_demora, archivada,
      fecha_completada, created_by, updated_by, created_at, updated_at
    ) VALUES (
      NEW.id, v_titulo, NEW.descripcion, v_estado, NEW.prioridad, NEW.fecha_limite,
      NEW.responsable_id, NEW.cargo_hora, NEW.cargo_hora_favor, NEW.cargo_hora_favor_fecha,
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
      responsable_id = NEW.responsable_id,
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

-- ─── FIN ────────────────────────────────────────────────────────────────────
