-- ============================================
-- MIGRACIÓN: Sistema de Agenda y Recordatorios
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Crear tabla de recordatorios
CREATE TABLE IF NOT EXISTS public.recordatorios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descripcion text,
  fecha date NOT NULL,
  hora time NOT NULL,
  color text DEFAULT 'blue',
  completado boolean DEFAULT false,
  caso_id uuid REFERENCES public.casos(id) ON DELETE SET NULL,
  tiene_audio boolean DEFAULT false,
  audio_path text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Habilitar RLS
ALTER TABLE public.recordatorios ENABLE ROW LEVEL SECURITY;

-- 3. Políticas: cada usuario ve solo sus recordatorios
CREATE POLICY "Usuarios ven sus recordatorios"
  ON public.recordatorios FOR SELECT
  TO authenticated
  USING (usuario_id = auth.uid());

CREATE POLICY "Usuarios crean sus recordatorios"
  ON public.recordatorios FOR INSERT
  TO authenticated
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "Usuarios editan sus recordatorios"
  ON public.recordatorios FOR UPDATE
  TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "Usuarios eliminan sus recordatorios"
  ON public.recordatorios FOR DELETE
  TO authenticated
  USING (usuario_id = auth.uid());

-- 4. Crear bucket para notas de voz
INSERT INTO storage.buckets (id, name, public)
VALUES ('notas-voz', 'notas-voz', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Políticas de storage para notas de voz
CREATE POLICY "Usuarios suben notas de voz"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'notas-voz');

CREATE POLICY "Usuarios descargan notas de voz"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'notas-voz');

CREATE POLICY "Usuarios eliminan notas de voz"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'notas-voz');
