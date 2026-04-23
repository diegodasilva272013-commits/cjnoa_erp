-- ============================================================================
-- MIGRATION: Cuotas para CASOS-PAGOS
-- Flujo:
--   - Cada cuota pertenece a un caso de pago comercial
--   - Cuando una cuota se marca pagada, genera / sincroniza un ingreso automatico
--   - Si se vuelve a pendiente o se elimina, el ingreso vinculado se elimina
-- Visibilidad: socios y administradores
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.casos_pagos_cuotas (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  caso_pago_id uuid NOT NULL REFERENCES public.casos_pagos(id) ON DELETE CASCADE,
  numero integer NOT NULL CHECK (numero > 0),
  fecha_vencimiento date NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto >= 0),
  estado text NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Pagada')),
  fecha_pago date,
  modalidad_pago text CHECK (modalidad_pago IN ('Efectivo', 'Transferencia') OR modalidad_pago IS NULL),
  cobrado_por text CHECK (cobrado_por IN ('Rodrigo','Noelia','Fabricio','Alejandro') OR cobrado_por IS NULL),
  observaciones text,
  ingreso_id uuid REFERENCES public.ingresos(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.perfiles(id),
  CONSTRAINT casos_pagos_cuotas_unique_numero UNIQUE (caso_pago_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_casos_pagos_cuotas_caso_pago_id ON public.casos_pagos_cuotas(caso_pago_id);
CREATE INDEX IF NOT EXISTS idx_casos_pagos_cuotas_estado ON public.casos_pagos_cuotas(estado);

ALTER TABLE public.casos_pagos_cuotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "casos_pagos_cuotas_select" ON public.casos_pagos_cuotas;
DROP POLICY IF EXISTS "casos_pagos_cuotas_insert" ON public.casos_pagos_cuotas;
DROP POLICY IF EXISTS "casos_pagos_cuotas_update" ON public.casos_pagos_cuotas;
DROP POLICY IF EXISTS "casos_pagos_cuotas_delete" ON public.casos_pagos_cuotas;

CREATE POLICY "casos_pagos_cuotas_select" ON public.casos_pagos_cuotas
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio', 'admin')));

CREATE POLICY "casos_pagos_cuotas_insert" ON public.casos_pagos_cuotas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio', 'admin')));

CREATE POLICY "casos_pagos_cuotas_update" ON public.casos_pagos_cuotas
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio', 'admin')));

CREATE POLICY "casos_pagos_cuotas_delete" ON public.casos_pagos_cuotas
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('socio', 'admin')));

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

CREATE OR REPLACE FUNCTION public.casos_pagos_cuotas_sync_ingresos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_pagada boolean := false;
  v_parent record;
  v_new_ingreso_id uuid;
BEGIN
  SELECT caso_id, cliente_nombre, socio_carga
    INTO v_parent
  FROM public.casos_pagos
  WHERE id = NEW.caso_pago_id;

  IF TG_OP = 'UPDATE' THEN
    v_old_pagada := COALESCE(OLD.estado, 'Pendiente') = 'Pagada';
  END IF;

  IF NEW.estado = 'Pagada' AND COALESCE(NEW.monto, 0) > 0 THEN
    IF NEW.ingreso_id IS NULL THEN
      INSERT INTO public.ingresos (
        caso_id, fecha, cliente_nombre, concepto,
        monto_total, monto_cj_noa, socio_cobro, modalidad, es_manual
      ) VALUES (
        v_parent.caso_id,
        COALESCE(NEW.fecha_pago, NEW.fecha_vencimiento, current_date),
        v_parent.cliente_nombre,
        'Cuota caso de pago #' || NEW.numero || ' - ' || COALESCE(v_parent.cliente_nombre, ''),
        NEW.monto,
        NEW.monto,
        COALESCE(NEW.cobrado_por, v_parent.socio_carga),
        NEW.modalidad_pago,
        false
      ) RETURNING id INTO v_new_ingreso_id;

      NEW.ingreso_id := v_new_ingreso_id;
    ELSE
      UPDATE public.ingresos SET
        caso_id = v_parent.caso_id,
        fecha = COALESCE(NEW.fecha_pago, NEW.fecha_vencimiento, current_date),
        cliente_nombre = v_parent.cliente_nombre,
        concepto = 'Cuota caso de pago #' || NEW.numero || ' - ' || COALESCE(v_parent.cliente_nombre, ''),
        monto_total = NEW.monto,
        monto_cj_noa = NEW.monto,
        socio_cobro = COALESCE(NEW.cobrado_por, v_parent.socio_carga),
        modalidad = NEW.modalidad_pago
      WHERE id = NEW.ingreso_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND v_old_pagada = true AND NEW.estado <> 'Pagada' AND OLD.ingreso_id IS NOT NULL THEN
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_id;
    NEW.ingreso_id := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_casos_pagos_cuotas_sync_ingresos ON public.casos_pagos_cuotas;
CREATE TRIGGER trg_casos_pagos_cuotas_sync_ingresos
  BEFORE INSERT OR UPDATE ON public.casos_pagos_cuotas
  FOR EACH ROW EXECUTE FUNCTION public.casos_pagos_cuotas_sync_ingresos();

CREATE OR REPLACE FUNCTION public.casos_pagos_cuotas_cleanup_ingresos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.ingreso_id IS NOT NULL THEN
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_casos_pagos_cuotas_cleanup ON public.casos_pagos_cuotas;
CREATE TRIGGER trg_casos_pagos_cuotas_cleanup
  BEFORE DELETE ON public.casos_pagos_cuotas
  FOR EACH ROW EXECUTE FUNCTION public.casos_pagos_cuotas_cleanup_ingresos();

NOTIFY pgrst, 'reload schema';