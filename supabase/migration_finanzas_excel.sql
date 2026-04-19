alter table public.egresos drop constraint if exists egresos_responsable_check;

alter table public.egresos
add constraint egresos_responsable_check
check (responsable in ('Rodrigo', 'Noelia', 'Fabricio', 'Alejandro', 'CJ NOA'));