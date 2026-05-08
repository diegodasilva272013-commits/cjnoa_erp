-- ============================================================
-- Realtime ALL: agrega todas las tablas relevantes a la
-- publicación 'supabase_realtime' para que cualquier cambio
-- (insert/update/delete) se refleje al instante en el front
-- sin necesidad de refrescar la página.
--
-- Seguro de correr varias veces: usa DO + EXCEPTION para
-- ignorar tablas que ya estén en la publicación.
-- ============================================================

do $$
declare
  t text;
  tablas text[] := array[
    -- Casos / seguimiento
    'casos_generales',
    'caso_general_notas',
    'historial_caso',
    'audiencias_general',
    -- Tareas
    'tareas',
    'tarea_pasos',
    -- Notificaciones
    'notificaciones_app',
    'notificaciones',
    -- Finanzas
    'ingresos',
    'egresos',
    'casos_pagos',
    -- Previsional
    'clientes_previsional',
    'aportes_previsional',
    'historial_previsional',
    'tareas_previsional',
    -- Agenda
    'agenda_eventos',
    -- Equipo / perfiles
    'perfiles',
    -- Documentos
    'documentos'
  ];
begin
  foreach t in array tablas loop
    -- Solo si la tabla existe
    if exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = t
    ) then
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception
        when duplicate_object then null;  -- ya estaba
        when others then null;            -- otra: no romper el batch
      end;
    end if;
  end loop;
end $$;

-- Verificación (opcional, sólo informativa al ejecutar)
-- select schemaname, tablename from pg_publication_tables
--  where pubname = 'supabase_realtime' order by tablename;
