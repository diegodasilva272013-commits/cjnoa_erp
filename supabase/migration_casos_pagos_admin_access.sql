DROP POLICY IF EXISTS "casos_pagos_select_socios" ON public.casos_pagos;
DROP POLICY IF EXISTS "casos_pagos_insert_socios" ON public.casos_pagos;
DROP POLICY IF EXISTS "casos_pagos_update_socios" ON public.casos_pagos;
DROP POLICY IF EXISTS "casos_pagos_delete_socios" ON public.casos_pagos;

CREATE POLICY "casos_pagos_select_socios" ON public.casos_pagos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio', 'admin')));

CREATE POLICY "casos_pagos_insert_socios" ON public.casos_pagos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio', 'admin')));

CREATE POLICY "casos_pagos_update_socios" ON public.casos_pagos
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio', 'admin')));

CREATE POLICY "casos_pagos_delete_socios" ON public.casos_pagos
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio', 'admin')));

NOTIFY pgrst, 'reload schema';