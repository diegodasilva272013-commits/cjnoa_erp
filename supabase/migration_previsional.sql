-- ============================================
-- TABLA: auditoria_previsional (historial de cambios)
-- ============================================
CREATE TABLE IF NOT EXISTS public.auditoria_previsional (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tabla text NOT NULL,
  registro_id uuid NOT NULL,
  campo text NOT NULL,
  valor_anterior text,
  valor_nuevo text,
  modificado_por uuid REFERENCES public.perfiles(id),
  modificado_en timestamptz DEFAULT now()
);

-- ============================================
-- TABLA: alertas_previsional (alertas automáticas)
-- ============================================
CREATE TABLE IF NOT EXISTS public.alertas_previsional (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_prev_id uuid REFERENCES public.clientes_previsional(id) ON DELETE CASCADE,
  tarea_id uuid REFERENCES public.tareas_previsional(id),
  tipo text NOT NULL, -- vencimiento, demora, etc
  mensaje text,
  leida boolean DEFAULT false,
  creada_en timestamptz DEFAULT now()
);

-- ============================================
-- TRIGGERS: Auditoría automática en UPDATE/DELETE

-- ============================================
-- FUNCIÓN: trg_alertas_tareas_previsional
-- ============================================
CREATE OR REPLACE FUNCTION public.trg_alertas_tareas_previsional() RETURNS trigger AS $$
BEGIN
  -- Al crear o actualizar una tarea, si la fecha_limite es hoy o pasada y no está completada, crear alerta de vencimiento
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.fecha_limite IS NOT NULL AND NEW.estado != 'completada' AND NEW.fecha_limite <= CURRENT_DATE THEN
      INSERT INTO public.alertas_previsional (cliente_prev_id, tarea_id, tipo, mensaje)
      VALUES (NEW.cliente_prev_id, NEW.id, 'vencimiento',
        'La tarea "' || NEW.titulo || '" está vencida o vence hoy.'
      )
      ON CONFLICT DO NOTHING;
    END IF;
    -- Si la tarea está en estado pendiente o en_curso y la fecha_limite ya pasó, crear alerta de demora
    IF NEW.fecha_limite IS NOT NULL AND NEW.estado IN ('pendiente','en_curso') AND NEW.fecha_limite < CURRENT_DATE THEN
      INSERT INTO public.alertas_previsional (cliente_prev_id, tarea_id, tipo, mensaje)
      VALUES (NEW.cliente_prev_id, NEW.id, 'demora',
        'La tarea "' || NEW.titulo || '" está demorada.'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: tareas_previsional -> alertas automáticas
-- ============================================
DROP TRIGGER IF EXISTS trg_alertas_tareas_previsional ON public.tareas_previsional;
CREATE TRIGGER trg_alertas_tareas_previsional
AFTER INSERT OR UPDATE ON public.tareas_previsional
FOR EACH ROW EXECUTE FUNCTION public.trg_alertas_tareas_previsional();
-- ============================================

-- ============================================
-- FUNCIÓN: trg_auditoria_previsional
-- ============================================
CREATE OR REPLACE FUNCTION public.trg_auditoria_previsional() RETURNS trigger AS $$
DECLARE
  col text;
  old_val text;
  new_val text;
BEGIN
  -- Solo auditar UPDATE
  IF TG_OP = 'UPDATE' THEN
    FOREACH col IN ARRAY TG_ARGV LOOP
      EXECUTE format('SELECT ($1).%I::text', col) INTO old_val USING OLD;
      EXECUTE format('SELECT ($1).%I::text', col) INTO new_val USING NEW;
      IF old_val IS DISTINCT FROM new_val THEN
        INSERT INTO public.auditoria_previsional(tabla, registro_id, campo, valor_anterior, valor_nuevo, modificado_por)
        VALUES (TG_TABLE_NAME, OLD.id, col, old_val, new_val, COALESCE(NEW.updated_by, OLD.updated_by));
      END IF;
    END LOOP;
  END IF;
  -- Solo auditar DELETE
  IF TG_OP = 'DELETE' THEN
    FOREACH col IN ARRAY TG_ARGV LOOP
      EXECUTE format('SELECT ($1).%I::text', col) INTO old_val USING OLD;
      INSERT INTO public.auditoria_previsional(tabla, registro_id, campo, valor_anterior, valor_nuevo, modificado_por)
      VALUES (TG_TABLE_NAME, OLD.id, col, old_val, NULL, OLD.updated_by);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS: clientes_previsional
-- ============================================
DROP TRIGGER IF EXISTS trg_auditoria_clientes_previsional ON public.clientes_previsional;
CREATE TRIGGER trg_auditoria_clientes_previsional
AFTER UPDATE OR DELETE ON public.clientes_previsional
FOR EACH ROW EXECUTE FUNCTION public.trg_auditoria_previsional(
  'apellido_nombre', 'cuil', 'clave_social', 'clave_fiscal', 'fecha_nacimiento', 'sexo', 'direccion', 'telefono', 'hijos',
  'meses_moratoria_24476', 'meses_moratoria_27705', 'fecha_edad_jubilatoria', 'resumen_informe', 'conclusion',
  'fecha_ultimo_contacto', 'situacion_actual', 'captado_por', 'pipeline', 'sub_estado', 'cobro_total', 'monto_cobrado',
  'url_drive', 'caso_id', 'cliente_id', 'visible_para', 'score_probabilidad'
);

-- ============================================
-- TRIGGERS: tareas_previsional
-- ============================================
DROP TRIGGER IF EXISTS trg_auditoria_tareas_previsional ON public.tareas_previsional;
CREATE TRIGGER trg_auditoria_tareas_previsional
AFTER UPDATE OR DELETE ON public.tareas_previsional
FOR EACH ROW EXECUTE FUNCTION public.trg_auditoria_previsional(
  'titulo', 'descripcion', 'avance', 'cargo_hora', 'cargo_hora_fecha', 'estado', 'prioridad', 'fecha_limite',
  'responsable_id', 'responsable_nombre', 'observaciones_demora', 'archivos', 'visible_para'
);

-- ============================================
-- ÍNDICES para performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_clientes_previsional_pipeline ON public.clientes_previsional(pipeline);
CREATE INDEX IF NOT EXISTS idx_clientes_previsional_responsable ON public.clientes_previsional(created_by);
CREATE INDEX IF NOT EXISTS idx_tareas_previsional_responsable ON public.tareas_previsional(responsable_id);
CREATE INDEX IF NOT EXISTS idx_tareas_previsional_estado ON public.tareas_previsional(estado);
ALTER TABLE public.clientes_previsional ENABLE ROW LEVEL SECURITY;

-- Permisos granulares: admin/socio ven todo, empleados sólo lo visible_para o creados por ellos
CREATE POLICY "clientes_previsional_select" ON public.clientes_previsional 
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio'))
    OR (visible_para @> ARRAY[auth.uid()] OR created_by = auth.uid())
  );
