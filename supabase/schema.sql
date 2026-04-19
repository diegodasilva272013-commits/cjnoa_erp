-- ============================================
-- SCHEMA: Centro Jurídico NOA - ERP
-- Base de datos para Supabase (PostgreSQL)
-- ============================================

-- Extensión para UUID
create extension if not exists "uuid-ossp";

-- ============================================
-- TABLA: perfiles (vinculada a auth.users)
-- ============================================
create table public.perfiles (
  id uuid references auth.users on delete cascade primary key,
  nombre text not null,
  rol text not null default 'socio',
  created_at timestamptz default now()
);

alter table public.perfiles enable row level security;

create policy "Perfiles visibles para usuarios autenticados"
  on public.perfiles for select
  to authenticated
  using (true);

create policy "Perfiles insertables por trigger"
  on public.perfiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Usuarios pueden actualizar su perfil"
  on public.perfiles for update
  to authenticated
  using (auth.uid() = id);

-- ============================================
-- TABLA: clientes
-- ============================================
create table public.clientes (
  id uuid default uuid_generate_v4() primary key,
  nombre_apellido text not null,
  telefono text,
  created_at timestamptz default now(),
  created_by uuid references public.perfiles(id),
  updated_at timestamptz default now(),
  updated_by uuid references public.perfiles(id)
);

alter table public.clientes enable row level security;

create policy "Clientes visibles para autenticados"
  on public.clientes for select to authenticated using (true);
create policy "Clientes insertables por autenticados"
  on public.clientes for insert to authenticated with check (true);
create policy "Clientes editables por autenticados"
  on public.clientes for update to authenticated using (true);
create policy "Clientes eliminables por autenticados"
  on public.clientes for delete to authenticated using (true);

-- ============================================
-- TABLA: casos
-- ============================================
create table public.casos (
  id uuid default uuid_generate_v4() primary key,
  cliente_id uuid references public.clientes(id) on delete cascade not null,

  -- Información del caso
  materia text not null check (materia in ('Jubilaciones', 'Sucesorios', 'Reajuste', 'Otro')),
  materia_otro text,
  estado text not null check (estado in ('Vino a consulta', 'Trámite no judicial', 'Cliente Judicial')),
  socio text not null check (socio in ('Rodrigo', 'Noelia', 'Fabricio', 'Alejandro')),
  fecha date,

  -- Campos condicionales (estado = "Vino a consulta")
  interes text check (interes in ('Muy interesante', 'Interesante', 'Poco interesante') or interes is null),
  interes_porque text,
  fuente text check (fuente in ('Derivado', 'Campaña', 'Captadora') or fuente is null),
  captadora text check (captadora in ('Milagros - La Quiaca', 'Hilda - Norte') or captadora is null),

  -- Honorarios
  honorarios_monto numeric(12,2) default 0,
  modalidad_pago text check (modalidad_pago in ('Único', 'En cuotas') or modalidad_pago is null),

  -- Pago único
  pago_unico_pagado boolean,
  pago_unico_monto numeric(12,2),
  pago_unico_fecha date,

  -- Observaciones
  observaciones text,

  -- Auditoría
  created_at timestamptz default now(),
  created_by uuid references public.perfiles(id),
  updated_at timestamptz default now(),
  updated_by uuid references public.perfiles(id)
);

alter table public.casos enable row level security;

create policy "Casos visibles para autenticados"
  on public.casos for select to authenticated using (true);
create policy "Casos insertables por autenticados"
  on public.casos for insert to authenticated with check (true);
create policy "Casos editables por autenticados"
  on public.casos for update to authenticated using (true);
create policy "Casos eliminables por autenticados"
  on public.casos for delete to authenticated using (true);

-- ============================================
-- TABLA: cuotas
-- ============================================
create table public.cuotas (
  id uuid default uuid_generate_v4() primary key,
  caso_id uuid references public.casos(id) on delete cascade not null,
  fecha date not null,
  monto numeric(12,2) not null,
  estado text not null default 'Pendiente' check (estado in ('Pagado', 'Pendiente')),
  fecha_pago date,
  cobrado_por text check (cobrado_por in ('Rodrigo', 'Noelia', 'Fabricio', 'Alejandro') or cobrado_por is null),
  modalidad_pago text check (modalidad_pago in ('Efectivo', 'Transferencia') or modalidad_pago is null),
  notas text,
  created_at timestamptz default now()
);

alter table public.cuotas enable row level security;

create policy "Cuotas visibles para autenticados"
  on public.cuotas for select to authenticated using (true);
create policy "Cuotas insertables por autenticados"
  on public.cuotas for insert to authenticated with check (true);
create policy "Cuotas editables por autenticados"
  on public.cuotas for update to authenticated using (true);
create policy "Cuotas eliminables por autenticados"
  on public.cuotas for delete to authenticated using (true);

-- ============================================
-- TABLA: ingresos
-- ============================================
create table public.ingresos (
  id uuid default uuid_generate_v4() primary key,
  caso_id uuid references public.casos(id) on delete set null,
  fecha date not null default current_date,
  cliente_nombre text,
  materia text,
  concepto text,
  monto_total numeric(12,2) not null,
  monto_cj_noa numeric(12,2) not null,
  comision_captadora numeric(12,2) default 0,
  captadora_nombre text,
  socio_cobro text check (socio_cobro in ('Rodrigo', 'Noelia', 'Fabricio', 'Alejandro') or socio_cobro is null),
  modalidad text check (modalidad in ('Efectivo', 'Transferencia') or modalidad is null),
  notas text,
  es_manual boolean default false,
  created_at timestamptz default now()
);

