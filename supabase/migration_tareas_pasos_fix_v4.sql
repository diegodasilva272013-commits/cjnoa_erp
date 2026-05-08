-- ============================================================
-- v4: RPC SECURITY DEFINER para que Mi Día vea las tareas de
--     pasos compartidos sin chocar con RLS.
-- ============================================================
-- Devuelve, para un usuario, todas las tareas en las que participa
-- como responsable principal O como responsable de algún paso,
-- junto con el detalle de los pasos. Bypassa RLS porque corre como
-- owner postgres.
-- ============================================================

drop function if exists public.mi_dia_pasos_y_tareas(uuid);

create or replace function public.mi_dia_pasos_y_tareas(p_user_id uuid)
returns table (
  tarea_id uuid,
  tarea_titulo text,
  tarea_descripcion text,
  tarea_caso_id uuid,
  tarea_caso_general_id uuid,
  tarea_prioridad text,
  tarea_fecha_limite date,
  tarea_estado text,
  tarea_fecha_completada timestamptz,
  tarea_archivada boolean,
  tarea_responsable_id uuid,
  tarea_created_by uuid,
  paso_id uuid,
  paso_orden int,
  paso_descripcion text,
  paso_responsable_id uuid,
  paso_completado boolean,
  paso_completado_at timestamptz,
  paso_completado_por uuid,
  paso_le_toca_ahora boolean
)
language sql
security definer
set search_path = public
as $$
  with mis_pasos as (
    select tp.*
      from public.tarea_pasos tp
     where tp.responsable_id = p_user_id
  ),
  prev_pendientes as (
    select tp.tarea_id, tp.orden,
           exists (
             select 1 from public.tarea_pasos tp2
              where tp2.tarea_id = tp.tarea_id
                and tp2.orden < tp.orden
                and tp2.completado = false
           ) as hay_anterior_pendiente
      from mis_pasos tp
  )
  select
    t.id,
    t.titulo,
    t.descripcion,
    t.caso_id,
    t.caso_general_id,
    t.prioridad::text,
    t.fecha_limite,
    t.estado::text,
    t.fecha_completada,
    coalesce(t.archivada,false),
    t.responsable_id,
    t.created_by,
    mp.id,
    mp.orden,
    mp.descripcion,
    mp.responsable_id,
    mp.completado,
    mp.completado_at,
    mp.completado_por,
    case when mp.completado = false then not pp.hay_anterior_pendiente else false end
  from mis_pasos mp
  join public.tareas t on t.id = mp.tarea_id
  join prev_pendientes pp on pp.tarea_id = mp.tarea_id and pp.orden = mp.orden
  where coalesce(t.archivada,false) = false;
$$;

alter function public.mi_dia_pasos_y_tareas(uuid) owner to postgres;
grant execute on function public.mi_dia_pasos_y_tareas(uuid) to authenticated;

notify pgrst, 'reload schema';
