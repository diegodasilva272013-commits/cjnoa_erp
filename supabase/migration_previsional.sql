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
  
  -- Cobro
  cobro_total numeric(12,2) DEFAULT 0,
  monto_cobrado numeric(12,2) DEFAULT 0,
  saldo_pendiente numeric(12,2) GENERATED ALWAYS AS (cobro_total - monto_cobrado) STORED,
  
  -- Google Drive
  url_drive text,
  
  -- Vinculación con módulo de casos existente
  caso_id uuid REFERENCES public.casos(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  
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
  
  -- Archivo adjunto
  archivo_url text,
  archivo_nombre text,
  
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
