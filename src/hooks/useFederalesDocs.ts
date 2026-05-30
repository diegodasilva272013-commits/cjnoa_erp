import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface FederalDoc {
  id: string;
  cliente_fed_id: string;
  nombre: string;
  mime: string;
  tamano: number;
  storage_path: string;
  subido_por: string | null;
  created_at: string;
}

const BUCKET = 'federales-adjuntos';

export function useFederalesDocs(clienteId: string | null) {
  const [docs, setDocs] = useState<FederalDoc[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!clienteId) { setDocs([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('clientes_federales_documentos')
      .select('*')
      .eq('cliente_fed_id', clienteId)
      .order('created_at', { ascending: false });
    setDocs((data as FederalDoc[]) || []);
    setLoading(false);
  }, [clienteId]);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    if (!clienteId) return;
    // Channel name único por mount para evitar el error
    // "cannot add postgres_changes callbacks after subscribe()" cuando
    // dos instancias del hook se montan con el mismo clienteId (StrictMode
    // o dos paneles abiertos a la vez).
    const uniq = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    const ch = supabase.channel(`fed-docs-${clienteId}-${uniq}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'clientes_federales_documentos', filter: `cliente_fed_id=eq.${clienteId}` },
        () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [clienteId, refetch]);

  return { docs, loading, refetch };
}

export async function uploadFederalDoc(
  clienteId: string,
  file: File,
  userId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const path = `${clienteId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (up.error) return { ok: false, error: up.error.message };

  const ins = await supabase.from('clientes_federales_documentos').insert({
    cliente_fed_id: clienteId,
    nombre: file.name,
    mime: file.type || 'application/octet-stream',
    tamano: file.size,
    storage_path: path,
    subido_por: userId,
  });
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: ins.error.message };
  }
  return { ok: true };
}

export async function deleteFederalDoc(doc: FederalDoc): Promise<{ ok: boolean; error?: string }> {
  const st = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  if (st.error) return { ok: false, error: st.error.message };
  const db = await supabase.from('clientes_federales_documentos').delete().eq('id', doc.id);
  if (db.error) return { ok: false, error: db.error.message };
  return { ok: true };
}

export async function getFederalDocSignedUrl(storage_path: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storage_path, seconds);
  return data?.signedUrl || null;
}

export async function downloadFederalDoc(doc: FederalDoc) {
  const { data, error } = await supabase.storage.from(BUCKET).download(doc.storage_path);
  if (error || !data) return;
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.nombre;
  a.click();
  URL.revokeObjectURL(url);
}
