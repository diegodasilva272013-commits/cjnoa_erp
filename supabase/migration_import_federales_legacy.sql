-- ============================================================================
-- IMPORTAR CASOS LEGACY FEDERALES de casos_generales -> clientes_federales
-- Idempotente: solo importa los que aún no estén linkeados via caso_id.
-- Marca los origen como archivado=true para sacarlos del listado provincial.
-- ============================================================================

INSERT INTO public.clientes_federales (
  apellido_nombre,
  numero_expediente,
  telefono,
  tipo_caso,
  tipo_caso_otros,
  pipeline,
  caso_id,
  url_drive,
  created_at,
  created_by
)
SELECT
  COALESCE(NULLIF(TRIM(cg.titulo), ''), 'SIN NOMBRE')      AS apellido_nombre,
  cg.expediente                                            AS numero_expediente,
  cg.telefono                                              AS telefono,
  ARRAY['otros']::text[]                                   AS tipo_caso,
  NULLIF(TRIM(cg.tipo_caso), '')                           AS tipo_caso_otros,
  'activo'                                                 AS pipeline,
  cg.id                                                    AS caso_id,
  cg.url_drive                                             AS url_drive,
  cg.created_at                                            AS created_at,
  cg.created_by                                            AS created_by
FROM public.casos_generales cg
WHERE cg.estado = 'federales'
  AND NOT EXISTS (
    SELECT 1 FROM public.clientes_federales cf WHERE cf.caso_id = cg.id
  );

-- Archivar los origen para que no queden huérfanos en el kanban provincial
UPDATE public.casos_generales
SET archivado = true,
    updated_at = now()
WHERE estado = 'federales'
  AND archivado = false;

NOTIFY pgrst, 'reload schema';
