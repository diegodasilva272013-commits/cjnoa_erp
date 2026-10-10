-- ============================================================================
-- Agrega SOLO una policy: el administrador puede ver/cargar/editar/borrar la
-- disponibilidad de Alejandro y Fabricio. No borra ni modifica nada existente.
-- Idempotente (se puede correr más de una vez).
-- ============================================================================
DO $pol$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='disponibilidad_horarios' AND policyname='disp_admin_all') THEN
    EXECUTE $q$CREATE POLICY disp_admin_all ON public.disponibilidad_horarios
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol = 'admin'))$q$;
  END IF;
END $pol$;

NOTIFY pgrst, 'reload schema';
