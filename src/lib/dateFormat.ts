// Formato de fecha/hora exacto para el seguimiento de fichas (Provincial,
// Federal, Previsional). El pedido puntual fue: nada de "hace 1 d" que
// después muta a una fecha sin hora — mostrar SIEMPRE la fecha y hora
// completas y precisas, desde el primer momento, porque se usan para
// contar plazos. Formato: "13 de agosto de 2026 Hs: 11:29 A.M".
const MESES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function fmtFechaHoraExacta(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dia = d.getDate();
  const mes = MESES_LARGO[d.getMonth()];
  const anio = d.getFullYear();
  let h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'P.M' : 'A.M';
  h = h % 12; if (h === 0) h = 12;
  return `${dia} de ${mes} de ${anio} Hs: ${h}:${min} ${ampm}`;
}
