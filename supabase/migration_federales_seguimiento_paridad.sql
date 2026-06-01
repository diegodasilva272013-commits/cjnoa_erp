-- ============================================================================
-- MIGRACION: paridad del seguimiento de Casos Federales con Casos Provinciales
-- ----------------------------------------------------------------------------
-- Objetivo: que el componente NotasFeedPanel (provincial) tambien funcione
-- para Casos Federales, sin tener que mantener dos UIs separadas.
--
-- Cambios:
--   1. tareas_federales gana las columnas que necesita el panel rico:
--      visto_por_asignado, visto_at, cargo_hora, cargo_hora_favor,
--      cargo_hora_favor_fecha, culminacion, adjunto_path, adjunto_nombre,
--      updated_by.
--   2. Estado de tareas_federales acepta el flujo de 5 estados (compat).
--   3. Vista clientes_federales_notas_completo con la MISMA forma que
--      caso_general_notas_completo (mismas columnas), para que un solo hook /
--      componente pueda renderizar ambos casos.
--   4. Tabla tarea_federal_pasos (idempotente, por si no estaba creada en
--      este entorno).
--
-- Es 100% idempotente.
-- ============================================================================

-- 1) Columnas faltantes en tareas_federales --------------------------------
ALTER TABLE public.tareas_federales
  ADD COLUMN IF NOT EXISTS visto_por_asignado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS visto_at           timestamptz,
  ADD COLUMN IF NOT EXISTS cargo_hora         text,
  ADD COLUMN IF NOT EXISTS cargo_hora_favor   text,
  ADD COLUMN IF NOT EXISTS cargo_hora_favor_fecha date,
  ADD COLUMN IF NOT EXISTS culminacion        text,
  ADD COLUMN IF NOT EXISTS adjunto_path       text,
  ADD COLUMN IF NOT EXISTS adjunto_nombre     text,
  ADD COLUMN IF NOT EXISTS updated_by         uuid;

-- 2) Ampliar el CHECK de estado (admite ambos flujos) ----------------------
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.tareas_federales'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%estado%IN%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tareas_federales DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.tareas_federales
  ADD CONSTRAINT tareas_federales_estado_check
  CHECK (estado IN (
    'activa','aceptada','pendiente','en_proceso','finalizada',
    'en_curso','completada'
  ));

-- 3) Tabla tarea_federal_pasos (idempotente) -------------------------------
CREATE TABLE IF NOT EXISTS public.tarea_federal_pasos (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tarea_federal_id uuid NOT NULL REFERENCES public.tareas_federales(id) ON DELETE CASCADE,
  orden int NOT NULL DEFAULT 1,
  descripcion text NOT NULL,
  responsable_id uuid,
  completado boolean DEFAULT false,
  completado_at timestamptz,
  completado_por uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tarea_federal_pasos_tarea
  ON public.tarea_federal_pasos (tarea_federal_id, orden);

ALTER TABLE public.tarea_federal_pasos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tarea_federal_pasos_select" ON public.tarea_federal_pasos;
DROP POLICY IF EXISTS "tarea_federal_pasos_insert" ON public.tarea_federal_pasos;
DROP POLICY IF EXISTS "tarea_federal_pasos_update" ON public.tarea_federal_pasos;
DROP POLICY IF EXISTS "tarea_federal_pasos_delete" ON public.tarea_federal_pasos;
CREATE POLICY "tarea_federal_pasos_select" ON public.tarea_federal_pasos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tarea_federal_pasos_insert" ON public.tarea_federal_pasos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tarea_federal_pasos_update" ON public.tarea_federal_pasos
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "tarea_federal_pasos_delete" ON public.tarea_federal_pasos
  FOR DELETE TO authenticated USING (true);

-- 4) Vista clientes_federales_notas_completo ------------------------------
-- Misma forma exacta que caso_general_notas_completo, pero alimentada por las
-- tablas federales. La columna se llama "caso_id" (alias de cliente_fed_id)
-- para que un solo tipo de TS sirva para ambos casos.
DROP VIEW IF EXISTS public.clientes_federales_notas_completo CASCADE;

CREATE OR REPLACE VIEW public.clientes_federales_notas_completo AS
SELECT
  n.id,
  n.cliente_fed_id  AS caso_id,
  n.contenido,
  n.tarea_federal_id AS tarea_id,
  n.audio_path,
  n.created_by,
  n.created_at,
  n.updated_at,
  n.editado,
  pa.nombre         AS autor_nombre,
  pa.avatar_url     AS autor_avatar,
  -- datos de la tarea asociada (si hay)
  t.titulo                 AS tarea_titulo,
  t.estado                 AS tarea_estado,
  t.fecha_limite           AS tarea_fecha_limite,
  t.responsable_id         AS tarea_responsable_id,
  t.visto_por_asignado     AS tarea_visto,
  t.visto_at               AS tarea_visto_at,
  t.prioridad              AS tarea_prioridad,
  t.descripcion            AS tarea_descripcion,
  t.culminacion            AS tarea_culminacion,
  t.cargo_hora             AS tarea_cargo_hora,
  t.cargo_hora_favor       AS tarea_cargo_hora_favor,
  t.cargo_hora_favor_fecha AS tarea_cargo_hora_favor_fecha,
  t.adjunto_path           AS tarea_adjunto_path,
  t.adjunto_nombre         AS tarea_adjunto_nombre,
  pr.nombre                AS tarea_responsable_nombre,
  pr.avatar_url            AS tarea_responsable_avatar
FROM public.clientes_federales_notas n
LEFT JOIN public.perfiles        pa ON pa.id = n.created_by
LEFT JOIN public.tareas_federales t  ON t.id  = n.tarea_federal_id
LEFT JOIN public.perfiles        pr ON pr.id = t.responsable_id;

-- 5) Realtime --------------------------------------------------------------
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND tablename='tareas_federales';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tareas_federales';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND tablename='tarea_federal_pasos';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tarea_federal_pasos';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─── FIN ───────────────────────────────────────────────────────────────────
