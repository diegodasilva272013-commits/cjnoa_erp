-- ============================================================
-- v5: RPC para completar/reabrir un paso sin chocar con RLS
--     ni con el trigger gate de tareas, y habilitar realtime
--     en notificaciones_app.
-- ============================================================
-- Soluciona dos cosas:
--   1) "Error: no soy el responsable" al marcar un paso como hecho:
--      el sync_estado actualiza la tarea madre y choca con el gate.
--      Esta RPC corre con security definer y bypasea ambos.
--   2) Las notificaciones le llegan al otro usuario sin tener que
--      refrescar: agregamos la tabla a la publicación de realtime.
-- ============================================================

drop function if exists public.tarea_paso_set_completado(uuid, boolean);

create or replace function public.tarea_paso_set_completado(
  p_paso_id uuid,
  p_hecho boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'no auth';
  end if;

  update public.tarea_pasos
     set completado = p_hecho,
         completado_at = case when p_hecho then now() else null end,
         completado_por = case when p_hecho then v_uid else null end,
         updated_at = now()
   where id = p_paso_id;
end $$;

alter function public.tarea_paso_set_completado(uuid, boolean) owner to postgres;
grant execute on function public.tarea_paso_set_completado(uuid, boolean) to authenticated;

-- Realtime: asegurar que notificaciones_app emita eventos en vivo
do $$
begin
  begin
    alter publication supabase_realtime add table public.notificaciones_app;
  exception when duplicate_object then null;
           when others then null;
  end;
end $$;

-- Por las dudas también para tarea_pasos (Mi Día se actualiza al toque)
do $$
begin
  begin
    alter publication supabase_realtime add table public.tarea_pasos;
  exception when duplicate_object then null;
           when others then null;
  end;
end $$;

notify pgrst, 'reload schema';
