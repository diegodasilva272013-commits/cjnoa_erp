-- ============================================================================
-- MIGRACION v2: paridad TOTAL del seguimiento + tareas Federales <-> Provincial
-- ----------------------------------------------------------------------------
-- Objetivo: una tarea creada desde un caso federal se comporta IDENTICO
-- a una tarea creada desde un caso provincial:
--   * Se guarda en la MISMA tabla (public.tareas) -> dispara los triggers de
--     notificacion existentes -> el responsable recibe el aviso in-app.
--   * Aparece en tareas_completas_v2 -> visible en Mi Dia, Control de Tareas
--     y la pagina de Tareas.
--   * El boton "Visto" y los cambios de estado actualizan la misma fila.
--   * Los pasos compartidos viven en tarea_pasos (no en tarea_federal_pasos).
--
-- Cambios:
--   1. public.tareas gana columna cliente_federal_id.
--   2. notificaciones_app gana columna related_cliente_federal_id.
--   3. Triggers notify_tarea_asignada / notify_tarea_vista soportan ambos
--      tipos de caso (caso_general_id O cliente_federal_id).
--   4. Vista clientes_federales_notas_completo: se rearma para hacer JOIN
--      contra public.tareas (no contra tareas_federales).
--   5. Vista tareas_completas_v2: incluye cliente_federal_id +
--      cliente_federal_nombre + cliente_federal_tipo.
--
-- 100% idempotente. Requiere haber corrido antes:
--   - migration_casos_federales.sql
--   - migration_caso_general_notas_y_notificaciones.sql
--   - migration_federales_seguimiento_paridad.sql (v1, columnas extra)
-- ============================================================================

-- 1) Columna cliente_federal_id en public.tareas ---------------------------
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS cliente_federal_id uuid
    REFERENCES public.clientes_federales(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_tareas_cliente_federal
  ON public.tareas (cliente_federal_id);

-- 2) related_cliente_federal_id en notificaciones_app ----------------------
ALTER TABLE public.notificaciones_app
  ADD COLUMN IF NOT EXISTS related_cliente_federal_id uuid
    REFERENCES public.clientes_federales(id) ON DELETE SET NULL;

-- 3) Triggers de notificacion (soportan caso general O caso federal) -------

-- 3.a) Asignar / reasignar tarea -> avisar al responsable
CREATE OR REPLACE FUNCTION public.notify_tarea_asignada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emisor_nombre text;
  v_caso_titulo   text;
  v_link          text;
  v_should_notify boolean := false;
BEGIN
  -- Necesitamos responsable y algun caso (general o federal)
  IF NEW.responsable_id IS NULL
     OR (NEW.caso_general_id IS NULL AND NEW.cliente_federal_id IS NULL) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := (NEW.responsable_id IS DISTINCT FROM NEW.created_by);
  ELSIF TG_OP = 'UPDATE' THEN
    v_should_notify := (
      OLD.responsable_id IS DISTINCT FROM NEW.responsable_id
      AND NEW.responsable_id IS DISTINCT FROM COALESCE(NEW.updated_by, NEW.created_by)
    );
  END IF;

  IF NOT v_should_notify THEN
    RETURN NEW;
  END IF;

  SELECT nombre INTO v_emisor_nombre
    FROM perfiles WHERE id = COALESCE(NEW.created_by, NEW.updated_by);

  IF NEW.cliente_federal_id IS NOT NULL THEN
    SELECT nombre_apellido INTO v_caso_titulo
      FROM clientes_federales WHERE id = NEW.cliente_federal_id;
    v_link := '/casos-federales?caso=' || NEW.cliente_federal_id;
  ELSE
    SELECT titulo INTO v_caso_titulo
      FROM casos_generales WHERE id = NEW.caso_general_id;
    v_link := '/casos-generales?caso=' || NEW.caso_general_id;
  END IF;

  INSERT INTO notificaciones_app (
    user_id, tipo, titulo, mensaje, link,
    related_id, related_caso_general_id, related_cliente_federal_id, related_user_id
  )
  VALUES (
    NEW.responsable_id,
    'tarea_asignada',
    'Nueva tarea asignada',
    COALESCE(v_emisor_nombre,'Alguien') || ' te asignó "' || NEW.titulo || '"' ||
      CASE WHEN v_caso_titulo IS NOT NULL THEN ' en ' || v_caso_titulo ELSE '' END,
    v_link,
    NEW.id,
    NEW.caso_general_id,
    NEW.cliente_federal_id,
    COALESCE(NEW.created_by, NEW.updated_by)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_tarea_asignada ON public.tareas;
CREATE TRIGGER trg_notify_tarea_asignada
  AFTER INSERT OR UPDATE OF responsable_id ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.notify_tarea_asignada();

-- 3.b) Marca "vista" -> avisar al emisor
CREATE OR REPLACE FUNCTION public.notify_tarea_vista()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asignado_nombre text;
  v_caso_titulo     text;
  v_link            text;
