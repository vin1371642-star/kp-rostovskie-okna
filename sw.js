// sw.js — МИНИМАЛЬНЫЙ service worker только ради «Установить как приложение» (PWA).
// НИЧЕГО не кэширует: все запросы прозрачно идут в сеть, поэтому залипнуть на старом
// коде невозможно — приложение всегда грузится свежим. Офлайн-режима нет (он и не нужен).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  // network-only — прозрачный прокси в сеть, без кэша.
  e.respondWith(fetch(e.request));
});
