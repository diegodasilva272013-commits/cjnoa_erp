import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Wallet, Activity, TrendingUp, Radio, AlertTriangle, Save, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { llamarAgentes } from '../lib/agentesApi';
import { resumenGasto, saldoEstimado, usd, diaLocal, horaLocal, type UsoOpenAI, type ConfigSaldo, type CuentaOpenAI } from '../lib/gastoOpenAI';

const hace = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000)); return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.floor(s / 60)} min` : `hace ${Math.floor(s / 3600)} h`; };
const ETIQUETA: Record<string, string> = { agente: 'Agente WhatsApp', agente_vision: 'Lectura de fotos y recibos', pruebas: 'Pruebas del agente', pruebas_cliente: 'Persona simulada (pruebas)', cj_analisis: 'CJ · análisis de campañas' };

export default function GastosAgente() {
  const [filas, setFilas] = useState<UsoOpenAI[]>([]);
  const [config, setConfig] = useState<ConfigSaldo>(null);
  const [cuenta, setCuenta] = useState<CuentaOpenAI>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [saldoTexto, setSaldoTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [destello, setDestello] = useState(false);
  const anterior = useRef(0);

  const cargar = useCallback(async () => {
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const desde = new Date(inicioMes.getTime() - 2 * 86400000).toISOString();
    const [u, c] = await Promise.all([
      supabase.from('uso_openai').select('id, at, origen, modelo, entrada, salida, usd').gte('at', desde).order('at', { ascending: false }).limit(5000),
      supabase.from('uso_openai_config').select('saldo_inicial, saldo_desde, actualizado_por').eq('id', 1).maybeSingle(),
    ]);
    if (u.error) { setError(/does not exist|relation|schema cache/i.test(u.error.message) ? 'falta_migracion' : u.error.message); setCargando(false); return; }
    setError('');
    setFilas(((u.data ?? []) as any[]).map(x => ({ ...x, usd: Number(x.usd), entrada: Number(x.entrada), salida: Number(x.salida) })));
    setConfig((c.data as ConfigSaldo) ?? null);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
    const canal = supabase.channel('gasto-openai').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'uso_openai' }, () => { void cargar(); }).subscribe();
    const t = setInterval(() => { void cargar(); }, 10000);
    return () => { clearInterval(t); void supabase.removeChannel(canal); };
  }, [cargar]);

  useEffect(() => {
    llamarAgentes<CuentaOpenAI>('gasto_cuenta', { desde: config?.saldo_desde ?? undefined }).then(setCuenta).catch(() => setCuenta(null));
  }, [config?.saldo_desde]);

  const r = useMemo(() => resumenGasto(filas), [filas]);
  const s = useMemo(() => saldoEstimado(config, filas, cuenta), [config, filas, cuenta]);
  useEffect(() => {
    const subio = anterior.current > 0 && r.hoy > anterior.current;
    anterior.current = r.hoy;
    if (!subio) return;
    setDestello(true);
    const t = setTimeout(() => setDestello(false), 900);
    return () => clearTimeout(t);
  }, [r.hoy]);

  const guardarSaldo = async () => {
    const n = Number(saldoTexto.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) { setError('Escribí el saldo como número, por ejemplo 12,50'); return; }
    setGuardando(true);
    try { await llamarAgentes('gasto_saldo', { saldo: n }); setSaldoTexto(''); await cargar(); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    setGuardando(false);
  };

  const maxHora = Math.max(...r.porHora, 0.0001), maxDia = Math.max(...r.porDia.map(d => d.usd), 0.0001);
  const horaActual = horaLocal(new Date());
  const bajo = s.saldo != null && s.saldo < 2;

  return (
    <div className="pb-10">
      <Link to="/agente-whatsapp" className="mb-3 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300"><ArrowLeft className="size-3.5" /> Volver al agente</Link>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">Centro Jurídico NOA · Agente WhatsApp</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-white md:text-2xl">Gasto del agente en tiempo real</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300"><Radio className="size-3 animate-pulse" /> en vivo</span>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">Cada llamada a OpenAI queda anotada con sus tokens y su costo calculado con el precio de lista. Los números de abajo se actualizan solos apenas el agente usa OpenAI.</p>

      {error === 'falta_migracion' && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Falta crear las tablas del gasto. Corré <b>supabase/migration_uso_openai.sql</b> en el SQL Editor de Supabase (no borra nada) y recargá esta pantalla.</p></div>
      )}
      {error && error !== 'falta_migracion' && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_2fr]">
        <section className={`rounded-3xl border p-5 ${bajo ? 'border-rose-400/40 bg-rose-500/10' : 'border-white/10 bg-white/[0.04]'}`}>
          <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-400"><Wallet className="size-4" /> Saldo que queda en OpenAI</p>
          <p className={`mt-3 text-4xl font-semibold tabular-nums ${bajo ? 'text-rose-300' : 'text-white'}`}>{s.saldo == null ? '—' : usd(s.saldo, 2)}</p>
          <p className="mt-1 text-xs text-gray-500">{s.saldo == null ? 'Anotá el saldo que te muestra OpenAI para empezar a calcularlo.' : `Gastado desde que anotaste el saldo: ${usd(s.gastado)} · ${s.fuente === 'openai' ? 'gasto oficial de OpenAI' : 'gasto medido por el ERP'}`}</p>
          {bajo && <p className="mt-2 text-sm font-medium text-rose-300">Saldo bajo: menos de US$ 2.</p>}
          <div className="mt-4 flex gap-2">
            <input value={saldoTexto} onChange={e => setSaldoTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void guardarSaldo(); }} inputMode="decimal" placeholder="Saldo actual, ej. 12,50"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-emerald-400/50 focus:outline-none" />
            <button type="button" onClick={() => void guardarSaldo()} disabled={guardando || !saldoTexto.trim()} style={{ minHeight: 38 }} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-40"><Save className="size-4" /> Anotar</button>
          </div>
          <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-gray-500"><Info className="mt-0.5 size-3 shrink-0" /> OpenAI no entrega el saldo por API en tiempo real. Anotá el saldo que ves en platform.openai.com (Billing) y desde ese momento el ERP le va restando cada llamada. Con la clave de administrador (OPENAI_ADMIN_KEY) usa además el gasto oficial de toda la cuenta{cuenta?.configurado ? ' — activada' : ' — todavía no está cargada'}.</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Tarjeta icono={<Activity className="size-4" />} titulo="Gastado hoy" valor={usd(r.hoy)} sub={`${r.llamadasHoy} llamadas · ${r.tokensHoy.toLocaleString('es-AR')} tokens`} destello={destello} grande />
          <Tarjeta icono={<TrendingUp className="size-4" />} titulo="Última hora" valor={usd(r.ultimaHora)} sub={`Promedio por llamada hoy: ${usd(r.promedioPorLlamada, 5)}`} />
          <Tarjeta titulo="Este mes" valor={usd(r.mes)} sub="Solo lo medido por el ERP" />
          <Tarjeta titulo="Gasto oficial de la cuenta (OpenAI)" valor={cuenta?.configurado && !cuenta.error ? usd(cuenta.total_usd ?? 0) : '—'} sub={cuenta?.error ? cuenta.error : cuenta?.configurado ? 'Incluye todo lo que use esta cuenta, también otros agentes' : 'Cargá OPENAI_ADMIN_KEY en Vercel para verlo'} />
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs uppercase tracking-wider text-gray-400">Hoy, hora por hora</p>
          <div className="mt-4 flex h-28 items-end gap-1">
            {r.porHora.map((v, h) => (<div key={h} title={`${h}:00 · ${usd(v)}`} className={`flex-1 rounded-t ${h === horaActual ? 'bg-emerald-400' : 'bg-blue-500/60'}`} style={{ height: `${Math.max(2, (v / maxHora) * 100)}%` }} />))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-600"><span>0 h</span><span>12 h</span><span>23 h</span></div>
        </section>
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs uppercase tracking-wider text-gray-400">Últimos 14 días</p>
          <div className="mt-4 flex h-28 items-end gap-1.5">
            {r.porDia.map(d => (<div key={d.fecha} title={`${d.fecha} · ${usd(d.usd)}`} className={`flex-1 rounded-t ${d.fecha === diaLocal(new Date()) ? 'bg-emerald-400' : 'bg-indigo-500/60'}`} style={{ height: `${Math.max(2, (d.usd / maxDia) * 100)}%` }} />))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-600"><span>{r.porDia[0]?.fecha.slice(5)}</span><span>hoy</span></div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs uppercase tracking-wider text-gray-400">Llamadas en vivo</p>
          {cargando ? <p className="mt-4 text-sm text-gray-500">Cargando…</p> : filas.length === 0 ? <p className="mt-4 text-sm text-gray-500">Todavía no hay llamadas anotadas. Aparecen acá apenas el agente use OpenAI.</p> : (
            <ul className="mt-3 divide-y divide-white/5">
              {filas.slice(0, 14).map(f => (
                <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-gray-500">{hace(f.at)}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-200">{ETIQUETA[f.origen] ?? f.origen} <span className="text-gray-600">· {f.modelo}</span></span>
                  <span className="hidden shrink-0 text-xs tabular-nums text-gray-500 sm:inline">{(f.entrada + f.salida).toLocaleString('es-AR')} tok</span>
                  <span className="w-24 shrink-0 text-right tabular-nums text-emerald-300">{usd(f.usd, 5)}</span>
                </li>))}
            </ul>)}
        </section>
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <p className="text-xs uppercase tracking-wider text-gray-400">Este mes, por uso y por modelo</p>
          <Desglose titulo="Para qué" items={r.porOrigen.map(x => ({ ...x, clave: ETIQUETA[x.clave] ?? x.clave }))} />
          <Desglose titulo="Qué modelo" items={r.porModelo} />
        </section>
      </div>
    </div>
  );
}

function Tarjeta({ titulo, valor, sub, icono, grande, destello }: { titulo: string; valor: string; sub: string; icono?: React.ReactNode; grande?: boolean; destello?: boolean }) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition ${destello ? 'ring-2 ring-emerald-400/60' : ''}`}>
      <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-400">{icono}{titulo}</p>
      <p className={`mt-3 font-semibold tabular-nums text-white ${grande ? 'text-3xl' : 'text-2xl'}`}>{valor}</p>
      <p className="mt-1 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

function Desglose({ titulo, items }: { titulo: string; items: { clave: string; usd: number; llamadas: number }[] }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-600">{titulo}</p>
      {items.length === 0 ? <p className="mt-1 text-sm text-gray-600">—</p> : (
        <ul className="mt-1 space-y-1">{items.map(i => (<li key={i.clave} className="flex justify-between gap-3 text-sm"><span className="truncate text-gray-300">{i.clave}</span><span className="shrink-0 tabular-nums text-gray-400">{usd(i.usd)} <span className="text-gray-600">· {i.llamadas}</span></span></li>))}</ul>)}
    </div>
  );
}
