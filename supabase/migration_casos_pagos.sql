-- ============================================================================
-- MIGRATION: Modulo CASOS-PAGOS (visible solo a socios)
-- Flujo:
--   Paso 1 (Agendamiento): se registra la consulta antes de que ocurra
--     - cliente, telefono, abogado_asignado, fecha_consulta, hora_consulta
--     - monto_reserva, monto_a_cancelar
--     - reserva_pagada (bool)
--   Paso 2 (Resultado): completar luego de la consulta
--     - consulta_realizada (bool), resultado_estado, saldo_pagado, saldo_monto_real
--     - honorarios, observaciones, detalle_consulta
-- Integracion con ingresos:
--   - Cuando reserva_pagada=true => crea ingreso vinculado (ingreso_reserva_id)
--   - Cuando saldo_pagado=true   => crea ingreso vinculado (ingreso_saldo_id)
--   - Si se desmarca el bool => se borra el ingreso vinculado
--   - Si se cambia monto/socio => se sincroniza el ingreso existente
-- Visibilidad: solo socios (rol = 'socio') por RLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.casos_pagos (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Vinculo opcional a un caso de trabajo
  caso_id uuid REFERENCES public.casos(id) ON DELETE SET NULL,

  -- Datos cliente / consulta
  cliente_nombre text NOT NULL,
  telefono text,
  estado_caso text CHECK (estado_caso IN ('Vino a consulta','Trámite no judicial','Cliente Judicial') OR estado_caso IS NULL),
  detalle_consulta text,
  socio_carga text NOT NULL CHECK (socio_carga IN ('Rodrigo','Noelia','Fabricio','Alejandro')),
  fecha_carga date NOT NULL DEFAULT current_date,

  -- ==== Paso 1: Agendamiento ====
  fecha_consulta date,
  hora_consulta time,
  abogado_asignado text,
  monto_reserva numeric(12,2) DEFAULT 0,
  monto_a_cancelar numeric(12,2) DEFAULT 0,
  reserva_pagada boolean DEFAULT false,
  reserva_modalidad text CHECK (reserva_modalidad IN ('Efectivo','Transferencia') OR reserva_modalidad IS NULL),

  -- ==== Paso 2: Resultado ====
  consulta_realizada boolean DEFAULT false,
  resultado_estado text CHECK (resultado_estado IN ('Vino a consulta','Trámite no judicial','Cliente Judicial') OR resultado_estado IS NULL),
  saldo_pagado boolean DEFAULT false,
  saldo_monto_real numeric(12,2) DEFAULT 0,
  saldo_modalidad text CHECK (saldo_modalidad IN ('Efectivo','Transferencia') OR saldo_modalidad IS NULL),
  honorarios numeric(12,2) DEFAULT 0,
  observaciones text,

  -- Vinculos a ingresos generados automaticamente
  ingreso_reserva_id uuid REFERENCES public.ingresos(id) ON DELETE SET NULL,
  ingreso_saldo_id   uuid REFERENCES public.ingresos(id) ON DELETE SET NULL,

  -- Auditoria
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.perfiles(id)
);

CREATE INDEX IF NOT EXISTS idx_casos_pagos_fecha_consulta ON public.casos_pagos(fecha_consulta);
CREATE INDEX IF NOT EXISTS idx_casos_pagos_socio_carga ON public.casos_pagos(socio_carga);

-- ============================================================================
-- RLS: solo socios y administradores pueden ver / escribir CASOS-PAGOS
-- ============================================================================
ALTER TABLE public.casos_pagos ENABLE ROW LEVEL SECURITY;

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

-- ============================================================================
-- TRIGGER: auto-set updated_at + updated_by
-- ============================================================================
CREATE OR REPLACE FUNCTION public.casos_pagos_set_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_casos_pagos_updated ON public.casos_pagos;
CREATE TRIGGER trg_casos_pagos_updated
  BEFORE UPDATE ON public.casos_pagos
  FOR EACH ROW EXECUTE FUNCTION public.casos_pagos_set_updated();

