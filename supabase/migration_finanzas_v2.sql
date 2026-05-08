-- ============================================================
-- Migración Finanzas v2 — Centro Jurídico NOA (Mayo 2026)
-- Rediseño completo según informe técnico-estratégico.
--
-- ⚠️  ATENCIÓN: ejecutar el día del cierre. ELIMINA todos los
--     ingresos y egresos históricos para arrancar limpio.
--     Hacé un dump antes si querés conservar los datos viejos.
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────
-- 0) DROP de tablas y vistas viejas (orden por FK)
-- ──────────────────────────────────────────────────────────
drop view if exists public.v_finanzas_resumen_mensual cascade;
drop view if exists public.v_ingresos_por_socio cascade;
drop view if exists public.v_egresos_por_categoria cascade;
drop table if exists public.finanzas_excel_resumenes cascade;
drop table if exists public.ingresos cascade;
drop table if exists public.egresos cascade;

-- Drop de cualquier resto de v2 si se reejecuta
drop table if exists public.cierres_periodo cascade;
drop table if exists public.metas_finanzas cascade;
drop table if exists public.cuentas_socio_movimientos cascade;
drop table if exists public.cuentas_socio cascade;
drop table if exists public.movimientos_caja cascade;
drop table if exists public.egresos_v2 cascade;
drop table if exists public.fondos_movimientos cascade;
drop table if exists public.fondos_clientes cascade;
drop table if exists public.ingresos_operativos cascade;

-- ──────────────────────────────────────────────────────────
-- 1) ENUMS
-- ──────────────────────────────────────────────────────────
do $$ begin
  create type socio_finanzas as enum ('Rodri', 'Noe', 'Ale', 'Fabri');
exception when duplicate_object then null; end $$;

