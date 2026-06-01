-- ============================================================================
-- V3: mover casos generales -> clientes federales INCLUYENDO notas.
-- Compatible con Supabase SQL Editor: una sola sentencia, sin TEMP TABLE,
-- sin BEGIN/COMMIT manual (la atomicidad la da el wrapper de Supabase).
--
-- Orden correcto:
--   1) ins:        INSERT en clientes_federales (los que aun no existen)
--   2) mapeo:      pares (caso_general.id, cliente_fed.id) — toma de "ins"
--                  los recien creados Y ademas hace un fallback contra
--                  clientes_federales por si alguno ya existia (re-run).
--   3) copy_notas: INSERT en clientes_federales_notas leyendo de
--                  caso_general_notas. ESTO TIENE QUE PASAR ANTES DEL DELETE.
--   4) del:        DELETE de casos_generales (CASCADE borra las notas viejas,
--                  pero ya las copiamos en el paso 3).
--
-- Truco clave: el INSERT data-modifying en CTE devuelve las filas via
-- RETURNING, y los CTEs siguientes leen DESDE ESE RETURNING. Asi mapeo y
-- copy_notas ven los nuevos clientes federales aunque PG use el snapshot
-- previo de la tabla.
-- ============================================================================

WITH targets AS (
  SELECT id, titulo, expediente, abogado, tipo_caso, url_drive, actualizacion
  FROM public.casos_generales
  WHERE archivado = false
    AND (
         titulo ILIKE 'AGUILAR JAVIER CRESENCIO%'
      OR titulo ILIKE 'BARRERA LIDIA TERESA%'
      OR titulo ILIKE 'BARRIONUEVO JOSE ANGEL%'
      OR titulo ILIKE 'CALIZAYA ANGELICA VICTORIA%'
      OR titulo ILIKE 'CORSANIGO ALDO DANIEL%'
      OR titulo ILIKE 'FARFAN ILDA ELSA%'
      OR titulo ILIKE 'FRASCA CARLOS DOMINGO%'
      OR titulo ILIKE 'LLAMPA LEANDRO EUFRASIO%'
      OR titulo ILIKE 'MARTINEZ ANTONIA%'
      OR titulo ILIKE 'MENDOZA MARIA DEL ROSARIO%'
      OR titulo ILIKE 'PUCHETA MANUEL CESAR%'
      OR titulo ILIKE 'Quipildor filiacion%'
      OR titulo ILIKE 'RAMOS BERTA ALICIA%'
      OR titulo ILIKE 'VARGAS OSCAL FIDEL%'
      OR titulo ILIKE 'VILLALOBOS GREGORIA%'
      OR titulo ILIKE 'ZAPANA LUISA DINA%'
    )
),
ins AS (
  INSERT INTO public.clientes_federales (
    apellido_nombre, numero_expediente, tipo_caso, tipo_caso_otros,
    situacion_actual, url_drive, captado_por, pipeline, pipeline_fecha_ingreso
  )
  SELECT
    t.titulo,
    NULLIF(t.expediente,''),
    CASE WHEN lower(coalesce(t.tipo_caso,'')) LIKE 'previsional%'
         THEN ARRAY['reajuste_movilidad']::text[]
         ELSE ARRAY['otros']::text[] END,
    CASE WHEN lower(coalesce(t.tipo_caso,'')) LIKE 'previsional%'
         THEN NULL ELSE NULLIF(t.tipo_caso,'') END,
    NULLIF(t.actualizacion,''),
    NULLIF(t.url_drive,''),
    NULLIF(t.abogado,''),
    'seguimiento',
    now()
  FROM targets t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clientes_federales cf
    WHERE upper(cf.apellido_nombre) = upper(t.titulo)
  )
  RETURNING id, apellido_nombre
),
-- mapeo: une cada caso_general con su cliente_federal.
-- Primero busca match en "ins" (recien creados).
-- Si no, fallback a clientes_federales (snapshot pre-ins) para re-runs.
mapeo AS (
  SELECT t.id AS caso_general_id, i.id AS cliente_fed_id, t.titulo
  FROM targets t
  JOIN ins i ON upper(i.apellido_nombre) = upper(t.titulo)
  UNION
  SELECT t.id AS caso_general_id, cf.id AS cliente_fed_id, t.titulo
  FROM targets t
  JOIN public.clientes_federales cf
    ON upper(cf.apellido_nombre) = upper(t.titulo)
  WHERE NOT EXISTS (
    SELECT 1 FROM ins i WHERE upper(i.apellido_nombre) = upper(t.titulo)
  )
),
copy_notas AS (
  INSERT INTO public.clientes_federales_notas (
    cliente_fed_id, contenido, audio_path, editado, created_by, created_at, updated_at
  )
  SELECT
    m.cliente_fed_id,
    n.contenido,
    n.audio_path,
    n.editado,
    n.created_by,
    n.created_at,
    n.updated_at
  FROM public.caso_general_notas n
  JOIN mapeo m ON m.caso_general_id = n.caso_id
  RETURNING id
),
del AS (
  DELETE FROM public.casos_generales
  WHERE id IN (SELECT caso_general_id FROM mapeo)
  RETURNING id
)
SELECT
  (SELECT count(*) FROM targets)    AS encontrados,
  (SELECT count(*) FROM ins)        AS clientes_creados,
  (SELECT count(*) FROM mapeo)      AS mapeados,
  (SELECT count(*) FROM copy_notas) AS notas_copiadas,
  (SELECT count(*) FROM del)        AS casos_borrados;
