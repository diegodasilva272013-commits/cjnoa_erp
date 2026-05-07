-- ============================================================
-- Migration: Chat interno tipo Telegram
-- ============================================================
-- Tablas:
--   chat_conversaciones  : conversaciones (1-a-1 o grupales)
--   chat_participantes   : usuarios miembros de cada conversación
--   chat_mensajes        : mensajes (texto, imagen, archivo, audio, gif, sticker)
--   chat_lecturas        : marca de "último leído" por usuario/conversación
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_conversaciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text NOT NULL DEFAULT 'directo' CHECK (tipo IN ('directo','grupo')),
  nombre      text,
  avatar_url  text,
  creada_por  uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_participantes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES public.chat_conversaciones(id) ON DELETE CASCADE,
  usuario_id      uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  rol             text NOT NULL DEFAULT 'miembro' CHECK (rol IN ('miembro','admin')),
  archivada       boolean NOT NULL DEFAULT false,
  silenciada      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversacion_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_part_usuario ON public.chat_participantes (usuario_id);
CREATE INDEX IF NOT EXISTS idx_chat_part_conv ON public.chat_participantes (conversacion_id);

CREATE TABLE IF NOT EXISTS public.chat_mensajes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES public.chat_conversaciones(id) ON DELETE CASCADE,
  emisor_id       uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  tipo            text NOT NULL DEFAULT 'texto'
                   CHECK (tipo IN ('texto','imagen','archivo','audio','gif','sticker','sistema')),
  contenido       text,                           -- texto plano o caption
  media_url       text,                           -- URL pública del archivo / gif
  media_nombre    text,                           -- nombre original
  media_mime      text,
  media_size      bigint,
  duracion_seg    integer,                        -- para notas de voz
  reply_to        uuid REFERENCES public.chat_mensajes(id) ON DELETE SET NULL,
  editado         boolean NOT NULL DEFAULT false,
  eliminado       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON public.chat_mensajes (conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_msg_emisor ON public.chat_mensajes (emisor_id);

CREATE TABLE IF NOT EXISTS public.chat_lecturas (
  conversacion_id uuid NOT NULL REFERENCES public.chat_conversaciones(id) ON DELETE CASCADE,
  usuario_id      uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  ultimo_leido    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversacion_id, usuario_id)
);

-- Bump updated_at conversación al insertar mensaje
CREATE OR REPLACE FUNCTION public.chat_bump_conv() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.chat_conversaciones SET updated_at = now() WHERE id = NEW.conversacion_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_bump_conv ON public.chat_mensajes;
CREATE TRIGGER trg_chat_bump_conv AFTER INSERT ON public.chat_mensajes
  FOR EACH ROW EXECUTE FUNCTION public.chat_bump_conv();

-- =================== RLS ============================
ALTER TABLE public.chat_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participantes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensajes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_lecturas        ENABLE ROW LEVEL SECURITY;

-- conversaciones: ven solo las que participan
DROP POLICY IF EXISTS chat_conv_select ON public.chat_conversaciones;
CREATE POLICY chat_conv_select ON public.chat_conversaciones
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.chat_participantes p
            WHERE p.conversacion_id = id AND p.usuario_id = auth.uid())
  );

DROP POLICY IF EXISTS chat_conv_insert ON public.chat_conversaciones;
CREATE POLICY chat_conv_insert ON public.chat_conversaciones
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS chat_conv_update ON public.chat_conversaciones;
CREATE POLICY chat_conv_update ON public.chat_conversaciones
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.chat_participantes p
            WHERE p.conversacion_id = id AND p.usuario_id = auth.uid())
  );

-- participantes: ven todos los participantes de las conversaciones donde están
DROP POLICY IF EXISTS chat_part_select ON public.chat_participantes;
CREATE POLICY chat_part_select ON public.chat_participantes
  FOR SELECT TO authenticated USING (
    usuario_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.chat_participantes p
      WHERE p.conversacion_id = chat_participantes.conversacion_id
        AND p.usuario_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS chat_part_insert ON public.chat_participantes;
CREATE POLICY chat_part_insert ON public.chat_participantes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS chat_part_update ON public.chat_participantes;
CREATE POLICY chat_part_update ON public.chat_participantes
  FOR UPDATE TO authenticated USING (usuario_id = auth.uid());
DROP POLICY IF EXISTS chat_part_delete ON public.chat_participantes;
CREATE POLICY chat_part_delete ON public.chat_participantes
  FOR DELETE TO authenticated USING (usuario_id = auth.uid());

-- mensajes: ven y escriben los que participan
DROP POLICY IF EXISTS chat_msg_select ON public.chat_mensajes;
CREATE POLICY chat_msg_select ON public.chat_mensajes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.chat_participantes p
            WHERE p.conversacion_id = conversacion_id AND p.usuario_id = auth.uid())
  );
