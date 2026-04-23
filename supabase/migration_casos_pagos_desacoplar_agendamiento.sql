-- ============================================================================
-- MIGRATION: Desacoplar agendamiento historico de CASOS-PAGOS
-- Objetivos:
--   - Backfillear consultas_agendadas con los agendamientos ya cargados en casos_pagos
--   - Dejar a casos_pagos sincronizando solo el ingreso de saldo comercial
-- ============================================================================

CREATE OR REPLACE FUNCTION public.casos_pagos_sync_ingresos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_saldo boolean := false;
  v_new_saldo_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_saldo := COALESCE(OLD.saldo_pagado, false);
  END IF;

  IF NEW.saldo_pagado = true AND COALESCE(NEW.saldo_monto_real, 0) > 0 THEN
    IF NEW.ingreso_saldo_id IS NULL THEN
      INSERT INTO public.ingresos (
        caso_id, fecha, cliente_nombre, concepto,
        monto_total, monto_cj_noa, socio_cobro, modalidad, es_manual
      ) VALUES (
        NEW.caso_id,
        COALESCE(NEW.fecha_carga, current_date),
        NEW.cliente_nombre,
        'Saldo consulta - ' || COALESCE(NEW.cliente_nombre, ''),
        NEW.saldo_monto_real,
        NEW.saldo_monto_real,
        NEW.socio_carga,
        NEW.saldo_modalidad,
        false
      ) RETURNING id INTO v_new_saldo_id;

      NEW.ingreso_saldo_id := v_new_saldo_id;
    ELSE
      UPDATE public.ingresos SET
        caso_id = NEW.caso_id,
        fecha = COALESCE(NEW.fecha_carga, current_date),
        cliente_nombre = NEW.cliente_nombre,
        concepto = 'Saldo consulta - ' || COALESCE(NEW.cliente_nombre, ''),
        monto_total = NEW.saldo_monto_real,
        monto_cj_noa = NEW.saldo_monto_real,
        socio_cobro = NEW.socio_carga,
        modalidad = NEW.saldo_modalidad
      WHERE id = NEW.ingreso_saldo_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND v_old_saldo = true AND NEW.saldo_pagado = false AND OLD.ingreso_saldo_id IS NOT NULL THEN
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_saldo_id;
    NEW.ingreso_saldo_id := NULL;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.casos_pagos_cleanup_ingresos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.ingreso_saldo_id IS NOT NULL THEN
    DELETE FROM public.ingresos WHERE id = OLD.ingreso_saldo_id;
  END IF;
  RETURN OLD;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'consultas_agendadas'
  ) THEN
    INSERT INTO public.consultas_agendadas (
      cliente_nombre,
      telefono,
      detalle_consulta,
      socio_carga,
      fecha_carga,
      fecha_consulta,
      hora_consulta,
      abogado_asignado,
      monto_reserva,
      monto_a_cancelar,
      reserva_pagada,
      reserva_modalidad,
      observaciones,
      ingreso_reserva_id,
      created_at,
      created_by,
      updated_at,
      updated_by
    )
    SELECT
      cp.cliente_nombre,
      cp.telefono,
      cp.detalle_consulta,
      cp.socio_carga,
      cp.fecha_carga,
      COALESCE(cp.fecha_consulta, cp.fecha_carga),
      cp.hora_consulta,
      cp.abogado_asignado,
      COALESCE(cp.monto_reserva, 0),
      COALESCE(cp.monto_a_cancelar, 0),
      COALESCE(cp.reserva_pagada, false),
      cp.reserva_modalidad,
      cp.observaciones,
      cp.ingreso_reserva_id,
      cp.created_at,
      cp.created_by,
      cp.updated_at,
      cp.updated_by
    FROM public.casos_pagos cp
    WHERE (
      cp.fecha_consulta IS NOT NULL
      OR cp.hora_consulta IS NOT NULL
      OR cp.abogado_asignado IS NOT NULL
      OR COALESCE(cp.monto_reserva, 0) > 0
      OR COALESCE(cp.monto_a_cancelar, 0) > 0
      OR COALESCE(cp.detalle_consulta, '') <> ''
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.consultas_agendadas ca
      WHERE ca.cliente_nombre = cp.cliente_nombre
        AND ca.fecha_carga = cp.fecha_carga
        AND ca.fecha_consulta = COALESCE(cp.fecha_consulta, cp.fecha_carga)
        AND COALESCE(ca.hora_consulta::text, '') = COALESCE(cp.hora_consulta::text, '')
        AND COALESCE(ca.abogado_asignado, '') = COALESCE(cp.abogado_asignado, '')
        AND COALESCE(ca.monto_reserva, 0) = COALESCE(cp.monto_reserva, 0)
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';