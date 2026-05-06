-- ============================================================================
-- Migration: Documentos / archivos para casos_generales
-- Permite cargar fotos, PDFs, audios y cualquier tipo de archivo por caso
-- y verlos dentro de la app (signed URLs)
-- ============================================================================

-- 1. Tabla
CREATE TABLE IF NOT EXISTS public.casos_generales_documentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id         uuid NOT NULL REFERENCES public.casos_generales(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  mime            text NOT NULL DEFAULT 'application/octet-stream',
  tamano          bigint NOT NULL DEFAULT 0,
  storage_path    text NOT NULL,
  subido_por      uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cg_docs_caso
  ON public.casos_generales_documentos (caso_id, created_at DESC);

-- 2. RLS
ALTER TABLE public.casos_generales_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cg_docs_all ON public.casos_generales_documentos;
CREATE POLICY cg_docs_all ON public.casos_generales_documentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Bucket de storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('casos-generales-adjuntos', 'casos-generales-adjuntos', false)
ON CONFLICT (id) DO NOTHING;

-- 4. Politicas de storage (idempotente)
DROP POLICY IF EXISTS cg_adj_select ON storage.objects;
CREATE POLICY cg_adj_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'casos-generales-adjuntos');

DROP POLICY IF EXISTS cg_adj_insert ON storage.objects;
CREATE POLICY cg_adj_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'casos-generales-adjuntos');

DROP POLICY IF EXISTS cg_adj_delete ON storage.objects;
CREATE POLICY cg_adj_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'casos-generales-adjuntos');

DROP POLICY IF EXISTS cg_adj_update ON storage.objects;
CREATE POLICY cg_adj_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'casos-generales-adjuntos')
  WITH CHECK (bucket_id = 'casos-generales-adjuntos');

-- 5. Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.casos_generales_documentos;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
