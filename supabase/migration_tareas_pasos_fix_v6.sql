-- ============================================================
-- v6: RPCs para que un responsable de paso pueda usar el
--     cronómetro de Mi Día (Iniciar/Pausar/Completar) sin
--     chocar con el trigger gate de tareas.
-- ============================================================

drop function if exists public.tarea_set_estado_dia(uuid, text, timestamptz, int);

create or replace function public.tarea_set_estado_dia(
  p_tarea_id uuid,
  p_estado_dia text,
  p_started_at timestamptz default null,
  p_tiempo_real_min int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_autorizado boolean;
begin
  if v_uid is null then raise exception 'no auth'; end if;

  -- Permitido si: es responsable principal, creador, admin/socio,
  -- o tiene un paso asignado en esta tarea.
  select exists (
    select 1 from public.tareas t
     where t.id = p_tarea_id
       and (t.responsable_id = v_uid or t.created_by = v_uid)
  ) or exists (
    select 1 from public.perfiles p
     where p.id = v_uid and p.rol in ('admin','socio')
  ) or exists (
    select 1 from public.tarea_pasos tp
     where tp.tarea_id = p_tarea_id and tp.responsable_id = v_uid
  ) into v_autorizado;

  if not v_autorizado then
    raise exception 'No autorizado';
  end if;

  update public.tareas
     set estado_dia = p_estado_dia,
         started_at = case
           when p_estado_dia = 'en_progreso' then coalesce(p_started_at, now())
           when p_estado_dia = 'pausada'     then null
           else started_at
         end,
         tiempo_real_min = case
           when p_tiempo_real_min is not null then p_tiempo_real_min
           else tiempo_real_min
         end,
         fecha_orden = coalesce(fecha_orden, current_date::text),
         updated_at = now()
   where id = p_tarea_id;
end $$;

alter function public.tarea_set_estado_dia(uuid, text, timestamptz, int) owner to postgres;
grant execute on function public.tarea_set_estado_dia(uuid, text, timestamptz, int) to authenticated;

notify pgrst, 'reload schema';
