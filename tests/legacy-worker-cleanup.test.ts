import { describe, expect, it, vi } from 'vitest';
import { cleanupLegacyServiceWorker } from '../src/legacy-worker-cleanup';

const origin = 'https://cadence.example';
const worker = (scriptURL = `${origin}/sw.js`) => ({ scriptURL }) as ServiceWorker;
function registration(scriptURL = `${origin}/sw.js`, state = 'active') {
  return {
    scope: `${origin}/`, active: null, waiting: null, installing: null,
    [state]: worker(scriptURL), unregister: vi.fn().mockResolvedValue(true),
  } as unknown as ServiceWorkerRegistration;
}
function environment() {
  const values = new Map<string, string>();
  return {
    origin,
    serviceWorkers: { controller: null as ServiceWorker | null, getRegistrations: vi.fn().mockResolvedValue([]) },
    cacheStorage: { keys: vi.fn().mockResolvedValue([]), delete: vi.fn().mockResolvedValue(true) },
    sessionStorage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
      removeItem: vi.fn((key: string) => { values.delete(key); }),
    },
    reload: vi.fn(),
  };
}

describe('temporary production worker cleanup', () => {
  it('unregisters active, waiting and installing legacy workers only', async () => {
    const env = environment();
    const legacy = ['active', 'waiting', 'installing'].map(state => registration(`${origin}/sw.js?v=old`, state));
    const unrelated = registration(`${origin}/other/sw.js`);
    const foreign = registration('https://other.example/sw.js');
    env.serviceWorkers.getRegistrations.mockResolvedValue([...legacy, unrelated, foreign]);
    await expect(cleanupLegacyServiceWorker(env)).resolves.toBe(false);
    legacy.forEach(reg => expect(reg.unregister).toHaveBeenCalledOnce());
    expect(unrelated.unregister).not.toHaveBeenCalled();
    expect(foreign.unregister).not.toHaveBeenCalled();
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('deletes only the two exact cache prefixes, preserving models and unrelated caches', async () => {
    const env = environment();
    env.cacheStorage.keys.mockResolvedValue(['cadence-shell-v1', 'cadence-runtime-v2', 'transformers-cache', 'kokoro-voices', 'other-app', 'cadence-shell', 'x-cadence-shell-v1']);
    await cleanupLegacyServiceWorker(env);
    expect(env.cacheStorage.delete.mock.calls).toEqual([['cadence-shell-v1'], ['cadence-runtime-v2']]);
  });

  it('reloads a controlled page once, after unregistering and deleting caches', async () => {
    const env = environment();
    env.serviceWorkers.controller = worker();
    const old = registration();
    env.serviceWorkers.getRegistrations.mockResolvedValue([old]);
    env.cacheStorage.keys.mockResolvedValue(['cadence-shell-v1']);
    await expect(cleanupLegacyServiceWorker(env)).resolves.toBe(true);
    expect(env.reload).toHaveBeenCalledOnce();
    expect(env.cacheStorage.delete.mock.invocationCallOrder[0]).toBeLessThan(env.reload.mock.invocationCallOrder[0]);
    await expect(cleanupLegacyServiceWorker(env)).resolves.toBe(false);
    expect(env.reload).toHaveBeenCalledOnce();
    env.serviceWorkers.controller = null;
    await cleanupLegacyServiceWorker(env);
    expect(env.sessionStorage.removeItem).toHaveBeenCalledWith('cadence-legacy-worker-reload');
  });

  it('releases a controller whose registration was already removed by another tab', async () => {
    const env = environment();
    env.serviceWorkers.controller = worker();
    await expect(cleanupLegacyServiceWorker(env)).resolves.toBe(true);
  });

  it('does not reload for an unrelated controller or a failed unregister', async () => {
    const env = environment();
    const old = registration();
    env.serviceWorkers.getRegistrations.mockResolvedValue([old]);
    env.serviceWorkers.controller = worker(`${origin}/other.js`);
    await expect(cleanupLegacyServiceWorker(env)).resolves.toBe(false);
    env.serviceWorkers.controller = worker();
    vi.mocked(old.unregister).mockRejectedValue(new Error('disabled'));
    await expect(cleanupLegacyServiceWorker(env)).resolves.toBe(false);
    vi.mocked(old.unregister).mockResolvedValue(false);
    await expect(cleanupLegacyServiceWorker(env)).resolves.toBe(false);
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('continues independent cleanup when worker inspection or one cache deletion fails', async () => {
    const env = environment();
    env.serviceWorkers.getRegistrations.mockRejectedValue(new Error('disabled'));
    env.cacheStorage.keys.mockResolvedValue(['cadence-shell-v1', 'cadence-runtime-v1']);
    env.cacheStorage.delete.mockRejectedValueOnce(new Error('disabled'));
    await expect(cleanupLegacyServiceWorker(env)).resolves.toBe(false);
    expect(env.cacheStorage.delete).toHaveBeenCalledTimes(2);
  });

  it('starts normally with absent APIs, failed cache access or blocked tab storage', async () => {
    await expect(cleanupLegacyServiceWorker({ origin, reload: vi.fn() })).resolves.toBe(false);
    const env = environment();
    env.cacheStorage.keys.mockRejectedValue(new Error('disabled'));
    await expect(cleanupLegacyServiceWorker(env)).resolves.toBe(false);
    env.serviceWorkers.controller = worker();
    env.sessionStorage.getItem.mockImplementation(() => { throw new Error('blocked'); });
    await expect(cleanupLegacyServiceWorker(env)).resolves.toBe(false);
    expect(env.reload).not.toHaveBeenCalled();
  });
});
