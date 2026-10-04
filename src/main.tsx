import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { cleanupLegacyServiceWorker } from './legacy-worker-cleanup';

function readBrowserAPI<T>(read: () => T): T | undefined {
  try { return read(); } catch { return undefined; }
}

async function start() {
  if (import.meta.env.PROD) {
    try {
      const reloading = await cleanupLegacyServiceWorker({
        origin: window.location.origin,
        serviceWorkers: readBrowserAPI(() => navigator.serviceWorker),
        cacheStorage: readBrowserAPI(() => window.caches),
        sessionStorage: readBrowserAPI(() => window.sessionStorage),
        reload: () => window.location.reload(),
      });
      if (reloading) return;
    } catch { /* Access to browser storage APIs can itself be restricted. */ }
  }
  // No StrictMode double initialization of expensive local speech workers.
  createRoot(document.getElementById('root')!).render(<App/>);
}
void start();
