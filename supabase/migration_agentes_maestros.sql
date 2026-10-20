-- ============================================================================
-- AGENTES MAESTROS (analista, redactor, tester, auditor) + prompts en la base
--
-- SIN NADA DESTRUCTIVO: este archivo no tiene DROP, DELETE, TRUNCATE ni ALTER sobre tablas existentes.
-- Solo CREA objetos nuevos (cada uno solo si todavía no existe) e inserta 5 filas iniciales.
-- Se puede correr más de una vez: lo que ya existe se deja como está.
--
-- Qué crea:
--   agentes_estado          qué está haciendo cada agente ahora (lo ve la pantalla en vivo)
--   agentes_registro        bitácora de TODO lo que hacen los agentes (no se puede editar ni borrar)
--   agentes_ejecuciones     cada corrida de un agente (cuándo, quién la pidió, cómo terminó)
--   agentes_analisis        resultados del Analista (métricas, errores, propuestas)
--   agentes_config          pausa general, cada cuántas conversaciones analizar, tope diario
--   agente_prompt_versiones el prompt del agente de WhatsApp, con versiones y backup
--                           (nunca se borran; solo los administradores pueden leerlo)
-- ============================================================================

-- 1) Estado en vivo ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agentes_estado (
  agente         text PRIMARY KEY,
  nombre         text NOT NULL,
  rol            text NOT NULL,
  estado         text NOT NULL DEFAULT 'inactivo' CHECK (estado IN ('inactivo','trabajando','pausado','error')),
  tarea          text,
  progreso       integer NOT NULL DEFAULT 0 CHECK (progreso BETWEEN 0 AND 100),
  run_id         uuid,
  actualizado_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Registro de todo lo que hacen (bitácora) --------------------------------
CREATE TABLE IF NOT EXISTS public.agentes_registro (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  agente  text NOT NULL,
  run_id  uuid,
  nivel   text NOT NULL DEFAULT 'info' CHECK (nivel IN ('info','aviso','error')),
  accion  text NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_agentes_registro_at ON public.agentes_registro (at DESC);
CREATE INDEX IF NOT EXISTS idx_agentes_registro_agente ON public.agentes_registro (agente, at DESC);

-- 3) Corridas ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agentes_ejecuciones (
  run_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente     text NOT NULL,
  disparador text NOT NULL CHECK (disparador IN ('manual','automatico','cron')),
  pedido_por text,
  estado     text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso','ok','omitida','error')),
  inicio     timestamptz NOT NULL DEFAULT now(),
  fin        timestamptz,
  resumen    jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_agentes_ejecuciones_inicio ON public.agentes_ejecuciones (inicio DESC);

-- 4) Análisis del Analista ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agentes_analisis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_at      timestamptz NOT NULL DEFAULT now(),
  run_id         uuid,
  conversaciones integer NOT NULL DEFAULT 0,
  desde          timestamptz,
  hasta          timestamptz,
  metricas       jsonb NOT NULL DEFAULT '{}'::jsonb,
  hallazgos      jsonb NOT NULL DEFAULT '{}'::jsonb,
  propuestas     jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_agentes_analisis_creado ON public.agentes_analisis (creado_at DESC);

-- 5) Configuración (una sola fila) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.agentes_config (
  id                        integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pausado                   boolean NOT NULL DEFAULT false,
  analizar_cada             integer NOT NULL DEFAULT 10 CHECK (analizar_cada >= 1),
  max_ejecuciones_dia       integer NOT NULL DEFAULT 6 CHECK (max_ejecuciones_dia >= 1),
  ultimo_analisis_at        timestamptz,
  conversaciones_analizadas integer NOT NULL DEFAULT 0,
  actualizado_at            timestamptz NOT NULL DEFAULT now()
);

-- 6) Prompt del agente de WhatsApp, con versiones y backup --------------------
CREATE TABLE IF NOT EXISTS public.agente_prompt_versiones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version      bigint GENERATED ALWAYS AS IDENTITY,
  contenido    text NOT NULL,
  hash         text,
  estado       text NOT NULL DEFAULT 'propuesta' CHECK (estado IN ('activa','propuesta','archivada','rechazada')),
  origen       text NOT NULL DEFAULT 'manual' CHECK (origen IN ('importada','manual','propuesta_agente','restauracion')),
  motivo       text,
  creado_por   text,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  aplicada_at  timestamptz,
  aplicada_por text
);
-- Como mucho UNA versión activa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agente_prompt_una_activa ON public.agente_prompt_versiones ((true)) WHERE estado = 'activa';