DROP POLICY IF EXISTS chat_msg_insert ON public.chat_mensajes;
CREATE POLICY chat_msg_insert ON public.chat_mensajes
  FOR INSERT TO authenticated WITH CHECK (
    emisor_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.chat_participantes p
      WHERE p.conversacion_id = conversacion_id AND p.usuario_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS chat_msg_update ON public.chat_mensajes;
CREATE POLICY chat_msg_update ON public.chat_mensajes
  FOR UPDATE TO authenticated USING (emisor_id = auth.uid());
DROP POLICY IF EXISTS chat_msg_delete ON public.chat_mensajes;
CREATE POLICY chat_msg_delete ON public.chat_mensajes
  FOR DELETE TO authenticated USING (emisor_id = auth.uid());

-- lecturas: cada uno la suya
DROP POLICY IF EXISTS chat_lec_all ON public.chat_lecturas;
CREATE POLICY chat_lec_all ON public.chat_lecturas
  FOR ALL TO authenticated USING (usuario_id = auth.uid()) WITH CHECK (usuario_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensajes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participantes;

-- ===================== Storage bucket ==========================
-- IMPORTANTE: crear el bucket "chat-media" como PUBLIC desde Supabase Dashboard
-- (Storage → New bucket → name: chat-media → Public → Save)
-- O ejecutar:
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Policy para que cualquier autenticado suba a su carpeta
DROP POLICY IF EXISTS "chat_media_insert" ON storage.objects;
CREATE POLICY "chat_media_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat_media_select" ON storage.objects;
CREATE POLICY "chat_media_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat_media_delete" ON storage.objects;
CREATE POLICY "chat_media_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media' AND owner = auth.uid());

-- ===================== Vista helper ==========================
CREATE OR REPLACE VIEW public.chat_conv_resumen AS
SELECT
  c.id,
  c.tipo,
  c.nombre,
  c.avatar_url,
  c.created_at,
  c.updated_at,
  (SELECT COUNT(*) FROM public.chat_participantes pp WHERE pp.conversacion_id = c.id) AS total_participantes,
  (SELECT m.contenido FROM public.chat_mensajes m
     WHERE m.conversacion_id = c.id AND m.eliminado = false
     ORDER BY m.created_at DESC LIMIT 1) AS ultimo_mensaje,
  (SELECT m.tipo FROM public.chat_mensajes m
     WHERE m.conversacion_id = c.id AND m.eliminado = false
     ORDER BY m.created_at DESC LIMIT 1) AS ultimo_tipo,
  (SELECT m.created_at FROM public.chat_mensajes m
     WHERE m.conversacion_id = c.id
     ORDER BY m.created_at DESC LIMIT 1) AS ultimo_at,
  (SELECT pf.nombre FROM public.chat_mensajes m
     JOIN public.perfiles pf ON pf.id = m.emisor_id
     WHERE m.conversacion_id = c.id
     ORDER BY m.created_at DESC LIMIT 1) AS ultimo_emisor_nombre
FROM public.chat_conversaciones c;

-- Función para crear/obtener conversación 1-a-1 entre dos users
CREATE OR REPLACE FUNCTION public.get_or_create_dm(target_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conv uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No auth'; END IF;
  IF target_user = auth.uid() THEN RAISE EXCEPTION 'No podés chatear contigo mismo'; END IF;

  SELECT c.id INTO v_conv
  FROM public.chat_conversaciones c
  WHERE c.tipo = 'directo'
    AND EXISTS (SELECT 1 FROM public.chat_participantes p WHERE p.conversacion_id = c.id AND p.usuario_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.chat_participantes p WHERE p.conversacion_id = c.id AND p.usuario_id = target_user)
    AND (SELECT COUNT(*) FROM public.chat_participantes p WHERE p.conversacion_id = c.id) = 2
  LIMIT 1;

  IF v_conv IS NULL THEN
    INSERT INTO public.chat_conversaciones (tipo, creada_por) VALUES ('directo', auth.uid()) RETURNING id INTO v_conv;
    INSERT INTO public.chat_participantes (conversacion_id, usuario_id, rol) VALUES (v_conv, auth.uid(), 'admin');
    INSERT INTO public.chat_participantes (conversacion_id, usuario_id, rol) VALUES (v_conv, target_user, 'miembro');
  END IF;

  RETURN v_conv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_dm(uuid) TO authenticated;
