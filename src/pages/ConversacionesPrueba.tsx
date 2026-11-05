import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Msg = { de: 'persona' | 'agente'; texto: string; at?: string; v2?: { objetivos?: unknown; verificador?: unknown; mensaje_seguro?: boolean; redactor?: unknown } };
type Conv = { sesion: string; created_at: string; updated_at: string; usuario: string | null; version: string | null; modelo: string | null; agendo: boolean; mensajes: Msg[] };

const fecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Todas las conversaciones del Chat de prueba, grabadas turno a turno: la lista a la izquierda (más nuevas primero) y la conversación completa a la derecha. */
export default function ConversacionesPrueba() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [elegida, setElegida] = useState<string | null>(null);
  const [verTecnico, setVerTecnico] = useState(false);

  const cargar = async () => {
    setCargando(true); setError('');
    const { data, error: e } = await supabase.from('chat_prueba_conversaciones').select('*').order('updated_at', { ascending: false }).limit(300);
    if (e) setError(/relation|does not exist|schema cache/i.test(e.message) ? 'Todavía no existe la tabla: corré el archivo supabase/migration_chat_prueba.sql en Supabase (SQL Editor).' : e.message);
    else { setConvs((data ?? []) as Conv[]); setElegida(x => x ?? (data?.[0] as Conv | undefined)?.sesion ?? null); }
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const actual = useMemo(() => convs.find(c => c.sesion === elegida) ?? null, [convs, elegida]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/chat-agente" className="text-gray-400 hover:text-white"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-lg font-bold text-white">Conversaciones de prueba guardadas</h1>
        <span className="text-xs text-gray-500">{convs.length} en total</span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-400"><input type="checkbox" checked={verTecnico} onChange={e => setVerTecnico(e.target.checked)} /> ver detalle técnico</label>
        <button type="button" onClick={cargar} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white"><RefreshCw className="w-3.5 h-3.5" /> Actualizar</button>
      </div>
      {error && <p className="text-sm text-amber-400">{error}</p>}
      {cargando && <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> cargando…</p>}
      {!cargando && !error && convs.length === 0 && <p className="text-sm text-gray-500">Todavía no hay conversaciones guardadas. Las que hagas desde ahora en el Chat de prueba van a aparecer acá.</p>}
      <div className="grid md:grid-cols-[320px_1fr] gap-4">
        <div className="glass-card p-2 space-y-1 max-h-[75vh] overflow-y-auto">
          {convs.map(c => {
            const primera = c.mensajes.find(m => m.de === 'persona')?.texto ?? '';
            return (
              <button key={c.sesion} type="button" onClick={() => setElegida(c.sesion)}
                className={`w-full text-left rounded-lg px-3 py-2 border ${c.sesion === elegida ? 'bg-violet-600/20 border-violet-500/40' : 'bg-white/[0.02] border-transparent hover:bg-white/[0.05]'}`}>
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <span>{fecha(c.updated_at)}</span>
                  <span className="ml-auto uppercase">{c.version ?? ''}</span>
                </div>
                <p className="text-sm text-gray-200 truncate">{primera || '(vacía)'}</p>
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <span>{c.mensajes.length} mensajes</span>
                  <span className="truncate">{c.modelo ?? ''}</span>
                  <span className={`ml-auto flex items-center gap-1 ${c.agendo ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {c.agendo ? <><CheckCircle2 className="w-3 h-3" /> agendó</> : <><XCircle className="w-3 h-3" /> no agendó</>}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="glass-card p-4 space-y-3 max-h-[75vh] overflow-y-auto">
          {!actual && <p className="text-sm text-gray-600">Elegí una conversación de la lista.</p>}
          {actual && (
            <>
              <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                <span>Empezó: {fecha(actual.created_at)}</span>
                <span>Última actividad: {fecha(actual.updated_at)}</span>
                <span>Versión: {actual.version}</span>
                <span>Modelo: {actual.modelo}</span>
                {actual.usuario && <span>Por: {actual.usuario}</span>}
                <span className={actual.agendo ? 'text-emerald-400' : ''}>{actual.agendo ? 'Terminó agendando' : 'No agendó'}</span>
              </div>
              {actual.mensajes.map((m, i) => (
                <div key={i} className={`flex ${m.de === 'persona' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[85%] min-w-0">
                    <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.de === 'persona' ? 'bg-violet-600/30 text-white' : 'bg-white/[0.06] text-gray-200'}`}>{m.texto}</div>
                    {m.at && <p className="text-[10px] text-gray-600 mt-0.5 px-1">{m.de === 'persona' ? 'Persona' : 'Agente'} · {fecha(m.at)}</p>}
                    {verTecnico && m.v2 && (
                      <pre className="mt-1 rounded-lg bg-black/30 p-2 text-[11px] text-gray-400 whitespace-pre-wrap break-all max-h-60 overflow-auto">{JSON.stringify(m.v2, null, 2)}</pre>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
