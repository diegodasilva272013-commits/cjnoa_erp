-- ============================================================================
-- Migration: Documentos / archivos para clientes_federales
-- Mismo patrón que casos_generales_documentos:
--   - tabla con metadatos por cliente federal
--   - bucket dedicado 'federales-adjuntos'
--   - políticas de RLS + storage abiertas a usuarios autenticados
-- ============================================================================

-- 1. Tabla
CREATE TABLE IF NOT EXISTS public.clientes_federales_documentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_fed_id  uuid NOT NULL REFERENCES public.clientes_federales(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  mime            text NOT NULL DEFAULT 'application/octet-stream',
  tamano          bigint NOT NULL DEFAULT 0,
  storage_path    text NOT NULL,
  subido_por      uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fed_docs_cliente
  ON public.clientes_federales_documentos (cliente_fed_id, created_at DESC);

-- 2. RLS
ALTER TABLE public.clientes_federales_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fed_docs_all ON public.clientes_federales_documentos;
CREATE POLICY fed_docs_all ON public.clientes_federales_documentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('federales-adjuntos', 'federales-adjuntos', false)
ON CONFLICT (id) DO NOTHING;

-- 4. Políticas de storage (idempotente)
DROP POLICY IF EXISTS fed_adj_select ON storage.objects;
CREATE POLICY fed_adj_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'federales-adjuntos');

DROP POLICY IF EXISTS fed_adj_insert ON storage.objects;
CREATE POLICY fed_adj_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'federales-adjuntos');

DROP POLICY IF EXISTS fed_adj_delete ON storage.objects;
CREATE POLICY fed_adj_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'federales-adjuntos');

DROP POLICY IF EXISTS fed_adj_update ON storage.objects;
CREATE POLICY fed_adj_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'federales-adjuntos')
  WITH CHECK (bucket_id = 'federales-adjuntos');

-- 5. Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes_federales_documentos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
