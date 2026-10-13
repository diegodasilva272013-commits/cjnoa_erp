-- ============================================================================
-- MIGRATION: varios audios por persona
-- Una persona tiene UNA conversación en el ERP (se junta por teléfono), pero el canal
-- abre un conversation_id distinto en cada llamada/charla y cada una tiene su audio.
--   conversation_ids : todos los conversation_id que se juntaron en esta fila
--   audios           : [{conversation_id, path}] un audio por llamada/charla
-- Sin DROP/DELETE/TRUNCATE. Idempotente.
-- ============================================================================
ALTER TABLE public.conversaciones_whatsapp
  ADD COLUMN IF NOT EXISTS conversation_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS audios jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_conv_wa_conversation_ids ON public.conversaciones_whatsapp USING gin (conversation_ids);

NOTIFY pgrst, 'reload schema';
