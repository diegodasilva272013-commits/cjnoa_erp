-- Agregar campo telefono a casos_generales
-- Permite registrar el número de contacto del cliente al crear/editar un caso

alter table public.casos_generales
  add column if not exists telefono text;

-- Índice parcial para búsqueda por teléfono
create index if not exists idx_casos_generales_telefono
  on public.casos_generales (telefono)
  where telefono is not null;
