-- ============================================================================
-- Guarda las conversaciones del "Chat de prueba" del ERP para poder revisarlas.
-- Solo CREA una tabla nueva (no toca ni borra nada existente). Idempotente.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_prueba_conversaciones (
  sesion      uuid PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  usuario     text,
  version     text,
  modelo      text,
  agendo      boolean NOT NULL DEFAULT false,
  mensajes    jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.chat_prueba_conversaciones ENABLE ROW LEVEL SECURITY;

DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_prueba_conversaciones' AND policyname='chat_prueba_ver') THEN
    EXECUTE $q$CREATE POLICY chat_prueba_ver ON public.chat_prueba_conversaciones
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio')))$q$;
  END IF;
END $pol$;

CREATE INDEX IF NOT EXISTS chat_prueba_updated_idx ON public.chat_prueba_conversaciones (updated_at DESC);

NOTIFY pgrst, 'reload schema';
