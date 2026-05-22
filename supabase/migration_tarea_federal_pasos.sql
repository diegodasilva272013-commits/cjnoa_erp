-- ============================================================
-- MIGRATION: Pasos compartidos para tareas_federales
-- Espejo de migration_tareas_pasos_compartidas.sql pero
-- apuntando a tareas_federales (federales).
-- Idempotente.
-- ============================================================

-- 1) Tabla -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tarea_federal_pasos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_federal_id uuid NOT NULL REFERENCES public.tareas_federales(id) ON DELETE CASCADE,
  orden           int  NOT NULL DEFAULT 1,
  descripcion     text NOT NULL,
  responsable_id  uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  completado      boolean NOT NULL DEFAULT false,
  completado_at   timestamptz,
  completado_por  uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarea_federal_pasos_tarea
  ON public.tarea_federal_pasos (tarea_federal_id);
CREATE INDEX IF NOT EXISTS idx_tarea_federal_pasos_responsable
  ON public.tarea_federal_pasos (responsable_id);
CREATE INDEX IF NOT EXISTS idx_tarea_federal_pasos_orden
  ON public.tarea_federal_pasos (tarea_federal_id, orden);

-- 2) Triggers: updated_at + sync estado de tarea ---------------
CREATE OR REPLACE FUNCTION public.tarea_federal_pasos_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tarea_federal_pasos_touch ON public.tarea_federal_pasos;
CREATE TRIGGER trg_tarea_federal_pasos_touch
  BEFORE UPDATE ON public.tarea_federal_pasos
  FOR EACH ROW EXECUTE FUNCTION public.tarea_federal_pasos_touch();

CREATE OR REPLACE FUNCTION public.tarea_federal_pasos_sync_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tarea uuid;
  v_total int;
  v_done  int;
BEGIN
  v_tarea := COALESCE(NEW.tarea_federal_id, OLD.tarea_federal_id);
  IF v_tarea IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE completado)
    INTO v_total, v_done
    FROM public.tarea_federal_pasos
   WHERE tarea_federal_id = v_tarea;

  IF v_total > 0 AND v_done = v_total THEN
    UPDATE public.tareas_federales
       SET estado = 'completada',
           fecha_completada = COALESCE(fecha_completada, now())
     WHERE id = v_tarea AND estado <> 'completada';
  ELSE
    UPDATE public.tareas_federales
       SET estado = 'pendiente',
           fecha_completada = NULL
     WHERE id = v_tarea AND estado = 'completada';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_tarea_federal_pasos_sync_estado ON public.tarea_federal_pasos;
CREATE TRIGGER trg_tarea_federal_pasos_sync_estado
  AFTER INSERT OR UPDATE OR DELETE ON public.tarea_federal_pasos
  FOR EACH ROW EXECUTE FUNCTION public.tarea_federal_pasos_sync_estado();

-- 3) Vista con joins a perfiles --------------------------------
CREATE OR REPLACE VIEW public.tarea_federal_pasos_completos AS
SELECT
  tfp.*,
  p_resp.nombre     AS responsable_nombre,
  p_resp.avatar_url AS responsable_avatar,
  p_done.nombre     AS completado_por_nombre
FROM public.tarea_federal_pasos tfp
LEFT JOIN public.perfiles p_resp ON p_resp.id = tfp.responsable_id
LEFT JOIN public.perfiles p_done ON p_done.id = tfp.completado_por;

GRANT SELECT ON public.tarea_federal_pasos_completos TO authenticated;

-- 4) RLS -------------------------------------------------------
ALTER TABLE public.tarea_federal_pasos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tarea_federal_pasos_select" ON public.tarea_federal_pasos;
CREATE POLICY "tarea_federal_pasos_select" ON public.tarea_federal_pasos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "tarea_federal_pasos_insert" ON public.tarea_federal_pasos;
CREATE POLICY "tarea_federal_pasos_insert" ON public.tarea_federal_pasos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tarea_federal_pasos_update" ON public.tarea_federal_pasos;
CREATE POLICY "tarea_federal_pasos_update" ON public.tarea_federal_pasos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tarea_federal_pasos_delete" ON public.tarea_federal_pasos;
CREATE POLICY "tarea_federal_pasos_delete" ON public.tarea_federal_pasos
  FOR DELETE TO authenticated USING (true);

-- 5) RPC para completar/reabrir un paso (mismo patrón que provincial)
DROP FUNCTION IF EXISTS public.tarea_federal_paso_set_completado(uuid, boolean);
CREATE OR REPLACE FUNCTION public.tarea_federal_paso_set_completado(
  p_paso_id uuid,
  p_hecho   boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no auth';
  END IF;

  UPDATE public.tarea_federal_pasos
     SET completado     = p_hecho,
         completado_at  = CASE WHEN p_hecho THEN now() ELSE NULL END,
         completado_por = CASE WHEN p_hecho THEN v_uid ELSE NULL END,
         updated_at     = now()
   WHERE id = p_paso_id;
END $$;

ALTER FUNCTION public.tarea_federal_paso_set_completado(uuid, boolean) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.tarea_federal_paso_set_completado(uuid, boolean) TO authenticated;

-- 6) Realtime --------------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tarea_federal_pasos;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
