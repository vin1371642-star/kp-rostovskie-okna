// sw.js — МИНИМАЛЬНЫЙ service worker только ради «Установить как приложение» (PWA).
// НИЧЕГО не кэширует: все запросы прозрачно идут в сеть, поэтому залипнуть на старом
// коде невозможно — приложение всегда грузится свежим. Офлайн-режима нет (он и не нужен).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  // Чужие домены и не-GET отдаём браузеру как есть.
  if (req.method !== 'GET') return;
  let sameOrigin = false;
  try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch (_){ return; }
  if (!sameOrigin) return;
  // network-only И в обход HTTP-кэша браузера. Обычный fetch() ходит ЧЕРЕЗ него, а
  // GitHub Pages отдаёт скрипты с Cache-Control: max-age=600 — из-за этого после
  // публикации менеджер до десяти минут (а с открытой вкладкой и дольше) продолжал
  // работать на старом коде. cache:'no-store' заставляет всегда брать свежее.
  e.respondWith(
    fetch(req, { cache: 'no-store' }).catch(() => fetch(req))
  );
});
