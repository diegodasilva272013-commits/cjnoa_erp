-- ============================================================================
-- Migration: Notas con autoría + Tareas con flujo + Notificaciones in-app
-- Para casos_generales (sistema de seguimiento colaborativo)
-- ============================================================================
-- Crea:
--   1. caso_general_notas        (feed de notas con autor)
--   2. notificaciones_app        (mensajes in-app por usuario, realtime)
--   3. tareas extendida          (caso_general_id, estados nuevos, visto)
--   4. Triggers automáticos:
--      - asignar tarea          → notificar al responsable
--      - marcar tarea como vista → notificar al emisor
--      - completar/reabrir/etc. → mantenimiento
--   5. Vistas con joins de perfiles (nombre + avatar)
-- ============================================================================

-- ─── 1. NOTAS DE CASO ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.caso_general_notas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id     uuid NOT NULL REFERENCES public.casos_generales(id) ON DELETE CASCADE,
  contenido   text NOT NULL CHECK (length(trim(contenido)) > 0),
  tarea_id    uuid REFERENCES public.tareas(id) ON DELETE SET NULL,
  audio_path  text,
  created_by  uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  editado     boolean NOT NULL DEFAULT false
);
-- Por si la tabla ya existía antes (idempotente)
ALTER TABLE public.caso_general_notas ADD COLUMN IF NOT EXISTS audio_path text;
CREATE INDEX IF NOT EXISTS idx_caso_gen_notas_caso ON public.caso_general_notas (caso_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caso_gen_notas_tarea ON public.caso_general_notas (tarea_id);

-- trigger para marcar editado
CREATE OR REPLACE FUNCTION public.caso_general_notas_marcar_editado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.contenido IS DISTINCT FROM NEW.contenido THEN
    NEW.editado := true;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_caso_gen_notas_editado ON public.caso_general_notas;
CREATE TRIGGER trg_caso_gen_notas_editado
  BEFORE UPDATE ON public.caso_general_notas
  FOR EACH ROW EXECUTE FUNCTION public.caso_general_notas_marcar_editado();

ALTER TABLE public.caso_general_notas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS caso_gen_notas_all ON public.caso_general_notas;
CREATE POLICY caso_gen_notas_all ON public.caso_general_notas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 2. EXTENDER TAREAS PARA CASOS_GENERALES + FLUJO DE 5 ESTADOS ───────────
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS caso_general_id uuid REFERENCES public.casos_generales(id) ON DELETE SET NULL;
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS visto_por_asignado boolean NOT NULL DEFAULT false;
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS visto_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tareas_caso_general ON public.tareas (caso_general_id);

-- Relajar el CHECK para soportar el nuevo flujo (sin romper estados legacy)
ALTER TABLE public.tareas DROP CONSTRAINT IF EXISTS tareas_estado_check;
ALTER TABLE public.tareas ADD CONSTRAINT tareas_estado_check
  CHECK (estado IN (
    'en_curso','completada',                                      -- legacy
    'activa','aceptada','pendiente','en_proceso','finalizada'     -- flujo nuevo
  ));

-- ─── 3. NOTIFICACIONES IN-APP ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notificaciones_app (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('tarea_asignada','tarea_vista','tarea_estado','nota_caso','generico')),
  titulo          text NOT NULL,
  mensaje         text,
  link            text,                                  -- ruta in-app sugerida
  related_id      uuid,                                  -- id tarea/nota/caso
  related_caso_general_id uuid REFERENCES public.casos_generales(id) ON DELETE SET NULL,
  related_user_id uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  leida           boolean NOT NULL DEFAULT false,
  leida_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON public.notificaciones_app (user_id, leida, created_at DESC);

ALTER TABLE public.notificaciones_app ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_select_own ON public.notificaciones_app;
CREATE POLICY notif_select_own ON public.notificaciones_app
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS notif_update_own ON public.notificaciones_app;
CREATE POLICY notif_update_own ON public.notificaciones_app
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS notif_insert_any ON public.notificaciones_app;
CREATE POLICY notif_insert_any ON public.notificaciones_app
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS notif_delete_own ON public.notificaciones_app;
CREATE POLICY notif_delete_own ON public.notificaciones_app
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ─── 4. TRIGGERS DE NOTIFICACIÓN AUTOMÁTICA ─────────────────────────────────

-- 4.a) Al asignar/reasignar tarea de un caso_general → notificar al responsable
CREATE OR REPLACE FUNCTION public.notify_tarea_asignada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emisor_nombre text;
  v_caso_titulo text;
  v_should_notify boolean := false;