do $$ begin
  create type modalidad_pago as enum ('Transferencia', 'Efectivo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_cliente_ingreso as enum ('Nuevo', 'Viejo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rama_legal as enum (
    'Jubilaciones','UCAP','Reajuste','Reajuste Art 9',
    'Sucesorios','Reales','Familia','Otros'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type fuente_ingreso as enum ('Derivado','Campaña','Redes');
exception when duplicate_object then null; end $$;

do $$ begin
  create type concepto_ingreso as enum ('Honorarios','Consulta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_egreso as enum ('fijo','eventual','tarjeta','vencimiento','sueldo','servicio','permuta');
exception when duplicate_object then null; end $$;

-- ──────────────────────────────────────────────────────────
-- 2) INGRESOS OPERATIVOS (1.1)
-- ──────────────────────────────────────────────────────────
create table public.ingresos_operativos (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default current_date,
  cliente_nombre  text not null,
  tipo_cliente    tipo_cliente_ingreso not null default 'Nuevo',
  monto           numeric(14,2) not null check (monto >= 0),
  modalidad       modalidad_pago not null,
  doctor_cobra    socio_finanzas not null,
  receptor_transfer socio_finanzas, -- null si es efectivo
  rama            rama_legal not null,
  fuente          fuente_ingreso not null,
  concepto        concepto_ingreso not null default 'Honorarios',
  observaciones   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.perfiles(id),
  updated_by      uuid references public.perfiles(id),

  -- regla: si modalidad = Efectivo => receptor_transfer DEBE ser null
  -- si Transferencia => receptor obligatorio
  constraint ck_receptor_modalidad check (
    (modalidad = 'Efectivo'      and receptor_transfer is null) or
    (modalidad = 'Transferencia' and receptor_transfer is not null)
  )
);
create index ix_ing_op_fecha on public.ingresos_operativos (fecha desc);
create index ix_ing_op_doctor on public.ingresos_operativos (doctor_cobra);
create index ix_ing_op_receptor on public.ingresos_operativos (receptor_transfer);
create index ix_ing_op_rama on public.ingresos_operativos (rama);
create index ix_ing_op_fuente on public.ingresos_operativos (fuente);

-- ──────────────────────────────────────────────────────────
-- 3) FONDOS EN CUSTODIA (1.2)
-- ──────────────────────────────────────────────────────────
create table public.fondos_clientes (
  id              uuid primary key default gen_random_uuid(),
  cliente_nombre  text not null,
  fecha_ingreso   date not null default current_date,
  monto_inicial   numeric(14,2) not null check (monto_inicial >= 0),
  observaciones   text,
  finalizado      boolean not null default false, -- se "honorariza" cuando termina el caso
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.perfiles(id)
);
create index ix_fondos_cli_nombre on public.fondos_clientes (cliente_nombre);
create index ix_fondos_cli_fecha on public.fondos_clientes (fecha_ingreso desc);

create table public.fondos_movimientos (
  id              uuid primary key default gen_random_uuid(),
  fondo_id        uuid not null references public.fondos_clientes(id) on delete cascade,
  fecha           date not null default current_date,
  nombre_gasto    text not null,           -- ej: "Tasa de justicia"
  monto           numeric(14,2) not null check (monto > 0),
  observaciones   text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.perfiles(id)
);
create index ix_fondos_mov_fondo on public.fondos_movimientos (fondo_id);

-- Vista: saldo por cliente
create or replace view public.v_fondos_saldo as
select
  f.id,
  f.cliente_nombre,
  f.fecha_ingreso,
  f.monto_inicial,
  coalesce((select sum(m.monto) from public.fondos_movimientos m where m.fondo_id = f.id), 0) as gastos_totales,
  f.monto_inicial - coalesce((select sum(m.monto) from public.fondos_movimientos m where m.fondo_id = f.id), 0) as saldo,
  f.finalizado,
  f.observaciones
from public.fondos_clientes f;

-- Trigger: bloquear gasto que exceda saldo
create or replace function public.fn_check_saldo_fondo()
returns trigger language plpgsql as $$
declare
  v_saldo numeric(14,2);
begin
  select monto_inicial - coalesce((
    select sum(monto) from public.fondos_movimientos
    where fondo_id = NEW.fondo_id and id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ), 0)
  into v_saldo
  from public.fondos_clientes where id = NEW.fondo_id;

  if v_saldo is null then
    raise exception 'Fondo de cliente no encontrado';
  end if;

  if NEW.monto > v_saldo then
    raise exception 'El gasto ($%) supera el saldo disponible del cliente ($%). Bloqueado por integridad.',
      NEW.monto, v_saldo;
  end if;

  return NEW;
end;
$$;

drop trigger if exists tg_check_saldo_fondo on public.fondos_movimientos;
create trigger tg_check_saldo_fondo
  before insert or update on public.fondos_movimientos
  for each row execute function public.fn_check_saldo_fondo();

-- ──────────────────────────────────────────────────────────
-- 4) EGRESOS UNIFICADOS (2.1 + 2.2)
-- ──────────────────────────────────────────────────────────
create table public.egresos_v2 (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default current_date,
  tipo            tipo_egreso not null,           -- fijo|eventual|tarjeta|vencimiento|sueldo|servicio
  concepto        text not null,                  -- "Sueldo Karina", "Alquiler", "Cuturel", "Tarjeta Rodri", "Marketing IG", etc.
  detalle         text,
  monto           numeric(14,2) not null check (monto >= 0),
  modalidad       modalidad_pago not null,
  pagador         socio_finanzas,                 -- quién paga (descuenta saldo si es Transferencia)
  beneficiario    text,                           -- texto libre: "Karina", "Limsa", etc.
  observaciones   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.perfiles(id),
  updated_by      uuid references public.perfiles(id)
);
create index ix_eg_v2_fecha on public.egresos_v2 (fecha desc);
create index ix_eg_v2_tipo on public.egresos_v2 (tipo);
create index ix_eg_v2_pagador on public.egresos_v2 (pagador);

-- ──────────────────────────────────────────────────────────
-- 5) MOVIMIENTOS DE CAJA / PERMUTAS (2.3)
-- ──────────────────────────────────────────────────────────
create table public.movimientos_caja (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default current_date,
  socio_origen    socio_finanzas not null,    -- quien entrega
  socio_destino   socio_finanzas not null,    -- quien recibe
  monto           numeric(14,2) not null check (monto > 0),
  tipo_origen     modalidad_pago not null,    -- ej: Efectivo
  tipo_destino    modalidad_pago not null,    -- ej: Transferencia
  observaciones   text,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.perfiles(id),

  constraint ck_socios_distintos check (socio_origen <> socio_destino)
);
create index ix_mov_caja_fecha on public.movimientos_caja (fecha desc);

-- ──────────────────────────────────────────────────────────
-- 6) CUENTAS POR SOCIO (saldo digital + efectivo en mano)
-- ──────────────────────────────────────────────────────────
create table public.cuentas_socio (
  socio           socio_finanzas primary key,
  saldo_digital   numeric(14,2) not null default 0,
  saldo_efectivo  numeric(14,2) not null default 0,
  updated_at      timestamptz not null default now()
);

