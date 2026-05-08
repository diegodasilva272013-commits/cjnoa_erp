-- ============================================================
-- v3: Tareas compartidas finalizadas
--   - Notifica al RESPONSABLE y al CREADOR (created_by)
--   - Inserta nota automática en SEGUIMIENTO del caso
--     (caso_general_notas) con reporte de todos los pasos
--     (descripción, quién lo hizo, cuándo, duración)
-- ============================================================

create or replace function public.tarea_pasos_notify_siguiente()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_siguiente record;
  v_tarea_titulo text;
  v_quien text;
  v_total int;
  v_completos int;
  v_caso_general uuid;
  v_reporte text;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_dur_min int;
  v_dur_txt text;
  v_resp_id uuid;
  v_creador_id uuid;
  v_completador uuid;
begin
  if not (new.completado is true and (old.completado is null or old.completado = false)) then
    return new;
  end if;

  v_completador := coalesce(new.completado_por, '00000000-0000-0000-0000-000000000000'::uuid);

  select t.titulo, t.caso_general_id, t.responsable_id, t.created_by
    into v_tarea_titulo, v_caso_general, v_resp_id, v_creador_id
    from public.tareas t where t.id = new.tarea_id;

  select coalesce(nombre, 'Alguien') into v_quien
    from public.perfiles where id = new.completado_por;

  -- ---------------- siguiente paso ----------------
  select * into v_siguiente
  from public.tarea_pasos
  where tarea_id = new.tarea_id
    and completado = false
    and responsable_id is not null
    and orden > new.orden
  order by orden asc
  limit 1;

  if v_siguiente.id is not null
     and v_siguiente.responsable_id <> v_completador then
    begin
      insert into public.notificaciones_app
        (user_id, tipo, titulo, mensaje, link, related_id, related_user_id)
      values (
        v_siguiente.responsable_id,
        'tarea_paso_siguiente',
        '⚡ Te toca continuar: ' || coalesce(v_tarea_titulo, 'tarea'),
        coalesce(v_quien,'Alguien') || ' completó "' || coalesce(new.descripcion,'(sin descripción)') ||
        '". Ahora te toca: ' || coalesce(v_siguiente.descripcion,'(sin descripción)'),
        '/mi-dia',
        new.tarea_id,
        new.completado_por
      );
    exception when others then null; end;
  end if;

  -- ---------------- finalización total ----------------
  select count(*), count(*) filter (where completado)
    into v_total, v_completos
  from public.tarea_pasos where tarea_id = new.tarea_id;

  if v_total > 0 and v_completos = v_total then

    -- 1) NOTIFICAR a responsable y creador (deduplicado, sin auto-notificar al completador)
    begin
      insert into public.notificaciones_app
        (user_id, tipo, titulo, mensaje, link, related_id, related_user_id)
      select distinct u.uid,
             'tarea_compartida_completa',
             '🎉 Tarea finalizada: ' || coalesce(v_tarea_titulo,'(sin título)'),
             'Todos los pasos están completos. ' || coalesce(v_quien,'Alguien') ||
             ' cerró el último paso. Reporte automático cargado en el caso.',
             case when v_caso_general is not null
                  then '/seguimiento?caso=' || v_caso_general::text
                  else '/tareas' end,
             new.tarea_id,
             new.completado_por
        from (
          select v_resp_id    as uid where v_resp_id    is not null
          union
          select v_creador_id as uid where v_creador_id is not null
        ) u
        where u.uid is not null
          and u.uid <> v_completador;
    exception when others then null; end;

    -- 2) GENERAR REPORTE y guardar NOTA en SEGUIMIENTO del caso
    if v_caso_general is not null then
      begin
        select min(tp.completado_at), max(tp.completado_at)
          into v_inicio, v_fin
          from public.tarea_pasos tp
         where tp.tarea_id = new.tarea_id and tp.completado_at is not null;

        if v_inicio is not null and v_fin is not null then
          v_dur_min := greatest(0, extract(epoch from (v_fin - v_inicio))::int / 60);
          if v_dur_min < 60 then
            v_dur_txt := v_dur_min::text || ' min';
          elsif v_dur_min < 60*24 then
            v_dur_txt := (v_dur_min/60)::text || 'h ' || (v_dur_min%60)::text || 'min';
          else
            v_dur_txt := (v_dur_min/1440)::text || 'd ' || ((v_dur_min%1440)/60)::text || 'h';
          end if;
        else
          v_dur_txt := '—';
        end if;

        select string_agg(
          '• Paso ' || tp.orden::text || ': ' ||
          coalesce(tp.descripcion,'(sin descripción)') ||
          E'\n   ✓ Hecho por ' || coalesce(p.nombre,'—') ||
          coalesce(' el ' || to_char(tp.completado_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI'), ''),
          E'\n'
          order by tp.orden
        )
        into v_reporte
        from public.tarea_pasos tp
        left join public.perfiles p on p.id = tp.completado_por
        where tp.tarea_id = new.tarea_id;

        insert into public.caso_general_notas
          (caso_id, contenido, tarea_id, created_by)
        values (
          v_caso_general,
          '✅ TAREA FINALIZADA: ' || coalesce(v_tarea_titulo,'(sin título)') || E'\n' ||
          '🕒 Duración total: ' || v_dur_txt || E'\n' ||
          '👥 Pasos: ' || v_total::text || E'\n\n' ||
          'Reporte automático:' || E'\n' ||
          coalesce(v_reporte, '(sin pasos registrados)'),
          new.tarea_id,
          new.completado_por
        );
      exception when others then null; end;
    end if;

  end if;

  return new;
end $$;

alter function public.tarea_pasos_notify_siguiente() owner to postgres;

drop trigger if exists trg_tarea_pasos_notify_siguiente on public.tarea_pasos;
create trigger trg_tarea_pasos_notify_siguiente
  after update on public.tarea_pasos
  for each row execute function public.tarea_pasos_notify_siguiente();

notify pgrst, 'reload schema';
