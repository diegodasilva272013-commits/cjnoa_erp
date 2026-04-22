DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'casos_pagos'
      AND column_name = 'estado_caso'
  ) THEN
    ALTER TABLE public.casos_pagos
      ADD COLUMN estado_caso text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casos_pagos_estado_caso_check'
  ) THEN
    ALTER TABLE public.casos_pagos
      ADD CONSTRAINT casos_pagos_estado_caso_check
      CHECK (estado_caso IN ('Vino a consulta','Trámite no judicial','Cliente Judicial') OR estado_caso IS NULL);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';