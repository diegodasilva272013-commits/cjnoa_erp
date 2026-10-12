import { supabase } from './supabase';

/** Pide al servidor que traiga de ElevenLabs lo que todavía no está guardado (conversaciones, nombres, audios). Devuelve cuántas conversaciones nuevas entraron. */
export async function sincronizarAgente(): Promise<number> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return 0;
    const r = await fetch('/api/turnos/sincronizar', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return 0;
    const j = await r.json();
    return Number(j?.nuevas ?? 0) + Number(j?.audios ?? 0);
  } catch {
    return 0;
  }
}
