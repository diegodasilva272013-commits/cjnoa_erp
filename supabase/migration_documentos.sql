-- ============================================
-- MIGRACIÓN: Sistema de Documentos por Caso
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Crear tabla de documentos
CREATE TABLE IF NOT EXISTS public.documentos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  caso_id uuid NOT NULL REFERENCES public.casos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  nombre_archivo text NOT NULL,
  tipo text NOT NULL,
  tamano bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  subido_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- 2. Habilitar RLS
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de acceso
CREATE POLICY "Documentos visibles por autenticados"
  ON public.documentos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Documentos insertables por autenticados"
  ON public.documentos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Documentos eliminables por autenticados"
  ON public.documentos FOR DELETE
  TO authenticated
  USING (true);

-- 4. Crear bucket de storage (ejecutar en SQL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Políticas de storage
CREATE POLICY "Usuarios autenticados pueden subir documentos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documentos');

CREATE POLICY "Usuarios autenticados pueden ver documentos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documentos');

CREATE POLICY "Usuarios autenticados pueden eliminar documentos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'documentos');
