import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ReminderProvider } from './context/ReminderContext'
import { ChatNotificationsProvider } from './context/ChatNotificationsContext'
import { rearmChunkRecovery, tryRecoverChunkError } from './lib/chunkRecovery'
import './index.css'

// ============================================================
// AUTO-ACTUALIZACIÓN PWA — fuerza al service worker viejo a salir
// y al nuevo a tomar el control sin que el usuario tenga que limpiar nada.
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(async (regs) => {
    for (const reg of regs) {
      try { await reg.update(); } catch { /* ignore */ }
    }
  });
  // Cuando el SW nuevo activa, recargamos automáticamente
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

// Rearm the chunk recovery guard after a successful app boot so repeated deploys
// in the same tab still recover automatically instead of leaving the user stuck.
rearmChunkRecovery();
window.addEventListener('error', (ev) => { tryRecoverChunkError(ev.error || ev.message); });
window.addEventListener('unhandledrejection', (ev) => { tryRecoverChunkError(ev.reason); });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <ToastProvider>
            <ReminderProvider>
              <ChatNotificationsProvider>
                <App />
              </ChatNotificationsProvider>
            </ReminderProvider>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
