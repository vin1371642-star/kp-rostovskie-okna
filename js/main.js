// Роутер и загрузка приложения — общий контракт. НЕ редактировать в модулях-агентах.
import { openDB } from './db.js';
import { state, subscribe, setRoute, loadSettings } from './store.js';
import { seedData } from './seed.js';
import { renderKpList } from './view-kp-list.js';
import { renderConstructor } from './view-constructor.js';
import { renderCatalog } from './view-catalog.js';
import { renderOrganizations } from './view-organizations.js';
import { renderSettings } from './view-settings.js';

const NAV = [
  ['kp-list', 'Мои КП'],
  ['constructor', 'Конструктор КП'],
  ['catalog', 'Каталог'],
  ['organizations', 'Админ'],
  ['settings', 'Настройки'],
];
const RENDER = {
  'kp-list': renderKpList,
  'constructor': renderConstructor,
  'catalog': renderCatalog,
  'organizations': renderOrganizations,
  'settings': renderSettings,
};

function renderNav(){
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV.map(([r, label]) => `<button class="navbtn ${state.route === r ? 'active' : ''}" data-r="${r}">${label}</button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => setRoute(b.dataset.r));
}
function renderView(){
  const root = document.getElementById('view');
  root.__epoch = (root.__epoch || 0) + 1; // метка против устаревших async-рендеров
  root.innerHTML = '';
  const fn = RENDER[state.route];
  try {
    if (typeof fn === 'function') fn(root, state.params);
    else root.innerHTML = '<div class="card">Раздел «' + state.route + '» недоступен.</div>';
  } catch (e) {
    console.error('[render ' + state.route + ']', e);
    root.innerHTML = '<div class="card"><div class="h2">Не удалось открыть раздел</div><p class="muted">Раздел «' + state.route + '» временно недоступен. Попробуйте обновить страницу (Ctrl+F5).</p></div>';
  }
}

subscribe(() => { renderNav(); renderView(); });

// Service Worker — офлайн-кэш (только по http/https, не из file://).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('[sw]', e));
  });
}

(async () => {
  try {
    await openDB();
    await loadSettings();
    await seedData();
    await loadSettings();
  } catch (e) { console.error('[boot]', e); }
  renderNav();
  renderView();
})();