BEGIN
  IF NEW.visto_por_asignado = true
     AND COALESCE(OLD.visto_por_asignado, false) = false
     AND NEW.created_by IS NOT NULL
     AND NEW.created_by IS DISTINCT FROM NEW.responsable_id THEN

    SELECT nombre INTO v_asignado_nombre FROM perfiles WHERE id = NEW.responsable_id;

    IF NEW.cliente_federal_id IS NOT NULL THEN
      SELECT nombre_apellido INTO v_caso_titulo
        FROM clientes_federales WHERE id = NEW.cliente_federal_id;
      v_link := '/casos-federales?caso=' || NEW.cliente_federal_id;
    ELSIF NEW.caso_general_id IS NOT NULL THEN
      SELECT titulo INTO v_caso_titulo
        FROM casos_generales WHERE id = NEW.caso_general_id;
      v_link := '/casos-generales?caso=' || NEW.caso_general_id;
    ELSE
      v_link := '/tareas';
    END IF;

    INSERT INTO notificaciones_app (
      user_id, tipo, titulo, mensaje, link,
      related_id, related_caso_general_id, related_cliente_federal_id, related_user_id
    )
    VALUES (
      NEW.created_by,
      'tarea_vista',
      'Tarea vista',
      COALESCE(v_asignado_nombre,'El asignado') || ' confirmó haber visto "' || NEW.titulo || '"',
      v_link,
      NEW.id,
      NEW.caso_general_id,
      NEW.cliente_federal_id,
      NEW.responsable_id
    );
    NEW.visto_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_tarea_vista ON public.tareas;
CREATE TRIGGER trg_notify_tarea_vista
  BEFORE UPDATE OF visto_por_asignado ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.notify_tarea_vista();

-- 4) Vista clientes_federales_notas_completo: JOIN contra public.tareas ----
-- Antes apuntaba a tareas_federales. Ahora una tarea federal vive en
-- public.tareas (con cliente_federal_id), asi que la nota guarda en su
-- columna tarea_federal_id el id de la fila de public.tareas (es solo un
-- "puntero a la tarea unica del sistema").
DROP VIEW IF EXISTS public.clientes_federales_notas_completo CASCADE;

CREATE OR REPLACE VIEW public.clientes_federales_notas_completo AS
SELECT
  n.id,
  n.cliente_fed_id   AS caso_id,
  n.contenido,
  n.tarea_federal_id AS tarea_id,
  n.audio_path,
  n.created_by,
  n.created_at,
  n.updated_at,
  n.editado,
  pa.nombre          AS autor_nombre,
  pa.avatar_url      AS autor_avatar,
  t.titulo                 AS tarea_titulo,
  t.estado                 AS tarea_estado,
  t.fecha_limite           AS tarea_fecha_limite,
  t.responsable_id         AS tarea_responsable_id,
  t.visto_por_asignado     AS tarea_visto,
  t.visto_at               AS tarea_visto_at,
  t.prioridad              AS tarea_prioridad,
  t.descripcion            AS tarea_descripcion,
  t.culminacion            AS tarea_culminacion,
  t.cargo_hora             AS tarea_cargo_hora,
  t.cargo_hora_favor       AS tarea_cargo_hora_favor,
  t.cargo_hora_favor_fecha AS tarea_cargo_hora_favor_fecha,
  t.adjunto_path           AS tarea_adjunto_path,
  t.adjunto_nombre         AS tarea_adjunto_nombre,
  pr.nombre                AS tarea_responsable_nombre,
  pr.avatar_url            AS tarea_responsable_avatar
FROM public.clientes_federales_notas n
LEFT JOIN public.perfiles pa ON pa.id = n.created_by
LEFT JOIN public.tareas    t ON t.id  = n.tarea_federal_id
LEFT JOIN public.perfiles pr ON pr.id = t.responsable_id;

-- Quitamos la FK vieja (apuntaba a tareas_federales) si todavía existe.
-- A partir de ahora tarea_federal_id apunta a public.tareas.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_federales_notas_tarea_fk'
  ) THEN
    ALTER TABLE public.clientes_federales_notas
      DROP CONSTRAINT clientes_federales_notas_tarea_fk;
  END IF;
END $$;

-- 5) Vista tareas_completas_v2: incluye contexto federal -------------------
DROP VIEW IF EXISTS public.tareas_completas_v2 CASCADE;

CREATE OR REPLACE VIEW public.tareas_completas_v2 AS
SELECT
  t.*,
  cl.nombre_apellido     AS cliente_nombre,
  c.expediente           AS expediente_caso,
  cg.titulo              AS caso_general_titulo,
  cg.expediente          AS caso_general_expediente,
  cf.nombre_apellido     AS cliente_federal_nombre,
  cf.tipo_caso           AS cliente_federal_tipo,
  p_resp.nombre          AS responsable_nombre,
  p_resp.avatar_url      AS responsable_avatar,
  p_create.nombre        AS creado_por_nombre,
  p_create.avatar_url    AS creado_por_avatar
FROM public.tareas t
LEFT JOIN public.casos              c        ON c.id  = t.caso_id
LEFT JOIN public.clientes           cl       ON cl.id = c.cliente_id
LEFT JOIN public.casos_generales    cg       ON cg.id = t.caso_general_id
LEFT JOIN public.clientes_federales cf       ON cf.id = t.cliente_federal_id
LEFT JOIN public.perfiles           p_resp   ON p_resp.id   = t.responsable_id
LEFT JOIN public.perfiles           p_create ON p_create.id = t.created_by;

-- ─── FIN ───────────────────────────────────────────────────────────────────
