// sw.js — ВЫКЛЮЧАТЕЛЬ кэша. Офлайн-кэш убран (он залипал и ломал загрузку).
// Этот service worker при активации стирает все кэши, снимает сам себя с регистрации
// и перезагружает открытые страницы — чтобы клиенты со старым «застрявшим» кэшем
// автоматически стали работать без кэша, свежим кодом из сети. КП в IndexedDB не трогаем.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) { try { c.navigate(c.url); } catch (e) {} }
    } catch (e) { /* no-op */ }
  })());
});

// Ничего не перехватываем и не кэшируем — все запросы идут напрямую в сеть.
self.addEventListener('fetch', () => {});
