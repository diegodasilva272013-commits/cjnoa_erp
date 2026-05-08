-- ============================================================
-- MVP estilo Slack sobre el chat existente (camino C: extender)
-- ============================================================
-- Reusa: chat_conversaciones, chat_participantes, chat_mensajes,
--        chat_lecturas, notificaciones, bucket "chat-media".
-- Agrega: tipo 'canal', hilos, reacciones, menciones, presencia,
--         full text search.
-- NO crea: workspaces, files, notifications, message_files
--          (todo eso ya existe con otros nombres).
-- ============================================================

-- ------------------------------------------------------------
-- 1) chat_conversaciones: permitir tipo 'canal' + metadatos
-- ------------------------------------------------------------
alter table public.chat_conversaciones
  drop constraint if exists chat_conversaciones_tipo_check;

alter table public.chat_conversaciones
  add constraint chat_conversaciones_tipo_check
  check (tipo in ('directo','grupo','canal'));

alter table public.chat_conversaciones
  add column if not exists descripcion  text,
  add column if not exists es_privado   boolean not null default false,
  add column if not exists archivada    boolean not null default false,
  add column if not exists slug         text;

-- slug único solo entre canales (no aplica a DM/grupo)
create unique index if not exists ux_chat_canal_slug
  on public.chat_conversaciones (slug)
  where tipo = 'canal' and slug is not null;

-- ------------------------------------------------------------
-- 2) chat_mensajes: hilos + full text search
-- ------------------------------------------------------------
alter table public.chat_mensajes
  add column if not exists parent_mensaje_id uuid
    references public.chat_mensajes(id) on delete cascade;

create index if not exists idx_chat_msg_parent
  on public.chat_mensajes (parent_mensaje_id);

-- FTS: columna generada en español (idempotente)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='chat_mensajes' and column_name='search_vector'
  ) then
    alter table public.chat_mensajes
      add column search_vector tsvector
      generated always as (to_tsvector('spanish', coalesce(contenido,''))) stored;
  end if;
end $$;

create index if not exists idx_chat_msg_search
  on public.chat_mensajes using gin (search_vector);

-- ------------------------------------------------------------
-- 3) Reacciones
-- ------------------------------------------------------------
create table if not exists public.chat_mensaje_reacciones (
  id          uuid primary key default gen_random_uuid(),
  mensaje_id  uuid not null references public.chat_mensajes(id) on delete cascade,
  usuario_id  uuid not null references public.perfiles(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (mensaje_id, usuario_id, emoji)
);
create index if not exists idx_chat_reac_msg on public.chat_mensaje_reacciones (mensaje_id);

alter table public.chat_mensaje_reacciones enable row level security;

drop policy if exists chat_reac_select on public.chat_mensaje_reacciones;
create policy chat_reac_select on public.chat_mensaje_reacciones
  for select to authenticated using (
    exists (
      select 1 from public.chat_mensajes m
      join public.chat_participantes p
        on p.conversacion_id = m.conversacion_id
      where m.id = chat_mensaje_reacciones.mensaje_id
        and p.usuario_id = auth.uid()
    )
  );

drop policy if exists chat_reac_insert on public.chat_mensaje_reacciones;
create policy chat_reac_insert on public.chat_mensaje_reacciones
  for insert to authenticated with check (
    usuario_id = auth.uid()
    and exists (
      select 1 from public.chat_mensajes m
      join public.chat_participantes p
        on p.conversacion_id = m.conversacion_id
      where m.id = chat_mensaje_reacciones.mensaje_id
        and p.usuario_id = auth.uid()
    )
  );

drop policy if exists chat_reac_delete on public.chat_mensaje_reacciones;
create policy chat_reac_delete on public.chat_mensaje_reacciones
  for delete to authenticated using (usuario_id = auth.uid());

-- ------------------------------------------------------------
-- 4) Menciones
-- ------------------------------------------------------------
create table if not exists public.chat_mensaje_menciones (
  id           uuid primary key default gen_random_uuid(),
  mensaje_id   uuid not null references public.chat_mensajes(id) on delete cascade,
  usuario_id   uuid not null references public.perfiles(id) on delete cascade,
  tipo         text not null default 'usuario' check (tipo in ('usuario','canal','todos')),
  created_at   timestamptz not null default now(),
  unique (mensaje_id, usuario_id, tipo)
);
create index if not exists idx_chat_men_user on public.chat_mensaje_menciones (usuario_id);
create index if not exists idx_chat_men_msg  on public.chat_mensaje_menciones (mensaje_id);

alter table public.chat_mensaje_menciones enable row level security;

drop policy if exists chat_men_select on public.chat_mensaje_menciones;
create policy chat_men_select on public.chat_mensaje_menciones
  for select to authenticated using (
    usuario_id = auth.uid() or exists (
      select 1 from public.chat_mensajes m
      join public.chat_participantes p
        on p.conversacion_id = m.conversacion_id
      where m.id = chat_mensaje_menciones.mensaje_id
        and p.usuario_id = auth.uid()
    )
  );

