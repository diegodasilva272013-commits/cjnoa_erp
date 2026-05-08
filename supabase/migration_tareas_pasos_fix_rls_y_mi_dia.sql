-- ============================================================
-- Fix tareas compartidas / pasos: RLS + Mi Día + notificaciones
-- ============================================================
-- 1) Faltaba el rol 'abogado' en la RLS de tareas → bloqueaba el
--    trigger sync_estado al actualizar 'estado' de la tarea madre.
-- 2) Vista nueva: tareas donde soy responsable_id O responsable de
--    algún paso, con flags para Mi Día.
-- 3) Trigger mejorado: notifica al siguiente y también cuando todos
--    los pasos están completos.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Reescribir RLS de tareas para incluir 'abogado'
-- ------------------------------------------------------------
drop policy if exists tareas_select on public.tareas;
drop policy if exists tareas_insert on public.tareas;
drop policy if exists tareas_update on public.tareas;
drop policy if exists tareas_delete on public.tareas;

create policy tareas_select on public.tareas
  for select to authenticated
  using (
    exists (select 1 from public.perfiles p
            where p.id = auth.uid() and coalesce(p.activo,true) = true)
  );

create policy tareas_insert on public.tareas
  for insert to authenticated
  with check (
    exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
        and coalesce(p.activo,true) = true
        and coalesce(p.rol,'empleado') in ('admin','socio','abogado','empleado')
    )
  );

create policy tareas_update on public.tareas
  for update to authenticated
  using (
    exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
        and coalesce(p.activo,true) = true
        and (
          coalesce(p.rol,'empleado') in ('admin','socio','abogado','empleado')
          or (coalesce(p.rol,'empleado') = 'procurador'
              and public.tareas.responsable_id = auth.uid())
          -- responsable de cualquier paso de esta tarea también puede tocar la tarea madre
          or exists (
            select 1 from public.tarea_pasos tp
            where tp.tarea_id = public.tareas.id
              and tp.responsable_id = auth.uid()
          )
        )
    )
  )
  with check (true);

create policy tareas_delete on public.tareas
  for delete to authenticated
  using (
    exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
        and coalesce(p.activo,true) = true
        and coalesce(p.rol,'empleado') in ('admin','socio','abogado','empleado')
    )
  );

-- ------------------------------------------------------------
-- 2) Asegurar que el sync_estado pueda escribir tareas aunque RLS
--    sea estricta: SECURITY DEFINER + owner postgres (bypass).
-- ------------------------------------------------------------
create or replace function public.tarea_pasos_sync_estado()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tarea_id uuid;
  v_total int;
  v_completos int;
begin
  v_tarea_id := coalesce(new.tarea_id, old.tarea_id);
  if v_tarea_id is null then return coalesce(new, old); end if;

  select count(*), count(*) filter (where completado)
    into v_total, v_completos
  from public.tarea_pasos where tarea_id = v_tarea_id;

  if v_total > 0 and v_completos = v_total then
    update public.tareas
       set estado = 'completada',
           fecha_completada = coalesce(fecha_completada, now())
     where id = v_tarea_id and estado <> 'completada';
  elsif v_completos < v_total then
    update public.tareas
       set estado = 'en_curso',
           fecha_completada = null
     where id = v_tarea_id and estado = 'completada';
  end if;

  return coalesce(new, old);
end $$;

alter function public.tarea_pasos_sync_estado() owner to postgres;

drop trigger if exists trg_tarea_pasos_sync_estado on public.tarea_pasos;
create trigger trg_tarea_pasos_sync_estado
  after insert or update or delete on public.tarea_pasos
  for each row execute function public.tarea_pasos_sync_estado();

-- ------------------------------------------------------------
-- 3) Trigger notify_siguiente: mejorado + owner postgres
-- ------------------------------------------------------------
create or replace function public.tarea_pasos_notify_siguiente()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_siguiente record;
  v_tarea_titulo text;
  v_quien text;
  v_total int;
  v_completos int;
  has_notifs boolean;
