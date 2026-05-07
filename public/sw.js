/* CJ NOA Service Worker — handles Web Push + click navigation */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'CJ NOA', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'CJ NOA';
  const options = {
    body: data.body || '',
    icon: data.icon || '/Logo NOA.jpeg',
    badge: data.badge || '/Logo NOA.jpeg',
    tag: data.tag || 'cjnoa-msg',
    renotify: true,
    vibrate: [80, 40, 80],
    data: { url: data.url || '/chat' },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/chat';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      } catch {}
    }
    await self.clients.openWindow(targetUrl);
  })());
});
