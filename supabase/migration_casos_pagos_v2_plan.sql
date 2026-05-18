-- ============================================================================
-- MIGRATION: Casos-Pagos v2 — Plan de pagos completo (IDEMPOTENTE)
-- Crea / extiende todo lo necesario para el nuevo módulo CASOS PAGOS:
--   1) Asegura casos_pagos_cuotas (con RLS) sin FK a ingresos
--   2) Agrega columnas de pago_inicial en casos_pagos
--   3) Agrega motivo_atraso en casos_pagos_cuotas
--   4) Crea casos_pagos_cuotas_mora_historial
-- NOTA: el sistema de finanzas actual usa "ingresos_operativos", no "ingresos".
--       Por eso esta migración NO crea triggers que referencien "ingresos".
--       La sincronización con finanzas se hace desde la app si se desea.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabla casos_pagos_cuotas (idempotente, sin FK a ingresos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.casos_pagos_cuotas (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  caso_pago_id uuid NOT NULL REFERENCES public.casos_pagos(id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero > 0),
  fecha_vencimiento date NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto >= 0),
  estado text NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Pagada')),
  fecha_pago date,
  modalidad_pago text CHECK (modalidad_pago IN ('Efectivo', 'Transferencia') OR modalidad_pago IS NULL),
  cobrado_por text,
  observaciones text,
  ingreso_id uuid,  -- sin FK: el esquema actual usa ingresos_operativos
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.perfiles(id),
  CONSTRAINT casos_pagos_cuotas_unique_numero UNIQUE (caso_pago_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_casos_pagos_cuotas_caso_pago_id ON public.casos_pagos_cuotas(caso_pago_id);
CREATE INDEX IF NOT EXISTS idx_casos_pagos_cuotas_estado ON public.casos_pagos_cuotas(estado);
CREATE INDEX IF NOT EXISTS idx_casos_pagos_cuotas_fecha_venc ON public.casos_pagos_cuotas(fecha_vencimiento);

ALTER TABLE public.casos_pagos_cuotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "casos_pagos_cuotas_select" ON public.casos_pagos_cuotas;
DROP POLICY IF EXISTS "casos_pagos_cuotas_insert" ON public.casos_pagos_cuotas;
DROP POLICY IF EXISTS "casos_pagos_cuotas_update" ON public.casos_pagos_cuotas;
DROP POLICY IF EXISTS "casos_pagos_cuotas_delete" ON public.casos_pagos_cuotas;

CREATE POLICY "casos_pagos_cuotas_select" ON public.casos_pagos_cuotas
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio','admin')));

CREATE POLICY "casos_pagos_cuotas_insert" ON public.casos_pagos_cuotas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio','admin')));

CREATE POLICY "casos_pagos_cuotas_update" ON public.casos_pagos_cuotas
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio','admin')));

CREATE POLICY "casos_pagos_cuotas_delete" ON public.casos_pagos_cuotas
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio','admin')));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.casos_pagos_cuotas_set_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_casos_pagos_cuotas_updated ON public.casos_pagos_cuotas;
CREATE TRIGGER trg_casos_pagos_cuotas_updated
  BEFORE UPDATE ON public.casos_pagos_cuotas
  FOR EACH ROW EXECUTE FUNCTION public.casos_pagos_cuotas_set_updated();

-- ----------------------------------------------------------------------------
-- 2) Pago inicial en casos_pagos
-- ----------------------------------------------------------------------------
ALTER TABLE public.casos_pagos
  ADD COLUMN IF NOT EXISTS pago_inicial numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pago_inicial_modalidad text,
  ADD COLUMN IF NOT EXISTS pago_inicial_fecha date,
  ADD COLUMN IF NOT EXISTS pago_inicial_pagado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ingreso_pago_inicial_id uuid;

-- CHECK para pago_inicial_modalidad (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'casos_pagos_pago_inicial_modalidad_check'
  ) THEN
    ALTER TABLE public.casos_pagos
      ADD CONSTRAINT casos_pagos_pago_inicial_modalidad_check
      CHECK (pago_inicial_modalidad IN ('Efectivo','Transferencia') OR pago_inicial_modalidad IS NULL);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) Motivo de atraso rápido en cada cuota
-- ----------------------------------------------------------------------------
ALTER TABLE public.casos_pagos_cuotas
  ADD COLUMN IF NOT EXISTS motivo_atraso text;

-- ----------------------------------------------------------------------------
-- 4) Historial de notas / comentarios de mora por cuota
-- ----------------------------------------------------------------------------
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
