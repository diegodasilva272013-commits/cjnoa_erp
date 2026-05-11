import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { registrarServiceWorker, suscribirPush } from '../lib/pushNotifications';
import { showOSNotification } from '../lib/notify';

interface ChatNotificationsContextType {
  unreadTotal: number;
  unreadByConv: Record<string, number>;
  setActiveConv: (id: string | null) => void;
  markRead: (convId: string) => void;
  refreshUnread: () => Promise<void>;
}

const Ctx = createContext<ChatNotificationsContextType | undefined>(undefined);

// Sonido tipo "ding" único de la app, generado con WebAudio (no requiere assets)
function playDing() {
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;

    function tone(freq: number, start: number, dur: number, vol: number) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(vol, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    }

    // Doble nota ascendente — suena a "noa-chat"
    tone(880, 0, 0.18, 0.25);
    tone(1320, 0.12, 0.22, 0.22);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* ignore */
  }
}

export function ChatNotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [unreadByConv, setUnreadByConv] = useState<Record<string, number>>({});
  const activeConvRef = useRef<string | null>(null);

  const setActiveConv = useCallback((id: string | null) => {
    activeConvRef.current = id;
    if (id) {
      setUnreadByConv(prev => {
        if (!prev[id]) return prev;
        const n = { ...prev };
        delete n[id];
        return n;
      });
    }
  }, []);

  const markRead = useCallback((convId: string) => {
    setUnreadByConv(prev => {
      if (!prev[convId]) return prev;
      const n = { ...prev };
      delete n[convId];
      return n;
    });
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!user) { setUnreadByConv({}); return; }
    const { data: parts } = await supabase
      .from('chat_participantes').select('conversacion_id').eq('usuario_id', user.id);
    const convIds = (parts || []).map((p: any) => p.conversacion_id);
    if (convIds.length === 0) { setUnreadByConv({}); return; }
    const { data: lecs } = await supabase
      .from('chat_lecturas').select('conversacion_id, ultimo_leido').eq('usuario_id', user.id);
    const lecMap = new Map((lecs || []).map((l: any) => [l.conversacion_id, l.ultimo_leido]));
    const result: Record<string, number> = {};
    await Promise.all(convIds.map(async (cid) => {
      const ultimo = lecMap.get(cid) || '1970-01-01';
      const { count } = await supabase.from('chat_mensajes')
        .select('id', { count: 'exact', head: true })
        .eq('conversacion_id', cid)
        .neq('emisor_id', user.id)
        .gt('created_at', ultimo);
      if (count && count > 0) result[cid] = count;
    }));
    setUnreadByConv(result);
  }, [user]);

  // Carga inicial + suscripción global
  useEffect(() => {
    if (!user) return;
    refreshUnread();

    // Polling cada 15s — fallback si realtime no entrega
    const poll = setInterval(() => { refreshUnread(); }, 15000);
    // Refrescar al volver el foco
    const onFocus = () => refreshUnread();
    window.addEventListener('focus', onFocus);

    const lastSeenRef = { current: new Date().toISOString() };

    async function checkNew() {
      // Buscar mensajes nuevos para mí desde lastSeen
      const { data: parts } = await supabase
        .from('chat_participantes').select('conversacion_id').eq('usuario_id', user!.id);
      const convIds = (parts || []).map((p: any) => p.conversacion_id);
      if (convIds.length === 0) return;
      const { data: msgs } = await supabase
        .from('chat_mensajes')
        .select('id, conversacion_id, emisor_id, tipo, contenido, created_at')
        .in('conversacion_id', convIds)
        .neq('emisor_id', user!.id)
        .gt('created_at', lastSeenRef.current)
        .order('created_at', { ascending: true })
        .limit(20);
      if (!msgs || msgs.length === 0) return;
      lastSeenRef.current = msgs[msgs.length - 1].created_at;
      for (const m of msgs as any[]) {
        if (activeConvRef.current === m.conversacion_id) {
          await supabase.from('chat_lecturas').upsert({
            conversacion_id: m.conversacion_id, usuario_id: user!.id, ultimo_leido: new Date().toISOString(),
          });
          continue;
        }
        setUnreadByConv(prev => ({ ...prev, [m.conversacion_id]: (prev[m.conversacion_id] || 0) + 1 }));
        const { data: pf } = await supabase
          .from('perfiles').select('nombre').eq('id', m.emisor_id).maybeSingle();
        const nombre = pf?.nombre || 'Alguien';
        const preview = m.tipo === 'texto' ? (m.contenido || '').slice(0, 80)
          : m.tipo === 'audio' ? '🎤 Nota de voz'
          : m.tipo === 'imagen' ? '📷 Imagen'
          : m.tipo === 'gif' ? '🎬 GIF'
          : m.tipo === 'archivo' ? '📎 Archivo'
          : 'Nuevo mensaje';
        playDing();
        showToast(`💬 ${nombre}: ${preview}`, 'info');
        void showOSNotification(`Mensaje de ${nombre}`, { body: preview, icon: '/Logo NOA.jpeg', tag: m.conversacion_id });
      }
    }
    // Polling de mensajes nuevos cada 5s — fallback robusto
    const msgPoll = setInterval(checkNew, 5000);

    const ch = supabase.channel('chat-notif-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensajes' }, async (payload) => {
        const m = payload.new as any;
        if (!m || m.emisor_id === user.id) return;
        // Evitar duplicado con polling
        if (m.created_at <= lastSeenRef.current) return;
        lastSeenRef.current = m.created_at;
        // Verificar que el usuario actual es participante
        const { data: parts } = await supabase
          .from('chat_participantes').select('usuario_id')
          .eq('conversacion_id', m.conversacion_id);
        const ids = (parts || []).map((p: any) => p.usuario_id);
        if (!ids.includes(user.id)) return;

        if (activeConvRef.current === m.conversacion_id) {
          await supabase.from('chat_lecturas').upsert({
            conversacion_id: m.conversacion_id, usuario_id: user.id, ultimo_leido: new Date().toISOString(),
          });
          return;
        }

        setUnreadByConv(prev => ({ ...prev, [m.conversacion_id]: (prev[m.conversacion_id] || 0) + 1 }));

        const { data: pf } = await supabase
          .from('perfiles').select('nombre').eq('id', m.emisor_id).maybeSingle();
        const nombre = pf?.nombre || 'Alguien';
        const preview = m.tipo === 'texto' ? (m.contenido || '').slice(0, 80)
          : m.tipo === 'audio' ? '🎤 Nota de voz'
          : m.tipo === 'imagen' ? '📷 Imagen'
          : m.tipo === 'gif' ? '🎬 GIF'
          : m.tipo === 'archivo' ? '📎 Archivo'
          : 'Nuevo mensaje';

        playDing();
        showToast(`💬 ${nombre}: ${preview}`, 'info');

        void showOSNotification(`Mensaje de ${nombre}`, { body: preview, icon: '/Logo NOA.jpeg', tag: m.conversacion_id });
      })
      .subscribe();

    // Pedir permiso de notificación + registrar push
    (async () => {
      try {
        await registrarServiceWorker();
        if ('Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        if ('Notification' in window && Notification.permission === 'granted') {
          await suscribirPush(user.id);
        }
      } catch { /* ignore */ }
    })();

    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
      clearInterval(msgPoll);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, refreshUnread, showToast]);

  const unreadTotal = Object.values(unreadByConv).reduce((a, b) => a + b, 0);

  return (
    <Ctx.Provider value={{ unreadTotal, unreadByConv, setActiveConv, markRead, refreshUnread }}>
      {children}
    </Ctx.Provider>
  );
}

export function useChatNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useChatNotifications fuera de provider');
  return v;
}
