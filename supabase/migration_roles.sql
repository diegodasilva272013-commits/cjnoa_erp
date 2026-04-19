-- ============================================
-- MIGRACIÓN: Sistema de Roles y Permisos
-- Ejecutar en Supabase SQL Editor
-- ============================================
-- NOTA: Si ya ejecutaste la versión anterior, solo ejecutá la línea del paso 6.

-- 1. Agregar columna 'activo' a perfiles
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true;

-- 2. Actualizar el rol del usuario actual a 'admin'
UPDATE public.perfiles SET rol = 'admin' WHERE id = (SELECT id FROM auth.users LIMIT 1);

-- 3. Permitir que admins puedan actualizar cualquier perfil
DROP POLICY IF EXISTS "Usuarios pueden actualizar su perfil" ON public.perfiles;

CREATE POLICY "Admins pueden actualizar perfiles"
  ON public.perfiles FOR update
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Permitir insert de perfiles por cualquier autenticado (para que admin cree perfiles)
DROP POLICY IF EXISTS "Perfiles insertables por trigger" ON public.perfiles;

CREATE POLICY "Perfiles insertables por autenticados"
  ON public.perfiles FOR insert
  TO authenticated
  WITH CHECK (true);

-- 5. Permitir que admins eliminen perfiles
CREATE POLICY "Admins pueden eliminar perfiles"
  ON public.perfiles FOR delete
  TO authenticated
  USING (true);

-- 6. Agregar columna de permisos personalizados (JSONB)
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS permisos jsonb DEFAULT '{"dashboard":true,"casos":true,"finanzas":true,"equipo":false}'::jsonb;

-- Darle todos los permisos al admin actual
UPDATE public.perfiles SET permisos = '{"dashboard":true,"casos":true,"finanzas":true,"equipo":true}'::jsonb WHERE rol = 'admin';
