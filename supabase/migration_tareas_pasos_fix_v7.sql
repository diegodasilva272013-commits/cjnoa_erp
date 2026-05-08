-- ============================================================
-- v7: Quitar el "reporte automático de tarea finalizada" del
--     trigger de tarea_pasos. Ya no se inserta nada en
--     caso_general_notas desde el backend cuando se cierra el
--     último paso. Las únicas notas que quedan en seguimiento
--     son las que escribe cada usuario al marcar su paso.
--
-- Las notificaciones a responsable principal + creador siguen
-- igual (la campana sigue sonando cuando se cierra la tarea).
-- ============================================================

create or replace function public.tarea_pasos_notify_siguiente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tarea_titulo text;
  v_caso_general uuid;
  v_resp_principal uuid;
  v_creador uuid;
  v_total int;
  v_completos int;
  v_siguiente record;
begin
  -- solo nos interesa cuando un paso pasa a completado
  if not (new.completado is true and (old.completado is distinct from true)) then
    return new;
  end if;

  select t.titulo, t.caso_general_id, t.responsable_id, t.created_by
    into v_tarea_titulo, v_caso_general, v_resp_principal, v_creador
    from public.tareas t
   where t.id = new.tarea_id;

  -- Notificar al siguiente paso pendiente con responsable
  select tp.responsable_id, tp.descripcion, tp.orden
    into v_siguiente
    from public.tarea_pasos tp
   where tp.tarea_id = new.tarea_id
     and tp.completado is not true
     and tp.responsable_id is not null
     and tp.orden > new.orden
   order by tp.orden asc
   limit 1;

  if v_siguiente.responsable_id is not null
     and v_siguiente.responsable_id <> coalesce(new.completado_por, '00000000-0000-0000-0000-000000000000'::uuid) then
    begin
      insert into public.notificaciones_app
        (user_id, tipo, titulo, mensaje, link, related_id, related_user_id)
      values (
        v_siguiente.responsable_id,
        'tarea_asignada',
        '⚡ Te toca continuar: ' || coalesce(v_tarea_titulo,'tarea'),
        'Ahora te toca: ' || coalesce(v_siguiente.descripcion,'(sin descripción)'),
        '/mi-dia',
        new.tarea_id,
        new.completado_por
      );
    exception when others then null; end;
  end if;

  -- ¿Quedan pasos pendientes?
  select count(*), count(*) filter (where completado is true)
    into v_total, v_completos
    from public.tarea_pasos
   where tarea_id = new.tarea_id;

  if v_total > 0 and v_completos = v_total then
    -- Tarea finalizada: notificar a responsable principal y creador
    -- (la campana suena, sin reporte automatico en seguimiento)
    begin
      insert into public.notificaciones_app
        (user_id, tipo, titulo, mensaje, link, related_id, related_user_id)
      select uid, 'tarea_asignada',
             '🎉 Tarea finalizada: ' || coalesce(v_tarea_titulo,'tarea'),
             'Se cerraron todos los pasos.',
             coalesce('/seguimiento?caso=' || v_caso_general::text, '/tareas'),
             new.tarea_id,
             new.completado_por
        from (
          select v_resp_principal as uid where v_resp_principal is not null and v_resp_principal <> new.completado_por
          union
          select v_creador as uid where v_creador is not null and v_creador <> new.completado_por and v_creador <> v_resp_principal
        ) destinatarios
       where uid is not null;
    exception when others then null; end;
  end if;

  return new;
end $$;

alter function public.tarea_pasos_notify_siguiente() owner to postgres;

drop trigger if exists trg_tarea_pasos_notify_siguiente on public.tarea_pasos;
create trigger trg_tarea_pasos_notify_siguiente
  after update on public.tarea_pasos
  for each row execute function public.tarea_pasos_notify_siguiente();

notify pgrst, 'reload schema';
