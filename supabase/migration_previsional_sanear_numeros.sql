-- ============================================================================
-- FIX: limpia valores numéricos fuera de rango que pueden estar provocando
-- "numeric field overflow" al actualizar clientes_previsional.
-- Seguro de correr varias veces.
-- ============================================================================

-- 1) Diagnóstico previo: ver filas con valores raros
SELECT id, apellido_nombre, cobro_total, monto_cobrado,
       meses_moratoria_24476, meses_moratoria_27705, hijos
FROM public.clientes_previsional
WHERE cobro_total > 9999999999.99
   OR monto_cobrado > 9999999999.99
   OR cobro_total < 0
   OR monto_cobrado < 0
   OR meses_moratoria_24476 < 0
   OR meses_moratoria_27705 < 0
   OR hijos < 0;

-- 2) Saneo: poner a 0 cualquier valor fuera de rango.
UPDATE public.clientes_previsional
SET cobro_total = 0
WHERE cobro_total IS NULL OR cobro_total < 0 OR cobro_total > 9999999999.99;

UPDATE public.clientes_previsional
SET monto_cobrado = 0
WHERE monto_cobrado IS NULL OR monto_cobrado < 0 OR monto_cobrado > 9999999999.99;

UPDATE public.clientes_previsional
SET meses_moratoria_24476 = 0
WHERE meses_moratoria_24476 IS NULL OR meses_moratoria_24476 < 0 OR meses_moratoria_24476 > 9999;

UPDATE public.clientes_previsional
SET meses_moratoria_27705 = 0
WHERE meses_moratoria_27705 IS NULL OR meses_moratoria_27705 < 0 OR meses_moratoria_27705 > 9999;

UPDATE public.clientes_previsional
SET hijos = 0
WHERE hijos IS NULL OR hijos < 0 OR hijos > 99;

-- 3) Asegurar que monto_cobrado <= cobro_total (el saldo_pendiente es generated)
UPDATE public.clientes_previsional
SET monto_cobrado = cobro_total
WHERE monto_cobrado > cobro_total;