alter table public.ingresos enable row level security;

create policy "Ingresos visibles para autenticados"
  on public.ingresos for select to authenticated using (true);
create policy "Ingresos insertables por autenticados"
  on public.ingresos for insert to authenticated with check (true);
create policy "Ingresos editables por autenticados"
  on public.ingresos for update to authenticated using (true);
create policy "Ingresos eliminables por autenticados"
  on public.ingresos for delete to authenticated using (true);

-- ============================================
-- TABLA: egresos
-- ============================================
create table public.egresos (
  id uuid default uuid_generate_v4() primary key,
  fecha date not null default current_date,
  concepto text not null,
  concepto_detalle text,
  caso_id uuid references public.casos(id) on delete set null,
  monto numeric(12,2) not null,
  modalidad text not null check (modalidad in ('Efectivo', 'Transferencia')),
  responsable text not null check (responsable in ('Rodrigo', 'Noelia', 'Fabricio', 'Alejandro', 'CJ NOA')),
  observaciones text,
  created_at timestamptz default now()
);

alter table public.egresos enable row level security;

create policy "Egresos visibles para autenticados"
  on public.egresos for select to authenticated using (true);
create policy "Egresos insertables por autenticados"
  on public.egresos for insert to authenticated with check (true);
create policy "Egresos editables por autenticados"
  on public.egresos for update to authenticated using (true);
create policy "Egresos eliminables por autenticados"
  on public.egresos for delete to authenticated using (true);

-- ============================================
-- TABLA: finanzas_excel_resumenes
-- ============================================
create table public.finanzas_excel_resumenes (
  id uuid default uuid_generate_v4() primary key,
  periodo text not null unique,
  hoja text not null,
  metricas jsonb not null default '{}'::jsonb,
  formulas jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.finanzas_excel_resumenes enable row level security;

create policy "Resumenes financieros visibles para autenticados"
  on public.finanzas_excel_resumenes for select to authenticated using (true);
create policy "Resumenes financieros insertables por autenticados"
  on public.finanzas_excel_resumenes for insert to authenticated with check (true);
create policy "Resumenes financieros editables por autenticados"
  on public.finanzas_excel_resumenes for update to authenticated using (true);
create policy "Resumenes financieros eliminables por autenticados"
  on public.finanzas_excel_resumenes for delete to authenticated using (true);

-- ============================================
-- FUNCIONES: Triggers de auditoría
-- ============================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_clientes
  before update on public.clientes
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_casos
  before update on public.casos
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_finanzas_excel_resumenes
  before update on public.finanzas_excel_resumenes
  for each row execute function public.handle_updated_at();

-- ============================================
-- FUNCIÓN: Crear perfil al registrar usuario
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', new.email));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================
-- VISTAS: Para consultas frecuentes
-- ============================================
create or replace view public.casos_completos as
select
  c.id,
  cl.nombre_apellido,
  cl.telefono,
  cl.id as cliente_id,
  c.materia,
  c.materia_otro,
  c.estado,
  c.socio,
  c.fecha,
  c.interes,
  c.interes_porque,
  c.fuente,
  c.captadora,
  c.honorarios_monto,
  c.modalidad_pago,
  c.pago_unico_pagado,
  c.pago_unico_monto,
  c.pago_unico_fecha,
  c.observaciones,
  c.created_at,
  c.updated_at,
  c.created_by,
  c.updated_by,
  coalesce(c.honorarios_monto, 0) as total_acordado,
  coalesce(
    case
      when c.modalidad_pago = 'Único' and c.pago_unico_pagado = true then c.pago_unico_monto
      else (select coalesce(sum(cu.monto), 0) from public.cuotas cu where cu.caso_id = c.id and cu.estado = 'Pagado')
    end, 0
  ) as total_cobrado,
  coalesce(c.honorarios_monto, 0) - coalesce(
    case
      when c.modalidad_pago = 'Único' and c.pago_unico_pagado = true then c.pago_unico_monto
      else (select coalesce(sum(cu.monto), 0) from public.cuotas cu where cu.caso_id = c.id and cu.estado = 'Pagado')
    end, 0
  ) as saldo_pendiente,
  p_created.nombre as creado_por_nombre,
  p_updated.nombre as editado_por_nombre
from public.casos c
join public.clientes cl on cl.id = c.cliente_id
left join public.perfiles p_created on p_created.id = c.created_by
left join public.perfiles p_updated on p_updated.id = c.updated_by;

-- ============================================
-- REALTIME: Habilitar para tablas principales
-- ============================================
alter publication supabase_realtime add table public.casos;
alter publication supabase_realtime add table public.clientes;
alter publication supabase_realtime add table public.cuotas;
alter publication supabase_realtime add table public.ingresos;
alter publication supabase_realtime add table public.egresos;

-- ============================================
-- DATOS INICIALES: Usuarios de ejemplo
-- ============================================
-- NOTA: Los usuarios se crean desde la interfaz de Supabase Auth
-- o desde la app. Los perfiles se crean automáticamente via trigger.
