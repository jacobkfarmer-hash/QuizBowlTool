import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
export function localPWA(): Plugin {
  return { name: 'cadence-static-pwa', apply: 'build', generateBundle(_, bundle) {
    const files = Object.keys(bundle).filter(name => !name.includes('worker') && /\.(js|css)$/.test(name));
    const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const SHELL = 'cadence-shell-${version}', RUNTIME = 'cadence-runtime-${version}';
const FILES = ${JSON.stringify(['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', ...files.map(f => '/' + f)])};
self.addEventListener('install', e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(k => (k.startsWith('cadence-shell-') || k.startsWith('cadence-runtime-')) && k !== SHELL && k !== RUNTIME).map(k => caches.delete(k)))), self.clients.claim()])));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never intercept QBReader, Hugging Face, model weights or non-GET requests.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (e.request.mode === 'navigate') { e.respondWith(caches.open(SHELL).then(async c => (await c.match('/index.html')) || fetch(e.request))); return; }
  if (!FILES.includes(url.pathname) && !/^\\/(assets|runtime)\\/[^/]+\\.(js|mjs|css|wasm)$/.test(url.pathname)) return;
  // These are public same-origin static assets. Vite's Vary: Origin header can
  // differ between precache fetches and module requests; their content is identical.
  e.respondWith((async () => { const cached = await caches.match(e.request, { ignoreVary: true }); if (cached) return cached; const response = await fetch(e.request); if (response.ok && response.type === 'basic') { const cache = await caches.open(RUNTIME); await cache.put(e.request, response.clone()); } return response; })());
});
` });
  } };
}
