import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ReminderProvider } from './context/ReminderContext'
import './index.css'

// Auto-reload cuando el navegador tiene cacheado un index.html viejo que referencia
// chunks (assets/Layout-XXXX.js, etc.) que ya no existen tras un redeploy de Vercel.
// Sin esto el usuario queda atascado con "Failed to fetch dynamically imported module"
// hasta que hace Ctrl+Shift+R manual.
const RELOAD_KEY = 'cjnoa-chunk-reload';
function handleChunkError(err: unknown) {
  const msg = String((err as any)?.message || err || '');
  const isChunkErr =
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    /ChunkLoadError/i.test(msg);
  if (!isChunkErr) return false;
  // Evitar loop: solo recargamos una vez por sesion.
  if (sessionStorage.getItem(RELOAD_KEY)) return false;
  sessionStorage.setItem(RELOAD_KEY, '1');
  window.location.reload();
  return true;
}
window.addEventListener('error', (ev) => { handleChunkError(ev.error || ev.message); });
window.addEventListener('unhandledrejection', (ev) => { handleChunkError(ev.reason); });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <ToastProvider>
            <ReminderProvider>
              <App />
            </ReminderProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
