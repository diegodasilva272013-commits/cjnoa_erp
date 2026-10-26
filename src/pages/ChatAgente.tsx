import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, RotateCcw, MessageCircle } from 'lucide-react';
import { llamarAgentes } from '../lib/agentesApi';

type Traza = { nombre: string; input: unknown; resultado: unknown };
type TrazaV2 = { estado_antes?: unknown; extractor_crudo?: unknown; extractor?: unknown; objetivos?: unknown; datos?: unknown; estado?: unknown; redactor?: unknown };
type Linea = { de: 'yo' | 'agente'; texto: string; trazas?: Traza[]; v2?: TrazaV2 | null };

/** Hablar con el agente real desde el ERP. No pasa por WhatsApp ni escribe en las tablas reales; cada mensaje que mandás gasta OpenAI. */
export default function ChatAgente() {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [modelo, setModelo] = useState('gpt-4o-mini');
  const [version, setVersion] = useState<'v1' | 'v2'>('v1');
  const estado = useRef<any>(null);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth' }); }, [lineas, enviando]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setTexto(''); setError(''); setEnviando(true);
    setLineas(l => [...l, { de: 'yo', texto: t }]);
    try {
      const r = await llamarAgentes<any>('chat_agente', { texto: t, estado: estado.current, modelo, version });
      estado.current = r.estado;
      const respuestas = r.respuestas as string[];
      // La traza de este turno (herramientas con su input y su resultado completos) cuelga de la última respuesta del agente.
      setLineas(l => [...l, ...respuestas.map((x, i) => ({ de: 'agente' as const, texto: x, ...(i === respuestas.length - 1 ? { trazas: (r.trazas ?? []) as Traza[], v2: (r.v2 ?? null) as TrazaV2 | null } : {}) }))]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setEnviando(false); }
  };

  const reiniciar = () => { estado.current = null; setLineas([]); setError(''); };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-violet-400" />
        <h1 className="text-lg font-bold text-white">Chat de prueba con el agente</h1>
        <button type="button" onClick={reiniciar} className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 hover:text-white">
          <RotateCcw className="w-3.5 h-3.5" /> Empezar de cero
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>Versión:</span>
        <select value={version} onChange={e => { setVersion(e.target.value as 'v1' | 'v2'); }} className="rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1 text-xs text-white">
          <option value="v1">v1 (la de producción)</option>
          <option value="v2">v2 (director + extractor + redactor)</option>
        </select>
        <span>Modelo de esta prueba:</span>
        <select value={modelo} onChange={e => setModelo(e.target.value)} className="rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1 text-xs text-white">
          <option value="gpt-4o-mini">gpt-4o-mini (el de producción)</option>
          <option value="gpt-4.1-mini">gpt-4.1-mini (solo para comparar, ~3 veces más caro)</option>
        </select>
      </div>
      <p className="text-xs text-gray-500">
        Hablás con el agente real, pero nada sale por WhatsApp y no se guarda en los clientes ni en la agenda reales. Cada mensaje que mandás usa OpenAI (una fracción de centavo).
      </p>
      <div className="glass-card p-4 space-y-3 min-h-[320px] max-h-[60vh] overflow-y-auto">
        {lineas.length === 0 && <p className="text-xs text-gray-600 text-center py-12">Escribí como lo haría un cliente. Ej: "Hola, vi el anuncio".</p>}
        {lineas.map((l, i) => (
          <div key={i} className={`flex ${l.de === 'yo' ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[85%] min-w-0">
              <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${l.de === 'yo' ? 'bg-violet-600/30 text-white' : 'bg-white/[0.06] text-gray-200'}`}>{l.texto}</div>
              {l.de === 'agente' && l.v2 && (
                <details className="mt-1 text-[11px] text-gray-500" open>
                  <summary className="cursor-pointer select-none">v2 · estado, extractor y objetivo de este turno</summary>
                  {([
                    ['Objetivo del director', l.v2.objetivos],
                    ['Datos que puede usar el redactor', l.v2.datos],
                    ['Salida del extractor (ya validada)', l.v2.extractor],
                    ['Estado después del turno', l.v2.estado],
                    ['Estado antes del turno', l.v2.estado_antes],
                    ['Intentos del redactor', l.v2.redactor],
                  ] as [string, unknown][]).map(([titulo, valor]) => (
                    <div key={titulo} className="mt-1 rounded-lg bg-black/30 p-2 space-y-1">
                      <p className="text-emerald-300 font-semibold">{titulo}</p>
                      <pre className="whitespace-pre-wrap break-all max-h-60 overflow-auto text-gray-300">{JSON.stringify(valor, null, 2)}</pre>
                    </div>
                  ))}
                </details>
              )}
              {l.de === 'agente' && l.trazas && (
                <details className="mt-1 text-[11px] text-gray-500" open={l.trazas.length > 0}>
                  <summary className="cursor-pointer select-none">Herramientas que llamó en este turno ({l.trazas.length})</summary>
                  {l.trazas.length === 0 && <p className="mt-1">Ninguna.</p>}
                  {l.trazas.map((h, k) => (
                    <div key={k} className="mt-1 rounded-lg bg-black/30 p-2 space-y-1">
                      <p className="text-violet-300 font-semibold">{h.nombre}</p>
                      <p className="text-gray-400">input</p>
                      <pre className="whitespace-pre-wrap break-all max-h-40 overflow-auto text-gray-300">{JSON.stringify(h.input, null, 2)}</pre>
                      <p className="text-gray-400">resultado</p>
                      <pre className="whitespace-pre-wrap break-all max-h-60 overflow-auto text-gray-300">{JSON.stringify(h.resultado, null, 2)}</pre>
                    </div>
                  ))}
                </details>
              )}
            </div>
          </div>
        ))}
        {enviando && <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> el agente está escribiendo…</div>}
        <div ref={fin} />
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <form onSubmit={e => { e.preventDefault(); enviar(); }} className="flex gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribí tu mensaje…" disabled={enviando}
          className="flex-1 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50" />
        <button type="submit" disabled={enviando || !texto.trim()} className="btn-primary px-4 flex items-center gap-1.5 text-sm"><Send className="w-4 h-4" /> Enviar</button>
      </form>
    </div>
  );
}
