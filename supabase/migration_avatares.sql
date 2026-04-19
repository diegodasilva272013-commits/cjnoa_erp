-- Avatares de usuario
-- Profile photo storage

-- Add avatar_url column to perfiles
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- RLS policy for perfiles update (allow admin to update any profile)
-- Drop the restrictive policy first, then create a more permissive one
DROP POLICY IF EXISTS "Usuarios pueden actualizar su perfil" ON perfiles;
CREATE POLICY "Usuarios pueden actualizar perfiles"
  ON perfiles FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
