import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const cache = new Map<string, { url: string; expires: number }>();

export function useAvatarUrl(storagePath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!storagePath) {
      setUrl(null);
      return;
    }

    // Check cache (valid for 50 min)
    const cached = cache.get(storagePath);
    if (cached && cached.expires > Date.now()) {
      setUrl(cached.url);
      return;
    }

    supabase.storage
      .from('notas-voz')
      .createSignedUrl(storagePath, 3600)
      .then(({ data }) => {
        if (data) {
          cache.set(storagePath, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
          setUrl(data.signedUrl);
        }
      });
  }, [storagePath]);

  return url;
}
