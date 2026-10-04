self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.allSettled(
        names
          .filter((name) => name.startsWith('cadence-shell-') || name.startsWith('cadence-runtime-'))
          .map((name) => caches.delete(name)),
      );
    } finally {
      await self.registration.unregister();
    }
  })());
});
