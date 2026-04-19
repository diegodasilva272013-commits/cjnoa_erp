import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Bell, X, Clock, Volume2, CheckCircle } from 'lucide-react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { Recordatorio } from '../types/database';

interface ReminderAlert {
  id: string;
  recordatorio: Recordatorio;
  timestamp: number;
}

interface ReminderContextType {
  notificationsEnabled: boolean;
  requestNotifications: () => Promise<void>;
  dismissAlert: (id: string) => void;
  markDone: (id: string) => void;
}

const ReminderContext = createContext<ReminderContextType | undefined>(undefined);

// ── Generate notification sound using Web Audio API ──
function playNotificationSound() {
  try {
    const ctx = new AudioContext();

    // Melody: 3 ascending tones (professional chime)
    const notes = [
      { freq: 587.33, start: 0, dur: 0.15 },     // D5
      { freq: 739.99, start: 0.15, dur: 0.15 },   // F#5
      { freq: 880.00, start: 0.30, dur: 0.3 },    // A5
    ];

    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    });

    // Close context after sound finishes
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Audio not supported, fail silently
  }
}

function formatTime(t: string) {
  return t.slice(0, 5);
}

export function ReminderProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<ReminderAlert[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const notifiedRef = useRef<Set<string>>(new Set());
  const fetchIntervalRef = useRef<ReturnType<typeof setInterval>>();

  // ── Fetch recordatorios periodically ──
  const fetchRecordatorios = useCallback(async () => {
    if (!user) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('recordatorios')
      .select('*')
      .eq('fecha', todayStr)
      .eq('completado', false)
      .order('hora', { ascending: true });
    if (data) setRecordatorios(data as Recordatorio[]);
  }, [user]);

  useEffect(() => {
    fetchRecordatorios();
    fetchIntervalRef.current = setInterval(fetchRecordatorios, 60000);
    return () => { if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current); };
  }, [fetchRecordatorios]);

  // ── Check notification permission ──
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);

  async function requestNotifications() {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
  }

  // ── Check for due reminders every 15s ──
  useEffect(() => {
    if (!user) return;

    function checkReminders() {
      const now = new Date();
      const nowDate = now.toISOString().split('T')[0];
      const nowTime = now.toTimeString().slice(0, 5);

      for (const rec of recordatorios) {
        if (rec.completado) continue;
        if (rec.fecha !== nowDate) continue;
        if (notifiedRef.current.has(rec.id)) continue;

        const recTime = rec.hora.slice(0, 5);
        if (recTime <= nowTime) {
          notifiedRef.current.add(rec.id);

          // Play sound
          playNotificationSound();

          // In-app alert
          setAlerts(prev => [...prev, {
            id: rec.id,
            recordatorio: rec,
            timestamp: Date.now(),
          }]);

          // Browser notification (if enabled)
          if (notificationsEnabled) {
            new Notification('⏰ Recordatorio - CJ NOA', {
              body: `${rec.titulo}${rec.descripcion ? '\n' + rec.descripcion : ''}`,
              icon: '/Logo NOA.jpeg',
              tag: rec.id,
            });
          }
        }
      }
    }

    checkReminders();
    const interval = setInterval(checkReminders, 15000);
    return () => clearInterval(interval);
  }, [recordatorios, notificationsEnabled, user]);

  function dismissAlert(id: string) {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  async function markDone(id: string) {
    await supabase.from('recordatorios').update({ completado: true }).eq('id', id);
    setAlerts(prev => prev.filter(a => a.id !== id));
    fetchRecordatorios();
  }

  return (
    <ReminderContext.Provider value={{ notificationsEnabled, requestNotifications, dismissAlert, markDone }}>
      {children}

      {/* Alert banners - fixed top right */}
      {alerts.length > 0 && (
        <div className="fixed top-4 right-4 z-[200] flex flex-col gap-3 max-w-md w-full pointer-events-none">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="pointer-events-auto animate-slide-down"
            >
              <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-[#0c0c0e]/95 backdrop-blur-2xl shadow-2xl shadow-amber-500/10">
                {/* Glow accent */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />

                {/* Pulse ring */}
                <div className="absolute -top-1 -right-1 w-4 h-4">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500" />
                </div>

                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center flex-shrink-0">
                      <Bell className="w-6 h-6 text-amber-400 animate-[wiggle_0.5s_ease-in-out_3]" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
                        ⏰ Recordatorio
                      </p>
                      <p className="text-base font-semibold text-white leading-tight">
                        {alert.recordatorio.titulo}
                      </p>
                      {alert.recordatorio.descripcion && (
                        <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                          {alert.recordatorio.descripcion}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2.5">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatTime(alert.recordatorio.hora)}
                        </span>
                        {alert.recordatorio.tiene_audio && (
                          <span className="text-xs text-violet-400 flex items-center gap-1">
                            <Volume2 className="w-3 h-3" /> Audio adjunto
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Close */}
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="p-1 text-gray-500 hover:text-white transition-colors flex-shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => markDone(alert.id)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl 
                                 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 
                                 text-sm font-medium hover:bg-emerald-500/25 transition-all"
                    >
                      <CheckCircle className="w-4 h-4" /> Completado
                    </button>
                    <button
                      onClick={() => dismissAlert(alert.id)}
                      className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl
                                 bg-white/[0.04] border border-white/10 text-gray-400
                                 text-sm font-medium hover:bg-white/[0.08] transition-all"
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ReminderContext.Provider>
  );
}

export function useReminders() {
  const context = useContext(ReminderContext);
  if (!context) throw new Error('useReminders debe usarse dentro de ReminderProvider');
  return context;
}
