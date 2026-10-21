import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, MessageCircle, Send, Inbox, Mic, Image as ImagenIcon, FileText, Link2, Wallet, CalendarCheck, Sparkles, Snowflake, TrendingDown, Receipt, Banknote,
  UserCheck, RefreshCw, Lightbulb, Gauge, Hand, Repeat, UserX, AlertTriangle, Activity, Zap, Target, ShieldCheck,
} from 'lucide-react';
import AgenteAvatar from './AgenteAvatar';
import type { MetricasAgente, InformeMejoras } from '../../lib/agentesApi';

const ESTILOS = `
.tw-barra { transition: width 1s cubic-bezier(.2,.8,.2,1), opacity .6s; }
.tw-anillo { transition: stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1); }
.tw-columna { transition: height .9s cubic-bezier(.2,.8,.2,1); }
@keyframes tw-brillo { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes tw-aparece { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
@keyframes tw-latido { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
.tw-brillo { background-image: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent); background-size: 200% 100%; animation: tw-brillo 1.6s linear infinite; }
.tw-aparece { animation: tw-aparece .6s both; }
.tw-latido { animation: tw-latido 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .tw-escena *, .tw-escena { transition: none !important; animation: none !important; } }
`;

const ETAPAS: Record<string, { nombre: string; icono: ReactNode }> = {
  consulto: { nombre: 'Escribieron', icono: <MessageCircle className="size-4" /> },
  datos: { nombre: 'Dieron sus datos', icono: <UserCheck className="size-4" /> },
  propuesta: { nombre: 'Recibieron el valor de la consulta', icono: <Banknote className="size-4" /> },
  forma_pago: { nombre: 'Eligieron cómo pagar', icono: <Wallet className="size-4" /> },
  reserva: { nombre: 'Pagaron la reserva', icono: <ShieldCheck className="size-4" /> },
  agendada: { nombre: 'Agendaron su cita', icono: <CalendarCheck className="size-4" /> },
};
const FRENOS: Record<string, string> = {
  valor_de_la_consulta: 'Después de decirles el valor', forma_de_pago: 'Después de preguntarles cómo pagar', datos_de_pago: 'Después de pasarles los datos de pago',
  horarios: 'Después de ofrecerles horarios', pidio_recibo: 'Después de pedirles el recibo', pidio_datos: 'Después de pedirles sus datos',
  aviso_de_recepcion: 'Después de avisar que recibió su archivo', otra_pregunta: 'Después de otra pregunta', cierre: 'Después de confirmar la cita', otro: 'Después de otro mensaje',
};
const ESTADO_PERSONA = {
  agendada: { t: 'Agendó su cita', c: 'bg-emerald-500/15 text-emerald-300' },
  en_curso: { t: 'Conversando', c: 'bg-sky-500/15 text-sky-300' },
  abandonada: { t: 'Se enfrió', c: 'bg-rose-500/15 text-rose-300' },
} as const;

const num = (n: number) => n.toLocaleString('es-AR');
const haceMs = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 90) return 'recién';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
};

/** Para que las barras y los anillos "crezcan" al aparecer. */
function useMontado() {
  const [listo, setListo] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setListo(true)); return () => cancelAnimationFrame(r); }, []);
  return listo;
}

