-- ============================================================================
-- MIGRATION: Vista unificada de entidades-cliente (casos + previsional)
-- ============================================================================
-- En clientes_previsional la columna se llama apellido_nombre (no
-- nombre_apellido) y no existe dni: se usa cuil como documento.
-- ============================================================================

CREATE OR REPLACE VIEW public.clientes_unificado AS
SELECT
  c.id              AS id,
  'caso'::text      AS origen,
  c.nombre_apellido AS nombre,
  c.telefono        AS telefono,
  NULL::text        AS documento,
  c.created_at      AS created_at
FROM public.clientes c
UNION ALL
SELECT
  cp.id               AS id,
  'previsional'::text AS origen,
  cp.apellido_nombre  AS nombre,
  cp.telefono         AS telefono,
  cp.cuil             AS documento,
  cp.created_at       AS created_at
FROM public.clientes_previsional cp;

-- Función helper: buscar ficha previsional relacionada a un cliente de casos
CREATE OR REPLACE FUNCTION public.buscar_ficha_previsional_por_cliente(p_cliente_id uuid)
RETURNS TABLE (id uuid, nombre_apellido text, dni text, pipeline text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT cp.id, cp.apellido_nombre AS nombre_apellido, cp.cuil AS dni, cp.pipeline
  FROM public.clientes_previsional cp
  JOIN public.clientes c ON (
    lower(trim(c.nombre_apellido)) = lower(trim(cp.apellido_nombre))
    OR (c.telefono IS NOT NULL AND c.telefono = cp.telefono)
  )
  WHERE c.id = p_cliente_id
  LIMIT 5;
$$;

-- Función helper: buscar casos de un cliente previsional (por nombre/telefono)
CREATE OR REPLACE FUNCTION public.buscar_casos_por_cliente_previsional(p_cp_id uuid)
RETURNS TABLE (id uuid, materia text, estado text, expediente text, socio text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT ca.id, ca.materia, ca.estado, ca.expediente, ca.socio
  FROM public.casos ca
  JOIN public.clientes c ON c.id = ca.cliente_id
  JOIN public.clientes_previsional cp ON (
    lower(trim(cp.apellido_nombre)) = lower(trim(c.nombre_apellido))
    OR (cp.telefono IS NOT NULL AND cp.telefono = c.telefono)
  )
  WHERE cp.id = p_cp_id
  ORDER BY ca.created_at DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_ficha_previsional_por_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_casos_por_cliente_previsional(uuid) TO authenticated;
