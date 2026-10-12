-- ============================================================================
-- LIMPIEZA DE DATOS DE PRUEBA DEL AGENTE (solo estos teléfonos)
--
-- Se corre en el SQL Editor de Supabase, EN ESTE ORDEN, cada parte por separado:
--   PARTE 1  inventario (solo lectura). Guardá el resultado: es tu respaldo (descargalo como CSV/JSON).
--   PARTE 2  borrado en UNA transacción: si alguna cantidad no coincide con lo esperado, se cancela TODO.
--   PARTE 3  verificación (solo lectura).
--
-- No crea ni modifica tablas, columnas, índices ni triggers. No hace DROP/TRUNCATE/ALTER.
-- No toca: turnos manuales, turnos con reserva pagada o con ingreso vinculado (un trigger de la base
-- borraría el ingreso de finanzas), ni leads que el equipo movió a mano (consulta_realizada, cliente).
--
-- Teléfonos de prueba (se comparan por los últimos 10 dígitos, así que da igual el +, el 9 o el 54):
--   +5493454100816  +5493884867965  +5493885775043  +5493884965060  +5493884673952
-- ============================================================================


-- ============================================================================
-- PARTE 1 — INVENTARIO Y RESPALDO (solo lectura)
-- ============================================================================

-- 1a) Conteos de lo que se va a borrar y de lo que se excluye
WITH t(clave) AS (VALUES ('3454100816'), ('3884867965'), ('3885775043'), ('3884965060'), ('3884673952'))
SELECT 'conversaciones_whatsapp (se borran)' AS que, count(*) AS filas
  FROM public.conversaciones_whatsapp WHERE telefono_clave IN (SELECT clave FROM t)
UNION ALL
SELECT 'leads (se borran)', count(*)
  FROM public.leads WHERE telefono_clave IN (SELECT clave FROM t) AND etapa NOT IN ('consulta_realizada', 'cliente')
UNION ALL
SELECT 'leads EXCLUIDOS (etapa manual)', count(*)
  FROM public.leads WHERE telefono_clave IN (SELECT clave FROM t) AND etapa IN ('consulta_realizada', 'cliente')
UNION ALL
SELECT 'consultas_agendadas (se borran: origen agente, sin pago ni ingreso)', count(*)
  FROM public.consultas_agendadas
  WHERE telefono_clave IN (SELECT clave FROM t) AND origen = 'agente' AND ingreso_reserva_id IS NULL AND COALESCE(reserva_pagada, false) = false
UNION ALL
SELECT 'consultas_agendadas EXCLUIDAS (manual, con pago o con ingreso)', count(*)
  FROM public.consultas_agendadas
  WHERE telefono_clave IN (SELECT clave FROM t)
    AND NOT (origen = 'agente' AND ingreso_reserva_id IS NULL AND COALESCE(reserva_pagada, false) = false);

-- 1b) RESPALDO de las filas que se borran (descargá este resultado antes de seguir)
WITH t(clave) AS (VALUES ('3454100816'), ('3884867965'), ('3885775043'), ('3884965060'), ('3884673952'))
SELECT 'conversaciones_whatsapp' AS tabla, to_jsonb(c) AS fila FROM public.conversaciones_whatsapp c WHERE c.telefono_clave IN (SELECT clave FROM t)
UNION ALL
SELECT 'leads', to_jsonb(l) FROM public.leads l WHERE l.telefono_clave IN (SELECT clave FROM t) AND l.etapa NOT IN ('consulta_realizada', 'cliente')
UNION ALL
SELECT 'consultas_agendadas', to_jsonb(q) FROM public.consultas_agendadas q
  WHERE q.telefono_clave IN (SELECT clave FROM t) AND q.origen = 'agente' AND q.ingreso_reserva_id IS NULL AND COALESCE(q.reserva_pagada, false) = false;

