-- ============================================================================
-- MIGRATION: Modulo Agendamiento (separado de CASOS-PAGOS)
-- Flujo:
--   - Registra consultas antes de que exista un caso de trabajo o un caso comercial
--   - Si la reserva se cobra, genera / sincroniza un ingreso automatico
-- Visibilidad: empleados, socios y administradores
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.consultas_agendadas (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_nombre text NOT NULL,
  telefono text,
  detalle_consulta text,
  socio_carga text NOT NULL CHECK (socio_carga IN ('Rodrigo','Noelia','Fabricio','Alejandro')),
  fecha_carga date NOT NULL DEFAULT current_date,
  fecha_consulta date NOT NULL,
  hora_consulta time,
  abogado_asignado text,
  monto_reserva numeric(12,2) DEFAULT 0,
  monto_a_cancelar numeric(12,2) DEFAULT 0,
  reserva_pagada boolean DEFAULT false,
  reserva_modalidad text CHECK (reserva_modalidad IN ('Efectivo','Transferencia') OR reserva_modalidad IS NULL),
  observaciones text,
  ingreso_reserva_id uuid REFERENCES public.ingresos(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.perfiles(id)
);

CREATE INDEX IF NOT EXISTS idx_consultas_agendadas_fecha_consulta ON public.consultas_agendadas(fecha_consulta);
CREATE INDEX IF NOT EXISTS idx_consultas_agendadas_socio_carga ON public.consultas_agendadas(socio_carga);

ALTER TABLE public.consultas_agendadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consultas_agendadas_select" ON public.consultas_agendadas;
DROP POLICY IF EXISTS "consultas_agendadas_insert" ON public.consultas_agendadas;
DROP POLICY IF EXISTS "consultas_agendadas_update" ON public.consultas_agendadas;
DROP POLICY IF EXISTS "consultas_agendadas_delete" ON public.consultas_agendadas;

CREATE POLICY "consultas_agendadas_select" ON public.consultas_agendadas
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('empleado', 'socio', 'admin')));

CREATE POLICY "consultas_agendadas_insert" ON public.consultas_agendadas
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('empleado', 'socio', 'admin')));

CREATE POLICY "consultas_agendadas_update" ON public.consultas_agendadas
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('empleado', 'socio', 'admin')));

CREATE POLICY "consultas_agendadas_delete" ON public.consultas_agendadas
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('empleado', 'socio', 'admin')));

CREATE OR REPLACE FUNCTION public.consultas_agendadas_set_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_consultas_agendadas_updated ON public.consultas_agendadas;
CREATE TRIGGER trg_consultas_agendadas_updated
  BEFORE UPDATE ON public.consultas_agendadas
  FOR EACH ROW EXECUTE FUNCTION public.consultas_agendadas_set_updated();

CREATE OR REPLACE FUNCTION public.consultas_agendadas_sync_ingresos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_reserva boolean := false;
  v_new_ingreso_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_reserva := COALESCE(OLD.reserva_pagada, false);
  END IF;

  IF NEW.reserva_pagada = true AND COALESCE(NEW.monto_reserva, 0) > 0 THEN
    IF NEW.ingreso_reserva_id IS NULL THEN
      INSERT INTO public.ingresos (
        caso_id, fecha, cliente_nombre, concepto,
        monto_total, monto_cj_noa, socio_cobro, modalidad, es_manual
      ) VALUES (
        NULL,
        COALESCE(NEW.fecha_consulta, NEW.fecha_carga, current_date),
        NEW.cliente_nombre,
        'Reserva consulta agendada - ' || COALESCE(NEW.cliente_nombre, ''),
        NEW.monto_reserva,
        NEW.monto_reserva,
        NEW.socio_carga,
        NEW.reserva_modalidad,
        false
      ) RETURNING id INTO v_new_ingreso_id;

      NEW.ingreso_reserva_id := v_new_ingreso_id;
    ELSE
      UPDATE public.ingresos SET
        fecha = COALESCE(NEW.fecha_consulta, NEW.fecha_carga, current_date),
        cliente_nombre = NEW.cliente_nombre,
        concepto = 'Reserva consulta agendada - ' || COALESCE(NEW.cliente_nombre, ''),
        monto_total = NEW.monto_reserva,
        monto_cj_noa = NEW.monto_reserva,
        socio_cobro = NEW.socio_carga,
        modalidad = NEW.reserva_modalidad
      WHERE id = NEW.ingreso_reserva_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND v_old_reserva = true AND NEW.reserva_pagada = false AND OLD.ingreso_reserva_id IS NOT NULL THEN
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_reserva_id;
    NEW.ingreso_reserva_id := NULL;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_consultas_agendadas_sync_ingresos ON public.consultas_agendadas;
CREATE TRIGGER trg_consultas_agendadas_sync_ingresos
  BEFORE INSERT OR UPDATE ON public.consultas_agendadas
  FOR EACH ROW EXECUTE FUNCTION public.consultas_agendadas_sync_ingresos();

CREATE OR REPLACE FUNCTION public.consultas_agendadas_cleanup_ingresos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.ingreso_reserva_id IS NOT NULL THEN
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_reserva_id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_consultas_agendadas_cleanup ON public.consultas_agendadas;
CREATE TRIGGER trg_consultas_agendadas_cleanup
  BEFORE DELETE ON public.consultas_agendadas
  FOR EACH ROW EXECUTE FUNCTION public.consultas_agendadas_cleanup_ingresos();

NOTIFY pgrst, 'reload schema';