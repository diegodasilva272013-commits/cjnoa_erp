// Helper para mostrar notificaciones del SO de forma compatible con móvil/PWA.
// En Android (incluido Chrome móvil instalado o no), `new Notification(...)` está
// PROHIBIDO y lanza "Failed to construct 'Notification': Illegal constructor".
// La única vía permitida es `ServiceWorkerRegistration.showNotification()`.
// En desktop ambas funcionan; preferimos el SW si está disponible.
//
// Esta función nunca debe lanzar: cualquier error se traga silenciosamente.
export async function showOSNotification(
  title: string,
  options?: NotificationOptions
): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    // Preferir Service Worker (obligatorio en móvil)
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, options);
          return;
        }
      } catch {
        // sigue al fallback
      }
    }

    // Fallback solo desktop: puede lanzar en móvil, por eso va en try/catch
    try {
      new Notification(title, options);
    } catch {
      /* móvil: ignorar */
    }
  } catch {
    /* nunca crashear la app por una notificación */
  }
}
