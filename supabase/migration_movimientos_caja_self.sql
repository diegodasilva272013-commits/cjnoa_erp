-- ============================================================
-- Permitir cambios de modalidad para el mismo socio (depósito/retiro)
-- y registrar correctamente el cambio efectivo↔transferencia.
-- ============================================================
begin;

alter table public.movimientos_caja drop constraint if exists ck_socios_distintos;
alter table public.movimientos_caja drop constraint if exists ck_modalidad_distinta;
alter table public.movimientos_caja
  add constraint ck_modalidad_distinta check (tipo_origen <> tipo_destino);

commit;
