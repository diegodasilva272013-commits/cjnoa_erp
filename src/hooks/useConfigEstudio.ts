import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface ConfigEstudio {
  reparto_base_pct: number;
  reparto_rendimiento_pct: number;
  comision_captadora_pct: number;
}

const DEFAULTS: ConfigEstudio = {
  reparto_base_pct: 0.65,
  reparto_rendimiento_pct: 0.35,
  comision_captadora_pct: 0.20,
};

export function useConfigEstudio() {
  const [config, setConfig] = useState<ConfigEstudio>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  async function fetchConfig() {
    const { data } = await supabase
      .from('configuracion_estudio')
      .select('reparto_base_pct, reparto_rendimiento_pct, comision_captadora_pct')
      .limit(1)
      .single();

    if (data) {
      setConfig({
        reparto_base_pct: Number(data.reparto_base_pct),
        reparto_rendimiento_pct: Number(data.reparto_rendimiento_pct),
        comision_captadora_pct: Number(data.comision_captadora_pct),
      });
    }
    setLoading(false);
  }

  async function updateConfig(patch: Partial<ConfigEstudio>) {
    const next = { ...config, ...patch };
    setConfig(next);
    await supabase
      .from('configuracion_estudio')
      .update(next)
      .not('id', 'is', null); // update the single row
  }

  useEffect(() => { fetchConfig(); }, []);

  return { config, loading, updateConfig };
}
