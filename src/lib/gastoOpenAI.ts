// Cuentas de la pantalla "Gasto del agente": todo sale de las filas reales de uso_openai (una por llamada a OpenAI).

export type UsoOpenAI = { id: number; at: string; origen: string; modelo: string; entrada: number; salida: number; usd: number };
export type ConfigSaldo = { saldo_inicial: number | null; saldo_desde: string | null; actualizado_por?: string | null } | null;
export type CuentaOpenAI = { configurado: boolean; error?: string; dias?: { fecha: string; usd: number }[]; total_usd?: number } | null;

const ZONA = 'America/Argentina/Jujuy';
export const diaLocal = (iso: string | number | Date) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONA });
export const horaLocal = (iso: string | number | Date) => Number(new Date(iso).toLocaleString('en-GB', { timeZone: ZONA, hour: '2-digit', hour12: false })) % 24;
const suma = (xs: UsoOpenAI[]) => xs.reduce((t, x) => t + Number(x.usd || 0), 0);

export type ResumenGasto = {
  hoy: number; ultimaHora: number; mes: number; total: number;
  llamadasHoy: number; tokensHoy: number; promedioPorLlamada: number;
  porHora: number[]; porDia: { fecha: string; usd: number }[];
  porOrigen: { clave: string; usd: number; llamadas: number }[]; porModelo: { clave: string; usd: number; llamadas: number }[];
};

function agrupar(xs: UsoOpenAI[], clave: (x: UsoOpenAI) => string) {
  const m = new Map<string, { usd: number; llamadas: number }>();
  for (const x of xs) { const k = clave(x) || '—'; const v = m.get(k) ?? { usd: 0, llamadas: 0 }; v.usd += Number(x.usd || 0); v.llamadas++; m.set(k, v); }
  return [...m.entries()].map(([k, v]) => ({ clave: k, ...v })).sort((a, b) => b.usd - a.usd);
}

export function resumenGasto(filas: UsoOpenAI[], ahora = new Date()): ResumenGasto {
  const hoyClave = diaLocal(ahora);
  const mesClave = hoyClave.slice(0, 7);
  const deHoy = filas.filter(f => diaLocal(f.at) === hoyClave);
  const delMes = filas.filter(f => diaLocal(f.at).slice(0, 7) === mesClave);
  const hace1h = ahora.getTime() - 3600_000;
  const porHora = Array.from({ length: 24 }, () => 0);
  for (const f of deHoy) porHora[horaLocal(f.at)] += Number(f.usd || 0);
  const porDia = Array.from({ length: 14 }, (_, i) => {
    const fecha = diaLocal(ahora.getTime() - (13 - i) * 86400000);
    return { fecha, usd: suma(filas.filter(f => diaLocal(f.at) === fecha)) };
  });
  return {
    hoy: suma(deHoy),
    ultimaHora: suma(filas.filter(f => Date.parse(f.at) >= hace1h)),
    mes: suma(delMes),
    total: suma(filas),
    llamadasHoy: deHoy.length,
    tokensHoy: deHoy.reduce((t, f) => t + f.entrada + f.salida, 0),
    promedioPorLlamada: deHoy.length ? suma(deHoy) / deHoy.length : 0,
    porHora, porDia,
    porOrigen: agrupar(delMes, f => f.origen), porModelo: agrupar(delMes, f => f.modelo),
  };
}

/**
 * Saldo que queda. OpenAI no entrega el saldo por API: se parte del último saldo que anotó una persona
 * y se le resta lo gastado desde ese momento (con el gasto oficial de la cuenta si hay clave de administrador;
 * si no, con lo medido llamada por llamada).
 */
export function saldoEstimado(config: ConfigSaldo, filas: UsoOpenAI[], cuenta: CuentaOpenAI) {
  if (!config || config.saldo_inicial == null || !config.saldo_desde) return { saldo: null as number | null, gastado: 0, fuente: 'sin_saldo' as const };
  const desdeMs = Date.parse(config.saldo_desde);
  const medido = suma(filas.filter(f => Date.parse(f.at) >= desdeMs));
  if (cuenta?.configurado && !cuenta.error && Array.isArray(cuenta.dias)) {
    const desdeDia = diaLocal(desdeMs);
    const oficial = cuenta.dias.filter(d => d.fecha >= desdeDia).reduce((t, d) => t + d.usd, 0);
    return { saldo: Math.max(0, Number(config.saldo_inicial) - Math.max(oficial, medido)), gastado: Math.max(oficial, medido), fuente: 'openai' as const };
  }
  return { saldo: Math.max(0, Number(config.saldo_inicial) - medido), gastado: medido, fuente: 'registro' as const };
}

export const usd = (n: number, dec = 4) => `US$ ${n.toLocaleString('es-AR', { minimumFractionDigits: n >= 1 ? 2 : dec, maximumFractionDigits: n >= 1 ? 2 : dec })}`;
