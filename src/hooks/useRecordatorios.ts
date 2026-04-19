import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Recordatorio } from '../types/database';

export function useRecordatorios() {
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('recordatorios')
        .select('*')
        .order('fecha', { ascending: true })
        .order('hora', { ascending: true });
      if (!error && data) setRecordatorios(data as Recordatorio[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { recordatorios, loading, refetch: fetch };
}

export async function createRecordatorio(data: {
  usuario_id: string;
  titulo: string;
  descripcion?: string;
  fecha: string;
  hora: string;
  color?: string;
  caso_id?: string;
}) {
  const { error } = await supabase.from('recordatorios').insert({
    ...data,
    descripcion: data.descripcion || null,
    color: data.color || 'blue',
    caso_id: data.caso_id || null,
  });
  if (error) throw error;
}

export async function updateRecordatorio(id: string, data: Partial<Recordatorio>) {
  const { error } = await supabase
    .from('recordatorios')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteRecordatorio(rec: Recordatorio) {
  if (rec.audio_path) {
    await supabase.storage.from('notas-voz').remove([rec.audio_path]);
  }
  const { error } = await supabase.from('recordatorios').delete().eq('id', rec.id);
  if (error) throw error;
}

export async function uploadAudio(recordatorioId: string, blob: Blob, userId: string) {
  const path = `${userId}/${recordatorioId}.webm`;

  const { error: uploadError } = await supabase.storage
    .from('notas-voz')
    .upload(path, blob, { upsert: true, contentType: 'audio/webm' });
  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase
    .from('recordatorios')
    .update({ tiene_audio: true, audio_path: path })
    .eq('id', recordatorioId);
  if (dbError) throw dbError;
}

export async function deleteAudio(rec: Recordatorio) {
  if (!rec.audio_path) return;
  await supabase.storage.from('notas-voz').remove([rec.audio_path]);
  await supabase.from('recordatorios')
    .update({ tiene_audio: false, audio_path: null })
    .eq('id', rec.id);
}

export async function getAudioUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('notas-voz')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