/** Número que sube hasta su valor. */
function Contador({ valor, className }: { valor: number; className?: string }) {
  const [v, setV] = useState(0);
  const previo = useRef(0);
  useEffect(() => {
    const quieto = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (quieto || previo.current === valor) { setV(valor); previo.current = valor; return; }
    const desde = previo.current, t0 = performance.now(), dur = 900;
    let raf = 0;
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(desde + (valor - desde) * e));
      if (k < 1) raf = requestAnimationFrame(paso); else previo.current = valor;
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <span className={className}>{num(v)}</span>;
}

function Anillo({ pct, color = '#34d399', tam = 120, grosor = 11, children }: { pct: number; color?: string; tam?: number; grosor?: number; children?: ReactNode }) {
  const listo = useMontado();
  const r = (tam - grosor) / 2, c = 2 * Math.PI * r, lleno = (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <div className="relative" style={{ width: tam, height: tam }}>
      <svg width={tam} height={tam} className="-rotate-90">
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={grosor} />
        <circle className="tw-anillo" cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeDasharray={`${listo ? lleno : 0} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

type Parte = { valor: number; color: string; etiqueta: string };

function Dona({ partes, tam = 170, grosor = 18, centro }: { partes: Parte[]; tam?: number; grosor?: number; centro: ReactNode }) {
  const listo = useMontado();
  const total = partes.reduce((a, p) => a + p.valor, 0);
  const r = (tam - grosor) / 2, c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <div className="relative" style={{ width: tam, height: tam }}>
      <svg width={tam} height={tam} className="-rotate-90">
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={grosor} />
        {total > 0 && partes.filter(p => p.valor > 0).map(p => {
          const largo = (p.valor / total) * c, inicio = acumulado; acumulado += largo;
          return <circle key={p.etiqueta} className="tw-anillo" cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={p.color} strokeWidth={grosor} strokeDasharray={`${listo ? Math.max(0, largo - 3) : 0} ${c}`} strokeDashoffset={-inicio} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{centro}</div>
    </div>
  );
}

function Apilada({ partes }: { partes: Parte[] }) {
  const listo = useMontado();
  const total = partes.reduce((a, p) => a + p.valor, 0);
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
      {total > 0 && partes.filter(p => p.valor > 0).map(p => <div key={p.etiqueta} className="tw-barra h-full" title={`${p.etiqueta}: ${p.valor}`} style={{ width: listo ? `${(p.valor / total) * 100}%` : '0%', backgroundColor: p.color }} />)}
    </div>
  );
}

function Leyenda({ partes }: { partes: Parte[] }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {partes.map(p => (
        <li key={p.etiqueta} className="flex items-center justify-between gap-3 text-[13px]">
          <span className="flex items-center gap-2 text-gray-300"><i className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />{p.etiqueta}</span>
          <span className="font-semibold tabular-nums text-white">{num(p.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

function Tarjeta({ titulo, subtitulo, icono, children, className = '', retraso = 0 }: { titulo?: string; subtitulo?: string; icono?: ReactNode; children: ReactNode; className?: string; retraso?: number }) {
  return (
    <section className={`tw-aparece rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-5 shadow-[0_10px_40px_-20px_rgba(0,0,0,.8)] ${className}`} style={{ animationDelay: `${retraso}ms` }}>
      {titulo && (
        <header className="mb-4 flex items-start gap-3">
          {icono && <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-emerald-300">{icono}</span>}
          <div className="min-w-0"><h2 className="text-[15px] font-semibold text-white">{titulo}</h2>{subtitulo && <p className="mt-0.5 text-xs text-gray-500">{subtitulo}</p>}</div>
        </header>
      )}
      {children}
    </section>
  );
}

function Cifra({ icono, titulo, valor, detalle, acento = 'text-emerald-300' }: { icono: ReactNode; titulo: string; valor: number; detalle?: ReactNode; acento?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3.5">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ${acento}`}>{icono}</span>
      <div className="min-w-0">
        <Contador valor={valor} className="block text-2xl font-semibold tabular-nums leading-none text-white" />
        <p className="mt-1 truncate text-xs text-gray-400">{titulo}</p>
        {detalle && <p className="mt-0.5 truncate text-[11px] text-gray-600">{detalle}</p>}
      </div>
    </div>
  );
}

const PERIODOS: { dias: number | null; texto: string }[] = [{ dias: 7, texto: '7 días' }, { dias: 30, texto: '30 días' }, { dias: 90, texto: '90 días' }, { dias: null, texto: 'Todo' }];

export type PropsTablero = {
  m: MetricasAgente; dias: number | null; onDias: (d: number | null) => void;
  informe: InformeMejoras | null; optimizando: boolean; progreso: { tarea: string; porcentaje: number } | null; onOptimizar: () => void; actualizando?: boolean;
};

export default function TableroAgente({ m, dias, onDias, informe, optimizando, progreso, onOptimizar, actualizando }: PropsTablero) {
  const periodoTexto = dias === null ? 'desde el principio' : `últimos ${dias} días`;
  const listo = useMontado();
  const maxDia = Math.max(1, ...m.por_dia.flatMap(d => [d.nuevas, d.agendadas]));
  const ultimaAct = m.actividad_reciente[0];
  const estadosPartes: Parte[] = [
    { valor: m.estados.agendadas, color: '#34d399', etiqueta: 'Agendaron su cita' },
    { valor: m.estados.en_curso, color: '#38bdf8', etiqueta: 'Siguen conversando' },
    { valor: m.estados.abandonadas, color: '#fb7185', etiqueta: 'Se quedaron a la mitad' },
  ];
  const recibosPartes: Parte[] = [
    { valor: m.recibos.sin_cargo, color: '#34d399', etiqueta: 'Consulta sin cargo' }, { valor: m.recibos.con_cargo, color: '#38bdf8', etiqueta: 'Consulta con reserva' },
    { valor: m.recibos.sin_descuento, color: '#a78bfa', etiqueta: 'Sin descuento' }, { valor: m.recibos.sin_importe, color: '#fbbf24', etiqueta: 'No se leyó el importe' }, { valor: m.recibos.ilegibles, color: '#fb7185', etiqueta: 'Ilegibles' },
  ];
  const compPartes: Parte[] = [
    { valor: m.comprobantes.validados, color: '#34d399', etiqueta: 'Validados' }, { valor: m.comprobantes.pendientes_mp, color: '#38bdf8', etiqueta: 'Esperando a Mercado Pago' },
    { valor: m.comprobantes.insuficientes, color: '#fbbf24', etiqueta: 'Importe menor' }, { valor: m.comprobantes.otro_titular, color: '#f472b6', etiqueta: 'A otro titular' }, { valor: m.comprobantes.ilegibles, color: '#fb7185', etiqueta: 'Ilegibles' },
  ];
  const maxFreno = Math.max(1, ...m.donde_mueren.map(x => x.cantidad));

  return (
    <div className="tw-escena space-y-6">
      <style>{ESTILOS}</style>

      {/* ---------- portada ---------- */}
      <section className="relative overflow-hidden rounded-[2rem] border border-emerald-400/20 bg-gradient-to-br from-[#0c2a27] via-[#0b1c24] to-[#0a0f1a] p-6 md:p-8">
        <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-0 size-96 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative flex flex-col items-center gap-6 md:flex-row md:items-center md:gap-10">
          <AgenteAvatar activo tam={210} />
          <div className="min-w-0 flex-1 text-center md:text-left">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-emerald-300/80">Centro Jurídico NOA · Agente de WhatsApp</p>
            <h1 className="mt-1 text-3xl font-semibold text-white md:text-4xl">Noa</h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-300 md:mx-0">Atiende a quienes escriben por WhatsApp, entiende sus audios y sus recibos, les explica cómo sigue la consulta y les agenda la cita con el abogado.</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300"><i className="tw-latido size-2 rounded-full bg-emerald-400" /> En línea</span>
              <span className="rounded-full bg-white/[0.07] px-3 py-1 text-xs text-gray-300">{num(m.personas)} personas · {periodoTexto}</span>
              {ultimaAct && <span className="rounded-full bg-white/[0.07] px-3 py-1 text-xs text-gray-400">Última actividad {haceMs(ultimaAct.hace_ms)}</span>}
              {actualizando && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1 text-xs text-gray-400"><RefreshCw className="size-3 animate-spin" /> Actualizando</span>}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col items-stretch gap-3 md:w-auto md:items-end">
            <div className="flex justify-center gap-1 rounded-full bg-black/30 p-1 md:justify-end">
              {PERIODOS.map(p => (
                <button key={p.texto} onClick={() => onDias(p.dias)} className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${dias === p.dias ? 'bg-emerald-400 text-black shadow' : 'text-gray-400 hover:text-white'}`}>{p.texto}</button>
              ))}
            </div>
            <button onClick={onOptimizar} disabled={optimizando} className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-sky-400 px-5 py-3 text-sm font-semibold text-black shadow-[0_12px_30px_-10px_rgba(52,211,153,.7)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70">
              <Sparkles className={`size-4 ${optimizando ? 'animate-pulse' : 'transition group-hover:rotate-12'}`} /> {optimizando ? 'Analizando…' : 'Analizar y proponer mejoras'}
            </button>
          </div>
        </div>
      </section>

      {m.confianza === 'baja' && m.personas > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>Hay pocas conversaciones ({m.personas}): los porcentajes todavía se mueven mucho. Con 30 o más empiezan a ser confiables.</span>
        </div>
      )}

      {/* ---------- cifras grandes ---------- */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tarjeta className="flex flex-col justify-center gap-3" retraso={0}>
          <Cifra icono={<Users className="size-5" />} titulo="Personas que escribieron" valor={m.personas} detalle={`${num(m.estados.en_curso)} conversando ahora`} />
          <Cifra icono={<Inbox className="size-5" />} titulo="Mensajes recibidos" valor={m.mensajes.recibidos} acento="text-sky-300" />
          <Cifra icono={<Send className="size-5" />} titulo="Mensajes enviados por Noa" valor={m.mensajes.enviados} acento="text-violet-300" />
        </Tarjeta>
        <Tarjeta titulo="Contestaron el primer mensaje" subtitulo="Respondieron después de que Noa les escribió" icono={<Hand className="size-4" />} className="flex flex-col items-center" retraso={80}>
          <Anillo pct={m.primer_contacto.pct_contestaron} color="#34d399" tam={136}>
            <span className="text-3xl font-semibold tabular-nums text-white">{m.primer_contacto.pct_contestaron}%</span>
            <span className="text-[11px] text-gray-500">contestaron</span>
          </Anillo>
          <p className="mt-3 text-center text-sm text-gray-300"><b className="text-white">{num(m.primer_contacto.contestaron)}</b> de {num(m.personas)} personas</p>
          <p className="text-center text-xs text-rose-300/90">{num(m.primer_contacto.no_contestaron)} no contestaron</p>
        </Tarjeta>
        <Tarjeta titulo="Cómo terminaron" subtitulo="Qué pasó con cada persona" icono={<Gauge className="size-4" />} className="flex flex-col items-center" retraso={160}>
          <Dona partes={estadosPartes} tam={150} grosor={16} centro={<><Contador valor={m.estados.agendadas} className="text-3xl font-semibold tabular-nums text-white" /><span className="text-[11px] text-gray-500">con cita</span></>} />
          <div className="w-full"><Leyenda partes={estadosPartes} /></div>
        </Tarjeta>
        <Tarjeta titulo="Personas con cita agendada" subtitulo="Lo que Noa logró cerrar" icono={<CalendarCheck className="size-4" />} className="flex flex-col justify-between" retraso={240}>
          <div>
            <Contador valor={m.estados.agendadas} className="block text-5xl font-semibold tabular-nums text-white" />
            <p className="mt-1 text-sm text-emerald-300">{m.personas ? `${Math.round((m.estados.agendadas / m.personas) * 1000) / 10}% de las personas que escribieron` : 'Sin datos todavía'}</p>
            {m.turnos.agendados > m.estados.agendadas && <p className="mt-1 text-[11px] text-gray-500">{num(m.turnos.agendados)} citas en total: algunas personas agendaron más de una.</p>}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[{ t: 'Reprogramadas', v: m.turnos.reprogramados, i: <Repeat className="mx-auto size-4" /> }, { t: 'Piden cancelar', v: m.turnos.cancelaciones_solicitadas, i: <UserX className="mx-auto size-4" /> }, { t: 'Con reserva pagada', v: m.turnos.con_reserva_pagada, i: <ShieldCheck className="mx-auto size-4" /> }].map(x => (
              <div key={x.t} className="rounded-xl bg-white/[0.04] px-1.5 py-2.5 text-gray-400">{x.i}<Contador valor={x.v} className="mt-1 block text-lg font-semibold text-white" /><span className="block text-[10px] leading-tight">{x.t}</span></div>
            ))}
          </div>
        </Tarjeta>
      </div>

      {/* ---------- recorrido + dónde se enfría ---------- */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Tarjeta titulo="El recorrido de cada persona" subtitulo="Cuántas llegan a cada paso hasta la cita" icono={<Target className="size-4" />} className="lg:col-span-3" retraso={0}>
          <ol>
            {m.embudo.map((e, i) => {
              const antes = i > 0 ? m.embudo[i - 1].alcanzaron : e.alcanzaron;
              const perdidas = i > 0 ? antes - e.alcanzaron : 0;
              return (
                <li key={e.etapa}>
                  {i > 0 && (
                    <div className="ml-[19px] flex items-center gap-3 border-l border-dashed border-white/15 py-2 pl-6">
                      {perdidas > 0
                        ? <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] text-rose-300"><TrendingDown className="size-3" /> se fueron {num(perdidas)} ({antes ? Math.round((perdidas / antes) * 100) : 0}%)</span>
                        : <span className="text-[11px] text-gray-600">no se perdió a nadie</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full border ${i === m.embudo.length - 1 ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300' : 'border-white/15 bg-white/[0.05] text-gray-300'}`}>{ETAPAS[e.etapa]?.icono}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm text-gray-200">{ETAPAS[e.etapa]?.nombre ?? e.etapa}</span>
                        <span className="shrink-0 text-sm tabular-nums"><b className="text-white">{num(e.alcanzaron)}</b> <span className="text-gray-500">· {e.pct_del_total}%</span></span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="tw-barra h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400" style={{ width: listo ? `${e.pct_del_total}%` : '0%' }} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-[11px] text-gray-600">El porcentaje grande es sobre todas las personas que escribieron. Quien llega a un paso cuenta también en los anteriores.</p>
        </Tarjeta>

        <Tarjeta titulo="¿Dónde se enfría la conversación?" subtitulo="Lo último que dijo Noa antes de que dejaran de contestar" icono={<Snowflake className="size-4" />} className="lg:col-span-2" retraso={80}>
          {m.sin_respuesta_del_agente > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"><AlertTriangle className="size-4 shrink-0" /> {num(m.sin_respuesta_del_agente)} {m.sin_respuesta_del_agente === 1 ? 'persona espera' : 'personas esperan'} una respuesta de Noa</div>
          )}
          {m.donde_mueren.length === 0 ? (
            <p className="rounded-xl bg-white/[0.04] p-4 text-sm text-gray-500">Todavía no hay conversaciones que se hayan enfriado en este período.</p>
          ) : (
            <ul className="space-y-3.5">
              {m.donde_mueren.map(x => (
                <li key={x.categoria}>
                  <div className="flex items-baseline justify-between gap-3 text-[13px]"><span className="text-gray-200">{FRENOS[x.categoria] ?? x.categoria}</span><span className="shrink-0 tabular-nums"><b className="text-white">{num(x.cantidad)}</b> <span className="text-gray-500">· {x.pct}%</span></span></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="tw-barra h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-300" style={{ width: listo ? `${(x.cantidad / maxFreno) * 100}%` : '0%' }} /></div>
                </li>
              ))}
            </ul>
          )}
          {m.se_quedaron_en.some(x => x.cantidad > 0) && (
            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="mb-2 text-xs text-gray-500">Se quedaron a la mitad, en este paso:</p>
              <div className="flex flex-wrap gap-1.5">
                {m.se_quedaron_en.filter(x => x.cantidad > 0).map(x => <span key={x.etapa} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-gray-300">{ETAPAS[x.etapa]?.nombre} · <b className="text-white">{x.cantidad}</b></span>)}
              </div>
            </div>
          )}
        </Tarjeta>
      </div>

      {/* ---------- ritmo ---------- */}
      <Tarjeta titulo="Ritmo de las consultas" subtitulo="Personas nuevas por día y citas que se cargaron" icono={<Activity className="size-4" />} retraso={0}>
        <div className="mb-2 flex gap-4 text-xs text-gray-400"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-sky-400" /> Personas nuevas</span><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-emerald-400" /> Citas agendadas</span></div>
        <svg viewBox="0 0 600 150" className="w-full" preserveAspectRatio="none" role="img" aria-label="Personas nuevas y citas por día">
          {[0.25, 0.5, 0.75].map(k => <line key={k} x1="0" x2="600" y1={130 - k * 110} y2={130 - k * 110} stroke="rgba(255,255,255,.06)" />)}
          {m.por_dia.map((d, i) => {
            const ancho = 600 / m.por_dia.length, alto = (d.nuevas / maxDia) * 110;
            return <rect key={d.fecha} className="tw-columna" x={i * ancho + ancho * 0.18} width={ancho * 0.64} y={130 - (listo ? alto : 0)} height={listo ? alto : 0} rx="3" fill="#38bdf8" opacity=".85"><title>{d.fecha}: {d.nuevas} personas nuevas</title></rect>;
          })}
          <polyline fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={m.por_dia.map((d, i) => `${i * (600 / m.por_dia.length) + 600 / m.por_dia.length / 2},${130 - (d.agendadas / maxDia) * 110}`).join(' ')} />
          {m.por_dia.map((d, i) => d.agendadas > 0 && <circle key={d.fecha} cx={i * (600 / m.por_dia.length) + 600 / m.por_dia.length / 2} cy={130 - (d.agendadas / maxDia) * 110} r="3.5" fill="#34d399"><title>{d.fecha}: {d.agendadas} citas</title></circle>)}
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-gray-600"><span>{m.por_dia[0]?.fecha.slice(5).split('-').reverse().join('/')}</span><span>{m.por_dia[Math.floor(m.por_dia.length / 2)]?.fecha.slice(5).split('-').reverse().join('/')}</span><span>{m.por_dia[m.por_dia.length - 1]?.fecha.slice(5).split('-').reverse().join('/')}</span></div>
      </Tarjeta>

      {/* ---------- lo que mandan ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta titulo="Lo que mandan" subtitulo="Además de escribir" icono={<Mic className="size-4" />} retraso={0}>
          <div className="grid grid-cols-2 gap-3">
            {[{ t: 'Audios', v: m.mensajes.audios, i: <Mic className="size-5" />, c: 'text-violet-300' }, { t: 'Fotos', v: m.mensajes.fotos, i: <ImagenIcon className="size-5" />, c: 'text-sky-300' },
              { t: 'Documentos', v: m.mensajes.documentos, i: <FileText className="size-5" />, c: 'text-amber-300' }, { t: 'No se pudieron leer', v: m.mensajes.no_leidos, i: <AlertTriangle className="size-5" />, c: 'text-rose-300' }].map(x => (
              <div key={x.t} className="rounded-2xl bg-white/[0.04] p-3.5"><span className={x.c}>{x.i}</span><Contador valor={x.v} className="mt-2 block text-2xl font-semibold tabular-nums text-white" /><span className="text-xs text-gray-400">{x.t}</span></div>
            ))}
          </div>
        </Tarjeta>
        <Tarjeta titulo="Recibos de sueldo" subtitulo="Lo que Noa pudo leer" icono={<Receipt className="size-4" />} retraso={80}>
          <div className="mb-3 flex items-end gap-2"><Contador valor={m.recibos.total} className="text-4xl font-semibold tabular-nums text-white" /><span className="pb-1 text-sm text-gray-500">recibos recibidos</span></div>
          {m.recibos.total > 0 ? <><Apilada partes={recibosPartes} /><Leyenda partes={recibosPartes} /></> : <p className="text-sm text-gray-500">Todavía no llegó ninguno en este período.</p>}
        </Tarjeta>
        <Tarjeta titulo="Comprobantes de pago" subtitulo="Transferencias que mandaron" icono={<Banknote className="size-4" />} retraso={160}>
          <div className="mb-3 flex items-end gap-2"><Contador valor={m.comprobantes.total} className="text-4xl font-semibold tabular-nums text-white" /><span className="pb-1 text-sm text-gray-500">comprobantes</span></div>
          {m.comprobantes.total > 0 ? <><Apilada partes={compPartes} /><Leyenda partes={compPartes} /></> : <p className="text-sm text-gray-500">Todavía no llegó ninguno en este período.</p>}
        </Tarjeta>
      </div>

      {/* ---------- pagos ---------- */}
      <Tarjeta titulo="Pagos" subtitulo="Cómo avanza el cobro de la reserva" icono={<Wallet className="size-4" />} retraso={0}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Cifra icono={<Wallet className="size-5" />} titulo="Datos de pago enviados" valor={m.pagos.personas_con_datos_enviados} detalle="alias y CVU" acento="text-sky-300" />
          <Cifra icono={<Link2 className="size-5" />} titulo="Links de Mercado Pago enviados" valor={m.pagos.links_mp_enviados} detalle={m.pagos.links_mp_enviados === 0 ? 'se activa al conectar Mercado Pago' : undefined} acento="text-violet-300" />
          <Cifra icono={<Zap className="size-5" />} titulo="Importes exactos asignados" valor={m.pagos.importes_unicos_asignados} detalle="con centavos únicos" acento="text-amber-300" />
          <Cifra icono={<ShieldCheck className="size-5" />} titulo="Reservas confirmadas" valor={m.pagos.reservas_confirmadas} detalle="por Mercado Pago" />
        </div>
      </Tarjeta>

      {/* ---------- mejoras ---------- */}
      <Tarjeta titulo="Qué conviene mejorar" subtitulo="A partir de todos estos números" icono={<Lightbulb className="size-4" />} className="border-emerald-400/20" retraso={0}>
        {optimizando && (
          <div className="mb-4 overflow-hidden rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4">
            <p className="flex items-center gap-2 text-sm text-emerald-200"><Sparkles className="size-4 animate-pulse" /> {progreso?.tarea ?? 'Analizando las métricas…'}</p>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/10"><div className="tw-barra tw-brillo h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(6, progreso?.porcentaje ?? 6)}%` }} /></div>
          </div>
        )}
        {!informe && !optimizando && (
          <div className="rounded-2xl bg-white/[0.04] p-6 text-center">
            <Lightbulb className="mx-auto size-8 text-emerald-300/80" />
            <p className="mt-3 text-sm text-gray-300">Todavía no se analizó nada. Tocá <b className="text-white">“Analizar y proponer mejoras”</b> y Noa revisa estas métricas y te dice qué cambiar para que más personas lleguen a la cita.</p>
          </div>
        )}
        {informe && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-sky-400/25 bg-sky-400/5 p-4">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500"><span>Análisis de {haceMs(Date.now() - Date.parse(informe.creado_at))} · {num(informe.personas)} conversaciones</span><span className={`rounded-full px-2 py-0.5 ${informe.fuente === 'ia' ? 'bg-violet-500/15 text-violet-300' : 'bg-white/10 text-gray-300'}`}>{informe.fuente === 'ia' ? 'Con IA' : 'Calculado con reglas'}</span></div>
              <p className="text-sm leading-relaxed text-gray-100">{informe.resumen}</p>
            </div>
            {informe.mejoras.length === 0 ? (
              <p className="rounded-xl bg-white/[0.04] p-4 text-sm text-gray-400">No se encontró nada para mejorar con estos números.</p>
            ) : (
              <ol className="space-y-3">
                {informe.mejoras.map((x, i) => (
                  <li key={x.id} className="rounded-2xl bg-white/[0.04] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-sm font-semibold text-white">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-white">{x.titulo}</h3>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${x.impacto === 'alto' ? 'bg-rose-500/15 text-rose-300' : x.impacto === 'medio' ? 'bg-amber-500/15 text-amber-300' : 'bg-gray-500/15 text-gray-300'}`}>Impacto {x.impacto}</span></div>
                        {x.evidencia && <p className="mt-1.5 text-[13px] leading-snug text-gray-400">{x.evidencia}</p>}
                        <div className="mt-2.5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5"><p className="text-[11px] font-medium uppercase tracking-wide text-emerald-300/80">Qué cambiar</p><p className="mt-0.5 text-[13px] leading-snug text-gray-100">{x.cambio}</p></div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-xs text-gray-600">Son sugerencias: nada se aplica solo. Para probar un cambio, cárgalo como propuesta en <Link to="/agentes" className="text-emerald-300 underline-offset-2 hover:underline">Agentes IA → Prompt del agente</Link>; queda con backup y se puede deshacer.</p>
          </div>
        )}
      </Tarjeta>

      {/* ---------- actividad ---------- */}
      <Tarjeta titulo="Actividad reciente" subtitulo="Las últimas conversaciones" icono={<MessageCircle className="size-4" />} retraso={0}>
        {m.actividad_reciente.length === 0 ? <p className="text-sm text-gray-500">Sin conversaciones en este período.</p> : (
          <ul className="grid gap-2 md:grid-cols-2">
            {m.actividad_reciente.map((a, i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/30 to-sky-400/30 text-sm font-semibold text-white">{a.nombre.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm text-gray-100">{a.nombre}</p><p className="truncate text-[11px] text-gray-500">{ETAPAS[a.etapa]?.nombre ?? a.etapa}{a.esperando_al_agente ? ' · esperando respuesta' : ''}</p></div>
                <div className="shrink-0 text-right"><span className={`rounded-full px-2 py-0.5 text-[10px] ${ESTADO_PERSONA[a.estado].c}`}>{ESTADO_PERSONA[a.estado].t}</span><p className="mt-1 text-[10px] text-gray-600">{haceMs(a.hace_ms)}</p></div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
