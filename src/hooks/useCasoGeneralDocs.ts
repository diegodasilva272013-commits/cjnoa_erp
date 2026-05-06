import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface CasoGeneralDoc {
  id: string;
  caso_id: string;
  nombre: string;
  mime: string;
  tamano: number;
  storage_path: string;
  subido_por: string | null;
  created_at: string;
}

const BUCKET = 'casos-generales-adjuntos';

export function useCasoGeneralDocs(casoId: string | null) {
  const [docs, setDocs] = useState<CasoGeneralDoc[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!casoId) { setDocs([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('casos_generales_documentos')
      .select('*')
      .eq('caso_id', casoId)
      .order('created_at', { ascending: false });
    setDocs((data as CasoGeneralDoc[]) || []);
    setLoading(false);
  }, [casoId]);

  useEffect(() => { refetch(); }, [refetch]);

  // realtime
  useEffect(() => {
    if (!casoId) return;
    const ch = supabase.channel(`cg-docs-${casoId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'casos_generales_documentos', filter: `caso_id=eq.${casoId}` },
        () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [casoId, refetch]);

  return { docs, loading, refetch };
}

export async function uploadCasoGeneralDoc(
  casoId: string,
  file: File,
  userId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const path = `${casoId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (up.error) return { ok: false, error: up.error.message };

  const ins = await supabase.from('casos_generales_documentos').insert({
    caso_id: casoId,
    nombre: file.name,
    mime: file.type || 'application/octet-stream',
    tamano: file.size,
    storage_path: path,
    subido_por: userId,
  });
  if (ins.error) {
    // rollback storage
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: ins.error.message };
  }
  return { ok: true };
}

export async function deleteCasoGeneralDoc(doc: CasoGeneralDoc): Promise<{ ok: boolean; error?: string }> {
  const st = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  if (st.error) return { ok: false, error: st.error.message };
  const db = await supabase.from('casos_generales_documentos').delete().eq('id', doc.id);
  if (db.error) return { ok: false, error: db.error.message };
  return { ok: true };
}

export async function getCasoGeneralDocSignedUrl(storage_path: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storage_path, seconds);
  return data?.signedUrl || null;
}

export async function downloadCasoGeneralDoc(doc: CasoGeneralDoc) {
  const { data, error } = await supabase.storage.from(BUCKET).download(doc.storage_path);
  if (error || !data) return;
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.nombre;
  a.click();
  URL.revokeObjectURL(url);
}
