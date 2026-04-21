import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Perfil } from '../types/database';

interface AuthContextType {
  user: User | null;
  perfil: Perfil | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refetchPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPerfil = useCallback(async (nextUser: User | null) => {
    if (!nextUser) return null;

    const { data } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', nextUser.id)
      .maybeSingle();

    return data ?? null;
  }, []);

  useEffect(() => {
    let active = true;

    const applySession = async (nextSession: Session | null) => {
      const nextUser = nextSession?.user ?? null;
      const nextPerfil = await loadPerfil(nextUser);

      if (!active) return;

      setSession(nextSession);
      setUser(nextUser);
      setPerfil(nextPerfil);
      setLoading(false);
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

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadPerfil]);

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      setSession(data.session);
      setUser(data.session.user);
      const perfilData = await loadPerfil(data.session.user);
      setPerfil(perfilData);
    }
    return { error: error as Error | null };
  }

  async function refetchPerfil() {
    if (user) {
      const data = await loadPerfil(user);
      setPerfil(data);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setPerfil(null);
  }

  return (
    <AuthContext.Provider value={{ user, perfil, session, loading, signIn, signOut, refetchPerfil }}>
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
