type CleanupEnvironment = {
  origin: string;
  serviceWorkers?: Pick<ServiceWorkerContainer, 'getRegistrations' | 'controller'>;
  cacheStorage?: Pick<CacheStorage, 'keys' | 'delete'>;
  sessionStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  reload: () => void;
};

const RELOAD_GUARD = 'cadence-legacy-worker-reload';
const LEGACY_CACHE_PREFIXES = ['cadence-shell-', 'cadence-runtime-'];

// Temporary migration: remove after existing installations have had a release or
// two to update. This never registers a worker or touches IndexedDB/model caches.
export async function cleanupLegacyServiceWorker(env: CleanupEnvironment): Promise<boolean> {
  const isLegacyWorker = (worker: ServiceWorker | null | undefined) => {
    if (!worker) return false;
    try {
      const url = new URL(worker.scriptURL);
      return url.origin === env.origin && url.pathname === '/sw.js';
    } catch { return false; }
  };
  let mayReload = false;
  try {
    if (env.serviceWorkers) {
      const controlled = isLegacyWorker(env.serviceWorkers.controller);
      const registrations = await env.serviceWorkers.getRegistrations();
      const legacy = registrations.filter(registration => {
        if (new URL(registration.scope).origin !== env.origin) return false;
        return [registration.active, registration.waiting, registration.installing].some(isLegacyWorker);
      });
      const results = await Promise.allSettled(legacy.map(registration => registration.unregister()));
      // A registration may already have been removed by another tab while this
      // document remains controlled. Reload also handles that case.
      mayReload = controlled && results.every(result => result.status === 'fulfilled' && result.value);
    }
  } catch { /* Restricted browsers must still be able to start the online app. */ }

  // Keep cleanup independent: a failed worker API must not skip cache cleanup,
  // and a failed cache deletion must not prevent other matching deletions.
  try {
    if (env.cacheStorage) {
      const names = await env.cacheStorage.keys();
      await Promise.allSettled(names
        .filter(name => LEGACY_CACHE_PREFIXES.some(prefix => name.startsWith(prefix)))
        .map(name => env.cacheStorage!.delete(name)));
    }
  } catch { /* Cache Storage may be disabled or unavailable. */ }

  try {
    if (!mayReload) {
      if (!env.serviceWorkers?.controller) env.sessionStorage?.removeItem(RELOAD_GUARD);
      return false;
    }
    // Unregistration does not release the current document immediately. Reload
    // before mounting the app, with a tab-local guard against reload loops.
    if (!env.sessionStorage || env.sessionStorage.getItem(RELOAD_GUARD)) return false;
    env.sessionStorage.setItem(RELOAD_GUARD, '1');
    env.reload();
    return true;
  } catch { return false; }
}
