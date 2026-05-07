-- Eventos internos del calendario (no requieren Google Calendar)
-- Permite agendar eventos directamente en el sistema, con sync opcional a Google.

CREATE TABLE IF NOT EXISTS public.eventos_internos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descripcion text,
  ubicacion text,
  fecha_inicio timestamptz NOT NULL,
  fecha_fin timestamptz,
  todo_el_dia boolean NOT NULL DEFAULT false,
  google_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eventos_internos_fecha_inicio ON public.eventos_internos(fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_eventos_internos_user ON public.eventos_internos(user_id);

ALTER TABLE public.eventos_internos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eventos_internos_select" ON public.eventos_internos;
DROP POLICY IF EXISTS "eventos_internos_insert" ON public.eventos_internos;
DROP POLICY IF EXISTS "eventos_internos_update" ON public.eventos_internos;
DROP POLICY IF EXISTS "eventos_internos_delete" ON public.eventos_internos;

-- Cualquier usuario autenticado del estudio puede ver/crear/editar/borrar eventos internos.
CREATE POLICY "eventos_internos_select" ON public.eventos_internos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()));

CREATE POLICY "eventos_internos_insert" ON public.eventos_internos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()));

CREATE POLICY "eventos_internos_update" ON public.eventos_internos
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()));

CREATE POLICY "eventos_internos_delete" ON public.eventos_internos
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()));

CREATE OR REPLACE FUNCTION public.eventos_internos_set_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_eventos_internos_updated ON public.eventos_internos;
CREATE TRIGGER trg_eventos_internos_updated
  BEFORE UPDATE ON public.eventos_internos
  FOR EACH ROW EXECUTE FUNCTION public.eventos_internos_set_updated();
