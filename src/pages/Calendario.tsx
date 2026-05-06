import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, ChevronRight, RefreshCw, Link as LinkIcon, Unlink, ExternalLink, Gavel, CalendarClock, Briefcase } from 'lucide-react';

type EventoCal = {
  id: string;
  source: 'audiencia_general' | 'consulta' | 'audiencia_legal' | 'gcal';
  fecha: Date;
  titulo: string;
  subtitulo?: string;
  color: string; // tailwind ring color
  bg: string;
  raw: any;
};

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DOW = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59, 999); }
function fmtKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function buildGrid(monthDate: Date) {
  const first = startOfMonth(monthDate);
  // queremos lunes como primer dia (getDay: 0=dom..6=sab)
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(first); start.setDate(first.getDate() - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export default function Calendario() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [cursor, setCursor] = useState(() => new Date());
  const [eventos, setEventos] = useState<EventoCal[]>([]);
  const [loading, setLoading] = useState(false);
  const [conectado, setConectado] = useState<{ google_email?: string; conectado_at?: string } | null>(null);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Mensaje desde callback
  useEffect(() => {
    if (params.get('connected') === '1') {
      setMsg('✅ Google Calendar conectado correctamente.');
      params.delete('connected');
      setParams(params, { replace: true });
    }
    const err = params.get('google_error');
    if (err) {
      setMsg('❌ Error conectando Google: ' + err);
      params.delete('google_error');
      setParams(params, { replace: true });
    }
  }, []);

  // Estado de conexion Google
  useEffect(() => {
    if (!user) return;
    supabase.from('google_oauth_tokens')
      .select('google_email, conectado_at')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setConectado(data || null));
  }, [user, msg]);

  // Cargar eventos del mes visible
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const startDate = fmtKey(start);
    const endDate = fmtKey(end);

    Promise.all([
      supabase.from('audiencias_general_completas')
        .select('*')
        .gte('fecha', startISO).lte('fecha', endISO),
      supabase.from('consultas_agendadas')
        .select('*')
        .gte('fecha_consulta', startDate).lte('fecha_consulta', endDate),
      supabase.from('audiencias')
        .select('*')
        .gte('fecha', startISO).lte('fecha', endISO),
      // Eventos directos del Google Calendar del usuario (si esta conectado)
      conectado && user
        ? fetch(`/api/google/list-events?user_id=${encodeURIComponent(user.id)}&timeMin=${encodeURIComponent(startISO)}&timeMax=${encodeURIComponent(endISO)}`)
            .then(r => r.json()).catch(() => ({ events: [] }))
        : Promise.resolve({ events: [] as any[] }),
    ]).then(([ag, cs, al, gc]) => {
      if (!alive) return;
      const out: EventoCal[] = [];
      (ag.data || []).forEach((r: any) => {
        out.push({
          id: 'ag-' + r.id,
          source: 'audiencia_general',
          fecha: new Date(r.fecha),
          titulo: `Audiencia${r.tipo ? ' ' + r.tipo : ''}`,
          subtitulo: r.caso_general_titulo || r.cliente_nombre || r.juzgado || '',
          color: 'border-orange-400/40',
          bg: 'bg-orange-500/15 text-orange-200',
          raw: r,
        });
      });
      (cs.data || []).forEach((r: any) => {
        const d = new Date(`${r.fecha_consulta}T${(r.hora_consulta || '10:00')}:00`);
        out.push({
          id: 'cs-' + r.id,
          source: 'consulta',
          fecha: d,
          titulo: `Consulta ${r.cliente_nombre || ''}`,
          subtitulo: r.detalle_consulta || r.telefono || '',
          color: 'border-violet-400/40',
          bg: 'bg-violet-500/15 text-violet-200',
          raw: r,
        });
      });
      (al.data || []).forEach((r: any) => {
        out.push({
          id: 'al-' + r.id,
          source: 'audiencia_legal',
          fecha: new Date(r.fecha),
          titulo: r.titulo || 'Audiencia',
          subtitulo: r.juzgado || r.descripcion || '',
          color: 'border-sky-400/40',
          bg: 'bg-sky-500/15 text-sky-200',
          raw: r,
        });
      });
      // Eventos de Google Calendar (excluye los que ya creamos nosotros para no duplicar)
      const idsLocales = new Set(
        (ag.data || [])
          .map((r: any) => r.google_event_id)
          .filter(Boolean)
      );
      ((gc as any).events || []).forEach((e: any) => {
        if (!e.start) return;
        if (idsLocales.has(e.id)) return;
        out.push({
          id: 'gc-' + e.id,
          source: 'gcal',
          fecha: new Date(e.start),
          titulo: e.summary || '(sin título)',
          subtitulo: e.location || e.description || '',
          color: 'border-emerald-400/40',
          bg: 'bg-emerald-500/15 text-emerald-200',
          raw: e,
        });
      });
      setEventos(out.sort((a,b) => a.fecha.getTime() - b.fecha.getTime()));
      setLoading(false);
    });

    return () => { alive = false; };
  }, [cursor, conectado, user]);

  const grid = useMemo(() => buildGrid(cursor), [cursor]);
  const eventosPorDia = useMemo(() => {
    const m = new Map<string, EventoCal[]>();
    eventos.forEach(e => {
      const k = fmtKey(e.fecha);
      const arr = m.get(k) || [];
      arr.push(e);
      m.set(k, arr);
    });
    return m;
  }, [eventos]);

  async function conectarGoogle() {
    if (!user) return;
    const r = await fetch(`/api/google/auth-url?user_id=${encodeURIComponent(user.id)}`);
    const j = await r.json();
    if (j.url) window.location.href = j.url;
    else setMsg('❌ No se pudo iniciar OAuth: ' + (j.error || ''));
  }

  async function desconectarGoogle() {
    if (!user) return;
    if (!confirm('¿Desconectar Google Calendar? Las audiencias ya sincronizadas NO se borrarán de tu calendario.')) return;
    await supabase.from('google_oauth_tokens').delete().eq('user_id', user.id);
    setConectado(null);
    setMsg('Google Calendar desconectado.');
  }

  async function sincronizarMes() {
    if (!conectado) { setMsg('Primero conectá Google Calendar.'); return; }
    setSyncing(true); setMsg(null);
    let ok = 0, fail = 0;
    for (const e of eventos) {
      if (e.source === 'audiencia_legal') continue; // no sincronizamos las legales por ahora
      try {
        const r = await fetch('/api/google/sync-audiencia', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audiencia_id: e.raw.id, source: e.source === 'consulta' ? 'consulta' : 'audiencia' }),
        });
        const j = await r.json();
        if (j.ok || j.skipped) ok++; else fail++;
      } catch { fail++; }
    }
    setSyncing(false);
    setMsg(`Sincronización completa: ${ok} OK${fail ? `, ${fail} con error` : ''}.`);
  }

  const seleccion = diaSeleccionado ? (eventosPorDia.get(diaSeleccionado) || []) : [];
  const hoyKey = fmtKey(new Date());

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendario</h1>
          <p className="text-sm text-gray-500">Audiencias, consultas y eventos en una sola vista.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {conectado ? (
            <>
              <span className="px-3 py-2 text-xs rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-2">
                <LinkIcon className="w-3.5 h-3.5" /> Google: {conectado.google_email || 'conectado'}
              </span>
              <button onClick={sincronizarMes} disabled={syncing}
                className="px-3 py-2 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 flex items-center gap-2 disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sincronizar mes
              </button>
              <button onClick={desconectarGoogle}
                className="px-3 py-2 text-xs rounded-lg bg-white/5 hover:bg-red-500/10 text-red-300 border border-white/10 flex items-center gap-2">
                <Unlink className="w-3.5 h-3.5" /> Desconectar
              </button>
            </>
          ) : (
            <button onClick={conectarGoogle}
              className="px-3 py-2 text-xs rounded-lg bg-white text-black hover:bg-gray-100 flex items-center gap-2 font-medium">
              <LinkIcon className="w-3.5 h-3.5" /> Conectar Google Calendar
            </button>
          )}
        </div>
      </header>

      {msg && (
        <div className="px-4 py-2 rounded-lg bg-white/5 text-sm text-white border border-white/10">{msg}</div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth()-1, 1))}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">{MESES[cursor.getMonth()]} {cursor.getFullYear()}</h2>
          <button onClick={() => setCursor(new Date())}
            className="px-2 py-1 text-xs rounded-md bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10">
            Hoy
          </button>
        </div>
        <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth()+1, 1))}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500/60" /> Audiencias generales</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500/60" /> Consultas</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500/60" /> Audiencias (casos legales)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" /> Google Calendar</span>
      </div>

      <div className="grid grid-cols-7 gap-px bg-white/5 border border-white/10 rounded-xl overflow-hidden text-[11px]">
        {DOW.map(d => (
          <div key={d} className="bg-[#0c0c0e] px-2 py-1.5 text-gray-500 font-semibold uppercase tracking-wider">{d}</div>
        ))}
        {grid.map((d, idx) => {
          const k = fmtKey(d);
          const enMes = d.getMonth() === cursor.getMonth();
          const esHoy = k === hoyKey;
          const evs = eventosPorDia.get(k) || [];
          return (
            <button key={idx}
              onClick={() => setDiaSeleccionado(k)}
              className={`min-h-[92px] text-left bg-[#0a0a0a] hover:bg-white/[0.03] p-1.5 flex flex-col gap-1 transition ${enMes ? '' : 'opacity-40'} ${diaSeleccionado === k ? 'ring-2 ring-white/30 z-10' : ''}`}
            >
              <div className={`text-[11px] font-semibold ${esHoy ? 'text-emerald-300' : 'text-gray-300'}`}>
                {d.getDate()}
                {esHoy && <span className="ml-1 text-[9px] uppercase">hoy</span>}
              </div>
              <div className="flex flex-col gap-0.5">
                {evs.slice(0, 3).map(e => (
                  <div key={e.id} className={`truncate px-1 py-0.5 rounded border ${e.color} ${e.bg} text-[10px]`}>
                    {e.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} {e.titulo}
                  </div>
                ))}
                {evs.length > 3 && <div className="text-[10px] text-gray-500">+{evs.length - 3} más…</div>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detalle del dia seleccionado */}
      {diaSeleccionado && (
        <div className="rounded-xl border border-white/10 bg-[#0c0c0e] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">
              Eventos del {new Date(diaSeleccionado).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </h3>
            <button onClick={() => setDiaSeleccionado(null)} className="text-xs text-gray-500 hover:text-white">Cerrar</button>
          </div>
          {seleccion.length === 0 ? (
            <p className="text-sm text-gray-500">Sin eventos.</p>
          ) : (
            <ul className="space-y-2">
              {seleccion.map(e => (
                <li key={e.id} className={`p-3 rounded-lg border ${e.color} ${e.bg.replace('text-','text-white ')} bg-white/[0.02]`}>
                  <div className="flex items-start gap-2">
                    {e.source === 'audiencia_general' && <Briefcase className="w-4 h-4 mt-0.5 text-orange-300" />}
                    {e.source === 'consulta' && <CalendarClock className="w-4 h-4 mt-0.5 text-violet-300" />}
                    {e.source === 'audiencia_legal' && <Gavel className="w-4 h-4 mt-0.5 text-sky-300" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium">{e.titulo}</div>
                      {e.subtitulo && <div className="text-xs text-gray-400 truncate">{e.subtitulo}</div>}
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {e.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        {e.raw.juzgado && ` · ${e.raw.juzgado}`}
                      </div>
                      {e.raw.notas && <div className="text-xs text-gray-300 mt-1 whitespace-pre-wrap">{e.raw.notas}</div>}
                      {e.raw.observaciones && <div className="text-xs text-gray-300 mt-1 whitespace-pre-wrap">{e.raw.observaciones}</div>}
                    </div>
                    {e.source === 'audiencia_general' && conectado && (
                      <button
                        onClick={async () => {
                          setMsg('Sincronizando…');
                          const r = await fetch('/api/google/sync-audiencia', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ audiencia_id: e.raw.id }),
                          });
                          const j = await r.json();
                          setMsg(j.ok ? '✅ Sincronizado' : ('❌ ' + (j.error || 'fallo')));
                        }}
                        className="text-xs px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-white border border-white/10 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Sync
                      </button>
                    )}
                    {e.raw.google_event_id && (
                      <a
                        href={`https://calendar.google.com/calendar/event?eid=${e.raw.google_event_id}`}
                        target="_blank" rel="noreferrer"
                        className="text-xs px-2 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"
                        title="Abrir en Google Calendar"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading && <div className="text-xs text-gray-500">Cargando eventos…</div>}
    </div>
  );
}
