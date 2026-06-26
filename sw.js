// sw.js — офлайн-кэш приложения КП «Ростовские окна».
// Эталон (код + статика) кэшируется здесь; личные данные живут в IndexedDB и SW их не трогает.
// Стратегии: навигация — network-first (свежий код, офлайн-фолбэк на index.html);
// статика (js/css/шрифты/картинки) — cache-first; api/ и shared.json — только сеть (никогда не кэшируем).
const VERSION = 'v4';
const CACHE = 'kp-rostov-' + VERSION;

// Оболочка приложения — кладём в кэш при установке (гарантированный офлайн-старт).
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/theme.css',
  'css/fonts.css',
  'js/main.js',
  'js/db.js',
  'js/store.js',
  'js/util.js',
  'js/seed.js',
  'js/calc.js',
  'js/amount-in-words.js',
  'js/storage-kp.js',
  'js/share.js',
  'js/publish.js',
  'js/doc-templates.js',
  'js/print.js',
  'js/view-kp-list.js',
  'js/view-constructor.js',
  'js/view-configurator.js',
  'js/view-catalog.js',
  'js/view-discount.js',
  'js/view-update.js',
  'js/view-help.js',
  'js/view-organizations.js',
  'js/view-settings.js',
  'assets/logo-color.png',
  'assets/logo-white.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll падает целиком, если хоть один ресурс не отдан; кладём по одному и не валим установку.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Принудительная активация новой версии по сообщению из приложения.
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function isApi(url){
  return url.pathname.includes('/api/') || url.pathname.endsWith('/shared.json') || url.pathname.endsWith('shared.json');
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // POST (публикация) — мимо кэша
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // сторонние ресурсы — как есть
  if (isApi(url)) return;                            // публикация/общий слой — всегда из сети

  const putCache = resp => {
    if (resp && resp.ok && resp.type === 'basic'){ const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return resp;
  };

  // Код приложения (навигация, js/css/manifest) — NETWORK-FIRST: всегда свежая версия онлайн,
  // офлайн → из кэша. Это убирает «залипание» старого кода у сотрудников.
  const isCode = req.mode === 'navigate' || /\.(js|css)$/.test(url.pathname) || url.pathname.endsWith('manifest.webmanifest');
  if (isCode){
    e.respondWith(
      fetch(req).then(putCache).catch(() =>
        caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('index.html').then(x => x || caches.match('./')) : undefined))
      )
    );
    return;
  }

  // Прочая статика (шрифты, картинки) — cache-first (она не меняется между версиями).
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(putCache))
  );
});
