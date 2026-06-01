-- ============================================================================
-- VERSION CORREGIDA: mover casos de casos_generales a clientes_federales
-- INCLUYENDO sus notas/seguimientos (caso_general_notas -> clientes_federales_notas).
--
-- IMPORTANTE: usar SOLO despues de restaurar backup. La version anterior
-- (migration_mover_16_a_federales.sql) borraba las notas por ON DELETE CASCADE.
--
-- Orden correcto:
--   1) crear los clientes_federales
--   2) copiar caso_general_notas -> clientes_federales_notas (mapeando caso_id -> cliente_fed_id)
--   3) recien ahi borrar de casos_generales (el CASCADE borra las notas viejas,
--      pero ya las copiamos)
-- ============================================================================

BEGIN;

-- Tabla temporal con los pares (caso_general.id, cliente_federal.id)
CREATE TEMP TABLE _mapeo (
  caso_general_id uuid PRIMARY KEY,
  cliente_fed_id  uuid NOT NULL,
  titulo          text NOT NULL
) ON COMMIT DROP;

-- 1) Localizar los 16 casos en casos_generales
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
    NULLIF(t.expediente, ''),
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
)
INSERT INTO _mapeo (caso_general_id, cliente_fed_id, titulo)
SELECT t.id, cf.id, t.titulo
FROM (SELECT id, titulo FROM public.casos_generales
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
        )) t
JOIN public.clientes_federales cf
  ON upper(cf.apellido_nombre) = upper(t.titulo);

-- 2) Copiar notas/seguimientos
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
JOIN _mapeo m ON m.caso_general_id = n.caso_id;

-- 3) Reporte previo al delete (revisalo antes de hacer COMMIT)
SELECT
  (SELECT count(*) FROM _mapeo)                                   AS mapeados,
  (SELECT count(*) FROM public.caso_general_notas n
     JOIN _mapeo m ON m.caso_general_id = n.caso_id)              AS notas_origen,
  (SELECT count(*) FROM public.clientes_federales_notas cfn
     JOIN _mapeo m ON m.cliente_fed_id = cfn.cliente_fed_id)      AS notas_destino;

-- 4) Borrar de casos_generales (ahora si, las notas ya estan copiadas)
DELETE FROM public.casos_generales
WHERE id IN (SELECT caso_general_id FROM _mapeo);

COMMIT;
