import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        supabase.from('perfiles').select('*').eq('id', s.user.id).single()
          .then(({ data }) => setPerfil(data));
      }
    }).catch(() => {});

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          supabase.from('perfiles').select('*').eq('id', s.user.id).single()
            .then(({ data }) => setPerfil(data));
        } else {
          setPerfil(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      setSession(data.session);
      setUser(data.session.user);
      const { data: perfilData } = await supabase
        .from('perfiles').select('*').eq('id', data.session.user.id).single();
      setPerfil(perfilData);
    }
    return { error: error as Error | null };
  }

  async function refetchPerfil() {
    if (user) {
      const { data } = await supabase.from('perfiles').select('*').eq('id', user.id).single();
      if (data) setPerfil(data);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
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
