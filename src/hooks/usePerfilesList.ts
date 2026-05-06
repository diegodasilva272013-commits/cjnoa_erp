import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface PerfilLite {
  id: string;
  nombre: string;
  avatar_url: string | null;
  rol: string | null;
  activo: boolean;
}

/** Lista de perfiles activos para asignación de tareas / mostrar nombres */
export function usePerfilesList() {
  const [perfiles, setPerfiles] = useState<PerfilLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('perfiles')
        .select('id, nombre, avatar_url, rol, activo')
        .eq('activo', true)
        .order('nombre');
      if (mounted && data) setPerfiles(data as PerfilLite[]);
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  return { perfiles, loading };
}
