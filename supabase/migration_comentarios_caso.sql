-- =====================================================================
-- Migration: comentarios (thread) sobre un caso
-- =====================================================================
-- Diferencia con historial_caso:
--   historial_caso  -> registro formal inmutable de avances + tarea
--   comentarios_caso -> hilo de discusión libre editable por el autor
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.comentarios_caso (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id     uuid NOT NULL REFERENCES public.casos(id) ON DELETE CASCADE,
  contenido   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  editado     boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_comentarios_caso_caso ON public.comentarios_caso (caso_id, created_at DESC);

CREATE OR REPLACE VIEW public.comentarios_caso_completo AS
SELECT
  c.*,
  p.nombre AS autor_nombre,
  p.avatar_url AS autor_avatar
FROM public.comentarios_caso c
LEFT JOIN public.perfiles p ON p.id = c.created_by;

-- Trigger para marcar updated_at y editado=true en update
CREATE OR REPLACE FUNCTION public.comentarios_caso_on_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contenido IS DISTINCT FROM OLD.contenido THEN
    NEW.updated_at := now();
    NEW.editado := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comentarios_caso_upd ON public.comentarios_caso;
CREATE TRIGGER trg_comentarios_caso_upd
  BEFORE UPDATE ON public.comentarios_caso
  FOR EACH ROW EXECUTE FUNCTION public.comentarios_caso_on_update();

-- RLS
ALTER TABLE public.comentarios_caso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comentarios_caso_select ON public.comentarios_caso;
CREATE POLICY comentarios_caso_select ON public.comentarios_caso
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS comentarios_caso_insert ON public.comentarios_caso;
CREATE POLICY comentarios_caso_insert ON public.comentarios_caso
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND COALESCE(p.activo,true) = true)
    AND created_by = auth.uid()
  );

-- Solo el autor puede editar/borrar sus comentarios (o admin/socio)
DROP POLICY IF EXISTS comentarios_caso_update ON public.comentarios_caso;
CREATE POLICY comentarios_caso_update ON public.comentarios_caso
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio'))
  );

DROP POLICY IF EXISTS comentarios_caso_delete ON public.comentarios_caso;
CREATE POLICY comentarios_caso_delete ON public.comentarios_caso
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio'))
  );
