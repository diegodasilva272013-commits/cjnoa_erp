const RELOAD_KEY = 'cjnoa-chunk-reload-ts';
const RELOAD_PARAM = '__chunk_reload';
const RELOAD_GUARD_MS = 15_000;
const REARM_DELAY_MS = 8_000;

function buildFreshUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_PARAM, String(Date.now()));
  return url.toString();
}

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
  window.location.replace(buildFreshUrl());
  return true;
}

export function rearmChunkRecovery() {
  window.setTimeout(() => {
    sessionStorage.removeItem(RELOAD_KEY);
    const url = new URL(window.location.href);
    if (url.searchParams.has(RELOAD_PARAM)) {
      url.searchParams.delete(RELOAD_PARAM);
      const clean = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, '', clean || '/');
    }
  }, REARM_DELAY_MS);
}
