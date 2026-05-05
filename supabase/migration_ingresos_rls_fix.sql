-- ============================================================================
-- FIX RLS para permitir borrar ingresos y desmarcar consultas/casos.
-- Seguro de correr varias veces.
-- ============================================================================

-- 1) Asegurar policies en ingresos para todos los autenticados
DROP POLICY IF EXISTS "Ingresos eliminables por autenticados" ON public.ingresos;
CREATE POLICY "Ingresos eliminables por autenticados"
  ON public.ingresos FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Ingresos editables por autenticados" ON public.ingresos;
CREATE POLICY "Ingresos editables por autenticados"
  ON public.ingresos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 2) Asegurar policy de UPDATE en consultas_agendadas
ALTER TABLE public.consultas_agendadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consultas_agendadas_update_authenticated ON public.consultas_agendadas;
CREATE POLICY consultas_agendadas_update_authenticated
  ON public.consultas_agendadas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 3) Asegurar policy de UPDATE en casos_pagos
ALTER TABLE public.casos_pagos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS casos_pagos_update_authenticated ON public.casos_pagos;
CREATE POLICY casos_pagos_update_authenticated
  ON public.casos_pagos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
