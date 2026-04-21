import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SOCIOS } from '../types/database';
import { sortOperationalSocios } from '../lib/operationalSocios';

/**
 * Devuelve socios operativos canonicos para finanzas/casos.
 *
 * IMPORTANTE: la lista canonica `SOCIOS = ['Rodrigo', 'Noelia', 'Fabricio', 'Alejandro']`
 * es la fuente de verdad para el reparto, porque los casos/ingresos guardan esos nombres.
 * Los `perfiles` con rol=socio pueden ser un subconjunto (no todos los socios tienen
 * usuario en la app), asi que NUNCA reemplazamos la lista canonica: solo la enriquecemos
 * con nombres extra que existan en perfiles. Asi un socio sin perfil sigue apareciendo en
 * las tarjetas y recibe la atribucion de sus ingresos.
 */
export function useSocios() {
  const [socios, setSocios] = useState<string[]>(SOCIOS);

  useEffect(() => {
    supabase
      .from('perfiles')
      .select('nombre')
      .eq('rol', 'socio')
      .order('nombre')
      .then(({ data }) => {
        const merged = sortOperationalSocios([
          ...SOCIOS,
          ...(data || []).map(p => p.nombre),
        ]);
        setSocios(merged);
      });
  }, []);

  return socios;
}
