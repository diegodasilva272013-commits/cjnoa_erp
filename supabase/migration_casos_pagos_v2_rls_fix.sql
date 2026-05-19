-- ============================================================================
-- FIX RLS: casos_pagos + casos_pagos_cuotas + mora_historial
-- Permitir acceso a socio, admin, abogado y a quien tenga permisos.finanzas
-- (alineado con el frontend de CasosPagos.tsx)
-- ============================================================================

-- ----- casos_pagos -----
DROP POLICY IF EXISTS "casos_pagos_select_socios" ON public.casos_pagos;
DROP POLICY IF EXISTS "casos_pagos_insert_socios" ON public.casos_pagos;
DROP POLICY IF EXISTS "casos_pagos_update_socios" ON public.casos_pagos;
DROP POLICY IF EXISTS "casos_pagos_delete_socios" ON public.casos_pagos;
DROP POLICY IF EXISTS "casos_pagos_select" ON public.casos_pagos;
DROP POLICY IF EXISTS "casos_pagos_insert" ON public.casos_pagos;
DROP POLICY IF EXISTS "casos_pagos_update" ON public.casos_pagos;
DROP POLICY IF EXISTS "casos_pagos_delete" ON public.casos_pagos;

CREATE POLICY "casos_pagos_select" ON public.casos_pagos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

CREATE POLICY "casos_pagos_insert" ON public.casos_pagos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

CREATE POLICY "casos_pagos_update" ON public.casos_pagos
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

CREATE POLICY "casos_pagos_delete" ON public.casos_pagos
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

-- ----- casos_pagos_cuotas -----
DROP POLICY IF EXISTS "casos_pagos_cuotas_select" ON public.casos_pagos_cuotas;
DROP POLICY IF EXISTS "casos_pagos_cuotas_insert" ON public.casos_pagos_cuotas;
DROP POLICY IF EXISTS "casos_pagos_cuotas_update" ON public.casos_pagos_cuotas;
DROP POLICY IF EXISTS "casos_pagos_cuotas_delete" ON public.casos_pagos_cuotas;

CREATE POLICY "casos_pagos_cuotas_select" ON public.casos_pagos_cuotas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

CREATE POLICY "casos_pagos_cuotas_insert" ON public.casos_pagos_cuotas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

CREATE POLICY "casos_pagos_cuotas_update" ON public.casos_pagos_cuotas
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

CREATE POLICY "casos_pagos_cuotas_delete" ON public.casos_pagos_cuotas
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

-- ----- mora_historial -----
DROP POLICY IF EXISTS "cp_mora_select" ON public.casos_pagos_cuotas_mora_historial;
DROP POLICY IF EXISTS "cp_mora_insert" ON public.casos_pagos_cuotas_mora_historial;
DROP POLICY IF EXISTS "cp_mora_delete" ON public.casos_pagos_cuotas_mora_historial;

CREATE POLICY "cp_mora_select" ON public.casos_pagos_cuotas_mora_historial
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

CREATE POLICY "cp_mora_insert" ON public.casos_pagos_cuotas_mora_historial
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

CREATE POLICY "cp_mora_delete" ON public.casos_pagos_cuotas_mora_historial
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.perfiles p
    WHERE p.id = auth.uid()
      AND (p.rol IN ('socio','admin','abogado')
           OR COALESCE((p.permisos->>'finanzas')::boolean, false) = true)
  ));

NOTIFY pgrst, 'reload schema';
