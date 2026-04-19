import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/** Returns a Map<uuid, nombre> for all perfiles. Useful for resolving audit fields. */
export function usePerfilMap() {
  const [map, setMap] = useState<Map<string, string>>(new Map());

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('perfiles')
      .select('id, nombre');
    if (data) {
      setMap(new Map(data.map(p => [p.id, p.nombre])));
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return map;
}
