-- ============================================
-- TAREAS COMPARTIDAS / POR PASOS
-- ============================================
-- Una tarea (en public.tareas) puede tener varios pasos asignados a distintos
-- responsables. La tarea queda 'completada' automáticamente cuando todos los
-- pasos están completos. El orden es configurable y mañana puede cambiar.

create table if not exists public.tarea_pasos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas(id) on delete cascade,
  orden int not null default 1,
  descripcion text not null,
  responsable_id uuid references public.perfiles(id) on delete set null,
  completado boolean not null default false,
  completado_at timestamptz,
  completado_por uuid references public.perfiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tarea_pasos_tarea on public.tarea_pasos (tarea_id);
create index if not exists idx_tarea_pasos_responsable on public.tarea_pasos (responsable_id);
create index if not exists idx_tarea_pasos_orden on public.tarea_pasos (tarea_id, orden);

-- Touch updated_at
create or replace function public.tarea_pasos_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_tarea_pasos_touch on public.tarea_pasos;
create trigger trg_tarea_pasos_touch
  before update on public.tarea_pasos
  for each row execute function public.tarea_pasos_touch();

-- Cuando todos los pasos están completos -> marcar la tarea madre como completada
-- Cuando se desmarca alguno -> volver la tarea a 'en_curso'
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
      set estado = 'completada', fecha_completada = coalesce(fecha_completada, now())
      where id = v_tarea_id and estado <> 'completada';
  else
    update public.tareas
      set estado = 'en_curso', fecha_completada = null
      where id = v_tarea_id and estado = 'completada';
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists trg_tarea_pasos_sync_estado on public.tarea_pasos;
create trigger trg_tarea_pasos_sync_estado
  after insert or update or delete on public.tarea_pasos
  for each row execute function public.tarea_pasos_sync_estado();

-- View para listar pasos con nombre y avatar del responsable
create or replace view public.tarea_pasos_completos as
select
  tp.*,
  p_resp.nombre  as responsable_nombre,
  p_resp.avatar_url as responsable_avatar,
  p_done.nombre  as completado_por_nombre
from public.tarea_pasos tp
left join public.perfiles p_resp on p_resp.id = tp.responsable_id
left join public.perfiles p_done on p_done.id = tp.completado_por;

grant select on public.tarea_pasos_completos to authenticated;

-- RLS
alter table public.tarea_pasos enable row level security;

drop policy if exists "tarea_pasos_select" on public.tarea_pasos;
create policy "tarea_pasos_select" on public.tarea_pasos
  for select to authenticated
  using (exists (select 1 from public.perfiles p where p.id = auth.uid()));

drop policy if exists "tarea_pasos_insert" on public.tarea_pasos;
create policy "tarea_pasos_insert" on public.tarea_pasos
  for insert to authenticated
  with check (exists (select 1 from public.perfiles p where p.id = auth.uid()));

drop policy if exists "tarea_pasos_update" on public.tarea_pasos;
create policy "tarea_pasos_update" on public.tarea_pasos
  for update to authenticated
  using (exists (select 1 from public.perfiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.perfiles p where p.id = auth.uid()));

drop policy if exists "tarea_pasos_delete" on public.tarea_pasos;
create policy "tarea_pasos_delete" on public.tarea_pasos
  for delete to authenticated
  using (exists (select 1 from public.perfiles p where p.id = auth.uid()));

-- Notificaciones: cuando se completa un paso, avisar al responsable del siguiente
-- (si existe). Reutiliza la tabla notificaciones si existe.
create or replace function public.tarea_pasos_notify_siguiente()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_siguiente record;
  v_tarea_titulo text;
  v_quien text;
  has_notifs boolean;
begin
  if not (new.completado is true and (old.completado is null or old.completado = false)) then
    return new;
  end if;

  -- Tabla notificaciones existe?
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notificaciones'
  ) into has_notifs;
  if not has_notifs then return new; end if;

  select titulo into v_tarea_titulo from public.tareas where id = new.tarea_id;

  -- Buscar siguiente paso pendiente con responsable
  select * into v_siguiente
  from public.tarea_pasos
  where tarea_id = new.tarea_id
    and completado = false
    and responsable_id is not null
    and orden > new.orden
  order by orden asc
  limit 1;

  if v_siguiente.id is null then return new; end if;

  select coalesce(nombre, 'Alguien') into v_quien from public.perfiles where id = new.completado_por;

  begin
    insert into public.notificaciones (user_id, titulo, mensaje, tipo, leida, created_at)
    values (
      v_siguiente.responsable_id,
      'Tu turno en una tarea compartida',
      v_quien || ' completó su parte. Te toca: ' || coalesce(v_siguiente.descripcion, '(sin descripción)') ||
      ' (tarea: ' || coalesce(v_tarea_titulo, '—') || ')',
      'tarea_compartida',
      false,
      now()
    );
  exception when others then
    -- Si la tabla notificaciones tiene otro esquema, no rompemos el delete del paso
    null;
  end;

  return new;
end $$;

drop trigger if exists trg_tarea_pasos_notify_siguiente on public.tarea_pasos;
create trigger trg_tarea_pasos_notify_siguiente
  after update on public.tarea_pasos
  for each row execute function public.tarea_pasos_notify_siguiente();

notify pgrst, 'reload schema';
