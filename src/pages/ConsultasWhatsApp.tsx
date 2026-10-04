import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Mensaje = { from: 'cliente' | 'agente'; texto: string; at: string };

type Consulta = {
  id: string;
  conversation_id: string | null;
  mensaje: string | null;
  mensajes: Mensaje[];
  nombre_consultante: string | null;
  dni_o_cuil: string | null;
  telefono: string | null;
  rama_consulta: string | null;
  tipo_tramite_previsional: string | null;
  requiere_turno: boolean | null;
  resumen: string | null;
  transcripcion: string | null;
  datos_adicionales: string | null;
  created_at: string;
  updated_at: string;
};

type Bubble = { who: 'cliente' | 'agente'; texto: string };

function parseTranscripcion(t: string | null): Bubble[] {
  if (!t) return [];
  return t
    .split('\n')
    .map((line) => line.match(/^\[(.+?)\]:\s*(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m && m[2].trim().length > 0)
    .map((m) => {
      const label = m[1].toLowerCase();
      const who: Bubble['who'] = /user|cliente|consultante/.test(label) ? 'cliente' : 'agente';
      return { who, texto: m[2].trim() };
    });
}

function bubblesFor(c: Consulta): Bubble[] {
  if (c.mensajes?.length > 0) return c.mensajes.map((m) => ({ who: m.from, texto: m.texto }));
  const fromTranscripcion = parseTranscripcion(c.transcripcion);
  if (fromTranscripcion.length > 0) return fromTranscripcion;
  if (c.mensaje) return [{ who: 'cliente', texto: c.mensaje }];
  return [];
}

function initials(name: string | null, telefono: string | null) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }
  if (telefono) return telefono.slice(-2);
  return '?';
}

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  return `hace ${Math.floor(hs / 24)} d`;
}

async function fetchConsultas(): Promise<Consulta[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No hay sesión activa');

  const res = await fetch('/api/consultas-whatsapp', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `Error ${res.status}`);
  return (body?.data as Consulta[]) ?? [];
}

export default function ConsultasWhatsApp() {
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    fetchConsultas()
      .then((data) => {
        if (!activo) return;
        setConsultas(data);
        setSelectedId((prev) => prev ?? data[0]?.id ?? null);
      })
      .catch((e) => activo && setError(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => activo && setLoading(false));

    const interval = setInterval(() => {
      fetchConsultas().then((data) => activo && setConsultas(data)).catch(() => {});
    }, 5000);

    return () => { activo = false; clearInterval(interval); };
  }, []);

  const selected = useMemo(
    () => consultas.find((c) => c.id === selectedId) ?? consultas[0] ?? null,
    [consultas, selectedId]
  );
  const bubbles = useMemo(() => (selected ? bubblesFor(selected) : []), [selected]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-700/40 bg-red-950/20 p-4 text-sm text-red-300">
        Error al cargar las consultas: {error}
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-blue-400">
        Centro Jurídico NOA · Agente WhatsApp
      </p>
      <h1 className="mt-2 mb-5 text-xl font-semibold text-white md:text-2xl">Consultas recibidas</h1>

      <div className="flex h-[calc(100vh-220px)] min-h-[520px] overflow-hidden rounded-lg border border-white/10">
        <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-white/10 bg-[#0a0a0a]">
          {consultas.length === 0 && (
            <p className="p-5 text-sm text-gray-500">Todavía no llegó ninguna consulta.</p>
          )}
          {consultas.map((c) => {
            const preview = bubblesFor(c).slice(-1)[0]?.texto;
            const active = selected?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full items-start gap-3 border-b border-white/10 px-4 py-3 text-left transition ${
                  active ? 'bg-blue-500/10' : 'hover:bg-white/[0.03]'
                }`}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-semibold text-blue-400">
                  {initials(c.nombre_consultante, c.telefono)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-white">
                      {c.nombre_consultante || c.telefono || 'Consulta sin nombre'}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-500">{relativeTime(c.updated_at)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">
                    {preview || 'Sin mensaje registrado'}
                  </span>
                  {c.rama_consulta && (
                    <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-400">
                      {c.rama_consulta}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </aside>

        <section className="flex flex-1 flex-col overflow-hidden bg-[#050505]">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
              Elegí una consulta para ver el detalle.
            </div>
          ) : (
            <>
              <header className="shrink-0 border-b border-white/10 px-5 py-4">
                <h2 className="text-sm font-semibold text-white">
                  {selected.nombre_consultante || selected.telefono || 'Consulta sin nombre'}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {[selected.telefono, selected.rama_consulta, selected.tipo_tramite_previsional]
                    .filter(Boolean)
                    .join(' · ') || 'Sin datos adicionales'}
                </p>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
                {bubbles.length > 0 ? (
                  bubbles.map((b, i) => (
                    <div key={i} className={`flex ${b.who === 'cliente' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                          b.who === 'cliente'
                            ? 'rounded-br-sm bg-blue-600 text-white'
                            : 'rounded-bl-sm bg-white/10 text-white'
                        }`}
                      >
                        {b.texto}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">Sin mensajes registrados todavía.</p>
                )}

                {bubbles.length > 0 && !bubbles.some((b) => b.who === 'agente') && (
                  <p className="pt-2 text-center text-[11px] text-gray-500">
                    Solo se ve el lado del cliente — todavía no llegó la respuesta del agente para esta consulta.
                  </p>
                )}
              </div>

              {(selected.resumen || selected.dni_o_cuil || selected.requiere_turno !== null || selected.datos_adicionales) && (
                <footer className="shrink-0 space-y-1 border-t border-white/10 bg-[#0a0a0a] px-5 py-3 text-xs text-gray-400">
                  {selected.resumen && <p><span className="text-gray-300">Resumen:</span> {selected.resumen}</p>}
                  {selected.dni_o_cuil && <p><span className="text-gray-300">DNI/CUIL:</span> {selected.dni_o_cuil}</p>}
                  {selected.requiere_turno !== null && (
                    <p><span className="text-gray-300">Turno:</span> {selected.requiere_turno ? 'Sí' : 'No'}</p>
                  )}
                  {selected.datos_adicionales && <p><span className="text-gray-300">Otros datos:</span> {selected.datos_adicionales}</p>}
                </footer>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
