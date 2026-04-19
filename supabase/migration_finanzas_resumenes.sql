create table if not exists public.finanzas_excel_resumenes (
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

create trigger set_updated_at_finanzas_excel_resumenes
  before update on public.finanzas_excel_resumenes
  for each row execute function public.handle_updated_at();