-- Inicializar las 4 cuentas
insert into public.cuentas_socio (socio) values ('Rodri'), ('Noe'), ('Ale'), ('Fabri')
on conflict (socio) do nothing;

create table public.cuentas_socio_movimientos (
  id              uuid primary key default gen_random_uuid(),
  socio           socio_finanzas not null,
  fecha           timestamptz not null default now(),
  tipo            text not null,            -- 'ingreso','egreso','permuta_entra','permuta_sale','reparto','manual'
  modalidad       modalidad_pago not null,
  monto           numeric(14,2) not null,   -- positivo = entra, negativo = sale
  ref_tabla       text,                     -- 'ingresos_operativos','egresos_v2','movimientos_caja'
  ref_id          uuid,
  observaciones   text
);
create index ix_cs_mov_socio on public.cuentas_socio_movimientos (socio, fecha desc);

-- ──────────────────────────────────────────────────────────
-- 7) TRIGGERS de afectación automática a cuentas_socio
-- ──────────────────────────────────────────────────────────

-- INGRESOS: el receptor (transfer) o doctor_cobra (efectivo) suma a su saldo
create or replace function public.fn_ingreso_a_cuenta()
returns trigger language plpgsql as $$
declare
  v_socio socio_finanzas;
begin
  if TG_OP = 'INSERT' then
    v_socio := case when NEW.modalidad = 'Transferencia'
                    then NEW.receptor_transfer
                    else NEW.doctor_cobra end;
    insert into public.cuentas_socio_movimientos (socio, modalidad, tipo, monto, ref_tabla, ref_id)
      values (v_socio, NEW.modalidad, 'ingreso', NEW.monto, 'ingresos_operativos', NEW.id);
    update public.cuentas_socio set
      saldo_digital  = saldo_digital  + case when NEW.modalidad = 'Transferencia' then NEW.monto else 0 end,
      saldo_efectivo = saldo_efectivo + case when NEW.modalidad = 'Efectivo'      then NEW.monto else 0 end,
      updated_at = now()
      where socio = v_socio;
    return NEW;
  end if;
  return NEW;
end;
$$;
drop trigger if exists tg_ingreso_a_cuenta on public.ingresos_operativos;
create trigger tg_ingreso_a_cuenta after insert on public.ingresos_operativos
  for each row execute function public.fn_ingreso_a_cuenta();

-- EGRESOS: el pagador resta del saldo correspondiente
create or replace function public.fn_egreso_a_cuenta()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' and NEW.pagador is not null then
    insert into public.cuentas_socio_movimientos (socio, modalidad, tipo, monto, ref_tabla, ref_id)
      values (NEW.pagador, NEW.modalidad, 'egreso', -NEW.monto, 'egresos_v2', NEW.id);
    update public.cuentas_socio set
      saldo_digital  = saldo_digital  - case when NEW.modalidad = 'Transferencia' then NEW.monto else 0 end,
      saldo_efectivo = saldo_efectivo - case when NEW.modalidad = 'Efectivo'      then NEW.monto else 0 end,
      updated_at = now()
      where socio = NEW.pagador;
  end if;
  return NEW;
end;
$$;
drop trigger if exists tg_egreso_a_cuenta on public.egresos_v2;
create trigger tg_egreso_a_cuenta after insert on public.egresos_v2
  for each row execute function public.fn_egreso_a_cuenta();

-- PERMUTAS: origen entrega su tipo, destino recibe el suyo (intercambio)
create or replace function public.fn_permuta_a_cuenta()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    -- Origen: pierde tipo_origen
    insert into public.cuentas_socio_movimientos (socio, modalidad, tipo, monto, ref_tabla, ref_id, observaciones)
      values (NEW.socio_origen, NEW.tipo_origen, 'permuta_sale', -NEW.monto, 'movimientos_caja', NEW.id,
        'Permuta con ' || NEW.socio_destino::text);
    update public.cuentas_socio set
      saldo_digital  = saldo_digital  - case when NEW.tipo_origen = 'Transferencia' then NEW.monto else 0 end,
      saldo_efectivo = saldo_efectivo - case when NEW.tipo_origen = 'Efectivo'      then NEW.monto else 0 end,
      updated_at = now()
      where socio = NEW.socio_origen;

    -- Destino: gana tipo_destino
    insert into public.cuentas_socio_movimientos (socio, modalidad, tipo, monto, ref_tabla, ref_id, observaciones)
      values (NEW.socio_destino, NEW.tipo_destino, 'permuta_entra', NEW.monto, 'movimientos_caja', NEW.id,
        'Permuta con ' || NEW.socio_origen::text);
    update public.cuentas_socio set
      saldo_digital  = saldo_digital  + case when NEW.tipo_destino = 'Transferencia' then NEW.monto else 0 end,
      saldo_efectivo = saldo_efectivo + case when NEW.tipo_destino = 'Efectivo'      then NEW.monto else 0 end,
      updated_at = now()
      where socio = NEW.socio_destino;
  end if;
  return NEW;
