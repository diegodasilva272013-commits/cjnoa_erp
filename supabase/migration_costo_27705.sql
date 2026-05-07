-- Persistir el costo mensual de la cuota Ley 27.705 en DB (no solo localStorage)
alter table public.configuracion_estudio
  add column if not exists costo_mensual_27705 numeric(12,2);
