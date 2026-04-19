import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Carga la lista de socios desde perfiles (rol = 'socio').
 * Devuelve los nombres ordenados alfabéticamente.
 * Mientras carga, retorna un array vacío.
 */
export function useSocios() {
  const [socios, setSocios] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('perfiles')
      .select('nombre')
      .eq('rol', 'socio')
      .order('nombre')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setSocios(data.map(p => p.nombre));
        }
      });
  }, []);

  return socios;
}
