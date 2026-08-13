-- ============================================================
-- RECUPERACIÓN v2: datos de ingresos/egresos/movimientos del
-- 01/06 al 10/06/2026 eliminados por el cierre defectuoso.
--
-- Reemplaza a recovery_junio_1_10.sql (nunca se llegó a correr).
-- Esta versión agrega un paso que el script viejo NO tenía y que
-- es crítico: las tablas ingresos_operativos y egresos_v2 tienen
-- triggers que suman/restan automáticamente el saldo de cada socio
-- en cuentas_socio cuando se INSERTA una fila. Esos triggers NO se
-- revirtieron cuando el cierre borró las filas en su momento (no
-- existe un trigger de reversión en DELETE), así que cuentas_socio
-- HOY YA tiene contabilizado ese dinero. Si insertamos las filas
-- de nuevo sin desactivar los triggers, se duplicaría el saldo de
-- cada socio. Por eso los pasos 2-4 corren dentro de una misma
-- transacción con los triggers apagados.
--
-- Ejecutar en Supabase Dashboard → SQL Editor, PASO A PASO,
-- en el orden que está escrito. No saltear pasos.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PASO 0: Confirmar que el cierre defectuoso es el periodo '2026-06'
-- y ver cuántos registros trae el snapshot en total (mayo + junio).
-- ────────────────────────────────────────────────────────────
SELECT
  periodo,
  fecha_cierre,
  jsonb_array_length(snapshot->'ingresos')    AS cant_ingresos_snapshot,
  jsonb_array_length(snapshot->'egresos')     AS cant_egresos_snapshot,
  jsonb_array_length(snapshot->'movimientos') AS cant_movimientos_snapshot
FROM cierres_mes_finanzas
ORDER BY fecha_cierre DESC;

-- Si el periodo que aparece con fecha de cierre más reciente NO es
-- '2026-06', pará acá y avisame el valor real antes de seguir:
-- hay que reemplazar '2026-06' por ese valor en todos los pasos
-- siguientes.


-- ────────────────────────────────────────────────────────────
-- PASO 0b: Saldo ACTUAL de cada socio (foto antes de restaurar).
-- Guardá este resultado — lo vamos a comparar después del PASO 3
-- para confirmar que no se duplicó nada.
-- ────────────────────────────────────────────────────────────
SELECT socio, saldo_digital, saldo_efectivo, updated_at
FROM cuentas_socio
ORDER BY socio;


-- ────────────────────────────────────────────────────────────
-- PASO 1, 2 y 3 van en UNA sola transacción: se apagan los
-- triggers de saldo, se insertan las filas de junio 1-10 desde
-- el snapshot, y se prenden los triggers de nuevo. Todo o nada.
-- ────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE public.ingresos_operativos DISABLE TRIGGER tg_ingreso_a_cuenta;
ALTER TABLE public.egresos_v2          DISABLE TRIGGER tg_egreso_a_cuenta;
ALTER TABLE public.movimientos_caja    DISABLE TRIGGER tg_permuta_a_cuenta;

-- Restaurar INGRESOS del 01/06 al 10/06
INSERT INTO ingresos_operativos (
  id, fecha, cliente_nombre, tipo_cliente, monto, modalidad,
  doctor_cobra, receptor_transfer, rama, fuente, concepto,
  observaciones, created_at, updated_at, created_by, updated_by
)
SELECT
  (elem->>'id')::uuid,
  (elem->>'fecha')::date,
  elem->>'cliente_nombre',
  (elem->>'tipo_cliente')::tipo_cliente_ingreso,
  (elem->>'monto')::numeric,
  (elem->>'modalidad')::modalidad_pago,
  (elem->>'doctor_cobra')::socio_finanzas,
  NULLIF(elem->>'receptor_transfer','')::socio_finanzas,
  (elem->>'rama')::rama_legal,
  (elem->>'fuente')::fuente_ingreso,
  (elem->>'concepto')::concepto_ingreso,
  elem->>'observaciones',
  COALESCE((elem->>'created_at')::timestamptz, NOW()),
  COALESCE((elem->>'updated_at')::timestamptz, NOW()),
  NULLIF(elem->>'created_by','')::uuid,
  NULLIF(elem->>'updated_by','')::uuid
FROM cierres_mes_finanzas,
     jsonb_array_elements(snapshot->'ingresos') AS elem
WHERE periodo = '2026-06'
  AND (elem->>'fecha') >= '2026-06-01'
  AND (elem->>'fecha') <= '2026-06-10'
ON CONFLICT (id) DO NOTHING;

