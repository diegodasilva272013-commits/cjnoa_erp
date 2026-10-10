import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Mensaje = { from: 'cliente' | 'agente'; texto: string; t?: number | null };

type Conversacion = {
  id: string;
  conversation_id: string;
  telefono: string | null;
  nombre: string | null;
  resumen: string | null;
  mensajes: Mensaje[];
  audio_path: string | null;
  created_at: string;
  updated_at: string;
};

type Turno = {
  id: string;
  conversation_id: string;
  fecha_consulta: string;
  hora_consulta: string | null;
  abogado_asignado: string | null;
  detalle_consulta: string | null;
  reserva_pagada: boolean | null;
};

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

async function fetchConversaciones(): Promise<{ convs: Conversacion[]; turnos: Turno[] }> {
  const { data, error } = await supabase
    .from('conversaciones_whatsapp')
    .select('id, conversation_id, telefono, nombre, resumen, mensajes, audio_path, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const convs = (data ?? []) as Conversacion[];

  // Turnos que el agente agendó desde estas conversaciones (se muestran junto al chat).
  const { data: t } = await supabase
    .from('consultas_agendadas')
    .select('id, conversation_id, fecha_consulta, hora_consulta, abogado_asignado, detalle_consulta, reserva_pagada')
    .not('conversation_id', 'is', null);
  return { convs, turnos: (t ?? []) as Turno[] };
}

export default function ConsultasWhatsApp() {
  const [consultas, setConsultas] = useState<Conversacion[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);

  useEffect(() => {
    let activo = true;
    const cargar = (primera = false) =>
      fetchConversaciones()
        .then(({ convs, turnos: t }) => {
          if (!activo) return;
          setConsultas(convs);
          setTurnos(t);
          setError('');
          if (primera) setSelectedId((prev) => prev ?? convs[0]?.id ?? null);
        })
        .catch((e) => {
          if (activo && primera) setError(e instanceof Error ? e.message : 'Error al cargar');
        })
        .finally(() => { if (activo && primera) setLoading(false); });

    cargar(true);

    // Tiempo real: cualquier cambio en la tabla (o en los turnos) recarga la lista.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refrescar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cargar(), 300);
    };
    const channel = supabase
      .channel('consultas-whatsapp')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones_whatsapp' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas_agendadas' }, refrescar)
      .subscribe();

    // Red de seguridad si el websocket se cae; también refresca los "hace X min".
    const interval = setInterval(() => { cargar(); setTick((n) => n + 1); }, 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      activo = false;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, []);

  const selected = useMemo(
    () => consultas.find((c) => c.id === selectedId) ?? consultas[0] ?? null,
    [consultas, selectedId]
  );
  const bubbles = selected?.mensajes ?? [];
  const turnosSel = useMemo(
    () => (selected ? turnos.filter((t) => t.conversation_id === selected.conversation_id) : []),
    [turnos, selected]
  );

  const audioPath = selected?.audio_path ?? null;
  useEffect(() => {
    setAudioUrl(null);
    if (!audioPath) return;
    let activo = true;
    supabase.storage.from('conversaciones-audio').createSignedUrl(audioPath, 3600)
      .then(({ data }) => { if (activo) setAudioUrl(data?.signedUrl ?? null); });
    return () => { activo = false; };
  }, [audioPath]);

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
            const preview = c.mensajes?.slice(-1)[0]?.texto;
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
                  {initials(c.nombre, c.telefono)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-white">
                      {c.nombre || c.telefono || 'Consulta sin nombre'}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-500">{relativeTime(c.updated_at)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">
                    {preview || 'Sin mensaje registrado'}
                  </span>
                  {!turnos.some((t) => t.conversation_id === c.conversation_id) && (
                    <span className="mt-1 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                      Sin turno agendado
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
                  {selected.nombre || selected.telefono || 'Consulta sin nombre'}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">{selected.telefono || 'Sin datos adicionales'}</p>
                {audioUrl && <audio controls src={audioUrl} className="mt-2 h-8 w-full max-w-md" />}
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
                {bubbles.length > 0 ? (
                  bubbles.map((b, i) => (
                    <div key={i} className={`flex ${b.from === 'cliente' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                          b.from === 'cliente'
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
              </div>

              {(selected.resumen || turnosSel.length > 0) && (
                <footer className="shrink-0 space-y-1 border-t border-white/10 bg-[#0a0a0a] px-5 py-3 text-xs text-gray-400">
                  {selected.resumen && <p><span className="text-gray-300">Resumen:</span> {selected.resumen}</p>}
                  {turnosSel.map((t) => (
                    <p key={t.id}>
                      <span className="text-gray-300">Turno:</span>{' '}
                      {t.fecha_consulta.split('-').reverse().join('/')} {t.hora_consulta?.slice(0, 5)} con {t.abogado_asignado}
                      {t.detalle_consulta ? ` · ${t.detalle_consulta}` : ''} · {t.reserva_pagada ? 'Pagó' : 'No pagó'}
                    </p>
                  ))}
                </footer>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
