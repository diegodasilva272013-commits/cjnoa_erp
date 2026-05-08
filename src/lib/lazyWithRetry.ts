import { lazy, type ComponentType } from 'react';
import { isChunkLoadError, tryRecoverChunkError } from './chunkRecovery';

/**
 * Wrapper sobre React.lazy que evita el cartel "La app se trabo"
 * cuando un chunk viejo dejo de existir tras un redeploy.
 *
 * 1) Primer fallo por chunk-error -> reintenta una vez (bache de red).
 * 2) Si el reintento tambien falla -> delega en tryRecoverChunkError
 *    (reload duro con cache busting + guard antiloop).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (!isChunkLoadError(err)) throw err;
      try {
        return await factory();
      } catch (err2) {
        if (isChunkLoadError(err2) && tryRecoverChunkError(err2)) {
          return { default: (() => null) as unknown as T };
        }
        throw err2;
      }
    }
  });
}
