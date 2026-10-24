import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, RotateCcw, ClipboardCopy, CheckCircle2, XCircle, Loader2, ChevronDown, FlaskConical } from 'lucide-react';
import { llamarAgentes } from '../lib/agentesApi';
import { ESCENARIOS, type Chequeo, type EstadoPrueba } from '../server/agentePruebas';

type Estado = 'pendiente' | 'corriendo' | 'aprobada' | 'fallo' | 'error';
type Corrida = { estado: Estado; transcript: EstadoPrueba['transcript']; chequeos: Chequeo[]; mensaje?: string; paso: number };

const vacia = (): Corrida => ({ estado: 'pendiente', transcript: [], chequeos: [], paso: 0 });

export default function AgentePruebas() {
  const [corridas, setCorridas] = useState<Record<string, Corrida>>(() => Object.fromEntries(ESCENARIOS.map(e => [e.id, vacia()])));
  const [abierta, setAbierta] = useState<string | null>(null);
  const [corriendoTodas, setCorriendoTodas] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const frenar = useRef(false);

  const poner = (id: string, parche: Partial<Corrida>) => setCorridas(prev => ({ ...prev, [id]: { ...prev[id], ...parche } }));

  const correr = async (id: string) => {
    const esc = ESCENARIOS.find(e => e.id === id);
    if (!esc) return;
    setCorridas(prev => ({ ...prev, [id]: { ...vacia(), estado: 'corriendo' } }));
    let estado: any = null;
    try {
      for (let paso = 0; paso < esc.pasos.length; paso++) {
        if (frenar.current) { poner(id, { estado: 'pendiente' }); return; }
        let r: any = null;
        for (let intento = 1; intento <= 5; intento++) {
          try { r = await llamarAgentes<any>('probar_agente', { id, paso, estado }); break; }
          catch (e) {
            const msg = e instanceof Error ? e.message : '';
            if (intento === 5 || !/reintenta|l[ií]mite|429|Failed to fetch|timeout/i.test(msg)) throw e;
            poner(id, { mensaje: 'OpenAI saturado: esperando para reintentar…' });
            await new Promise(res => setTimeout(res, 12000));
          }
        }
        estado = r.estado;
        poner(id, { transcript: r.estado.transcript, paso: paso + 1 });
        if (r.fin) poner(id, { estado: r.ok ? 'aprobada' : 'fallo', chequeos: r.chequeos ?? [] });
      }
    } catch (e) {
      poner(id, { estado: 'error', mensaje: e instanceof Error ? e.message : 'Error' });
    }
  };

  const correrLista = async (ids: string[]) => {
    frenar.current = false;
    setCorriendoTodas(true);
    for (const id of ids) { if (frenar.current) break; await correr(id); }
    setCorriendoTodas(false);
  };

  const cuentas = useMemo(() => {
    const v = Object.values(corridas);
    return { aprobadas: v.filter(c => c.estado === 'aprobada').length, fallaron: v.filter(c => c.estado === 'fallo' || c.estado === 'error').length, pendientes: v.filter(c => c.estado === 'pendiente' || c.estado === 'corriendo').length };
  }, [corridas]);

  const informe = () => {
    const partes: string[] = [`Pruebas del agente: ${cuentas.aprobadas} aprobadas, ${cuentas.fallaron} fallaron, ${cuentas.pendientes} sin correr.`];
    for (const e of ESCENARIOS) {
      const c = corridas[e.id];
      if (c.estado !== 'fallo' && c.estado !== 'error') continue;
      partes.push(`\n## ${e.titulo} (${e.id})`);
      if (c.estado === 'error') partes.push(`ERROR: ${c.mensaje}`);
      for (const k of c.chequeos.filter(x => !x.ok)) partes.push(`✗ ${k.nombre}${k.detalle ? ` → ${k.detalle}` : ''}`);
      partes.push('Conversación:');
      for (const t of c.transcript) partes.push(`${t.de === 'cliente' ? 'Cliente' : 'Karina'}: ${t.texto}`);
    }
    return partes.join('\n');
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(informe()); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* sin portapapeles */ }
  };

  return (
    <div>
      <Link to="/agente-whatsapp" className="mb-3 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300"><ArrowLeft className="size-3.5" /> Volver al agente</Link>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">Centro Jurídico NOA · Agente WhatsApp</p>
      <h1 className="mt-2 text-xl font-semibold text-white md:text-2xl">Pruebas del agente</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
        Cada prueba le manda una conversación distinta al <span className="text-gray-200">agente real</span> (el mismo prompt, el mismo modelo y las mismas herramientas que atienden por WhatsApp).
        Es el mismo agente y lee la agenda real del ERP (solo lectura): ofrece los horarios que de verdad están libres. Lo único distinto es que no escribe por WhatsApp y que lo que agenda queda solo en la prueba: no crea turnos, fichas ni mensajes reales. Una prueba falla si el agente no agenda cuando debía, inventa una cifra o un horario,
        usa una frase hecha, tutea, se presenta mal, filtra algo interno o divaga. Usa créditos de OpenAI en cada corrida.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" disabled={corriendoTodas} onClick={() => correrLista(ESCENARIOS.map(e => e.id))} style={{ minHeight: 40 }}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50">
          {corriendoTodas ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Correr las {ESCENARIOS.length}
        </button>
        <button type="button" disabled={corriendoTodas || cuentas.fallaron === 0} onClick={() => correrLista(ESCENARIOS.filter(e => ['fallo', 'error'].includes(corridas[e.id].estado)).map(e => e.id))} style={{ minHeight: 40 }}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 text-sm text-gray-200 transition hover:bg-white/5 disabled:opacity-40">
          <RotateCcw className="size-4" /> Volver a tirar las que fallaron
        </button>
        {corriendoTodas && (
          <button type="button" onClick={() => { frenar.current = true; }} style={{ minHeight: 40 }} className="rounded-xl border border-rose-400/40 px-4 text-sm text-rose-300 hover:bg-rose-400/10">Frenar</button>
        )}
        <button type="button" disabled={cuentas.fallaron === 0} onClick={copiar} style={{ minHeight: 40 }}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 text-sm text-gray-200 transition hover:bg-white/5 disabled:opacity-40">
          <ClipboardCopy className="size-4" /> {copiado ? 'Copiado' : 'Copiar informe de fallas'}
        </button>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-emerald-300">{cuentas.aprobadas} aprobadas</span>
          <span className="text-rose-300">{cuentas.fallaron} fallaron</span>
          <span className="text-gray-500">{cuentas.pendientes} sin correr</span>
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {ESCENARIOS.map((e, i) => {
          const c = corridas[e.id];
          const abiertaEsta = abierta === e.id;
          return (
            <li key={e.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/5 font-mono text-xs text-gray-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{e.titulo}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{e.descripcion}</p>
                </div>
                <Chip estado={c.estado} paso={c.paso} total={e.pasos.length} />
                <button type="button" disabled={c.estado === 'corriendo' || corriendoTodas} onClick={() => correr(e.id)} style={{ minHeight: 34 }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs text-gray-200 hover:bg-white/5 disabled:opacity-40">
                  <FlaskConical className="size-3.5" /> Correr
                </button>
                <button type="button" aria-label="Ver la conversación" onClick={() => setAbierta(abiertaEsta ? null : e.id)} style={{ minHeight: 34, minWidth: 34, padding: 0 }}
                  className="inline-flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/5">
                  <ChevronDown className={`size-4 transition ${abiertaEsta ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {abiertaEsta && (
                <div className="grid gap-4 border-t border-white/10 bg-black/20 p-4 lg:grid-cols-[1.4fr_1fr]">
                  <div className="space-y-2">
                    {c.transcript.length === 0 && <p className="text-sm text-gray-500">Todavía no se corrió.</p>}
                    {c.transcript.map((t, k) => (
                      <div key={k} className={`flex ${t.de === 'cliente' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${t.de === 'cliente' ? 'rounded-br-sm bg-blue-600 text-white' : 'rounded-bl-sm bg-white/10 text-white'}`}>
                          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide opacity-60">{t.de === 'cliente' ? 'Cliente' : 'Karina'}</span>
                          {t.texto}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    {c.estado === 'error' && <p className="text-sm text-rose-300">No se pudo correr: {c.mensaje}</p>}
                    <ul className="space-y-1.5">
                      {c.chequeos.map((k, n) => (
                        <li key={n} className="flex gap-2 text-sm">
                          {k.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-rose-400" />}
                          <span className={k.ok ? 'text-gray-300' : 'text-rose-200'}>{k.nombre}{!k.ok && k.detalle ? <span className="block text-xs text-rose-300/80">{k.detalle}</span> : null}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Chip({ estado, paso, total }: { estado: Estado; paso: number; total: number }) {
  const m: Record<Estado, { t: string; c: string }> = {
    pendiente: { t: 'Sin correr', c: 'bg-white/5 text-gray-400' },
    corriendo: { t: `Corriendo ${paso}/${total}`, c: 'bg-blue-500/15 text-blue-300' },
    aprobada: { t: 'Aprobada', c: 'bg-emerald-500/15 text-emerald-300' },
    fallo: { t: 'Falló', c: 'bg-rose-500/15 text-rose-300' },
    error: { t: 'Error', c: 'bg-amber-500/15 text-amber-300' },
  };
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${m[estado].c}`}>{m[estado].t}</span>;
}
