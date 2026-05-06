-- ============================================================================
-- CASOS GENERALES — tabla nueva para reemplazar la vista de casos de trabajo.
-- Mapea directamente desde el CSV de Notion exportado.
-- Seguro de correr varias veces.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.casos_generales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Campos principales
  titulo          text NOT NULL,                         -- NOMBRE
  expediente      text,                                  -- Expediente
  estado          text DEFAULT 'activos',                -- Estado (activos, federales, esperando sentencias, etc.)
  tipo_caso       text,                                  -- tipo de caso (sucesorio, laboral, civil, etc.)
  abogado         text,                                  -- SISTEMA (DR. RODRIGO, DRA. NOELIA, etc.)
  personeria      text,                                  -- PERSONERIA (Apoderado, Patrocinante, etc.)
  radicado        text,                                  -- Juzgado / tribunal
  url_drive       text,                                  -- URL del DRIVE
  actualizacion   text,                                  -- último update de texto

  -- Fechas
  audiencias      date,                                  -- próxima audiencia
  vencimiento     date,                                  -- vencimiento importante

  -- Flags
  prioridad       boolean DEFAULT false,                 -- sí/no
  archivado       boolean DEFAULT false,                 -- Archivar

  -- Estado del expediente en términos de avance
  estadisticas_estado text DEFAULT 'al día',            -- al día / atrasado

  -- Auditoría
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_casos_gen_estado     ON public.casos_generales (estado);
CREATE INDEX IF NOT EXISTS idx_casos_gen_abogado    ON public.casos_generales (abogado);
CREATE INDEX IF NOT EXISTS idx_casos_gen_archivado  ON public.casos_generales (archivado);
CREATE INDEX IF NOT EXISTS idx_casos_gen_tipo       ON public.casos_generales (tipo_caso);
CREATE INDEX IF NOT EXISTS idx_casos_gen_titulo     ON public.casos_generales USING gin(to_tsvector('spanish', titulo));

-- RLS
ALTER TABLE public.casos_generales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "casos_gen_select" ON public.casos_generales;
DROP POLICY IF EXISTS "casos_gen_insert" ON public.casos_generales;
DROP POLICY IF EXISTS "casos_gen_update" ON public.casos_generales;
DROP POLICY IF EXISTS "casos_gen_delete" ON public.casos_generales;

CREATE POLICY "casos_gen_select" ON public.casos_generales FOR SELECT TO authenticated USING (true);
CREATE POLICY "casos_gen_insert" ON public.casos_generales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "casos_gen_update" ON public.casos_generales FOR UPDATE TO authenticated USING (true);
CREATE POLICY "casos_gen_delete" ON public.casos_generales FOR DELETE TO authenticated USING (true);

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION public.set_casos_gen_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_casos_gen_updated_at ON public.casos_generales;
CREATE TRIGGER trg_casos_gen_updated_at
  BEFORE UPDATE ON public.casos_generales
  FOR EACH ROW EXECUTE FUNCTION public.set_casos_gen_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.casos_generales;
