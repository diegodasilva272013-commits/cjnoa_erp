-- ============================================================================
-- MIGRATION: Módulo independiente de Cargos de Hora
-- ============================================================================
-- Un "cargo de hora" es un acto procesal con fecha y hora concreta donde se
-- deja asentado algo en el expediente (a favor o en contra del cliente).
-- Puede estar vinculado a un caso y opcionalmente a una tarea relacionada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cargos_hora (
  id               uuid primary key default gen_random_uuid(),
  caso_id          uuid references casos(id) on delete cascade,
  cliente_id       uuid references clientes(id) on delete set null,
  tarea_id         uuid references tareas(id) on delete set null,
  fecha            date not null,
  hora             time,
  tipo             text not null check (tipo in ('a_favor','en_contra','neutro')) default 'neutro',
  titulo           text not null,
  descripcion      text,
  juzgado          text,
  expediente       text,
  realizado        boolean not null default false,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_cargos_hora_caso ON cargos_hora(caso_id);
CREATE INDEX IF NOT EXISTS idx_cargos_hora_fecha ON cargos_hora(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cargos_hora_realizado ON cargos_hora(realizado);

-- updated_at trigger
CREATE OR REPLACE FUNCTION cargos_hora_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cargos_hora_on_update ON cargos_hora;
CREATE TRIGGER cargos_hora_on_update
BEFORE UPDATE ON cargos_hora
FOR EACH ROW EXECUTE FUNCTION cargos_hora_set_updated_at();

-- Vista completa con nombres
CREATE OR REPLACE VIEW cargos_hora_completo AS
SELECT
  ch.*,
  c.materia        AS caso_materia,
  c.expediente     AS caso_expediente,
  cli.nombre_apellido AS cliente_nombre,
  t.titulo         AS tarea_titulo,
  p.nombre         AS creado_por_nombre
FROM cargos_hora ch
LEFT JOIN casos c    ON c.id = ch.caso_id
LEFT JOIN clientes cli ON cli.id = ch.cliente_id
LEFT JOIN tareas t   ON t.id = ch.tarea_id
LEFT JOIN perfiles p ON p.id = ch.created_by;

-- RLS
ALTER TABLE cargos_hora ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cargos_hora_select_all ON cargos_hora;
CREATE POLICY cargos_hora_select_all ON cargos_hora
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cargos_hora_insert_authenticated ON cargos_hora;
CREATE POLICY cargos_hora_insert_authenticated ON cargos_hora
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM perfiles p WHERE p.id = auth.uid() AND COALESCE(p.activo, true))
);

DROP POLICY IF EXISTS cargos_hora_update_authenticated ON cargos_hora;
CREATE POLICY cargos_hora_update_authenticated ON cargos_hora
FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM perfiles p WHERE p.id = auth.uid() AND COALESCE(p.activo, true))
) WITH CHECK (true);

DROP POLICY IF EXISTS cargos_hora_delete_admin_socio ON cargos_hora;
CREATE POLICY cargos_hora_delete_admin_socio ON cargos_hora
FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio'))
  OR created_by = auth.uid()
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE cargos_hora;
