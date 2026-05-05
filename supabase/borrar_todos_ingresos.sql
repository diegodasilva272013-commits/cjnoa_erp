-- ============================================================================
-- BORRA TODOS LOS REGISTROS DE INGRESOS
-- ⚠️  ACCIÓN IRREVERSIBLE. Hacé backup antes si dudás.
-- ============================================================================

-- 1) (opcional) Ver cuántas filas vas a borrar
SELECT COUNT(*) AS total_a_borrar FROM public.ingresos;

-- 2) Desvincular referencias para que el delete no falle por FKs
UPDATE public.consultas_agendadas SET ingreso_reserva_id = NULL WHERE ingreso_reserva_id IS NOT NULL;
UPDATE public.casos_pagos         SET ingreso_saldo_id   = NULL WHERE ingreso_saldo_id   IS NOT NULL;

-- 3) Borrar todos los ingresos
DELETE FROM public.ingresos;

-- 4) Verificar
SELECT COUNT(*) AS quedan FROM public.ingresos;
