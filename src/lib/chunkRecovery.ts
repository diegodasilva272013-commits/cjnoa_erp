const RELOAD_KEY = 'cjnoa-chunk-reload-ts';
const RELOAD_GUARD_MS = 15_000;
const REARM_DELAY_MS = 8_000;

export function isChunkLoadError(err: unknown) {
  const msg = String((err as any)?.message || err || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    /ChunkLoadError/i.test(msg)
  );
}

export function tryRecoverChunkError(err: unknown) {
  if (!isChunkLoadError(err)) return false;
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
  if (Date.now() - last < RELOAD_GUARD_MS) return false;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
  return true;
}

export function rearmChunkRecovery() {
  window.setTimeout(() => {
    sessionStorage.removeItem(RELOAD_KEY);
  }, REARM_DELAY_MS);
}
