-- ============================================================================
-- MIGRACION PUNTUAL: Pasar 16 casos de "Casos Generales (Seguimiento)" a
-- "Casos Federales".
--
-- Origen: public.casos_generales (16 titulos listados)
-- Destino: public.clientes_federales (pipeline = 'seguimiento')
--
-- Reglas de mapeo:
--   apellido_nombre        <- casos_generales.titulo
--   numero_expediente      <- casos_generales.expediente
--   tipo_caso (text[])     <- ['reajuste_movilidad'] si tipo_caso = previsional
--                             ['otros']               en cualquier otro caso
--   tipo_caso_otros        <- casos_generales.tipo_caso (texto original) cuando no es previsional
--   situacion_actual       <- casos_generales.actualizacion (si tiene)
--   url_drive              <- casos_generales.url_drive
--   captado_por            <- casos_generales.abogado
--   pipeline               <- 'seguimiento'
--
-- Idempotente: si ya existe un cliente_federal con el mismo apellido_nombre,
-- NO se vuelve a insertar (pero igual se borra de casos_generales para
-- evitar duplicados visuales).
--
-- Seguro: corre todo dentro de una transaccion. Si algo falla, ROLLBACK.
-- ============================================================================

BEGIN;

WITH targets AS (
  SELECT
    id,
    titulo,
    expediente,
    abogado,
    tipo_caso,
    url_drive,
    actualizacion
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
    apellido_nombre,
    numero_expediente,
    tipo_caso,
    tipo_caso_otros,
    situacion_actual,
    url_drive,
    captado_por,
    pipeline,
    pipeline_fecha_ingreso
  )
  SELECT
    t.titulo,
    NULLIF(t.expediente, ''),
    CASE
      WHEN lower(coalesce(t.tipo_caso, '')) LIKE 'previsional%' THEN ARRAY['reajuste_movilidad']::text[]
      ELSE ARRAY['otros']::text[]
    END,
    CASE
      WHEN lower(coalesce(t.tipo_caso, '')) LIKE 'previsional%' THEN NULL
      ELSE NULLIF(t.tipo_caso, '')
    END,
    NULLIF(t.actualizacion, ''),
    NULLIF(t.url_drive, ''),
    NULLIF(t.abogado, ''),
    'seguimiento',
    now()
  FROM targets t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clientes_federales cf
    WHERE upper(cf.apellido_nombre) = upper(t.titulo)
  )
  RETURNING id, apellido_nombre
),
del AS (
  DELETE FROM public.casos_generales
  WHERE id IN (SELECT id FROM targets)
  RETURNING id, titulo
)
SELECT
  (SELECT count(*) FROM targets) AS encontrados_en_casos_generales,
  (SELECT count(*) FROM ins)     AS insertados_en_federales,
  (SELECT count(*) FROM del)     AS borrados_de_casos_generales;

-- Si los numeros lucen bien (encontrados = borrados = 16), hace COMMIT.
-- Si algo no coincide, hace ROLLBACK y avisame.
COMMIT;
