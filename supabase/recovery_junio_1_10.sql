-- ============================================================
-- SCRIPT DE RECUPERACIÓN: Datos junio 1-10 eliminados por cierre incorrecto
-- Ejecutar en Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- PASO 0: Verificar qué cierres existen y cuántos registros tienen
-- Ejecutá esto primero para confirmar el periodo del cierre incorrecto.
SELECT
  periodo,
  fecha_cierre,
  jsonb_array_length(snapshot->'ingresos')   AS cant_ingresos_snapshot,
  jsonb_array_length(snapshot->'egresos')    AS cant_egresos_snapshot,
  jsonb_array_length(snapshot->'movimientos') AS cant_movimientos_snapshot
FROM cierres_mes_finanzas
ORDER BY fecha_cierre DESC;

-- ============================================================
-- REEMPLAZÁ '2026-06' en los WHERE por el periodo real del cierre
-- si el valor que ves en PASO 0 es diferente.
-- ============================================================

-- PASO 1: Restaurar INGRESOS del 01/06 al 10/06 desde el snapshot
INSERT INTO ingresos_operativos (
  id, fecha, cliente_nombre, tipo_cliente, monto, modalidad,
  doctor_cobra, receptor_transfer, rama, fuente, concepto,
  observaciones, created_at, updated_at, created_by, updated_by
)
SELECT
  (elem->>'id')::uuid,
  (elem->>'fecha')::date,
  elem->>'cliente_nombre',
  elem->>'tipo_cliente',
  (elem->>'monto')::numeric,
  elem->>'modalidad',
  elem->>'doctor_cobra',
  elem->>'receptor_transfer',
  elem->>'rama',
  elem->>'fuente',
  elem->>'concepto',
  elem->>'observaciones',
  COALESCE((elem->>'created_at')::timestamptz, NOW()),
  COALESCE((elem->>'updated_at')::timestamptz, NOW()),
  (elem->>'created_by')::uuid,
  (elem->>'updated_by')::uuid
FROM cierres_mes_finanzas,
     jsonb_array_elements(snapshot->'ingresos') AS elem
WHERE periodo = '2026-06'
  AND (elem->>'fecha') >= '2026-06-01'
  AND (elem->>'fecha') <= '2026-06-10'
ON CONFLICT (id) DO NOTHING;

-- PASO 2: Restaurar EGRESOS del 01/06 al 10/06 desde el snapshot
INSERT INTO egresos_v2 (
  id, fecha, tipo, concepto, detalle, monto, modalidad,
  pagador, beneficiario, observaciones, created_at, updated_at
)
SELECT
  (elem->>'id')::uuid,
  (elem->>'fecha')::date,
  elem->>'tipo',
  elem->>'concepto',
  elem->>'detalle',
  (elem->>'monto')::numeric,
  elem->>'modalidad',
  elem->>'pagador',
  elem->>'beneficiario',
  elem->>'observaciones',
  COALESCE((elem->>'created_at')::timestamptz, NOW()),
  COALESCE((elem->>'updated_at')::timestamptz, NOW())
FROM cierres_mes_finanzas,
     jsonb_array_elements(snapshot->'egresos') AS elem
WHERE periodo = '2026-06'
  AND (elem->>'fecha') >= '2026-06-01'
  AND (elem->>'fecha') <= '2026-06-10'
ON CONFLICT (id) DO NOTHING;

-- PASO 3: Restaurar MOVIMIENTOS DE CAJA del 01/06 al 10/06 desde el snapshot
INSERT INTO movimientos_caja (
  id, fecha, socio_origen, socio_destino, monto,
  tipo_origen, tipo_destino, observaciones, created_at
)
SELECT
  (elem->>'id')::uuid,
  (elem->>'fecha')::date,
  elem->>'socio_origen',
  elem->>'socio_destino',
  (elem->>'monto')::numeric,
  elem->>'tipo_origen',
  elem->>'tipo_destino',
  elem->>'observaciones',
  COALESCE((elem->>'created_at')::timestamptz, NOW())
FROM cierres_mes_finanzas,
     jsonb_array_elements(snapshot->'movimientos') AS elem
WHERE periodo = '2026-06'
  AND (elem->>'fecha') >= '2026-06-01'
  AND (elem->>'fecha') <= '2026-06-10'
ON CONFLICT (id) DO NOTHING;

-- PASO 4: Eliminar el cierre incorrecto para poder rehacerlo bien
-- (los datos del snapshot siguen en backup hasta acá, después de este DELETE ya no)
DELETE FROM cierres_mes_finanzas WHERE periodo = '2026-06';

-- PASO 5: Verificar que los registros quedaron restaurados
SELECT COUNT(*), 'ingresos' AS tabla FROM ingresos_operativos WHERE fecha BETWEEN '2026-06-01' AND '2026-06-10'
UNION ALL
SELECT COUNT(*), 'egresos'  AS tabla FROM egresos_v2          WHERE fecha BETWEEN '2026-06-01' AND '2026-06-10'
UNION ALL
SELECT COUNT(*), 'movimientos' AS tabla FROM movimientos_caja  WHERE fecha BETWEEN '2026-06-01' AND '2026-06-10';