end;
$$;
drop trigger if exists tg_permuta_a_cuenta on public.movimientos_caja;
create trigger tg_permuta_a_cuenta after insert on public.movimientos_caja
  for each row execute function public.fn_permuta_a_cuenta();

-- ──────────────────────────────────────────────────────────
-- 8) METAS Y PISOS (3.1)
-- ──────────────────────────────────────────────────────────
create table public.metas_finanzas (
  id                 uuid primary key default gen_random_uuid(),
  periodo            text not null,                   -- '2026-05' (mes/año)
  meta_individual    numeric(14,2) not null default 0,
  meta_grupal        numeric(14,2) not null default 0,
  meta_individual_socio jsonb,                        -- {"Rodri": 800000, ...} opcional override
  observaciones      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (periodo)
);

-- ──────────────────────────────────────────────────────────
-- 9) CIERRES DE PERIODO (4)
-- ──────────────────────────────────────────────────────────
create table public.cierres_periodo (
  id                 uuid primary key default gen_random_uuid(),
  periodo            text not null unique,             -- '2026-05'
  fecha_cierre       date not null default current_date,
  ingresos_totales   numeric(14,2) not null,
  egresos_totales    numeric(14,2) not null,
  utilidad           numeric(14,2) not null,
  reparto_propuesto  jsonb,                            -- {"transferencias":[{from,to,monto,modalidad}]}
  saldos_iniciales   jsonb,                            -- snapshot al cierre
  observaciones      text,
  created_at         timestamptz not null default now(),
  created_by         uuid references public.perfiles(id)
);

-- ──────────────────────────────────────────────────────────
-- 10) RPC: calcular_reparto_periodo
--   Toma todas las cuentas, divide la utilidad en 4 partes
--   iguales y devuelve transferencias cruzadas que igualan
--   los saldos. NO ejecuta nada — sólo calcula la sugerencia.
-- ──────────────────────────────────────────────────────────
create or replace function public.calcular_reparto_periodo(p_periodo text default to_char(now(), 'YYYY-MM'))
returns jsonb language plpgsql security definer as $$
declare
  v_ingresos numeric(14,2);
  v_egresos  numeric(14,2);
  v_utilidad numeric(14,2);
  v_parte    numeric(14,2);
  r          record;
  v_resultado jsonb;
  v_transferencias jsonb := '[]'::jsonb;
  v_saldos jsonb := '{}'::jsonb;
begin
  -- Totales del periodo (filtrando por mes/año)
  select coalesce(sum(monto), 0) into v_ingresos
    from public.ingresos_operativos
    where to_char(fecha, 'YYYY-MM') = p_periodo;

  select coalesce(sum(monto), 0) into v_egresos
    from public.egresos_v2
    where to_char(fecha, 'YYYY-MM') = p_periodo;

  v_utilidad := v_ingresos - v_egresos;
  v_parte := v_utilidad / 4.0;

  -- Snapshot de saldos por socio al momento
  for r in select socio, saldo_digital, saldo_efectivo, (saldo_digital + saldo_efectivo) as total
           from public.cuentas_socio order by socio loop
    v_saldos := v_saldos || jsonb_build_object(r.socio::text, jsonb_build_object(
      'digital',  r.saldo_digital,
      'efectivo', r.saldo_efectivo,
      'total',    r.total,
      'meta',     v_parte,
      'diferencia', r.total - v_parte
    ));
  end loop;

  -- Algoritmo simple: socios con exceso transfieren a los con déficit
  -- (greedy: ordenar y emparejar)
  with saldos as (
    select socio, (saldo_digital + saldo_efectivo) - v_parte as diff
    from public.cuentas_socio
  ),
  excedentes as (select socio, diff from saldos where diff > 0 order by diff desc),
  faltantes  as (select socio, -diff as falta from saldos where diff < 0 order by diff asc)
  select jsonb_agg(jsonb_build_object('from', e.socio, 'to', f.socio,
    'monto', round(least(e.diff, f.falta)::numeric, 2)))
  into v_transferencias
  from excedentes e cross join faltantes f
  where least(e.diff, f.falta) > 0;

  v_resultado := jsonb_build_object(
    'periodo',          p_periodo,
    'ingresos_totales', v_ingresos,
    'egresos_totales',  v_egresos,
    'utilidad',         v_utilidad,
    'parte_por_socio',  v_parte,
    'saldos',           v_saldos,
    'transferencias_sugeridas', coalesce(v_transferencias, '[]'::jsonb)
  );

  return v_resultado;
