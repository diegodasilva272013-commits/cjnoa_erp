-- ============================================
-- MIGRATION: spec v1.0 (Centro Juridico NOA)
-- Crea modulos top-level paralelos a previsional sin tocarlos:
--   tareas             (Seguimiento de Tareas)
--   audiencias_general (Audiencias)
--   historial_caso     (Historial inmutable de cada ficha)
--   honorarios         (stub Honorarios y Cobros)
-- ============================================

-- ============================================
-- TAREAS (modulo Seguimiento, generico para cualquier caso)
-- ============================================
create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  caso_id uuid references public.casos(id) on delete set null,
  descripcion text,
  culminacion text,
  cargo_hora text,
  estado text not null default 'en_curso' check (estado in ('en_curso','completada')),
  prioridad text not null default 'sin_prioridad' check (prioridad in ('alta','media','sin_prioridad')),
  fecha_limite date,
  responsable_id uuid references public.perfiles(id) on delete set null,
  observaciones_demora text,
  adjunto_path text,
  adjunto_nombre text,
  archivada boolean not null default false,
  fecha_completada timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.perfiles(id) on delete set null,
  updated_by uuid references public.perfiles(id) on delete set null
);
create index if not exists idx_tareas_estado on public.tareas (estado);
create index if not exists idx_tareas_prioridad on public.tareas (prioridad);
create index if not exists idx_tareas_responsable on public.tareas (responsable_id);
create index if not exists idx_tareas_caso on public.tareas (caso_id);
create index if not exists idx_tareas_fecha_limite on public.tareas (fecha_limite);

create or replace view public.tareas_completas as
select
  t.*,
  cl.nombre_apellido as cliente_nombre,
  c.expediente,
  p_resp.nombre as responsable_nombre,
  p_create.nombre as creado_por_nombre
from public.tareas t
left join public.casos c on c.id = t.caso_id
left join public.clientes cl on cl.id = c.cliente_id
left join public.perfiles p_resp on p_resp.id = t.responsable_id
left join public.perfiles p_create on p_create.id = t.created_by;

-- ============================================
-- AUDIENCIAS (modulo top-level, generico)
-- ============================================
create table if not exists public.audiencias_general (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid references public.casos(id) on delete set null,
  fecha timestamptz not null,
  juzgado text,
  tipo text,
  abogado_id uuid references public.perfiles(id) on delete set null,
  notas text,
  realizada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.perfiles(id) on delete set null
);
create index if not exists idx_audiencias_general_fecha on public.audiencias_general (fecha);
create index if not exists idx_audiencias_general_caso on public.audiencias_general (caso_id);

create or replace view public.audiencias_general_completas as
select
  a.*,
  cl.nombre_apellido as cliente_nombre,
  p.nombre as abogado_nombre
from public.audiencias_general a
left join public.casos c on c.id = a.caso_id
left join public.clientes cl on cl.id = c.cliente_id
left join public.perfiles p on p.id = a.abogado_id;

-- ============================================
-- HISTORIAL DE CASO (inmutable, append-only)
-- Cada entrada es un avance + tarea siguiente
-- ============================================
create table if not exists public.historial_caso (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos(id) on delete cascade,
  titulo text not null,
  descripcion text,
  tarea_siguiente text,
  created_at timestamptz not null default now(),
  created_by uuid references public.perfiles(id) on delete set null
);
create index if not exists idx_historial_caso_caso on public.historial_caso (caso_id, created_at desc);

-- Trigger: prohibir UPDATE/DELETE (historial inmutable por spec seccion 4.2)
create or replace function public.historial_caso_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'historial_caso es inmutable: no se permiten UPDATE/DELETE';
  return null;
end;
$$;

drop trigger if exists historial_caso_no_update on public.historial_caso;
create trigger historial_caso_no_update before update on public.historial_caso
  for each row execute function public.historial_caso_inmutable();

drop trigger if exists historial_caso_no_delete on public.historial_caso;
create trigger historial_caso_no_delete before delete on public.historial_caso
  for each row execute function public.historial_caso_inmutable();

create or replace view public.historial_caso_completo as
select
  h.*,
  p.nombre as autor_nombre
from public.historial_caso h
left join public.perfiles p on p.id = h.created_by;

-- ============================================
-- HONORARIOS Y COBROS (stub v1, detalle en v2)
-- ============================================
create table if not exists public.honorarios (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid references public.casos(id) on delete set null,
  concepto text not null,
  monto numeric(14,2) not null default 0,
  estado_cobro text not null default 'pendiente' check (estado_cobro in ('pendiente','parcial','cobrado')),
  fecha date not null default current_date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.perfiles(id) on delete set null
);
create index if not exists idx_honorarios_caso on public.honorarios (caso_id);
create index if not exists idx_honorarios_estado on public.honorarios (estado_cobro);

create or replace view public.honorarios_completos as
select
  h.*,
  cl.nombre_apellido as cliente_nombre
from public.honorarios h
left join public.casos c on c.id = h.caso_id
left join public.clientes cl on cl.id = c.cliente_id;

-- ============================================
-- RLS basico (usuario autenticado ve/edita todo; restringimos honorarios a no-procurador)
-- ============================================
alter table public.tareas enable row level security;
alter table public.audiencias_general enable row level security;
alter table public.historial_caso enable row level security;
alter table public.honorarios enable row level security;

drop policy if exists "tareas_all_authenticated" on public.tareas;
create policy "tareas_all_authenticated" on public.tareas
  for all to authenticated using (true) with check (true);

drop policy if exists "audiencias_general_all_authenticated" on public.audiencias_general;
create policy "audiencias_general_all_authenticated" on public.audiencias_general
  for all to authenticated using (true) with check (true);

drop policy if exists "historial_caso_select_all" on public.historial_caso;
create policy "historial_caso_select_all" on public.historial_caso
  for select to authenticated using (true);

drop policy if exists "historial_caso_insert_all" on public.historial_caso;
create policy "historial_caso_insert_all" on public.historial_caso
  for insert to authenticated with check (true);

-- Honorarios: bloqueado para procurador
drop policy if exists "honorarios_no_procurador" on public.honorarios;
create policy "honorarios_no_procurador" on public.honorarios
  for all to authenticated
  using (
    exists (select 1 from public.perfiles p where p.id = auth.uid() and coalesce(p.rol,'empleado') <> 'procurador')
  )
  with check (
    exists (select 1 from public.perfiles p where p.id = auth.uid() and coalesce(p.rol,'empleado') <> 'procurador')
  );

-- ============================================
-- STORAGE bucket para adjuntos de tareas
-- ============================================
insert into storage.buckets (id, name, public)
values ('tareas-adjuntos', 'tareas-adjuntos', false)
on conflict (id) do nothing;

drop policy if exists "tareas_adjuntos_authenticated" on storage.objects;
create policy "tareas_adjuntos_authenticated" on storage.objects
  for all to authenticated
  using (bucket_id = 'tareas-adjuntos')
  with check (bucket_id = 'tareas-adjuntos');
