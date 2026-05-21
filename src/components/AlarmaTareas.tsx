import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, ExternalLink, Volume2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { showOSNotification } from '../lib/notify';

interface AlarmaTarea {
  id: string;
  titulo: string;
  mensaje: string | null;
  link: string | null;
  related_id: string | null;
  tipo: 'tarea_proxima' | 'tarea_vencida' | 'presentar_escrito' | 'verificar_escrito' | 'tarea_paso_siguiente' | 'tarea_paso_asignado' | 'tarea_compartida_completa' | 'tarea_asignada';
  created_at: string;
}

const SHOWN_KEY = 'noa_alarmas_tareas_mostradas_v1';

function leerMostradas(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch { return new Set(); }
}
function guardarMostradas(s: Set<string>) {
  try { localStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(s).slice(-200))); } catch { /* noop */ }
}

// Beep usando Web Audio API (no requiere asset)
function reproducirBeep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const tocar = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    // 3 beeps tipo alarma
    tocar(880, 0,    0.18);
    tocar(660, 0.22, 0.18);
    tocar(880, 0.44, 0.22);
    setTimeout(() => { try { ctx.close(); } catch { /* noop */ } }, 1200);
  } catch { /* noop */ }
}

export default function AlarmaTareas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cola, setCola] = useState<AlarmaTarea[]>([]);
  const mostradasRef = useRef<Set<string>>(leerMostradas());

  function encolar(n: AlarmaTarea) {
    if (mostradasRef.current.has(n.id)) return;
    mostradasRef.current.add(n.id);
    guardarMostradas(mostradasRef.current);
    let reemplazo = false;
    setCola(prev => {
      // Dedupe: si ya hay una alarma para la misma tarea (related_id), la reemplazamos
      // por la más nueva para evitar acumular ventanas repetidas.
      const key = n.related_id || n.id;
      const previas = prev.filter(x => (x.related_id || x.id) === key);
      reemplazo = previas.length > 0;
      const filtered = prev.filter(x => (x.related_id || x.id) !== key);
      // Marcar las anteriores como leídas en DB para que no vuelvan a saltar
      previas.forEach(p => {
        supabase.from('notificaciones_app')
          .update({ leida: true, leida_at: new Date().toISOString() })
          .eq('id', p.id)
          .then(() => {});
      });
      return [...filtered, n];
    });
    // Sólo beep + notificación de SO si es una alarma realmente nueva (no un reemplazo)
    if (!reemplazo) {
      reproducirBeep();
      void showOSNotification(n.titulo, { body: n.mensaje || '', tag: n.related_id || n.id });
    }
  }

  // Pedir permiso de notificacion del SO una vez
  useEffect(() => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => { /* noop */ });
      }
    } catch { /* noop */ }
  }, []);

  // Carga inicial: mostrar no leidas de hoy que aun no se mostraron
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      // Disparar revision por las dudas
      try { await supabase.rpc('revisar_recordatorios_tareas'); } catch { /* noop */ }
      try { await supabase.rpc('revisar_recordatorios_escritos'); } catch { /* noop */ }
      const desde = new Date(); desde.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('notificaciones_app')
        .select('id, titulo, mensaje, link, related_id, tipo, created_at, leida')
        .eq('user_id', user.id)
        .in('tipo', ['tarea_proxima', 'tarea_vencida', 'presentar_escrito', 'verificar_escrito', 'tarea_paso_siguiente', 'tarea_paso_asignado', 'tarea_compartida_completa', 'tarea_asignada'])
        .eq('leida', false)
        .gte('created_at', desde.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
      if (cancelled || !data) return;
      data.forEach((n: any) => encolar({
        id: n.id, titulo: n.titulo, mensaje: n.mensaje, link: n.link,
        related_id: n.related_id, tipo: n.tipo, created_at: n.created_at,
      }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Realtime: escuchar inserts dirigidos al usuario
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`alarma-tareas-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones_app', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n: any = payload.new;
          if (n.tipo === 'tarea_proxima' || n.tipo === 'tarea_vencida' || n.tipo === 'presentar_escrito' || n.tipo === 'verificar_escrito' || n.tipo === 'tarea_paso_siguiente' || n.tipo === 'tarea_paso_asignado' || n.tipo === 'tarea_compartida_completa' || n.tipo === 'tarea_asignada') {
            encolar({
              id: n.id, titulo: n.titulo, mensaje: n.mensaje, link: n.link,
              related_id: n.related_id, tipo: n.tipo, created_at: n.created_at,
            });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Polling fallback: cada 10s revisa nuevas no leidas (por si realtime no esta habilitado)
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    let lastCheck = new Date().toISOString();
    const tick = async () => {
      if (cancelled) return;
      const desde = lastCheck;
      lastCheck = new Date().toISOString();
      const { data } = await supabase
        .from('notificaciones_app')
        .select('id, titulo, mensaje, link, related_id, tipo, created_at')
        .eq('user_id', user.id)
        .eq('leida', false)
        .in('tipo', ['tarea_proxima', 'tarea_vencida', 'presentar_escrito', 'verificar_escrito', 'tarea_paso_siguiente', 'tarea_paso_asignado', 'tarea_compartida_completa', 'tarea_asignada'])
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(20);
      if (cancelled || !data) return;
      data.forEach((n: any) => encolar({
        id: n.id, titulo: n.titulo, mensaje: n.mensaje, link: n.link,
        related_id: n.related_id, tipo: n.tipo, created_at: n.created_at,
      }));
    };
    const iv = setInterval(tick, 10000);
    return () => { cancelled = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function cerrar(id: string) {
    setCola(prev => prev.filter(x => x.id !== id));
    // marcar leida
    supabase.from('notificaciones_app').update({ leida: true, leida_at: new Date().toISOString() }).eq('id', id).then(() => {});
  }

  function abrir(n: AlarmaTarea) {
    cerrar(n.id);
    if (n.link && n.link.startsWith('/')) navigate(n.link);
    else navigate('/control-tareas');
  }

  // Auto-cierre suave (sin sonido al cerrar) para tipos "informativos".
  // Vencidas / próximas / escritos quedan hasta que el usuario las descarte.
  useEffect(() => {
    if (cola.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    cola.forEach(n => {
      const informativa = n.tipo === 'tarea_paso_siguiente'
        || n.tipo === 'tarea_paso_asignado'
        || n.tipo === 'tarea_compartida_completa'
        || n.tipo === 'tarea_asignada';
      if (informativa) {
        timers.push(setTimeout(() => cerrar(n.id), 12000));
      }
    });
    return () => { timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cola]);

  if (cola.length === 0) return null;

  // Mostramos sólo las 3 más recientes; el resto se contabiliza en un pill.
  const MAX_VISIBLES = 3;
  const visibles = cola.slice(-MAX_VISIBLES).reverse();
  const ocultas = Math.max(0, cola.length - MAX_VISIBLES);

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-start justify-end p-3 sm:p-4">
      <div className="flex flex-col gap-2 w-full max-w-xs pointer-events-auto">
        {ocultas > 0 && (
          <button
            type="button"
            onClick={() => {
              const restantes = cola.slice(0, cola.length - MAX_VISIBLES);
              restantes.forEach(n => cerrar(n.id));
            }}
            className="self-end text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10"
            title="Descartar las más antiguas"
          >
            +{ocultas} más · descartar
          </button>
        )}
        {visibles.map(n => {
          const esVencida = n.tipo === 'tarea_vencida';
          const esEscrito = n.tipo === 'presentar_escrito';
          const esVerificar = n.tipo === 'verificar_escrito';
          const esFinalizada = n.tipo === 'tarea_compartida_completa' || (n.tipo === 'tarea_asignada' && (n.titulo || '').includes('finalizada'));
          const esPaso = n.tipo === 'tarea_paso_siguiente' || n.tipo === 'tarea_paso_asignado' || (n.tipo === 'tarea_asignada' && (((n.titulo||'').includes('Te toca')) || ((n.titulo||'').includes('Nuevo paso'))));
          return (
            <div
              key={n.id}
              role="alertdialog"
              className={`rounded-xl border shadow-lg backdrop-blur-md px-3 py-2 animate-fade-in ${
                esFinalizada
                  ? 'bg-emerald-500/15 border-emerald-400/50'
                  : esPaso
                  ? 'bg-sky-500/12 border-sky-500/45'
                  : esVerificar
                  ? 'bg-amber-500/12 border-amber-500/45'
                  : esEscrito
                  ? 'bg-emerald-500/12 border-emerald-500/45'
                  : esVencida
                  ? 'bg-red-500/15 border-red-500/55'
                  : 'bg-orange-500/12 border-orange-500/45'
              }`}
              style={{ animation: 'fade-in 0.25s ease-out' }}
            >
              <div className="flex items-start gap-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${
                  esFinalizada ? 'bg-emerald-500/30 text-emerald-50' :
                  esPaso ? 'bg-sky-500/25 text-sky-100' :
                  esVerificar ? 'bg-amber-500/25 text-amber-100' :
                  esEscrito ? 'bg-emerald-500/25 text-emerald-100' :
                  esVencida ? 'bg-red-500/25 text-red-200' : 'bg-orange-500/25 text-orange-200'
                }`}>
                  {esFinalizada ? <span>🎉</span> : esPaso ? <span>⚡</span> : <AlertTriangle className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={`text-[12px] font-semibold leading-snug line-clamp-2 ${
                      esFinalizada ? 'text-emerald-50' :
                      esPaso ? 'text-sky-100' :
                      esVerificar ? 'text-amber-100' :
                      esEscrito ? 'text-emerald-100' : esVencida ? 'text-red-100' : 'text-orange-100'
                    }`}>
                      {n.titulo}
                    </h4>
                    <button
                      onClick={() => cerrar(n.id)}
                      className="text-gray-400 hover:text-white p-0.5 -mt-0.5 -mr-0.5 flex-shrink-0"
                      title="Cerrar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {n.mensaje && (
                    <p className="text-[10.5px] text-gray-300 mt-0.5 leading-snug line-clamp-2">{n.mensaje}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      onClick={() => abrir(n)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                        esFinalizada
                          ? 'bg-emerald-500/80 hover:bg-emerald-400 text-white'
                          : esPaso
                          ? 'bg-sky-500/80 hover:bg-sky-400 text-white'
                          : esVerificar
                          ? 'bg-amber-500/80 hover:bg-amber-400 text-white'
                          : esEscrito
                          ? 'bg-emerald-500/80 hover:bg-emerald-400 text-white'
                          : esVencida
                          ? 'bg-red-500/80 hover:bg-red-400 text-white'
                          : 'bg-orange-500/80 hover:bg-orange-400 text-white'
                      }`}
                    >
                      <ExternalLink className="w-2.5 h-2.5" /> {esFinalizada ? 'Seguimiento' : esPaso ? 'Mi Día' : esVerificar ? 'Verificar' : esEscrito ? 'Escrito' : 'Ver'}
                    </button>
                    <button
                      onClick={() => cerrar(n.id)}
                      className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5"
                    >
                      Cerrar
                    </button>
                    <span className="ml-auto text-[9px] text-gray-500 flex items-center gap-0.5">
                      <Volume2 className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
