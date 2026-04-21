import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Perfil } from '../types/database';

interface AuthContextType {
  user: User | null;
  perfil: Perfil | null;
  session: Session | null;
  loading: boolean;
  inactiveReason: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: (reason?: string) => Promise<void>;
  refetchPerfil: () => Promise<void>;
}

const INACTIVE_MESSAGE = 'Tu acceso fue deshabilitado por un administrador. Contactá al estudio.';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [inactiveReason, setInactiveReason] = useState<string | null>(null);

  const loadPerfil = useCallback(async (nextUser: User | null) => {
    if (!nextUser) return null;

    const { data } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', nextUser.id)
      .maybeSingle();

    return (data as Perfil | null) ?? null;
  }, []);

  const forceSignOut = useCallback(async (reason?: string) => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setSession(null);
    setUser(null);
    setPerfil(null);
    if (reason) setInactiveReason(reason);
  }, []);

  useEffect(() => {
    let active = true;
    let perfilChannel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToPerfil = (userId: string) => {
      if (perfilChannel) {
        try { supabase.removeChannel(perfilChannel); } catch { /* noop */ }
        perfilChannel = null;
      }
      perfilChannel = supabase
        .channel(`perfil-activo-${userId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'perfiles', filter: `id=eq.${userId}` },
          (payload) => {
            const next = payload.new as Partial<Perfil> | null;
            if (!active) return;
            if (next && next.activo === false) {
              void forceSignOut(INACTIVE_MESSAGE);
            } else if (next) {
              setPerfil((prev) => (prev ? { ...prev, ...next } as Perfil : prev));
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'perfiles', filter: `id=eq.${userId}` },
          () => {
            if (!active) return;
            void forceSignOut(INACTIVE_MESSAGE);
          }
        )
        .subscribe();
    };

    const unsubscribePerfil = () => {
      if (perfilChannel) {
        try { supabase.removeChannel(perfilChannel); } catch { /* noop */ }
        perfilChannel = null;
      }
    };

    const applySession = async (nextSession: Session | null) => {
      const nextUser = nextSession?.user ?? null;
      const nextPerfil = await loadPerfil(nextUser);

      if (!active) return;

      // Si el perfil está deshabilitado, corto la sesión inmediatamente.
      if (nextUser && nextPerfil && nextPerfil.activo === false) {
        unsubscribePerfil();
        await forceSignOut(INACTIVE_MESSAGE);
        setLoading(false);
        return;
      }

      setSession(nextSession);
      setUser(nextUser);
      setPerfil(nextPerfil);
      setLoading(false);

      if (nextUser) {
        subscribeToPerfil(nextUser.id);
      } else {
        unsubscribePerfil();
      }
    };

    const bootstrapSession = async () => {
      setLoading(true);
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        await applySession(currentSession);
      } catch {
        if (!active) return;
        setSession(null);
        setUser(null);
        setPerfil(null);
        setLoading(false);
      }
    };

    void bootstrapSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        void applySession(nextSession);
      }
    );

    // Re-check al volver el foco / pestaña visible (cubre desactivaciones que
    // ocurrieron mientras Realtime estaba caído).
    const recheckPerfil = async () => {
      if (!active) return;
      const { data: { session: current } } = await supabase.auth.getSession();
      const u = current?.user ?? null;
      if (!u) return;
      const p = await loadPerfil(u);
      if (!active) return;
      if (p && p.activo === false) {
        await forceSignOut(INACTIVE_MESSAGE);
      } else if (p) {
        setPerfil(p);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void recheckPerfil();
    };
    const onFocus = () => { void recheckPerfil(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      subscription.unsubscribe();
      unsubscribePerfil();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadPerfil, forceSignOut]);

  async function signIn(email: string, password: string) {
    setInactiveReason(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error as Error };
    }
    if (data.session) {
      const perfilData = await loadPerfil(data.session.user);
      if (perfilData && perfilData.activo === false) {
        await forceSignOut(INACTIVE_MESSAGE);
        return { error: new Error(INACTIVE_MESSAGE) };
      }
      setSession(data.session);
      setUser(data.session.user);
      setPerfil(perfilData);
    }
    return { error: null };
  }

  async function refetchPerfil() {
    if (user) {
      const data = await loadPerfil(user);
      if (data && data.activo === false) {
        await forceSignOut(INACTIVE_MESSAGE);
        return;
      }
      setPerfil(data);
    }
  }

  async function signOut(reason?: string) {
    await forceSignOut(reason);
  }

  return (
    <AuthContext.Provider value={{ user, perfil, session, loading, inactiveReason, signIn, signOut, refetchPerfil }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
