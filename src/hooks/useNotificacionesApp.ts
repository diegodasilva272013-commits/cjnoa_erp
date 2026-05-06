import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface NotificacionApp {
  id: string;
  user_id: string;
  tipo: 'tarea_asignada' | 'tarea_vista' | 'tarea_estado' | 'nota_caso' | 'generico';
  titulo: string;
  mensaje: string | null;
  link: string | null;
  related_id: string | null;
  related_caso_general_id: string | null;
  related_user_id: string | null;
  leida: boolean;
  leida_at: string | null;
  created_at: string;
}

export function useNotificacionesApp(userId: string | null) {
  const [items, setItems] = useState<NotificacionApp[]>([]);
  const [loading, setLoading] = useState(false);
  // sonido / pulse: usar ref para no re-renderear
  const lastSeenIdRef = useRef<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!userId) { setItems([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('notificaciones_app')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(80);
    if (!error && data) setItems(data as NotificacionApp[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // realtime: escuchar inserts/updates dirigidos al usuario actual
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notif-app-${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notificaciones_app', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const n = payload.new as NotificacionApp;
            setItems(prev => [n, ...prev].slice(0, 80));
            lastSeenIdRef.current = n.id;
          } else if (payload.eventType === 'UPDATE') {
            const n = payload.new as NotificacionApp;
            setItems(prev => prev.map(x => x.id === n.id ? n : x));
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) setItems(prev => prev.filter(x => x.id !== oldId));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  const unreadCount = items.filter(n => !n.leida).length;

  async function marcarLeida(id: string) {
    const { error } = await supabase
      .from('notificaciones_app')
      .update({ leida: true, leida_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) setItems(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
  }

  async function marcarTodasLeidas() {
    if (!userId) return;
    const { error } = await supabase
      .from('notificaciones_app')
      .update({ leida: true, leida_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('leida', false);
    if (!error) setItems(prev => prev.map(n => ({ ...n, leida: true })));
  }

  async function eliminar(id: string) {
    const { error } = await supabase.from('notificaciones_app').delete().eq('id', id);
    if (!error) setItems(prev => prev.filter(n => n.id !== id));
  }

  return { items, unreadCount, loading, refetch: fetchItems, marcarLeida, marcarTodasLeidas, eliminar };
}
