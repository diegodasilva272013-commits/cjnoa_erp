-- Agregar campos de auditoria a ingresos y egresos
-- created_by / updated_by se setean automaticamente con auth.uid()

alter table public.ingresos
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id);

alter table public.egresos
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id);

-- Trigger para setear created_by automaticamente al insertar
create or replace function public.set_audit_created_by()
returns trigger as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$ language plpgsql security definer;

-- Trigger para setear updated_by automaticamente al actualizar
create or replace function public.set_audit_updated_by()
returns trigger as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$ language plpgsql security definer;

-- Ingresos triggers
create trigger set_created_by_ingresos
  before insert on public.ingresos
  for each row execute function public.set_audit_created_by();

create trigger set_updated_by_ingresos
  before update on public.ingresos
  for each row execute function public.set_audit_updated_by();

-- Egresos triggers
create trigger set_created_by_egresos
  before insert on public.egresos
  for each row execute function public.set_audit_created_by();

create trigger set_updated_by_egresos
  before update on public.egresos
  for each row execute function public.set_audit_updated_by();
