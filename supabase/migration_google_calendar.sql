-- ============================================================================
-- Migration: Google Calendar integration
-- - Tabla google_oauth_tokens: 1 fila por usuario con refresh_token + access_token
-- - Campo google_event_id en audiencias_general (para idempotencia / update / delete)
-- - Politicas RLS: cada usuario ve/modifica solo su propia fila de tokens
-- Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  user_id          uuid PRIMARY KEY REFERENCES public.perfiles(id) ON DELETE CASCADE,
  google_email     text,
  access_token     text,
  refresh_token    text,
  expires_at       timestamptz,
  scope            text,
  calendar_id      text DEFAULT 'primary',
  conectado_at     timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_tokens_select_own" ON public.google_oauth_tokens;
DROP POLICY IF EXISTS "google_tokens_modify_own" ON public.google_oauth_tokens;
CREATE POLICY "google_tokens_select_own" ON public.google_oauth_tokens
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "google_tokens_modify_own" ON public.google_oauth_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Columna google_event_id en audiencias para sincronizacion idempotente
ALTER TABLE public.audiencias_general
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_synced_at timestamptz;

-- Recrear vista con los campos nuevos
DROP VIEW IF EXISTS public.audiencias_general_completas CASCADE;
CREATE OR REPLACE VIEW public.audiencias_general_completas AS
SELECT
  a.*,
  cl.nombre_apellido       AS cliente_nombre,
  p.nombre                 AS abogado_nombre,
  cg.titulo                AS caso_general_titulo,
  cg.expediente            AS caso_general_expediente
FROM public.audiencias_general a
LEFT JOIN public.casos             c  ON c.id  = a.caso_id
LEFT JOIN public.clientes          cl ON cl.id = c.cliente_id
LEFT JOIN public.perfiles          p  ON p.id  = a.abogado_id
LEFT JOIN public.casos_generales   cg ON cg.id = a.caso_general_id;

GRANT SELECT ON public.audiencias_general_completas TO authenticated;

-- ─── FIN ────────────────────────────────────────────────────────────────────
