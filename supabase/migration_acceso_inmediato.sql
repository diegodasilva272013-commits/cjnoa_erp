-- =====================================================================
-- Migration: revocación inmediata de acceso al desactivar usuario
-- =====================================================================
-- Objetivo:
--   1. Habilitar Realtime sobre perfiles para que el cliente reciba
--      el evento UPDATE cuando un admin pone activo=false y pueda
--      cerrar la sesión inmediatamente.
--   2. Función helper is_active_user() para usar en RLS de otras tablas.
--   3. Trigger que invalida tokens de Supabase Auth (logueado a tabla
--      auditoría) cuando activo pasa a false.
-- =====================================================================

-- 1. Habilitar Realtime en perfiles ------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'perfiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.perfiles';
  END IF;
END$$;

-- Aseguramos REPLICA IDENTITY FULL para que payload incluya activo previo
ALTER TABLE public.perfiles REPLICA IDENTITY FULL;

-- 2. Helper para RLS ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT activo FROM public.perfiles WHERE id = auth.uid()),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;

-- 3. Tabla de auditoría de desactivaciones -----------------------------
CREATE TABLE IF NOT EXISTS public.acceso_revocaciones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL,
  desactivado_por uuid,
  motivo      text,
  fecha       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.acceso_revocaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revocaciones_admin_read ON public.acceso_revocaciones;
CREATE POLICY revocaciones_admin_read ON public.acceso_revocaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'socio')
        AND p.activo = true
    )
  );

-- 4. Trigger: registra revocación cuando activo pasa a false ----------
CREATE OR REPLACE FUNCTION public.log_revocacion_acceso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE')
     AND COALESCE(OLD.activo, true) = true
     AND COALESCE(NEW.activo, true) = false THEN
    INSERT INTO public.acceso_revocaciones (usuario_id, desactivado_por, motivo)
    VALUES (NEW.id, auth.uid(), 'Desactivación manual desde Equipo');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_revocacion_acceso ON public.perfiles;
CREATE TRIGGER trg_log_revocacion_acceso
  AFTER UPDATE OF activo ON public.perfiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_revocacion_acceso();
