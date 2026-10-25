-- ============================================================================
-- GASTO DE OPENAI EN TIEMPO REAL
--
-- SIN NADA DESTRUCTIVO: no tiene DROP, DELETE, TRUNCATE ni ALTER sobre tablas existentes.
-- Solo CREA dos tablas nuevas (si todavía no existen). Se puede correr más de una vez.
--
--   uso_openai         una fila por cada llamada a OpenAI: cuándo, para qué, qué modelo, cuántos tokens y cuántos dólares
--   uso_openai_config  el último saldo que anotó una persona (para calcular cuánto queda) -> una sola fila
--
-- Escribe solo el servidor. Lo pueden LEER administradores y socios (pantalla "Gasto del agente").
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.uso_openai (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  origen  text NOT NULL DEFAULT 'agente',
  modelo  text NOT NULL,
  entrada integer NOT NULL DEFAULT 0,
  salida  integer NOT NULL DEFAULT 0,
  usd     numeric(12,6) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_uso_openai_at ON public.uso_openai (at DESC);

CREATE TABLE IF NOT EXISTS public.uso_openai_config (
  id             integer PRIMARY KEY CHECK (id = 1),
  saldo_inicial  numeric(12,2),
  saldo_desde    timestamptz,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_por text
);
INSERT INTO public.uso_openai_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.uso_openai        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uso_openai_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'uso_openai' AND policyname = 'uso_openai_leer') THEN
    CREATE POLICY uso_openai_leer ON public.uso_openai FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'uso_openai_config' AND policyname = 'uso_openai_config_leer') THEN
    CREATE POLICY uso_openai_config_leer ON public.uso_openai_config FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio')));
  END IF;
END $$;

-- Tiempo real para que la pantalla muestre cada llamada apenas ocurre
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.uso_openai; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- Para verificar (solo lectura):
--   SELECT * FROM public.uso_openai_config;                         -- 1 fila
--   SELECT count(*), coalesce(sum(usd),0) FROM public.uso_openai;   -- 0 hasta que el agente haga llamadas
