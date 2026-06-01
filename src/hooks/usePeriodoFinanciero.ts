import { useCallback, useEffect, useMemo, useState } from 'react';

export type PresetPeriodo =
  | 'mes_actual'
  | 'mes_anterior'
  | 'ultimos_30'
  | 'ultimos_90'
  | 'anio_actual'
  | 'todo'
  | 'personalizado';

export interface PeriodoFinanciero {
  preset: PresetPeriodo;
  desde: string; // 'YYYY-MM-DD' o '' (sin tope inferior)
  hasta: string; // 'YYYY-MM-DD' o '' (sin tope superior)
  label: string;
  setPreset: (p: PresetPeriodo) => void;
  setRangoPersonalizado: (desde: string, hasta: string) => void;
}

// Fechas en hora local (evita el bug clásico de toISOString() corriendo el día por UTC).
function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function nombreMes(d: Date): string {
  return `${NOMBRES_MES[d.getMonth()]} ${d.getFullYear()}`;
}

interface RangoCalculado {
  desde: string;
  hasta: string;
  label: string;
}

function calcularRango(
  preset: PresetPeriodo,
  custom: { desde: string; hasta: string },
): RangoCalculado {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'mes_actual': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
      return { desde: toISODateLocal(inicio), hasta: toISODateLocal(fin), label: nombreMes(inicio) };
    }
    case 'mes_anterior': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      return { desde: toISODateLocal(inicio), hasta: toISODateLocal(fin), label: nombreMes(inicio) };
    }
    case 'ultimos_30': {
      const inicio = new Date(hoy);
      inicio.setDate(inicio.getDate() - 29);
      return { desde: toISODateLocal(inicio), hasta: toISODateLocal(hoy), label: 'últimos 30 días' };
    }
    case 'ultimos_90': {
      const inicio = new Date(hoy);
      inicio.setDate(inicio.getDate() - 89);
      return { desde: toISODateLocal(inicio), hasta: toISODateLocal(hoy), label: 'últimos 90 días' };
    }
    case 'anio_actual': {
      const inicio = new Date(hoy.getFullYear(), 0, 1);
      const fin = new Date(hoy.getFullYear(), 11, 31);
      return { desde: toISODateLocal(inicio), hasta: toISODateLocal(fin), label: `año ${hoy.getFullYear()}` };
    }
    case 'todo':
      return { desde: '', hasta: '', label: 'todo el historial' };
    case 'personalizado': {
      const partes: string[] = [];
      if (custom.desde) partes.push(`desde ${custom.desde}`);
      if (custom.hasta) partes.push(`hasta ${custom.hasta}`);
      return {
        desde: custom.desde,
        hasta: custom.hasta,
        label: partes.length ? partes.join(' ') : 'rango personalizado',
      };
    }
  }
}

interface PersistedState {
  preset: PresetPeriodo;
  customDesde: string;
  customHasta: string;
}

function leerStorage(key: string, fallback: PresetPeriodo): PersistedState {
  if (typeof window === 'undefined') {
    return { preset: fallback, customDesde: '', customHasta: '' };
  }
  try {
    const raw = window.localStorage.getItem(`periodo:${key}`);
    if (!raw) return { preset: fallback, customDesde: '', customHasta: '' };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      preset: (parsed.preset as PresetPeriodo) || fallback,
      customDesde: typeof parsed.customDesde === 'string' ? parsed.customDesde : '',
      customHasta: typeof parsed.customHasta === 'string' ? parsed.customHasta : '',
    };
  } catch {
    return { preset: fallback, customDesde: '', customHasta: '' };
  }
}

/**
 * Hook para manejar el período de un tablero financiero.
 * - Default: "mes actual".
 * - Persiste la elección por `storageKey` en localStorage.
 * - Expone `desde` / `hasta` listos para filtrar (formato 'YYYY-MM-DD' en hora local).
 *   Cuando alguno está vacío, NO debe aplicarse tope en ese extremo.
 */
export function usePeriodoFinanciero(
  storageKey: string,
  defaultPreset: PresetPeriodo = 'mes_actual',
): PeriodoFinanciero {
  const [state, setState] = useState<PersistedState>(() => leerStorage(storageKey, defaultPreset));

  // Persistencia
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(`periodo:${storageKey}`, JSON.stringify(state));
    } catch {
      /* ignore quota */
    }
  }, [storageKey, state]);

  const rango = useMemo(
    () => calcularRango(state.preset, { desde: state.customDesde, hasta: state.customHasta }),
    [state],
  );

  const setPreset = useCallback((p: PresetPeriodo) => {
    setState(prev => ({ ...prev, preset: p }));
  }, []);

  const setRangoPersonalizado = useCallback((desde: string, hasta: string) => {
    setState({ preset: 'personalizado', customDesde: desde, customHasta: hasta });
  }, []);

  return {
    preset: state.preset,
    desde: rango.desde,
    hasta: rango.hasta,
    label: rango.label,
    setPreset,
    setRangoPersonalizado,
  };
}
