-- ============================================================================
-- Migration: Escrito subido + recordatorio cada 7 dias
-- - Columnas en casos_generales para marcar si el escrito fue presentado/subido
-- - Campo URL opcional para acceder al escrito (Drive, etc.)
-- - Tipo de notificacion 'verificar_escrito' (alarma cada 7 dias)
-- - Funcion revisar_recordatorios_escritos() (corre desde el cliente igual que
--   revisar_recordatorios_tareas) que crea una notif por caso/usuario/dia
--   cuando han pasado >= 7 dias desde la ultima verificacion (o desde que se subio).
-- Idempotente.
-- ============================================================================

-- 1) Columnas en casos_generales
ALTER TABLE public.casos_generales
  ADD COLUMN IF NOT EXISTS escrito_subido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escrito_url text,
  ADD COLUMN IF NOT EXISTS escrito_subido_at timestamptz,
  ADD COLUMN IF NOT EXISTS escrito_subido_por uuid REFERENCES public.perfiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escrito_ultima_verificacion timestamptz;

-- 2) Trigger para auto-poblar escrito_subido_at / escrito_subido_por al marcar
CREATE OR REPLACE FUNCTION public.casos_generales_escrito_set_meta()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.escrito_subido = true AND COALESCE(OLD.escrito_subido, false) = false THEN
    NEW.escrito_subido_at := now();
    IF NEW.escrito_subido_por IS NULL THEN
      NEW.escrito_subido_por := COALESCE(NEW.updated_by, NEW.created_by);
    END IF;
    NEW.escrito_ultima_verificacion := COALESCE(NEW.escrito_ultima_verificacion, now());
  END IF;
  IF NEW.escrito_subido = false AND COALESCE(OLD.escrito_subido, false) = true THEN
    NEW.escrito_subido_at := NULL;
    NEW.escrito_subido_por := NULL;
    NEW.escrito_ultima_verificacion := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_casos_generales_escrito_meta ON public.casos_generales;
CREATE TRIGGER trg_casos_generales_escrito_meta
  BEFORE UPDATE OF escrito_subido ON public.casos_generales
  FOR EACH ROW EXECUTE FUNCTION public.casos_generales_escrito_set_meta();

-- 3) Permitir nuevo tipo de notificacion 'verificar_escrito'
ALTER TABLE public.notificaciones_app DROP CONSTRAINT IF EXISTS notificaciones_app_tipo_check;
ALTER TABLE public.notificaciones_app ADD CONSTRAINT notificaciones_app_tipo_check
  CHECK (tipo IN (
    'tarea_asignada','tarea_vista','tarea_estado','nota_caso',
    'tarea_proxima','tarea_vencida','presentar_escrito','verificar_escrito',
    'generico'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_verificar_escrito_user_dia
  ON public.notificaciones_app (user_id, tipo, related_caso_general_id, dedupe_day)
  WHERE tipo = 'verificar_escrito';

-- 4) Funcion: revisar escritos subidos y avisar cada 7 dias
CREATE OR REPLACE FUNCTION public.revisar_recordatorios_escritos()
RETURNS TABLE(creadas integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec RECORD;
  v_creadas integer := 0;
  v_dias_desde integer;
  v_destino uuid;
  v_destinos uuid[];
BEGIN
  FOR rec IN
    SELECT cg.id, cg.titulo, cg.expediente,
           cg.escrito_subido_por, cg.created_by,
           cg.escrito_subido_at, cg.escrito_ultima_verificacion
    FROM casos_generales cg
    WHERE cg.escrito_subido = true
      AND COALESCE(cg.archivado, false) = false
  LOOP
    v_dias_desde := (current_date
      - COALESCE(rec.escrito_ultima_verificacion, rec.escrito_subido_at, now())::date);
    -- Avisar SOLO cuando el contador es multiplo de 7 (7, 14, 21, ...)
    IF v_dias_desde >= 7 AND (v_dias_desde % 7) = 0 THEN
      v_destinos := ARRAY[]::uuid[];
      IF rec.escrito_subido_por IS NOT NULL THEN
        v_destinos := array_append(v_destinos, rec.escrito_subido_por);
      END IF;
      IF rec.created_by IS NOT NULL
         AND rec.created_by <> COALESCE(rec.escrito_subido_por, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        v_destinos := array_append(v_destinos, rec.created_by);
      END IF;

      FOREACH v_destino IN ARRAY v_destinos LOOP
        BEGIN
          INSERT INTO notificaciones_app (
            user_id, tipo, titulo, mensaje, link, related_caso_general_id
          ) VALUES (
            v_destino,
            'verificar_escrito',
            'Verificar escrito: ' || rec.titulo,
            'Hace ' || v_dias_desde || ' dia(s) que se subio el escrito del caso "' || rec.titulo || '"' ||
              CASE WHEN rec.expediente IS NOT NULL THEN ' (' || rec.expediente || ')' ELSE '' END ||
              '. Revisa que el escrito y los datos del caso esten actualizados en el Poder Judicial.',
            '/casos-generales?focus=' || rec.id::text,
            rec.id
          );
          v_creadas := v_creadas + 1;
        EXCEPTION WHEN unique_violation THEN
          NULL;
        END;
      END LOOP;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_creadas;
END $$;

GRANT EXECUTE ON FUNCTION public.revisar_recordatorios_escritos() TO authenticated;

-- ─── FIN ────────────────────────────────────────────────────────────────────