begin
  if not (new.completado is true and (old.completado is null or old.completado = false)) then
    return new;
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notificaciones'
  ) into has_notifs;
  if not has_notifs then return new; end if;

  select titulo into v_tarea_titulo from public.tareas where id = new.tarea_id;
  select coalesce(nombre, 'Alguien') into v_quien
    from public.perfiles where id = new.completado_por;

  -- Buscar siguiente paso pendiente con responsable
  select * into v_siguiente
  from public.tarea_pasos
  where tarea_id = new.tarea_id
    and completado = false
    and responsable_id is not null
    and orden > new.orden
  order by orden asc
  limit 1;

  if v_siguiente.id is not null
     and v_siguiente.responsable_id <> coalesce(new.completado_por, '00000000-0000-0000-0000-000000000000'::uuid) then
    begin
      insert into public.notificaciones (user_id, titulo, mensaje, tipo, leida, created_at, link, related_id)
      values (
        v_siguiente.responsable_id,
        '⚡ Te toca continuar la tarea',
        v_quien || ' completó "' || coalesce(new.descripcion,'(sin descripción)') ||
        '". Ahora te toca: ' || coalesce(v_siguiente.descripcion,'(sin descripción)') ||
        ' (tarea: ' || coalesce(v_tarea_titulo, '—') || ')',
        'tarea_paso_siguiente',
        false,
        now(),
        '/mi-dia',
        new.tarea_id
      );
    exception when others then null; end;
  end if;

  -- Si TODOS los pasos están completos, avisar al creador / responsable principal
  select count(*), count(*) filter (where completado)
    into v_total, v_completos
  from public.tarea_pasos where tarea_id = new.tarea_id;

  if v_total > 0 and v_completos = v_total then
    begin
      insert into public.notificaciones (user_id, titulo, mensaje, tipo, leida, created_at, link, related_id)
      select
        t.responsable_id,
        '✅ Tarea compartida finalizada',
        'Todos los pasos de "' || coalesce(t.titulo,'(sin título)') || '" están completos.',
        'tarea_compartida_completa',
        false, now(), '/tareas', t.id
      from public.tareas t
      where t.id = new.tarea_id
        and t.responsable_id is not null
        and t.responsable_id <> coalesce(new.completado_por, '00000000-0000-0000-0000-000000000000'::uuid);
    exception when others then null; end;
  end if;

  return new;
end $$;

alter function public.tarea_pasos_notify_siguiente() owner to postgres;

-- ------------------------------------------------------------
-- 4) Vista para Mi Día: tareas donde participo (como responsable
--    principal O como responsable de algún paso) + flags útiles.
-- ------------------------------------------------------------
create or replace view public.tareas_mi_dia_con_pasos as
with mias as (
  -- responsable principal
  select t.id as tarea_id, t.responsable_id as user_id, null::uuid as paso_id,
         null::int as paso_orden, null::text as paso_descripcion,
         null::boolean as paso_completado, false as es_paso
  from public.tareas t
  where t.responsable_id is not null and coalesce(t.archivada,false) = false

  union all

  -- responsable de un paso
  select tp.tarea_id, tp.responsable_id, tp.id, tp.orden, tp.descripcion,
         tp.completado, true as es_paso
  from public.tarea_pasos tp
  join public.tareas t on t.id = tp.tarea_id
  where tp.responsable_id is not null and coalesce(t.archivada,false) = false
)
select
  m.user_id,
  m.tarea_id,
  m.es_paso,
  m.paso_id,
  m.paso_orden,
  m.paso_descripcion,
  m.paso_completado,
  -- ¿le toca AHORA? = es paso, no completado, y todos los anteriores están completos
  case when m.es_paso = true and m.paso_completado = false then
    not exists (
      select 1 from public.tarea_pasos tp2
      where tp2.tarea_id = m.tarea_id
        and tp2.orden < m.paso_orden
        and tp2.completado = false
    )
  else null end as paso_le_toca_ahora,
  t.titulo, t.descripcion, t.caso_id, t.prioridad, t.fecha_limite,
  t.estado, t.fecha_completada, t.created_at, t.updated_at
from mias m
join public.tareas t on t.id = m.tarea_id;

grant select on public.tareas_mi_dia_con_pasos to authenticated;

notify pgrst, 'reload schema';
