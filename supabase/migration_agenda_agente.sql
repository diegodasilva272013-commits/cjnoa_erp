-- ============================================================================
-- MIGRATION: El agente agenda en el calendario del ERP
--
-- Reutiliza consultas_agendadas (donde ya vive todo el agendamiento y lo que
-- lee el Calendario). Solo agrega:
--   1) disponibilidad_horarios : tiempos libres que cargan Alejandro / Fabricio
--   2) conversaciones_whatsapp : transcripción + audio de la conversación
--   3) consultas_agendadas.conversation_id / origen  (vínculo, sin copiar datos)
-- Sin DROP/DELETE/TRUNCATE: solo crea lo que falta (IF NOT EXISTS). Se puede correr más de una vez.
-- ============================================================================

-- 1) Disponibilidad ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disponibilidad_horarios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profesional text NOT NULL CHECK (profesional IN ('Alejandro','Fabricio')),
  perfil_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  -- Recurrente (dia_semana 1=lunes..7=domingo, ISO) o fecha puntual: uno de los dos.
  dia_semana smallint CHECK (dia_semana BETWEEN 1 AND 7),
  fecha date,
  hora_desde time NOT NULL,
  hora_hasta time NOT NULL,
  duracion_min smallint NOT NULL DEFAULT 30 CHECK (duracion_min BETWEEN 10 AND 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((dia_semana IS NOT NULL) <> (fecha IS NOT NULL)),
  CHECK (hora_hasta > hora_desde)
);

CREATE INDEX IF NOT EXISTS idx_disponibilidad_prof ON public.disponibilidad_horarios (profesional, dia_semana, fecha);

ALTER TABLE public.disponibilidad_horarios ENABLE ROW LEVEL SECURITY;


-- Leer: cualquier perfil (el calendario lo muestra). Escribir: SOLO el dueño,
-- y solo si su perfil es Alejandro o Fabricio (el nombre del perfil contiene
-- el nombre del profesional, igual que resolveOperationalSocio en el front).
DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='disponibilidad_horarios' AND policyname='disp_select') THEN
    EXECUTE $q$CREATE POLICY disp_select ON public.disponibilidad_horarios
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()))$q$;
  END IF;
END $pol$;

DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='disponibilidad_horarios' AND policyname='disp_insert') THEN
    EXECUTE $q$CREATE POLICY disp_insert ON public.disponibilidad_horarios
  FOR INSERT TO authenticated
  WITH CHECK (
    perfil_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.perfiles p
                WHERE p.id = auth.uid() AND p.nombre ILIKE '%' || profesional || '%')
  )$q$;
  END IF;
END $pol$;

DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='disponibilidad_horarios' AND policyname='disp_update') THEN
    EXECUTE $q$CREATE POLICY disp_update ON public.disponibilidad_horarios
  FOR UPDATE TO authenticated
  USING (perfil_id = auth.uid())
  WITH CHECK (
    perfil_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.perfiles p
                WHERE p.id = auth.uid() AND p.nombre ILIKE '%' || profesional || '%')
  )$q$;
  END IF;
END $pol$;

DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='disponibilidad_horarios' AND policyname='disp_delete') THEN
    EXECUTE $q$CREATE POLICY disp_delete ON public.disponibilidad_horarios
  FOR DELETE TO authenticated
  USING (perfil_id = auth.uid())$q$;
  END IF;
END $pol$;

-- 2) Conversaciones (una fila por conversation_id) -------------
CREATE TABLE IF NOT EXISTS public.conversaciones_whatsapp (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id text NOT NULL UNIQUE,
  telefono text,
  nombre text,
  resumen text,
  mensajes jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{from:'cliente'|'agente', texto, t}]
  audio_path text,                               -- path en bucket conversaciones-audio
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_wa_updated ON public.conversaciones_whatsapp (updated_at DESC);

ALTER TABLE public.conversaciones_whatsapp ENABLE ROW LEVEL SECURITY;

-- Solo lectura para usuarios del ERP. Escribe únicamente el webhook (service role).
DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='conversaciones_whatsapp' AND policyname='conv_wa_select') THEN
    EXECUTE $q$CREATE POLICY conv_wa_select ON public.conversaciones_whatsapp
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()))$q$;
  END IF;
END $pol$;

-- 3) Vínculo con el agendamiento existente ------------------------------------
ALTER TABLE public.consultas_agendadas
  ADD COLUMN IF NOT EXISTS conversation_id text,
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_consultas_agendadas_conv ON public.consultas_agendadas (conversation_id);

-- Evita doble reserva simultánea del agente sobre el mismo profesional/hora.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultas_agente_slot
  ON public.consultas_agendadas (abogado_asignado, fecha_consulta, hora_consulta)
  WHERE origen = 'agente';

-- 4) Audio (bucket privado; se escucha con URL firmada) ----------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('conversaciones-audio', 'conversaciones-audio', false)
ON CONFLICT (id) DO NOTHING;

DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='conv_audio_select') THEN
    EXECUTE $q$CREATE POLICY conv_audio_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'conversaciones-audio'
         AND EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid()))$q$;
  END IF;
END $pol$;

-- 5) Realtime ------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversaciones_whatsapp','disponibilidad_horarios'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('alter publication supabase_realtime add table public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
