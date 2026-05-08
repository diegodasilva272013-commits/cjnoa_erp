-- ============================================================
-- FIX TAREAS COMPARTIDAS - Versión 2 (definitiva)
-- ============================================================
-- Problemas que resuelve:
--   1) "no soy el responsable" al completar paso → trigger gate
--      bloquea procurador. Ahora permite si tiene algún paso.
--   2) Notificación al siguiente NO llegaba → estaba insertando en
--      tabla "notificaciones" pero la real es "notificaciones_app".
--   3) Mi Día no muestra tarea con mi paso → vista nueva +
--      fallback en frontend lee tarea_pasos directo.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Permitir CHECK constraint nuevos tipos de notificación
-- ------------------------------------------------------------
do $$
begin
  alter table public.notificaciones_app
    drop constraint if exists notificaciones_app_tipo_check;
  alter table public.notificaciones_app
    add constraint notificaciones_app_tipo_check
    check (tipo in (
      'tarea_asignada','tarea_vista','tarea_estado','nota_caso','generico',
      'tarea_paso_siguiente','tarea_compartida_completa','cargo_hora_pendiente',
      'cargo_hora_aprobado','cargo_hora_rechazado','consulta_agendada','tarea_paso_asignado'
    ));
exception when undefined_table then null;
end $$;

-- ------------------------------------------------------------
-- 2) Trigger gate de tareas: permitir procurador si tiene un paso
-- ------------------------------------------------------------
create or replace function public.tareas_before_update_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.current_rol();
  v_tiene_paso boolean;
begin
  if v_rol = 'procurador' then
    select exists (
      select 1 from public.tarea_pasos tp
      where tp.tarea_id = old.id and tp.responsable_id = auth.uid()
    ) into v_tiene_paso;

    if old.responsable_id is distinct from auth.uid() and not v_tiene_paso then
      raise exception 'No tenés permiso para modificar esta tarea (no sos el responsable ni tenés un paso asignado)';
    end if;

    -- Procurador NO puede archivar / cambiar metadatos clave (igual que antes)
    if new.archivada is distinct from old.archivada
       or new.titulo is distinct from old.titulo
       or new.caso_id is distinct from old.caso_id
       or new.responsable_id is distinct from old.responsable_id
       or new.prioridad is distinct from old.prioridad
       or new.fecha_limite is distinct from old.fecha_limite
       or new.cargo_hora is distinct from old.cargo_hora
       or new.descripcion is distinct from old.descripcion then
      raise exception 'Procurador solo puede actualizar avance (culminación, observaciones, estado, adjunto)';
    end if;
  end if;

  if new.estado = 'completada' and old.estado <> 'completada' then
    new.fecha_completada := now();
  elsif new.estado <> 'completada' and old.estado = 'completada' then
    new.fecha_completada := null;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.archivada = true and coalesce(old.archivada, false) = false then
    perform public.snapshot_tarea_a_historial(
      new,
      case when new.estado = 'completada' then 'completada_archivada' else 'archivada' end
    );
  end if;

  return new;
end $$;

alter function public.tareas_before_update_gate() owner to postgres;

drop trigger if exists trg_tareas_before_update on public.tareas;
create trigger trg_tareas_before_update
  before update on public.tareas
  for each row execute function public.tareas_before_update_gate();

-- ------------------------------------------------------------
-- 3) Trigger sync_estado: bypass del gate poniendo updated_by null
--    safety con SECURITY DEFINER + owner postgres
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
-- 4) Trigger notify_siguiente: usar notificaciones_app (la correcta)
-- ------------------------------------------------------------
create or replace function public.tarea_pasos_notify_siguiente()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_siguiente record;
  v_tarea_titulo text;
  v_quien text;
  v_total int;
  v_completos int;
begin
  if not (new.completado is true and (old.completado is null or old.completado = false)) then
    return new;
  end if;

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

  -- Si TODOS los pasos están completos, avisar al responsable principal
  select count(*), count(*) filter (where completado)
    into v_total, v_completos
  from public.tarea_pasos where tarea_id = new.tarea_id;

  if v_total > 0 and v_completos = v_total then
    begin
      insert into public.notificaciones_app
        (user_id, tipo, titulo, mensaje, link, related_id, related_user_id)
      select
        t.responsable_id,
        'tarea_compartida_completa',
        '✅ Tarea compartida finalizada',
        'Todos los pasos de "' || coalesce(t.titulo,'(sin título)') || '" están completos.',
        '/tareas',
        t.id,
        new.completado_por
      from public.tareas t
      where t.id = new.tarea_id
        and t.responsable_id is not null
        and t.responsable_id <> coalesce(new.completado_por, '00000000-0000-0000-0000-000000000000'::uuid);
    exception when others then null; end;
  end if;

  return new;
end $$;

alter function public.tarea_pasos_notify_siguiente() owner to postgres;

drop trigger if exists trg_tarea_pasos_notify_siguiente on public.tarea_pasos;
create trigger trg_tarea_pasos_notify_siguiente
  after update on public.tarea_pasos
  for each row execute function public.tarea_pasos_notify_siguiente();

-- ------------------------------------------------------------
-- 5) Trigger: cuando se ASIGNA un paso a alguien, notificarle
--    (al primer paso del orden, le avisamos enseguida)
-- ------------------------------------------------------------
create or replace function public.tarea_pasos_notify_asignacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_titulo text;
  v_es_primero boolean;
begin
  if new.responsable_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.responsable_id = new.responsable_id then return new; end if;

  select titulo into v_titulo from public.tareas where id = new.tarea_id;

  -- ¿es el primer paso pendiente?
  select not exists (
    select 1 from public.tarea_pasos tp
    where tp.tarea_id = new.tarea_id
      and tp.orden < new.orden
      and tp.completado = false
  ) into v_es_primero;

  begin
    insert into public.notificaciones_app
      (user_id, tipo, titulo, mensaje, link, related_id)
    values (
      new.responsable_id,
      'tarea_paso_asignado',
      case when v_es_primero
        then '🚀 Tenés un nuevo paso para arrancar'
        else 'Te asignaron un paso en una tarea compartida'
      end,
      coalesce(v_titulo,'Tarea') || ' — Paso: ' || coalesce(new.descripcion,'(sin descripción)'),
      '/mi-dia',
      new.tarea_id
    );
  exception when others then null; end;

  return new;
end $$;

alter function public.tarea_pasos_notify_asignacion() owner to postgres;

drop trigger if exists trg_tarea_pasos_notify_asignacion on public.tarea_pasos;
create trigger trg_tarea_pasos_notify_asignacion
  after insert or update of responsable_id on public.tarea_pasos
  for each row execute function public.tarea_pasos_notify_asignacion();

-- ------------------------------------------------------------
-- 6) Vista para Mi Día (idempotente, ya creada antes)
-- ------------------------------------------------------------
create or replace view public.tareas_mi_dia_con_pasos as
with mias as (
  select t.id as tarea_id, t.responsable_id as user_id, null::uuid as paso_id,
         null::int as paso_orden, null::text as paso_descripcion,
         null::boolean as paso_completado, false as es_paso
  from public.tareas t
  where t.responsable_id is not null and coalesce(t.archivada,false) = false

  union all

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
