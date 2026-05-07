-- ============================================================
-- Push notifications: storage de suscripciones por usuario
-- ============================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_sub_usuario ON public.push_subscriptions (usuario_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_sub_select ON public.push_subscriptions;
CREATE POLICY push_sub_select ON public.push_subscriptions
  FOR SELECT TO authenticated USING (usuario_id = auth.uid());
DROP POLICY IF EXISTS push_sub_insert ON public.push_subscriptions;
CREATE POLICY push_sub_insert ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (usuario_id = auth.uid());
DROP POLICY IF EXISTS push_sub_delete ON public.push_subscriptions;
CREATE POLICY push_sub_delete ON public.push_subscriptions
  FOR DELETE TO authenticated USING (usuario_id = auth.uid());

GRANT ALL ON public.push_subscriptions TO authenticated;

-- ============================================================
-- Trigger: cuando llega un chat_mensaje, llamar Edge Function send-chat-push
-- (usa pg_net si está disponible, si no queda como no-op)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    -- ok, ya está
    NULL;
  ELSE
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_net;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'No se pudo crear pg_net: %', SQLERRM;
    END;
  END IF;
END $$;

-- Tabla de configuración (URL de la edge function + service role key)
CREATE TABLE IF NOT EXISTS public.app_secrets (
  k text PRIMARY KEY,
  v text NOT NULL
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
-- nadie autenticado puede leer (solo el trigger SECURITY DEFINER)

CREATE OR REPLACE FUNCTION public.notify_chat_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text;
  v_key text;
  v_payload jsonb;
BEGIN
  SELECT v INTO v_url FROM public.app_secrets WHERE k = 'edge_send_chat_push_url';
  SELECT v INTO v_key FROM public.app_secrets WHERE k = 'edge_service_role_key';
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object('mensaje_id', NEW.id);

  -- llamada async via pg_net (ignora errores)
  BEGIN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body := v_payload
    );
  EXCEPTION WHEN OTHERS THEN
    -- silencioso
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_msg_push ON public.chat_mensajes;
CREATE TRIGGER trg_chat_msg_push
AFTER INSERT ON public.chat_mensajes
FOR EACH ROW EXECUTE FUNCTION public.notify_chat_push();
