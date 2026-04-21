-- ============================================================================
-- MIGRATION: Audit log de cambios de rol y permisos en perfiles
-- ============================================================================
-- Registra toda modificación de rol, permisos o estado activo de un perfil
-- para trazabilidad y cumplimiento de spec v1.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log_permisos (
  id             uuid primary key default gen_random_uuid(),
  perfil_id      uuid references perfiles(id) on delete set null,
  changed_by     uuid references auth.users(id) on delete set null,
  campo          text not null,                -- 'rol' | 'permisos' | 'activo'
  valor_anterior jsonb,
  valor_nuevo    jsonb,
  user_agent     text,
  created_at     timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_audit_permisos_perfil ON audit_log_permisos(perfil_id);
CREATE INDEX IF NOT EXISTS idx_audit_permisos_created ON audit_log_permisos(created_at DESC);

ALTER TABLE audit_log_permisos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_permisos_select_admin ON audit_log_permisos;
CREATE POLICY audit_permisos_select_admin ON audit_log_permisos
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio'))
);

-- NADIE puede modificar ni borrar (inmutable) — solo INSERT vía trigger
DROP POLICY IF EXISTS audit_permisos_insert_system ON audit_log_permisos;
CREATE POLICY audit_permisos_insert_system ON audit_log_permisos
FOR INSERT TO authenticated WITH CHECK (false);

-- Trigger en perfiles
CREATE OR REPLACE FUNCTION log_cambio_permisos_perfil()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    INSERT INTO audit_log_permisos (perfil_id, changed_by, campo, valor_anterior, valor_nuevo)
    VALUES (NEW.id, auth.uid(), 'rol', to_jsonb(OLD.rol), to_jsonb(NEW.rol));
  END IF;
  IF NEW.permisos IS DISTINCT FROM OLD.permisos THEN
    INSERT INTO audit_log_permisos (perfil_id, changed_by, campo, valor_anterior, valor_nuevo)
    VALUES (NEW.id, auth.uid(), 'permisos', OLD.permisos, NEW.permisos);
  END IF;
  IF NEW.activo IS DISTINCT FROM OLD.activo THEN
    INSERT INTO audit_log_permisos (perfil_id, changed_by, campo, valor_anterior, valor_nuevo)
    VALUES (NEW.id, auth.uid(), 'activo', to_jsonb(OLD.activo), to_jsonb(NEW.activo));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS perfiles_log_permisos ON perfiles;
CREATE TRIGGER perfiles_log_permisos
AFTER UPDATE OF rol, permisos, activo ON perfiles
FOR EACH ROW EXECUTE FUNCTION log_cambio_permisos_perfil();

-- Vista para consulta fácil
CREATE OR REPLACE VIEW audit_log_permisos_completo AS
SELECT
  a.*,
  p.nombre  AS perfil_nombre,
  p.email   AS perfil_email,
  pc.nombre AS changed_by_nombre
FROM audit_log_permisos a
LEFT JOIN perfiles p  ON p.id = a.perfil_id
LEFT JOIN perfiles pc ON pc.id = a.changed_by
ORDER BY a.created_at DESC;
