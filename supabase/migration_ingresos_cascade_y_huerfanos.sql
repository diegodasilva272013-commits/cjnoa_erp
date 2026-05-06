-- ============================================================================
-- Limpia ingresos huérfanos (de casos eliminados) y cambia la FK a CASCADE
-- para que en adelante, al borrar un caso, sus ingresos se borren solos.
-- Seguro de correr varias veces.
-- ============================================================================

-- 1) Diagnóstico previo (opcional)
SELECT COUNT(*) AS huerfanos_autogenerados
FROM public.ingresos
WHERE es_manual = false
  AND caso_id IS NULL;

SELECT COUNT(*) AS apuntan_a_caso_inexistente
FROM public.ingresos i
WHERE i.caso_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.casos c WHERE c.id = i.caso_id);

-- 2) Borrar ingresos auto-generados sin caso (huérfanos por SET NULL previo)
DELETE FROM public.ingresos
WHERE es_manual = false
  AND caso_id IS NULL;

-- 3) Borrar ingresos cuyo caso ya no existe (defensa por si la FK estaba rota)
DELETE FROM public.ingresos i
WHERE i.caso_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.casos c WHERE c.id = i.caso_id);

-- 4) Cambiar la FK a ON DELETE CASCADE
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname = 'ingresos'
    AND con.contype = 'f'
    AND pg_get_constraintdef(con.oid) ILIKE '%REFERENCES casos%caso_id%'
  LIMIT 1;

  IF v_conname IS NULL THEN
    -- Buscar por columna caso_id como fallback
    SELECT con.conname INTO v_conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE ns.nspname = 'public'
      AND rel.relname = 'ingresos'
      AND con.contype = 'f'
      AND att.attname = 'caso_id'
    LIMIT 1;
  END IF;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ingresos DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE public.ingresos
    ADD CONSTRAINT ingresos_caso_id_fkey
    FOREIGN KEY (caso_id) REFERENCES public.casos(id) ON DELETE CASCADE;
END $$;

-- 5) Verificación final
SELECT COUNT(*) AS quedan_huerfanos
FROM public.ingresos
WHERE es_manual = false
  AND caso_id IS NULL;