-- ============================================================================
-- TRIGGER: sincronizar ingresos vinculados (BEFORE INSERT/UPDATE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.casos_pagos_sync_ingresos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_reserva  boolean := false;
  v_old_saldo    boolean := false;
  v_new_reserva_id uuid;
  v_new_saldo_id   uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_reserva := COALESCE(OLD.reserva_pagada, false);
    v_old_saldo   := COALESCE(OLD.saldo_pagado, false);
  END IF;

  -- ============ RESERVA ============
  IF NEW.reserva_pagada = true AND COALESCE(NEW.monto_reserva, 0) > 0 THEN
    IF NEW.ingreso_reserva_id IS NULL THEN
      -- Crear ingreso reserva
      INSERT INTO public.ingresos (
        caso_id, fecha, cliente_nombre, concepto,
        monto_total, monto_cj_noa, socio_cobro, modalidad, es_manual
      ) VALUES (
        NEW.caso_id,
        COALESCE(NEW.fecha_consulta, NEW.fecha_carga, current_date),
        NEW.cliente_nombre,
        'Reserva consulta - ' || COALESCE(NEW.cliente_nombre, ''),
        NEW.monto_reserva, NEW.monto_reserva,
        NEW.socio_carga, NEW.reserva_modalidad,
        false
      ) RETURNING id INTO v_new_reserva_id;
      NEW.ingreso_reserva_id := v_new_reserva_id;
    ELSE
      -- Actualizar ingreso reserva existente
      UPDATE public.ingresos SET
        caso_id = NEW.caso_id,
        fecha = COALESCE(NEW.fecha_consulta, NEW.fecha_carga, current_date),
        cliente_nombre = NEW.cliente_nombre,
        monto_total = NEW.monto_reserva,
        monto_cj_noa = NEW.monto_reserva,
        socio_cobro = NEW.socio_carga,
        modalidad = NEW.reserva_modalidad
      WHERE id = NEW.ingreso_reserva_id;
    END IF;
  ELSIF (TG_OP = 'UPDATE' AND v_old_reserva = true AND NEW.reserva_pagada = false AND OLD.ingreso_reserva_id IS NOT NULL) THEN
    -- Se desmarco la reserva: borrar el ingreso vinculado
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_reserva_id;
    NEW.ingreso_reserva_id := NULL;
  END IF;

  -- ============ SALDO ============
  IF NEW.saldo_pagado = true AND COALESCE(NEW.saldo_monto_real, 0) > 0 THEN
    IF NEW.ingreso_saldo_id IS NULL THEN
      INSERT INTO public.ingresos (
        caso_id, fecha, cliente_nombre, concepto,
        monto_total, monto_cj_noa, socio_cobro, modalidad, es_manual
      ) VALUES (
        NEW.caso_id,
        COALESCE(NEW.fecha_consulta, current_date),
        NEW.cliente_nombre,
        'Saldo consulta - ' || COALESCE(NEW.cliente_nombre, ''),
        NEW.saldo_monto_real, NEW.saldo_monto_real,
        NEW.socio_carga, NEW.saldo_modalidad,
        false
      ) RETURNING id INTO v_new_saldo_id;
      NEW.ingreso_saldo_id := v_new_saldo_id;
    ELSE
      UPDATE public.ingresos SET
        caso_id = NEW.caso_id,
        fecha = COALESCE(NEW.fecha_consulta, current_date),
        cliente_nombre = NEW.cliente_nombre,
        monto_total = NEW.saldo_monto_real,
        monto_cj_noa = NEW.saldo_monto_real,
        socio_cobro = NEW.socio_carga,
        modalidad = NEW.saldo_modalidad
      WHERE id = NEW.ingreso_saldo_id;
    END IF;
  ELSIF (TG_OP = 'UPDATE' AND v_old_saldo = true AND NEW.saldo_pagado = false AND OLD.ingreso_saldo_id IS NOT NULL) THEN
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_saldo_id;
    NEW.ingreso_saldo_id := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_casos_pagos_sync_ingresos ON public.casos_pagos;
CREATE TRIGGER trg_casos_pagos_sync_ingresos
  BEFORE INSERT OR UPDATE ON public.casos_pagos
  FOR EACH ROW EXECUTE FUNCTION public.casos_pagos_sync_ingresos();

-- ============================================================================
-- TRIGGER: si se borra el caso_pagos, borrar tambien sus ingresos vinculados
-- ============================================================================
CREATE OR REPLACE FUNCTION public.casos_pagos_cleanup_ingresos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.ingreso_reserva_id IS NOT NULL THEN
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_reserva_id;
  END IF;
  IF OLD.ingreso_saldo_id IS NOT NULL THEN
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_saldo_id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_casos_pagos_cleanup ON public.casos_pagos;
CREATE TRIGGER trg_casos_pagos_cleanup
  BEFORE DELETE ON public.casos_pagos
  FOR EACH ROW EXECUTE FUNCTION public.casos_pagos_cleanup_ingresos();

NOTIFY pgrst, 'reload schema';