-- 7) Filas iniciales (si ya existen, no se tocan) ------------------------------
INSERT INTO public.agentes_estado (agente, nombre, rol, tarea) VALUES
  ('analista', 'Analista', 'Lee las conversaciones, mide el embudo y detecta errores', 'Esperando conversaciones nuevas'),
  ('redactor', 'Redactor', 'Propone mejoras al prompt a partir de los hallazgos', 'En espera (próxima etapa)'),
  ('tester',   'Tester',   'Prueba cada cambio contra conversaciones reales antes de aplicarlo', 'En espera (próxima etapa)'),
  ('auditor',  'Auditor',  'Verifica que todo siga alineado al objetivo y sin fallas', 'En espera (próxima etapa)')
ON CONFLICT (agente) DO NOTHING;
INSERT INTO public.agentes_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 8) Protecciones: el registro y las versiones del prompt no se editan ni se borran -----
--    (Estas funciones solo se aplican a las tablas nuevas de arriba.)
CREATE OR REPLACE FUNCTION public.agentes_registro_inmutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El registro de los agentes no se puede modificar ni borrar';
END $$;

CREATE OR REPLACE FUNCTION public.agente_prompt_proteger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las versiones del prompt no se borran (son el backup)';
  END IF;
  IF NEW.contenido IS DISTINCT FROM OLD.contenido THEN
    RAISE EXCEPTION 'El contenido de una versión no se edita: se crea una versión nueva';
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agentes_registro_inmutable' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_agentes_registro_inmutable
      BEFORE UPDATE OR DELETE ON public.agentes_registro
      FOR EACH ROW EXECUTE FUNCTION public.agentes_registro_inmutable();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agente_prompt_proteger' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_agente_prompt_proteger
      BEFORE UPDATE OR DELETE ON public.agente_prompt_versiones
      FOR EACH ROW EXECUTE FUNCTION public.agente_prompt_proteger();
  END IF;
END $$;

-- 9) Activar una versión (o volver a una anterior) en un solo paso -------------
--    La que estaba activa pasa a 'archivada' (queda guardada para volver atrás).
CREATE OR REPLACE FUNCTION public.agente_prompt_activar(p_id uuid, p_por text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agente_prompt_versiones WHERE id = p_id) THEN
    RAISE EXCEPTION 'La versión % no existe', p_id;
  END IF;
  UPDATE public.agente_prompt_versiones SET estado = 'archivada' WHERE estado = 'activa' AND id <> p_id;
  UPDATE public.agente_prompt_versiones
     SET estado = 'activa', aplicada_at = now(), aplicada_por = p_por
   WHERE id = p_id
   RETURNING version INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.agente_prompt_activar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agente_prompt_activar(uuid, text) TO service_role;

-- 10) Quién puede ver qué (RLS). Escribir lo hace solo el servidor. ---------------
ALTER TABLE public.agentes_estado          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentes_registro        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentes_ejecuciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentes_analisis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentes_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agente_prompt_versiones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Admin y socio pueden LEER el estado, el registro, las corridas, los análisis y la configuración.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agentes_estado' AND policyname = 'agentes_estado_leer') THEN
    CREATE POLICY agentes_estado_leer ON public.agentes_estado FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agentes_registro' AND policyname = 'agentes_registro_leer') THEN
    CREATE POLICY agentes_registro_leer ON public.agentes_registro FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agentes_ejecuciones' AND policyname = 'agentes_ejecuciones_leer') THEN
    CREATE POLICY agentes_ejecuciones_leer ON public.agentes_ejecuciones FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agentes_analisis' AND policyname = 'agentes_analisis_leer') THEN
    CREATE POLICY agentes_analisis_leer ON public.agentes_analisis FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agentes_config' AND policyname = 'agentes_config_leer') THEN
    CREATE POLICY agentes_config_leer ON public.agentes_config FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio')));
  END IF;
  -- El prompt es lo más sensible: SOLO administradores.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agente_prompt_versiones' AND policyname = 'agente_prompt_leer') THEN
    CREATE POLICY agente_prompt_leer ON public.agente_prompt_versiones FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'admin'));
  END IF;
END $$;

-- 11) Tiempo real para la pantalla en vivo ----------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.agentes_estado;   EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.agentes_registro; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Para verificar que quedó bien (opcional, solo lectura):
--   SELECT agente, estado, tarea FROM public.agentes_estado;      -- 4 filas
--   SELECT * FROM public.agentes_config;                          -- 1 fila
--   SELECT count(*) FROM public.agente_prompt_versiones;          -- 0 hasta importar el prompt
-- ============================================================================
