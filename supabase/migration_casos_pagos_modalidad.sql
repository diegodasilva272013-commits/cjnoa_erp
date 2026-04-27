-- Migration: agregar columna modalidad_pago a casos_pagos
-- Fecha: 2026-04-27
-- Valores: 'Único' | 'En cuotas'

ALTER TABLE public.casos_pagos
  ADD COLUMN IF NOT EXISTS modalidad_pago text DEFAULT 'Único'
  CHECK (modalidad_pago IN ('Único', 'En cuotas') OR modalidad_pago IS NULL);

-- Inferir modalidad para registros existentes:
-- si tiene cuotas → 'En cuotas'; si no → 'Único'
UPDATE public.casos_pagos cp
SET modalidad_pago = 'En cuotas'
WHERE EXISTS (
  SELECT 1 FROM public.casos_pagos_cuotas cpc
  WHERE cpc.caso_pago_id = cp.id
);

NOTIFY pgrst, 'reload schema';
