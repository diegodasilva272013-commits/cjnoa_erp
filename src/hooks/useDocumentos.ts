import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Documento } from '../types/database';

export function useDocumentos(casoId: string | null) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!casoId) { setDocumentos([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documentos')
        .select('*')
        .eq('caso_id', casoId)
        .order('created_at', { ascending: false });
      if (!error && data) setDocumentos(data as Documento[]);
    } finally {
      setLoading(false);
    }
  }, [casoId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { documentos, loading, refetch: fetch };
}

export async function uploadDocumento(
  casoId: string,
  file: File,
  userId: string | undefined,
) {
  const ext = file.name.split('.').pop();
  const storagePath = `${casoId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('documentos')
    .upload(storagePath, file);

  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase.from('documentos').insert({
    caso_id: casoId,
    nombre: file.name,
    nombre_archivo: file.name,
    tipo: file.type || 'application/octet-stream',
    tamano: file.size,
    storage_path: storagePath,
    subido_por: userId || null,
  });

  if (dbError) throw dbError;
}

export async function deleteDocumento(doc: Documento) {
  const { error: storageError } = await supabase.storage
    .from('documentos')
    .remove([doc.storage_path]);

  if (storageError) throw storageError;

  const { error: dbError } = await supabase
    .from('documentos')
    .delete()
    .eq('id', doc.id);

  if (dbError) throw dbError;
}

export async function downloadDocumento(doc: Documento) {
  const { data, error } = await supabase.storage
    .from('documentos')
    .download(doc.storage_path);

  if (error) throw error;

  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.nombre_archivo;
  a.click();
  URL.revokeObjectURL(url);
}
