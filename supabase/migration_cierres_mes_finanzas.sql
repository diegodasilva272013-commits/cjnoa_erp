-- ============================================================
-- Cierres de mes finanzas — snapshot completo por periodo
-- ============================================================
begin;

create table if not exists public.cierres_mes_finanzas (
  id            uuid primary key default gen_random_uuid(),
  periodo       text not null unique,                 -- 'YYYY-MM'
  fecha_cierre  timestamptz not null default now(),
  snapshot      jsonb not null,                       -- { ingresos:[], egresos:[], movimientos:[], totales:{...} }
  observaciones text,
  created_by    uuid references public.perfiles(id)
);
create index if not exists ix_cierres_mes_periodo on public.cierres_mes_finanzas (periodo desc);

alter table public.cierres_mes_finanzas enable row level security;

drop policy if exists cm_select on public.cierres_mes_finanzas;
create policy cm_select on public.cierres_mes_finanzas for select using (auth.uid() is not null);

drop policy if exists cm_insert on public.cierres_mes_finanzas;
create policy cm_insert on public.cierres_mes_finanzas for insert with check (auth.uid() is not null);

drop policy if exists cm_delete on public.cierres_mes_finanzas;
create policy cm_delete on public.cierres_mes_finanzas for delete using (auth.uid() is not null);

commit;