drop policy if exists chat_men_insert on public.chat_mensaje_menciones;
create policy chat_men_insert on public.chat_mensaje_menciones
  for insert to authenticated with check (
    exists (
      select 1 from public.chat_mensajes m
      where m.id = chat_mensaje_menciones.mensaje_id
        and m.emisor_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 5) Presencia
-- ------------------------------------------------------------
create table if not exists public.chat_presencia (
  usuario_id     uuid primary key references public.perfiles(id) on delete cascade,
  estado         text not null default 'offline' check (estado in ('online','offline','away')),
  ultima_vista   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.chat_presencia enable row level security;

drop policy if exists chat_pres_select on public.chat_presencia;
create policy chat_pres_select on public.chat_presencia
  for select to authenticated using (true);

drop policy if exists chat_pres_upsert on public.chat_presencia;
create policy chat_pres_upsert on public.chat_presencia
  for insert to authenticated with check (usuario_id = auth.uid());

drop policy if exists chat_pres_update on public.chat_presencia;
create policy chat_pres_update on public.chat_presencia
  for update to authenticated using (usuario_id = auth.uid());

-- ------------------------------------------------------------
-- 6) Trigger: notificar menciones reusando tabla "notificaciones"
-- ------------------------------------------------------------
create or replace function public.chat_mencion_notificar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_emisor    text;
  v_contenido text;
  v_conv      uuid;
  has_notifs  boolean;
begin
  if new.tipo <> 'usuario' then return new; end if;
  if new.usuario_id is null then return new; end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='notificaciones'
  ) into has_notifs;
  if not has_notifs then return new; end if;

  select m.conversacion_id, m.contenido, p.nombre
    into v_conv, v_contenido, v_emisor
  from public.chat_mensajes m
  left join public.perfiles p on p.id = m.emisor_id
  where m.id = new.mensaje_id;

  -- no notificar si te mencionás a vos mismo
  if v_emisor is not null and exists (
    select 1 from public.chat_mensajes m
    where m.id = new.mensaje_id and m.emisor_id = new.usuario_id
  ) then
    return new;
  end if;

  begin
    insert into public.notificaciones (user_id, titulo, mensaje, tipo, leida, created_at, link, related_id)
    values (
      new.usuario_id,
      'Te mencionaron en el chat',
      coalesce(v_emisor,'Alguien') || ': ' || coalesce(left(v_contenido, 140),''),
      'chat_mencion',
      false,
      now(),
      '/chat',
      v_conv
    );
  exception when others then
    -- si la tabla notificaciones tiene otro esquema, no rompemos la mención
    null;
  end;

  return new;
end $$;

drop trigger if exists trg_chat_mencion_notificar on public.chat_mensaje_menciones;
create trigger trg_chat_mencion_notificar
  after insert on public.chat_mensaje_menciones
  for each row execute function public.chat_mencion_notificar();

-- ------------------------------------------------------------
-- 7) RPC: crear canal (público o privado)
-- ------------------------------------------------------------
create or replace function public.chat_crear_canal(
  p_nombre      text,
  p_descripcion text default null,
  p_privado     boolean default false
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_slug text;
begin
  if auth.uid() is null then raise exception 'No auth'; end if;
  if p_nombre is null or length(trim(p_nombre)) = 0 then
    raise exception 'Nombre requerido';
  end if;

  v_slug := lower(regexp_replace(trim(p_nombre), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);

  insert into public.chat_conversaciones (tipo, nombre, descripcion, es_privado, slug, creada_por)
  values ('canal', trim(p_nombre), p_descripcion, coalesce(p_privado, false), v_slug, auth.uid())
  returning id into v_id;

  insert into public.chat_participantes (conversacion_id, usuario_id, rol)
  values (v_id, auth.uid(), 'admin');

  return v_id;
end $$;

grant execute on function public.chat_crear_canal(text, text, boolean) to authenticated;

-- ------------------------------------------------------------
-- 8) RPC: unirse a canal público
-- ------------------------------------------------------------
create or replace function public.chat_unirse_canal(p_canal_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_privado boolean;
  v_tipo    text;
begin
  if auth.uid() is null then raise exception 'No auth'; end if;

  select tipo, es_privado into v_tipo, v_privado
  from public.chat_conversaciones where id = p_canal_id;

  if v_tipo is null then raise exception 'Canal no existe'; end if;
  if v_tipo <> 'canal' then raise exception 'No es un canal'; end if;
  if coalesce(v_privado, false) then
    raise exception 'Canal privado: requiere invitación';
  end if;

  insert into public.chat_participantes (conversacion_id, usuario_id, rol)
  values (p_canal_id, auth.uid(), 'miembro')
  on conflict (conversacion_id, usuario_id) do nothing;

  return true;
end $$;

grant execute on function public.chat_unirse_canal(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9) RPC: búsqueda full text en mis conversaciones
-- ------------------------------------------------------------
create or replace function public.chat_buscar_mensajes(p_query text)
returns table (
  id              uuid,
  conversacion_id uuid,
  emisor_id       uuid,
  contenido       text,
  created_at      timestamptz,
  rank            real
)
language sql security definer set search_path = public as $$
  select
    m.id, m.conversacion_id, m.emisor_id, m.contenido, m.created_at,
    ts_rank(m.search_vector, plainto_tsquery('spanish', p_query)) as rank
  from public.chat_mensajes m
  where m.eliminado = false
    and m.search_vector @@ plainto_tsquery('spanish', p_query)
    and exists (
      select 1 from public.chat_participantes p
      where p.conversacion_id = m.conversacion_id
        and p.usuario_id = auth.uid()
    )
  order by rank desc, m.created_at desc
  limit 50;
$$;

grant execute on function public.chat_buscar_mensajes(text) to authenticated;

-- ------------------------------------------------------------
-- 10) Vista: canales públicos del estudio (para descubrir)
-- ------------------------------------------------------------
create or replace view public.chat_canales_publicos as
select
  c.id,
  c.nombre,
  c.descripcion,
  c.slug,
  c.created_at,
  (select count(*) from public.chat_participantes p where p.conversacion_id = c.id) as miembros
from public.chat_conversaciones c
where c.tipo = 'canal'
  and c.es_privado = false
  and c.archivada = false;

grant select on public.chat_canales_publicos to authenticated;

-- ------------------------------------------------------------
-- 11) Realtime para reacciones y menciones
-- ------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.chat_mensaje_reacciones;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.chat_mensaje_menciones;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.chat_presencia;
  exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