-- Restaurar EGRESOS del 01/06 al 10/06
INSERT INTO egresos_v2 (
  id, fecha, tipo, concepto, detalle, monto, modalidad,
  pagador, beneficiario, observaciones, created_at, updated_at,
  created_by, updated_by
)
SELECT
  (elem->>'id')::uuid,
  (elem->>'fecha')::date,
  (elem->>'tipo')::tipo_egreso,
  elem->>'concepto',
  elem->>'detalle',
  (elem->>'monto')::numeric,
  (elem->>'modalidad')::modalidad_pago,
  NULLIF(elem->>'pagador','')::socio_finanzas,
  elem->>'beneficiario',
  elem->>'observaciones',
  COALESCE((elem->>'created_at')::timestamptz, NOW()),
  COALESCE((elem->>'updated_at')::timestamptz, NOW()),
  NULLIF(elem->>'created_by','')::uuid,
  NULLIF(elem->>'updated_by','')::uuid
FROM cierres_mes_finanzas,
     jsonb_array_elements(snapshot->'egresos') AS elem
WHERE periodo = '2026-06'
  AND (elem->>'fecha') >= '2026-06-01'
  AND (elem->>'fecha') <= '2026-06-10'
ON CONFLICT (id) DO NOTHING;

-- Restaurar MOVIMIENTOS DE CAJA del 01/06 al 10/06
INSERT INTO movimientos_caja (
  id, fecha, socio_origen, socio_destino, monto,
  tipo_origen, tipo_destino, observaciones, created_at, created_by
)
SELECT
  (elem->>'id')::uuid,
  (elem->>'fecha')::date,
  (elem->>'socio_origen')::socio_finanzas,
  (elem->>'socio_destino')::socio_finanzas,
  (elem->>'monto')::numeric,
  (elem->>'tipo_origen')::modalidad_pago,
  (elem->>'tipo_destino')::modalidad_pago,
  elem->>'observaciones',
  COALESCE((elem->>'created_at')::timestamptz, NOW()),
  NULLIF(elem->>'created_by','')::uuid
FROM cierres_mes_finanzas,
     jsonb_array_elements(snapshot->'movimientos') AS elem
WHERE periodo = '2026-06'
  AND (elem->>'fecha') >= '2026-06-01'
  AND (elem->>'fecha') <= '2026-06-10'
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ingresos_operativos ENABLE TRIGGER tg_ingreso_a_cuenta;
ALTER TABLE public.egresos_v2          ENABLE TRIGGER tg_egreso_a_cuenta;
ALTER TABLE public.movimientos_caja    ENABLE TRIGGER tg_permuta_a_cuenta;

COMMIT;


-- ────────────────────────────────────────────────────────────
-- PASO 4: Verificar que los registros quedaron restaurados
-- (compará estas cantidades contra cant_ingresos_snapshot /
-- cant_egresos_snapshot / cant_movimientos_snapshot del PASO 0
-- MENOS los que correspondían a mayo — el resto es lo de junio).
-- ────────────────────────────────────────────────────────────
SELECT COUNT(*), 'ingresos' AS tabla FROM ingresos_operativos WHERE fecha BETWEEN '2026-06-01' AND '2026-06-10'
UNION ALL
SELECT COUNT(*), 'egresos' AS tabla FROM egresos_v2          WHERE fecha BETWEEN '2026-06-01' AND '2026-06-10'
UNION ALL
SELECT COUNT(*), 'movimientos' AS tabla FROM movimientos_caja WHERE fecha BETWEEN '2026-06-01' AND '2026-06-10';

-- Y que mayo (12/05 al 31/05) sigue intacto, sin tocar:
SELECT COUNT(*), 'ingresos_mayo' AS tabla FROM ingresos_operativos WHERE fecha BETWEEN '2026-05-12' AND '2026-05-31';


-- ────────────────────────────────────────────────────────────
-- PASO 5: Confirmar que cuentas_socio NO se duplicó — este
-- resultado debe ser IGUAL al del PASO 0b (mismo saldo).
-- ────────────────────────────────────────────────────────────
SELECT socio, saldo_digital, saldo_efectivo, updated_at
FROM cuentas_socio
ORDER BY socio;


-- ════════════════════════════════════════════════════════════
-- PASO 6 (recién correr esto cuando el PASO 4 y 5 ya se vieron
-- bien): borrar el cierre defectuoso para poder rehacerlo con
-- el rango correcto 12/05 al 10/06 desde la app.
-- Después de este DELETE los datos YA NO están en el snapshot,
-- solo en las tablas activas restauradas arriba.
-- ════════════════════════════════════════════════════════════
-- DELETE FROM cierres_mes_finanzas WHERE periodo = '2026-06';
