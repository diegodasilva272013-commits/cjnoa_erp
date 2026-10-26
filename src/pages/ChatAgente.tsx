import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, RotateCcw, MessageCircle } from 'lucide-react';
import { llamarAgentes } from '../lib/agentesApi';

type Linea = { de: 'yo' | 'agente'; texto: string };

/** Hablar con el agente real desde el ERP. No pasa por WhatsApp ni escribe en las tablas reales; cada mensaje que mandás gasta OpenAI. */
export default function ChatAgente() {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [herramientas, setHerramientas] = useState<string[]>([]);
  const [modelo, setModelo] = useState('gpt-4o-mini');
  const estado = useRef<any>(null);
  const fin = useRef<HTMLDivElement>(null);

  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth' }); }, [lineas, enviando]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setTexto(''); setError(''); setEnviando(true);
    setLineas(l => [...l, { de: 'yo', texto: t }]);
    try {
      const r = await llamarAgentes<any>('chat_agente', { texto: t, estado: estado.current, modelo });
      estado.current = r.estado;
      setLineas(l => [...l, ...(r.respuestas as string[]).map(x => ({ de: 'agente' as const, texto: x }))]);
      if (r.herramientas?.length) setHerramientas(h => [...h, ...r.herramientas]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setEnviando(false); }
  };

  const reiniciar = () => { estado.current = null; setLineas([]); setHerramientas([]); setError(''); };

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
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${l.de === 'yo' ? 'bg-violet-600/30 text-white' : 'bg-white/[0.06] text-gray-200'}`}>{l.texto}</div>
          </div>
        ))}
        {enviando && <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> el agente está escribiendo…</div>}
        <div ref={fin} />
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {herramientas.length > 0 && <p className="text-[11px] text-gray-600">Herramientas que usó el agente: {herramientas.join(', ')}</p>}
      <form onSubmit={e => { e.preventDefault(); enviar(); }} className="flex gap-2">
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribí tu mensaje…" disabled={enviando}
          className="flex-1 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50" />
        <button type="submit" disabled={enviando || !texto.trim()} className="btn-primary px-4 flex items-center gap-1.5 text-sm"><Send className="w-4 h-4" /> Enviar</button>
      </form>
    </div>
  );
}
