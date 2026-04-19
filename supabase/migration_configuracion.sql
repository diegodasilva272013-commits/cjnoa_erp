-- Tabla de configuracion del estudio (fila unica)
-- Contiene parametros del negocio que antes estaban hardcodeados
create table if not exists public.configuracion_estudio (
  id uuid default uuid_generate_v4() primary key,
  reparto_base_pct numeric not null default 0.65,
  reparto_rendimiento_pct numeric not null default 0.35,
  comision_captadora_pct numeric not null default 0.20,
  updated_at timestamptz default now(),
  constraint config_unica check (reparto_base_pct + reparto_rendimiento_pct = 1.0),
  constraint porcentajes_validos check (
    reparto_base_pct >= 0 and reparto_base_pct <= 1
    and reparto_rendimiento_pct >= 0 and reparto_rendimiento_pct <= 1
    and comision_captadora_pct >= 0 and comision_captadora_pct <= 1
  )
);

-- Insertar fila por defecto con los valores actuales
insert into public.configuracion_estudio (reparto_base_pct, reparto_rendimiento_pct, comision_captadora_pct)
values (0.65, 0.35, 0.20)
on conflict do nothing;

alter table public.configuracion_estudio enable row level security;

create policy "Config visible para autenticados"
  on public.configuracion_estudio for select to authenticated using (true);
create policy "Config editable por autenticados"
  on public.configuracion_estudio for update to authenticated using (true);

create trigger set_updated_at_configuracion_estudio
  before update on public.configuracion_estudio
  for each row execute function public.handle_updated_at();