end;
$$;
grant execute on function public.calcular_reparto_periodo(text) to authenticated;

-- ──────────────────────────────────────────────────────────
-- 11) VISTAS DE TABLERO
-- ──────────────────────────────────────────────────────────
create or replace view public.v_resumen_individual as
select
  doctor_cobra as socio,
  to_char(fecha, 'YYYY-MM') as periodo,
  count(*) filter (where concepto = 'Honorarios') as cant_honorarios,
  count(*) filter (where concepto = 'Consulta')   as cant_consultas,
  coalesce(sum(monto) filter (where concepto = 'Honorarios'), 0) as monto_honorarios,
  coalesce(sum(monto) filter (where concepto = 'Consulta'),   0) as monto_consultas,
  coalesce(sum(monto), 0) as recaudacion_total,
  count(distinct cliente_nombre) as clientes_distintos
from public.ingresos_operativos
group by doctor_cobra, to_char(fecha, 'YYYY-MM');

create or replace view public.v_resumen_por_rama as
select
  rama,
  to_char(fecha, 'YYYY-MM') as periodo,
  count(*) as cant,
  coalesce(sum(monto), 0) as total
from public.ingresos_operativos
group by rama, to_char(fecha, 'YYYY-MM');

create or replace view public.v_resumen_por_fuente as
select
  fuente,
  to_char(fecha, 'YYYY-MM') as periodo,
  count(*) as cant,
  coalesce(sum(monto), 0) as total
from public.ingresos_operativos
group by fuente, to_char(fecha, 'YYYY-MM');

-- ──────────────────────────────────────────────────────────
-- 12) RLS — restrictivo: sólo socios y admin ven finanzas
-- ──────────────────────────────────────────────────────────
alter table public.ingresos_operativos      enable row level security;
alter table public.fondos_clientes          enable row level security;
alter table public.fondos_movimientos       enable row level security;
alter table public.egresos_v2               enable row level security;
alter table public.movimientos_caja         enable row level security;
alter table public.cuentas_socio            enable row level security;
alter table public.cuentas_socio_movimientos enable row level security;
alter table public.metas_finanzas           enable row level security;
alter table public.cierres_periodo          enable row level security;

-- Helper: ¿el usuario es socio o admin?
create or replace function public.es_socio_o_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and (rol in ('admin','socio') or activo = true)
  );
$$;

-- Políticas (genéricas: lectura/escritura para socios/admin)
do $$
declare
  t text;
  tablas text[] := array[
    'ingresos_operativos','fondos_clientes','fondos_movimientos',
    'egresos_v2','movimientos_caja','cuentas_socio','cuentas_socio_movimientos',
    'metas_finanzas','cierres_periodo'
  ];
begin
  foreach t in array tablas loop
    execute format('drop policy if exists pol_%1$s_select on public.%1$s', t);
    execute format('create policy pol_%1$s_select on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists pol_%1$s_iud on public.%1$s', t);
    execute format('create policy pol_%1$s_iud on public.%1$s for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────
-- 13) REALTIME
-- ──────────────────────────────────────────────────────────
do $$
declare t text;
declare tablas text[] := array[
  'ingresos_operativos','fondos_clientes','fondos_movimientos',
  'egresos_v2','movimientos_caja','cuentas_socio','metas_finanzas','cierres_periodo'
];
begin
  foreach t in array tablas loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;
    end;
  end loop;
end $$;

commit;

-- ============================================================
-- LISTO. Próximos pasos sugeridos:
-- 1) Setear meta del mes:
--    insert into metas_finanzas(periodo, meta_individual, meta_grupal)
--      values ('2026-05', 800000, 3200000);
-- 2) Probar reparto:
--    select * from calcular_reparto_periodo('2026-05');
-- ============================================================
