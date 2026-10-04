// FILE_VERSION: admin-sw-v1
/* Сервис-воркер ДАШБОРДА (club-admin). Только пуши админу: «сборка поднялась»
   и всё, что сервер шлёт через admin_push_all. Ничего не кэширует — дашборд
   всегда должен брать свежий файл, иначе после выкладки виден старый. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title || 'Дашборд клуба', {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { url: data.url || './index.html' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
    }
    return clients.openWindow(url);
  }));
});