BEGIN
  -- Solo si la tarea está atada a un caso_general y tiene responsable distinto del creador
  IF NEW.responsable_id IS NULL OR NEW.caso_general_id IS NULL THEN
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

  IF v_should_notify THEN
    SELECT nombre INTO v_emisor_nombre FROM perfiles WHERE id = COALESCE(NEW.created_by, NEW.updated_by);
    SELECT titulo  INTO v_caso_titulo  FROM casos_generales WHERE id = NEW.caso_general_id;
    INSERT INTO notificaciones_app (user_id, tipo, titulo, mensaje, link, related_id, related_caso_general_id, related_user_id)
    VALUES (
      NEW.responsable_id,
      'tarea_asignada',
      'Nueva tarea asignada',
      COALESCE(v_emisor_nombre,'Alguien') || ' te asignó "' || NEW.titulo || '"' ||
        CASE WHEN v_caso_titulo IS NOT NULL THEN ' en ' || v_caso_titulo ELSE '' END,
      '/casos-generales?caso=' || NEW.caso_general_id,
      NEW.id,
      NEW.caso_general_id,
      COALESCE(NEW.created_by, NEW.updated_by)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_tarea_asignada ON public.tareas;
CREATE TRIGGER trg_notify_tarea_asignada
  AFTER INSERT OR UPDATE OF responsable_id ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.notify_tarea_asignada();

-- 4.b) Cuando el asignado marca "vista" → notificar al emisor
CREATE OR REPLACE FUNCTION public.notify_tarea_vista()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asignado_nombre text;
  v_caso_titulo text;
BEGIN
  IF NEW.visto_por_asignado = true
     AND COALESCE(OLD.visto_por_asignado, false) = false
     AND NEW.created_by IS NOT NULL
     AND NEW.created_by IS DISTINCT FROM NEW.responsable_id THEN
    SELECT nombre INTO v_asignado_nombre FROM perfiles WHERE id = NEW.responsable_id;
    SELECT titulo  INTO v_caso_titulo    FROM casos_generales WHERE id = NEW.caso_general_id;
    INSERT INTO notificaciones_app (user_id, tipo, titulo, mensaje, link, related_id, related_caso_general_id, related_user_id)
    VALUES (
      NEW.created_by,
      'tarea_vista',
      'Tarea vista',
      COALESCE(v_asignado_nombre,'El asignado') || ' confirmó haber visto "' || NEW.titulo || '"',
      CASE WHEN NEW.caso_general_id IS NOT NULL
           THEN '/casos-generales?caso=' || NEW.caso_general_id
           ELSE '/tareas' END,
      NEW.id,
      NEW.caso_general_id,
      NEW.responsable_id
    );
    -- guardar timestamp de visto
    NEW.visto_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_tarea_vista ON public.tareas;
CREATE TRIGGER trg_notify_tarea_vista
  BEFORE UPDATE OF visto_por_asignado ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.notify_tarea_vista();

-- ─── 5. VISTAS CON JOIN A PERFILES (avatar + nombre) ────────────────────────
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
  -- datos de la tarea asociada (si hay)
  t.titulo               AS tarea_titulo,
  t.estado               AS tarea_estado,
  t.fecha_limite         AS tarea_fecha_limite,
  t.responsable_id       AS tarea_responsable_id,
  t.visto_por_asignado   AS tarea_visto,
  t.visto_at             AS tarea_visto_at,
  t.prioridad            AS tarea_prioridad,
  t.descripcion          AS tarea_descripcion,
  t.culminacion          AS tarea_culminacion,
  t.cargo_hora           AS tarea_cargo_hora,
  t.adjunto_path         AS tarea_adjunto_path,
  t.adjunto_nombre       AS tarea_adjunto_nombre,
  pr.nombre              AS tarea_responsable_nombre,
  pr.avatar_url          AS tarea_responsable_avatar
FROM public.caso_general_notas n
LEFT JOIN public.perfiles pa ON pa.id = n.created_by
LEFT JOIN public.tareas    t  ON t.id  = n.tarea_id
LEFT JOIN public.perfiles pr ON pr.id = t.responsable_id;

-- Vista extendida de tareas: incluye caso_general (si tiene)
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

-- ─── 6. REALTIME ────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.caso_general_notas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones_app;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- tareas ya está en realtime

-- ─── FIN ────────────────────────────────────────────────────────────────────
