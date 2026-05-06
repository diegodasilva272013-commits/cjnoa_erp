import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, ExternalLink, Volume2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface AlarmaTarea {
  id: string;
  titulo: string;
  mensaje: string | null;
  link: string | null;
  related_id: string | null;
  tipo: 'tarea_proxima' | 'tarea_vencida' | 'presentar_escrito' | 'verificar_escrito';
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
    setCola(prev => [...prev, n]);
    reproducirBeep();
    // Notificacion del SO si esta permitida (silencioso si no)
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(n.titulo, { body: n.mensaje || '', tag: n.id });
      }
    } catch { /* noop */ }
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
        .in('tipo', ['tarea_proxima', 'tarea_vencida', 'presentar_escrito', 'verificar_escrito'])
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
          if (n.tipo === 'tarea_proxima' || n.tipo === 'tarea_vencida' || n.tipo === 'presentar_escrito' || n.tipo === 'verificar_escrito') {
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

  if (cola.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-start justify-end p-4 sm:p-6">
      <div className="flex flex-col gap-3 w-full max-w-sm pointer-events-auto">
        {cola.map(n => {
          const esVencida = n.tipo === 'tarea_vencida';
          const esEscrito = n.tipo === 'presentar_escrito';
          const esVerificar = n.tipo === 'verificar_escrito';
          return (
            <div
              key={n.id}
              role="alertdialog"
              className={`rounded-2xl border-2 shadow-2xl backdrop-blur-md p-4 animate-fade-in ${
                esVerificar
                  ? 'bg-amber-500/15 border-amber-500/60 shadow-amber-500/30'
                  : esEscrito
                  ? 'bg-emerald-500/15 border-emerald-500/60 shadow-emerald-500/30'
                  : esVencida
                  ? 'bg-red-500/15 border-red-500/60 shadow-red-500/30'
                  : 'bg-orange-500/15 border-orange-500/60 shadow-orange-500/30'
              }`}
              style={{ animation: 'fade-in 0.3s ease-out, pulse 2s ease-in-out infinite' }}
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  esVerificar ? 'bg-amber-500/30 text-amber-100' :
                  esEscrito ? 'bg-emerald-500/30 text-emerald-100' :
                  esVencida ? 'bg-red-500/30 text-red-200' : 'bg-orange-500/30 text-orange-200'
                }`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={`text-sm font-bold ${
                      esVerificar ? 'text-amber-100' :
                      esEscrito ? 'text-emerald-100' : esVencida ? 'text-red-100' : 'text-orange-100'
                    }`}>
                      {n.titulo}
                    </h4>
                    <button
                      onClick={() => cerrar(n.id)}
                      className="text-gray-400 hover:text-white p-0.5 -mt-1 -mr-1"
                      title="Cerrar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {n.mensaje && (
                    <p className="text-[12px] text-gray-200 mt-1 leading-relaxed">{n.mensaje}</p>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => abrir(n)}
                      className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
                        esVerificar
                          ? 'bg-amber-500 hover:bg-amber-400 text-white'
                          : esEscrito
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                          : esVencida
                          ? 'bg-red-500 hover:bg-red-400 text-white'
                          : 'bg-orange-500 hover:bg-orange-400 text-white'
                      }`}
                    >
                      <ExternalLink className="w-3 h-3" /> {esVerificar ? 'Verificar caso' : esEscrito ? 'Presentar escrito' : 'Ver tarea'}
                    </button>
                    <button
                      onClick={() => cerrar(n.id)}
                      className="text-[11px] text-gray-300 hover:text-white px-3 py-1.5"
                    >
                      Descartar
                    </button>
                    <span className="ml-auto text-[10px] text-gray-400 flex items-center gap-1">
                      <Volume2 className="w-3 h-3" /> alarma
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
