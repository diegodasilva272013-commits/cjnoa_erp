-- ============================================================
-- Cierre de caja NO destructivo.
--
-- Hasta ahora, el botón "Cerrar" de Flujo de Caja archivaba un
-- snapshot en cierres_mes_finanzas y DESPUÉS BORRABA con DELETE
-- los ingresos/egresos/movimientos de ese rango de las tablas
-- activas. Un bug en el cálculo del rango (ya corregido en el
-- código) hizo que se borraran datos que no correspondían.
--
-- Este cambio elimina el DELETE de raíz: en vez de borrar filas,
-- el cierre las marca con la columna cierre_periodo (a qué cierre
-- pertenecen). Los datos NUNCA se eliminan de la base al cerrar.
-- "Reabrir mes" ahora sí revierte de verdad: limpia la marca y
-- borra el snapshot, y las filas vuelven a aparecer como activas.
-- ============================================================
begin;

alter table public.ingresos_operativos
  add column if not exists cierre_periodo text references public.cierres_mes_finanzas(periodo) on delete set null;
create index if not exists ix_ingresos_op_cierre_periodo on public.ingresos_operativos (cierre_periodo);

alter table public.egresos_v2
  add column if not exists cierre_periodo text references public.cierres_mes_finanzas(periodo) on delete set null;
create index if not exists ix_egresos_v2_cierre_periodo on public.egresos_v2 (cierre_periodo);

alter table public.movimientos_caja
  add column if not exists cierre_periodo text references public.cierres_mes_finanzas(periodo) on delete set null;
create index if not exists ix_movimientos_caja_cierre_periodo on public.movimientos_caja (cierre_periodo);

commit;
