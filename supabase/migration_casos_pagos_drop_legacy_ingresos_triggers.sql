-- ============================================================================
-- FIX: Eliminar triggers/funciones legacy de casos_pagos que referencian
-- public.ingresos (tabla inexistente). El sistema v2 usa ingresos_operativos
-- y maneja la creacion/eliminacion de ingresos desde el frontend.
-- Error a corregir: "relation \"public.ingresos\" does not exist" al borrar
-- un caso_pagos.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_casos_pagos_cleanup ON public.casos_pagos;
DROP TRIGGER IF EXISTS trg_casos_pagos_sync_ingresos ON public.casos_pagos;

DROP FUNCTION IF EXISTS public.casos_pagos_cleanup_ingresos();
DROP FUNCTION IF EXISTS public.casos_pagos_sync_ingresos();

-- Las columnas ingreso_reserva_id / ingreso_saldo_id quedan como simple uuid
-- (la FK a public.ingresos nunca se llego a crear porque la tabla no existe).
-- No las borramos para no perder datos historicos si los hubiera.

NOTIFY pgrst, 'reload schema';