-- 1c) Lo EXCLUIDO, para que lo mires (no se toca)
WITH t(clave) AS (VALUES ('3454100816'), ('3884867965'), ('3885775043'), ('3884965060'), ('3884673952'))
SELECT id, cliente_nombre, telefono, fecha_consulta, hora_consulta, origen, reserva_pagada, ingreso_reserva_id
  FROM public.consultas_agendadas
  WHERE telefono_clave IN (SELECT clave FROM t)
    AND NOT (origen = 'agente' AND ingreso_reserva_id IS NULL AND COALESCE(reserva_pagada, false) = false);

-- 1d) Audios de esas conversaciones (los archivos quedan en el bucket; se pueden borrar a mano desde Storage > conversaciones-audio)
WITH t(clave) AS (VALUES ('3454100816'), ('3884867965'), ('3885775043'), ('3884965060'), ('3884673952'))
SELECT audio_path FROM public.conversaciones_whatsapp WHERE telefono_clave IN (SELECT clave FROM t) AND audio_path IS NOT NULL;


-- ============================================================================
-- PARTE 2 — BORRADO (una sola transacción: si algo no coincide, se cancela todo)
-- Corré esto solo después de guardar el respaldo de la parte 1b.
-- ============================================================================
DO $limpieza$
DECLARE
  claves text[] := ARRAY['3454100816', '3884867965', '3885775043', '3884965060', '3884673952'];
  esp_turnos int; esp_convs int; esp_leads int;
  n int;
BEGIN
  SELECT count(*) INTO esp_turnos FROM public.consultas_agendadas
    WHERE telefono_clave = ANY (claves) AND origen = 'agente' AND ingreso_reserva_id IS NULL AND COALESCE(reserva_pagada, false) = false;
  SELECT count(*) INTO esp_convs FROM public.conversaciones_whatsapp WHERE telefono_clave = ANY (claves);
  SELECT count(*) INTO esp_leads FROM public.leads WHERE telefono_clave = ANY (claves) AND etapa NOT IN ('consulta_realizada', 'cliente');

  -- 1) turnos de prueba
  DELETE FROM public.consultas_agendadas
    WHERE telefono_clave = ANY (claves) AND origen = 'agente' AND ingreso_reserva_id IS NULL AND COALESCE(reserva_pagada, false) = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> esp_turnos THEN RAISE EXCEPTION 'consultas_agendadas: se esperaban % y se borraron %. Se cancela todo.', esp_turnos, n; END IF;

  -- 2) conversaciones
  DELETE FROM public.conversaciones_whatsapp WHERE telefono_clave = ANY (claves);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> esp_convs THEN RAISE EXCEPTION 'conversaciones_whatsapp: se esperaban % y se borraron %. Se cancela todo.', esp_convs, n; END IF;

  -- 3) leads
  DELETE FROM public.leads WHERE telefono_clave = ANY (claves) AND etapa NOT IN ('consulta_realizada', 'cliente');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> esp_leads THEN RAISE EXCEPTION 'leads: se esperaban % y se borraron %. Se cancela todo.', esp_leads, n; END IF;

  RAISE NOTICE 'Listo: % turnos, % conversaciones y % leads borrados.', esp_turnos, esp_convs, esp_leads;
END
$limpieza$;


-- ============================================================================
-- PARTE 3 — VERIFICACIÓN (solo lectura): todo en 0, salvo lo excluido
-- ============================================================================
WITH t(clave) AS (VALUES ('3454100816'), ('3884867965'), ('3885775043'), ('3884965060'), ('3884673952'))
SELECT 'conversaciones_whatsapp' AS tabla, count(*) AS quedan FROM public.conversaciones_whatsapp WHERE telefono_clave IN (SELECT clave FROM t)
UNION ALL SELECT 'leads', count(*) FROM public.leads WHERE telefono_clave IN (SELECT clave FROM t)
UNION ALL SELECT 'consultas_agendadas', count(*) FROM public.consultas_agendadas WHERE telefono_clave IN (SELECT clave FROM t);
