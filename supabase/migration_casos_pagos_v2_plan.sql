-- ============================================================================
-- MIGRATION: Casos-Pagos v2 — Plan de pagos completo
-- Cambios:
--   1) casos_pagos: agregar pago_inicial (monto, modalidad, fecha, pagado, ingreso vinculado)
--   2) casos_pagos_cuotas: agregar motivo_atraso (texto rápido)
--   3) Nueva tabla casos_pagos_cuotas_mora_historial (comentarios de mora con historial)
-- ============================================================================

-- 1) Pago inicial en casos_pagos
ALTER TABLE public.casos_pagos
  ADD COLUMN IF NOT EXISTS pago_inicial numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pago_inicial_modalidad text CHECK (pago_inicial_modalidad IN ('Efectivo','Transferencia') OR pago_inicial_modalidad IS NULL),
  ADD COLUMN IF NOT EXISTS pago_inicial_fecha date,
  ADD COLUMN IF NOT EXISTS pago_inicial_pagado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ingreso_pago_inicial_id uuid REFERENCES public.ingresos(id) ON DELETE SET NULL;

-- 2) Motivo de atraso rápido en cada cuota
ALTER TABLE public.casos_pagos_cuotas
  ADD COLUMN IF NOT EXISTS motivo_atraso text;

-- 3) Historial de notas/comentarios de mora por cuota
CREATE TABLE IF NOT EXISTS public.casos_pagos_cuotas_mora_historial (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  cuota_id uuid NOT NULL REFERENCES public.casos_pagos_cuotas(id) ON DELETE CASCADE,
  caso_pago_id uuid NOT NULL REFERENCES public.casos_pagos(id) ON DELETE CASCADE,
  fecha timestamptz NOT NULL DEFAULT now(),
  motivo text NOT NULL,
  autor_id uuid REFERENCES public.perfiles(id),
  autor_nombre text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cp_mora_cuota ON public.casos_pagos_cuotas_mora_historial(cuota_id);
CREATE INDEX IF NOT EXISTS idx_cp_mora_caso ON public.casos_pagos_cuotas_mora_historial(caso_pago_id);

ALTER TABLE public.casos_pagos_cuotas_mora_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cp_mora_select" ON public.casos_pagos_cuotas_mora_historial;
DROP POLICY IF EXISTS "cp_mora_insert" ON public.casos_pagos_cuotas_mora_historial;
DROP POLICY IF EXISTS "cp_mora_delete" ON public.casos_pagos_cuotas_mora_historial;

CREATE POLICY "cp_mora_select" ON public.casos_pagos_cuotas_mora_historial
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio','admin')));

CREATE POLICY "cp_mora_insert" ON public.casos_pagos_cuotas_mora_historial
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio','admin')));

CREATE POLICY "cp_mora_delete" ON public.casos_pagos_cuotas_mora_historial
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio','admin')));