CREATE POLICY "clientes_previsional_insert" ON public.clientes_previsional 
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clientes_previsional_update" ON public.clientes_previsional 
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio'))
    OR (visible_para @> ARRAY[auth.uid()] OR created_by = auth.uid())
  );
CREATE POLICY "clientes_previsional_delete" ON public.clientes_previsional 
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio'))
    OR (visible_para @> ARRAY[auth.uid()] OR created_by = auth.uid())
  );
ALTER TABLE public.tareas_previsional ENABLE ROW LEVEL SECURITY;

-- Permisos granulares: admin/socio ven todo, empleados sólo lo visible_para o responsables
CREATE POLICY "tareas_prev_select" ON public.tareas_previsional FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio'))
  OR (visible_para @> ARRAY[auth.uid()] OR responsable_id = auth.uid())
);
CREATE POLICY "tareas_prev_insert" ON public.tareas_previsional FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tareas_prev_update" ON public.tareas_previsional FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio'))
  OR (visible_para @> ARRAY[auth.uid()] OR responsable_id = auth.uid())
);
CREATE POLICY "tareas_prev_delete" ON public.tareas_previsional FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.perfiles p WHERE p.id = auth.uid() AND p.rol IN ('admin','socio'))
  OR (visible_para @> ARRAY[auth.uid()] OR responsable_id = auth.uid())
);
-- ============================================
-- MIGRACIÓN: Módulo Previsional Completo
-- Centro Jurídico NOA - ERP
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- ============================================
-- TABLA: clientes_previsional (ficha ultra completa)
-- ============================================
CREATE TABLE IF NOT EXISTS public.clientes_previsional (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  
  -- Datos personales
  apellido_nombre text NOT NULL,
  cuil text,
  clave_social text,
  clave_fiscal text,
  fecha_nacimiento date,
  sexo text CHECK (sexo IN ('HOMBRE', 'MUJER') OR sexo IS NULL),
  direccion text,
  telefono text,
  hijos integer DEFAULT 0,
  
  -- Moratorias (calculados en frontend pero almacenados para cache)
  meses_moratoria_24476 integer DEFAULT 0,
  meses_moratoria_27705 integer DEFAULT 0,
  fecha_edad_jubilatoria date,
  
  -- Informe administrativo
  resumen_informe text,
  conclusion text,
  
  -- Seguimiento
  fecha_ultimo_contacto date,
  situacion_actual text,
  captado_por text,
  
  -- Pipeline
  pipeline text NOT NULL DEFAULT 'consulta' CHECK (pipeline IN ('consulta', 'seguimiento', 'ingreso', 'cobro', 'finalizado', 'descartado')),
  sub_estado text CHECK (sub_estado IN (
    'EN PROCESO', 'EN ESPERA', 'EN PROCESO - SEGUIMIENTO EXPTE', 
    'EN PROCESO - REALIZAR TAREA', 'FINALIZADO', 'COBRADO'
  ) OR sub_estado IS NULL),
  pipeline_fecha_ingreso timestamptz DEFAULT now(),
  pipeline_fecha_cobro timestamptz,
  pipeline_fecha_finalizado timestamptz,
  
  -- Scoring y analítica
  score_probabilidad integer CHECK (score_probabilidad BETWEEN 0 AND 100),
  tiempo_en_pipeline integer GENERATED ALWAYS AS (EXTRACT(DAY FROM (COALESCE(pipeline_fecha_finalizado, now()) - pipeline_fecha_ingreso))) STORED,
  
  -- Cobro
  cobro_total numeric(12,2) DEFAULT 0,
  monto_cobrado numeric(12,2) DEFAULT 0,
  saldo_pendiente numeric(12,2) GENERATED ALWAYS AS (cobro_total - monto_cobrado) STORED,
  
  -- Google Drive
  url_drive text,
  
  -- Vinculación con módulo de casos existente
  caso_id uuid REFERENCES public.casos(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  
  -- Permisos granulares
  visible_para uuid[] DEFAULT ARRAY[]::uuid[],
  
  -- Auditoría
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.perfiles(id)
);

ALTER TABLE public.clientes_previsional ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_previsional_select" ON public.clientes_previsional 
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "clientes_previsional_insert" ON public.clientes_previsional 
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "clientes_previsional_update" ON public.clientes_previsional 
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "clientes_previsional_delete" ON public.clientes_previsional 
  FOR DELETE TO authenticated USING (true);

-- ============================================
-- TABLA: aportes_laborales (historial de períodos)
-- ============================================
CREATE TABLE IF NOT EXISTS public.aportes_laborales (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_prev_id uuid REFERENCES public.clientes_previsional(id) ON DELETE CASCADE NOT NULL,
  
  empleador text,
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  total_meses integer DEFAULT 0,
  es_antes_0993 boolean DEFAULT false,
  es_simultaneo boolean DEFAULT false,
  observaciones text,
  
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.aportes_laborales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aportes_select" ON public.aportes_laborales FOR SELECT TO authenticated USING (true);
CREATE POLICY "aportes_insert" ON public.aportes_laborales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "aportes_update" ON public.aportes_laborales FOR UPDATE TO authenticated USING (true);
CREATE POLICY "aportes_delete" ON public.aportes_laborales FOR DELETE TO authenticated USING (true);

-- ============================================
-- TABLA: historial_avances (timeline permanente por cliente)
-- ============================================
CREATE TABLE IF NOT EXISTS public.historial_avances (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_prev_id uuid REFERENCES public.clientes_previsional(id) ON DELETE CASCADE NOT NULL,
  
  titulo text NOT NULL,
  descripcion text,
  tarea_siguiente text,
  
  usuario_id uuid REFERENCES public.perfiles(id),
  usuario_nombre text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.historial_avances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historial_select" ON public.historial_avances FOR SELECT TO authenticated USING (true);
CREATE POLICY "historial_insert" ON public.historial_avances FOR INSERT TO authenticated WITH CHECK (true);
-- NO DELETE/UPDATE: el historial es permanente e inmutable

-- ============================================
-- TABLA: tareas_previsional (seguimiento diario)
-- ============================================
CREATE TABLE IF NOT EXISTS public.tareas_previsional (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_prev_id uuid REFERENCES public.clientes_previsional(id) ON DELETE CASCADE,
  
  titulo text NOT NULL,
  descripcion text,
  avance text,
  cargo_hora text,
  cargo_hora_fecha date,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_curso', 'completada')),
  prioridad text NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta', 'media', 'sin_prioridad')),
  fecha_limite date,
  responsable_id uuid REFERENCES public.perfiles(id),
  responsable_nombre text,
  observaciones_demora text,
  
  -- Archivos adjuntos (multi-archivo)
  archivos jsonb DEFAULT '[]'::jsonb, -- [{url, nombre}]
  
  -- Permisos granulares
  visible_para uuid[] DEFAULT ARRAY[]::uuid[],
  -- Auditoría
  fecha_completada timestamptz,
  completada_por uuid REFERENCES public.perfiles(id),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tareas_previsional ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tareas_prev_select" ON public.tareas_previsional FOR SELECT TO authenticated USING (true);
CREATE POLICY "tareas_prev_insert" ON public.tareas_previsional FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tareas_prev_update" ON public.tareas_previsional FOR UPDATE TO authenticated USING (true);
CREATE POLICY "tareas_prev_delete" ON public.tareas_previsional FOR DELETE TO authenticated USING (true);

-- ============================================
-- TABLA: audiencias (del módulo previsional)
-- ============================================
CREATE TABLE IF NOT EXISTS public.audiencias (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_prev_id uuid REFERENCES public.clientes_previsional(id) ON DELETE CASCADE,
  
  fecha date NOT NULL,
  hora time,
  juzgado text,
  tipo text,
  abogado_cargo text,
  notas text,
  
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id)
);

ALTER TABLE public.audiencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audiencias_select" ON public.audiencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "audiencias_insert" ON public.audiencias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "audiencias_update" ON public.audiencias FOR UPDATE TO authenticated USING (true);
CREATE POLICY "audiencias_delete" ON public.audiencias FOR DELETE TO authenticated USING (true);

-- ============================================
-- TABLA: historial_tareas_eliminadas (métricas)
-- ============================================
CREATE TABLE IF NOT EXISTS public.historial_tareas_eliminadas (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tarea_titulo text NOT NULL,
  cliente_nombre text,
  responsable_nombre text,
  fecha_creacion timestamptz,
  fecha_cierre timestamptz DEFAULT now(),
  eliminada_por uuid REFERENCES public.perfiles(id),
  motivo text
);

ALTER TABLE public.historial_tareas_eliminadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hist_tareas_select" ON public.historial_tareas_eliminadas FOR SELECT TO authenticated USING (true);
CREATE POLICY "hist_tareas_insert" ON public.historial_tareas_eliminadas FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- AGREGAR permiso previsional al sistema de permisos
-- ============================================
-- Actualizar default de permisos para incluir 'previsional'
-- Los admin y socios ven todo, los empleados (procuradores) ven solo lo suyo
UPDATE public.perfiles 
SET permisos = permisos || '{"previsional": true}'::jsonb 
WHERE rol IN ('admin', 'socio');

UPDATE public.perfiles 
SET permisos = permisos || '{"previsional": true}'::jsonb 
WHERE rol = 'empleado';
