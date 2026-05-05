-- ============================================================================
-- FIX delete de ingresos:
-- 1) FKs con ON DELETE SET NULL (para no romper integridad)
-- 2) Política RLS de DELETE para admin/socio
-- ============================================================================

-- 1) Recrear FK consultas_agendadas.ingreso_reserva_id con SET NULL
ALTER TABLE public.consultas_agendadas
  DROP CONSTRAINT IF EXISTS consultas_agendadas_ingreso_reserva_id_fkey;
ALTER TABLE public.consultas_agendadas
  ADD CONSTRAINT consultas_agendadas_ingreso_reserva_id_fkey
  FOREIGN KEY (ingreso_reserva_id) REFERENCES public.ingresos(id) ON DELETE SET NULL;

-- 2) Recrear FK casos_pagos.ingreso_saldo_id con SET NULL
ALTER TABLE public.casos_pagos
  DROP CONSTRAINT IF EXISTS casos_pagos_ingreso_saldo_id_fkey;
ALTER TABLE public.casos_pagos
  ADD CONSTRAINT casos_pagos_ingreso_saldo_id_fkey
  FOREIGN KEY (ingreso_saldo_id) REFERENCES public.ingresos(id) ON DELETE SET NULL;

-- 3) Política DELETE en ingresos (admin/socio)
DROP POLICY IF EXISTS ingresos_delete_admin_socio ON public.ingresos;
CREATE POLICY ingresos_delete_admin_socio ON public.ingresos
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.perfiles p
      WHERE p.id = auth.uid()
        AND p.activo = true
        AND p.rol IN ('admin','socio')
    )
  );
