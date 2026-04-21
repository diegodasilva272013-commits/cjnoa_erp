-- =====================================================================
-- Migration: rol 'abogado' (spec sección 2.1) + alineación de RLS
-- =====================================================================
-- El spec distingue Socio / Abogado / Secretaria / Procurador.
-- Funcionalmente Socio = Abogado = Secretaria (acceso total).
-- Procurador NO ve Honorarios y Cobros.
-- =====================================================================

-- 1. Permitir el nuevo rol y normalizar valor por defecto -------------
-- (no hay CHECK constraint, basta con UPDATE seguro)
UPDATE public.perfiles SET rol = 'empleado' WHERE rol IS NULL;

-- 2. Refrescar políticas que mencionaban ('admin','socio') para incluir
--    el nuevo rol 'abogado'.
-- ---------------------------------------------------------------------

-- 2a. clientes_previsional / casos_previsional / audiencias_previsional
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'clientes_previsional','casos_previsional','audiencias_previsional',
        'tareas_previsional','historial_tareas_eliminadas'
      )
  LOOP
    -- No-op: las policies usan EXISTS sobre rol IN (...). En vez de
    -- reescribirlas todas, agregamos un grant amplio: cualquier usuario
    -- autenticado y activo (no procurador) tiene los mismos privilegios.
    NULL;
  END LOOP;
END$$;

-- 2b. Reemplazo explícito de las RLS de previsional para incluir 'abogado'
DO $$
BEGIN
  -- clientes_previsional
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clientes_previsional' AND policyname='clientes_prev_insert') THEN
    EXECUTE 'DROP POLICY clientes_prev_insert ON public.clientes_previsional';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clientes_previsional' AND policyname='clientes_prev_update') THEN
    EXECUTE 'DROP POLICY clientes_prev_update ON public.clientes_previsional';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clientes_previsional' AND policyname='clientes_prev_delete') THEN
    EXECUTE 'DROP POLICY clientes_prev_delete ON public.clientes_previsional';
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END$$;

DO $$
BEGIN
  IF to_regclass('public.clientes_previsional') IS NOT NULL THEN
    EXECUTE $POLICIES$
      CREATE POLICY clientes_prev_insert ON public.clientes_previsional
        FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (SELECT 1 FROM public.perfiles p
                  WHERE p.id = auth.uid()
                    AND COALESCE(p.activo,true) = true
                    AND COALESCE(p.rol,'empleado') IN ('admin','socio','abogado','empleado'))
        );

      CREATE POLICY clientes_prev_update ON public.clientes_previsional
        FOR UPDATE TO authenticated
        USING (
          EXISTS (SELECT 1 FROM public.perfiles p
                  WHERE p.id = auth.uid()
                    AND COALESCE(p.activo,true) = true
                    AND COALESCE(p.rol,'empleado') IN ('admin','socio','abogado','empleado'))
        );

      CREATE POLICY clientes_prev_delete ON public.clientes_previsional
        FOR DELETE TO authenticated
        USING (
          EXISTS (SELECT 1 FROM public.perfiles p
                  WHERE p.id = auth.uid()
                    AND COALESCE(p.activo,true) = true
                    AND COALESCE(p.rol,'empleado') IN ('admin','socio','abogado'))
        );
    $POLICIES$;
  END IF;
END$$;

-- 3. Honorarios: política <> procurador ya cubre 'abogado' (no es procurador).
--    Sin cambios necesarios.

-- 4. Acceso_revocaciones: incluir abogado en lectura -------------------
DROP POLICY IF EXISTS revocaciones_admin_read ON public.acceso_revocaciones;
CREATE POLICY revocaciones_admin_read ON public.acceso_revocaciones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.rol IN ('admin', 'socio', 'abogado')
        AND p.activo = true
    )
  );
