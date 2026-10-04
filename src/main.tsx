import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
// No StrictMode double initialization of expensive local speech workers.
createRoot(document.getElementById('root')!).render(<App/>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => { /* Browser may disable persistence; the online app still works. */ }); });
