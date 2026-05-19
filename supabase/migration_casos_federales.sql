-- ============================================================================
-- MODULO CASOS FEDERALES (independiente del modulo Provincial/Previsional)
-- Spec: REQUERIMIENTO TECNICO: APARTADO "CASOS FEDERALES" (2026)
--   - Listado exclusivo, separado de Casos Provinciales
--   - Replica datos personales de la ficha previsional, SIN hijos / moratorias
--     / aportes / fecha de jubilacion
--   - Agrega: numero de expediente + tipo(s) de caso
--   - Pipeline independiente:
--       activo, esperando_audiencia, esperando_sentencia,
--       analisis_sin_directivas, sin_pago, seguimiento
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLA: clientes_federales
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes_federales (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Datos personales (replica previsional, sin hijos/jubilacion)
  apellido_nombre text NOT NULL,
  cuil text,
  clave_social text,
  clave_fiscal text,
  fecha_nacimiento date,
  sexo text CHECK (sexo IN ('HOMBRE','MUJER') OR sexo IS NULL),
  direccion text,
  telefono text,

  -- Especificos del modulo federal
  numero_expediente text,
  tipo_caso text[] NOT NULL DEFAULT '{}',
    -- valores admitidos: 'reajuste_movilidad', 'reajuste_base_inicial',
    --                    'articulo_9', 'impuesto_ganancias', 'otros'
  tipo_caso_otros text,

  -- Informe / seguimiento
  resumen_informe text,
  conclusion text,
  fecha_ultimo_contacto date,
  situacion_actual text,
  captado_por text,

  -- Pipeline independiente
  pipeline text NOT NULL DEFAULT 'activo'
    CHECK (pipeline IN (
      'activo','esperando_audiencia','esperando_sentencia',
      'analisis_sin_directivas','sin_pago','seguimiento'
    )),
  pipeline_fecha_ingreso timestamptz DEFAULT now(),

  -- Cobro (mantenemos por simetria con previsional)
  cobro_total numeric(12,2) DEFAULT 0,
  monto_cobrado numeric(12,2) DEFAULT 0,

  -- Drive / vinculacion
  url_drive text,
  caso_id uuid,
  cliente_id uuid,

  -- Permisos granulares
  visible_para uuid[] DEFAULT '{}',

  -- Auditoria
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS ix_clientes_federales_pipeline ON public.clientes_federales (pipeline);
CREATE INDEX IF NOT EXISTS ix_clientes_federales_apellido ON public.clientes_federales (apellido_nombre);
CREATE INDEX IF NOT EXISTS ix_clientes_federales_cuil ON public.clientes_federales (cuil);
CREATE INDEX IF NOT EXISTS ix_clientes_federales_expediente ON public.clientes_federales (numero_expediente);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.clientes_federales_set_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clientes_federales_updated ON public.clientes_federales;
CREATE TRIGGER trg_clientes_federales_updated
  BEFORE UPDATE ON public.clientes_federales
  FOR EACH ROW EXECUTE FUNCTION public.clientes_federales_set_updated();

ALTER TABLE public.clientes_federales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_federales_select" ON public.clientes_federales;
DROP POLICY IF EXISTS "clientes_federales_insert" ON public.clientes_federales;
DROP POLICY IF EXISTS "clientes_federales_update" ON public.clientes_federales;
DROP POLICY IF EXISTS "clientes_federales_delete" ON public.clientes_federales;

CREATE POLICY "clientes_federales_select" ON public.clientes_federales
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clientes_federales_insert" ON public.clientes_federales
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clientes_federales_update" ON public.clientes_federales
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "clientes_federales_delete" ON public.clientes_federales
  FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- TABLA: clientes_federales_notas (seguimiento)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clientes_federales_notas (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_fed_id uuid NOT NULL REFERENCES public.clientes_federales(id) ON DELETE CASCADE,
  contenido text NOT NULL,
  tarea_federal_id uuid,
  audio_path text,
  editado boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_clientes_federales_notas_cliente
  ON public.clientes_federales_notas (cliente_fed_id, created_at DESC);

ALTER TABLE public.clientes_federales_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_federales_notas_select" ON public.clientes_federales_notas;
DROP POLICY IF EXISTS "clientes_federales_notas_insert" ON public.clientes_federales_notas;
DROP POLICY IF EXISTS "clientes_federales_notas_update" ON public.clientes_federales_notas;
DROP POLICY IF EXISTS "clientes_federales_notas_delete" ON public.clientes_federales_notas;

CREATE POLICY "clientes_federales_notas_select" ON public.clientes_federales_notas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clientes_federales_notas_insert" ON public.clientes_federales_notas
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clientes_federales_notas_update" ON public.clientes_federales_notas
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "clientes_federales_notas_delete" ON public.clientes_federales_notas
  FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- TABLA: tareas_federales
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tareas_federales (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_fed_id uuid REFERENCES public.clientes_federales(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descripcion text,
  avance text,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','en_curso','completada')),
  prioridad text NOT NULL DEFAULT 'sin_prioridad'
    CHECK (prioridad IN ('alta','media','sin_prioridad')),
  fecha_limite date,
  responsable_id uuid,
  responsable_nombre text,
  derivada_a uuid,
  observaciones_demora text,
  archivos jsonb DEFAULT '[]'::jsonb,
  visible_para uuid[] DEFAULT '{}',
  fecha_completada timestamptz,
  completada_por uuid,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tareas_federales_cliente ON public.tareas_federales (cliente_fed_id);
CREATE INDEX IF NOT EXISTS ix_tareas_federales_estado ON public.tareas_federales (estado);

CREATE OR REPLACE FUNCTION public.tareas_federales_set_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_tareas_federales_updated ON public.tareas_federales;
CREATE TRIGGER trg_tareas_federales_updated
  BEFORE UPDATE ON public.tareas_federales
  FOR EACH ROW EXECUTE FUNCTION public.tareas_federales_set_updated();

ALTER TABLE public.tareas_federales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tareas_federales_select" ON public.tareas_federales;
DROP POLICY IF EXISTS "tareas_federales_insert" ON public.tareas_federales;
DROP POLICY IF EXISTS "tareas_federales_update" ON public.tareas_federales;
DROP POLICY IF EXISTS "tareas_federales_delete" ON public.tareas_federales;

CREATE POLICY "tareas_federales_select" ON public.tareas_federales
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tareas_federales_insert" ON public.tareas_federales
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tareas_federales_update" ON public.tareas_federales
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "tareas_federales_delete" ON public.tareas_federales
  FOR DELETE TO authenticated USING (true);

-- FK diferida de notas -> tareas (despues de crear tareas_federales)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clientes_federales_notas_tarea_fk'
  ) THEN
    ALTER TABLE public.clientes_federales_notas
      ADD CONSTRAINT clientes_federales_notas_tarea_fk
      FOREIGN KEY (tarea_federal_id) REFERENCES public.tareas_federales(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Realtime
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND tablename='clientes_federales';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes_federales';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND tablename='clientes_federales_notas';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.clientes_federales_notas';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND tablename='tareas_federales';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tareas_federales';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
