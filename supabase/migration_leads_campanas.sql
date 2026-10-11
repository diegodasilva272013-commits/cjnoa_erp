-- ============================================================================
-- MIGRATION: Leads de campañas (una fila por persona, identificada por teléfono)
--
-- Una sola tabla nueva (leads). Las conversaciones siguen en conversaciones_whatsapp y los
-- turnos en consultas_agendadas; se cruzan por telefono_clave (últimos 10 dígitos del teléfono),
-- columna calculada que se agrega a esas dos tablas. No se copian datos entre tablas.
-- Sin DROP/DELETE/TRUNCATE. Idempotente.
-- ============================================================================

-- 1) Clave de cruce por teléfono ---------------------------------------------
-- Ej: '+54 9 388 486-7965' y '5493884867965' -> '3884867965'. Vacía si el teléfono no sirve.
ALTER TABLE public.conversaciones_whatsapp
  ADD COLUMN IF NOT EXISTS telefono_clave text GENERATED ALWAYS AS (
    CASE WHEN length(regexp_replace(coalesce(telefono, ''), '\D', '', 'g')) >= 8
         THEN right(regexp_replace(telefono, '\D', '', 'g'), 10) ELSE '' END
  ) STORED;

ALTER TABLE public.consultas_agendadas
  ADD COLUMN IF NOT EXISTS telefono_clave text GENERATED ALWAYS AS (
    CASE WHEN length(regexp_replace(coalesce(telefono, ''), '\D', '', 'g')) >= 8
         THEN right(regexp_replace(telefono, '\D', '', 'g'), 10) ELSE '' END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_conv_wa_tel_clave ON public.conversaciones_whatsapp (telefono_clave);
CREATE INDEX IF NOT EXISTS idx_consultas_agendadas_tel_clave ON public.consultas_agendadas (telefono_clave);

-- 2) Leads ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  telefono text NOT NULL,
  telefono_clave text GENERATED ALWAYS AS (
    CASE WHEN length(regexp_replace(coalesce(telefono, ''), '\D', '', 'g')) >= 8
         THEN right(regexp_replace(telefono, '\D', '', 'g'), 10) ELSE '' END
  ) STORED,

  -- Identidad
  nombre text,
  apellido text,
  email text,
  dni_cuil text,
  localidad text,

  -- Origen (la campaña la deduce el agente del primer mensaje del anuncio)
  campana text,
  mensaje_inicial text,
  canal text NOT NULL DEFAULT 'whatsapp',

  -- Calificación (lo que pregunta el agente). Lo específico de cada rama va en datos (jsonb)
  rama text,
  tipo_tramite text,
  calificacion text,            -- alto_valor | estandar | fuera_avatar
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Resultado
  resumen text,
  requiere_turno boolean,
  motivo_descarte text,

  -- Gestión
  etapa text NOT NULL DEFAULT 'nuevo',
  asignado_a uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  proxima_accion_at timestamptz,
  notas text,

  primer_contacto_at timestamptz NOT NULL DEFAULT now(),
  ultimo_contacto_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un lead por teléfono (los teléfonos inservibles no se deduplican)
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_telefono_clave ON public.leads (telefono_clave) WHERE telefono_clave <> '';
CREATE INDEX IF NOT EXISTS idx_leads_etapa ON public.leads (etapa);
CREATE INDEX IF NOT EXISTS idx_leads_campana ON public.leads (campana);
CREATE INDEX IF NOT EXISTS idx_leads_ultimo_contacto ON public.leads (ultimo_contacto_at DESC);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Lectura y gestión: cualquier usuario del ERP (igual que Consultas WhatsApp). Borrar: solo admin.
-- Los leads nuevos los crea el servidor (service role), que no pasa por RLS.
DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_select') THEN
    EXECUTE $q$CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()))$q$;
  END IF;
END $pol$;

DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_insert') THEN
    EXECUTE $q$CREATE POLICY leads_insert ON public.leads FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()))$q$;
  END IF;
END $pol$;

DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_update') THEN
    EXECUTE $q$CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()))$q$;
  END IF;
END $pol$;

DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_delete') THEN
    EXECUTE $q$CREATE POLICY leads_delete ON public.leads FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'admin'))$q$;
  END IF;
END $pol$;

CREATE OR REPLACE FUNCTION public.leads_set_updated() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $trg$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_updated' AND tgrelid = 'public.leads'::regclass) THEN
    CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
      FOR EACH ROW EXECUTE FUNCTION public.leads_set_updated();
  END IF;
END $trg$;

-- 3) Realtime ------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='leads') THEN
    EXECUTE 'alter publication supabase_realtime add table public.leads';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
