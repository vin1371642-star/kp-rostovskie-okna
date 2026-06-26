// Роутер и загрузка приложения — общий контракт. НЕ редактировать в модулях-агентах.
import { openDB } from './db.js';
import { state, subscribe, setRoute, loadSettings, enterAdminMode, exitAdminMode } from './store.js';
import { toast } from './util.js';
import { seedData } from './seed.js';
import { renderKpList } from './view-kp-list.js';
import { renderConstructor } from './view-constructor.js';
import { renderCatalog } from './view-catalog.js';
import { renderDiscount } from './view-discount.js';
import { renderUpdate } from './view-update.js';
import { renderOrganizations } from './view-organizations.js';
import { renderSettings } from './view-settings.js';
import { renderHelp } from './view-help.js';

// Меню зависит от режима: сотрудники видят «Обновить данные», админ — «Админ».
function navItems(){
  const items = [
    ['kp-list', 'Мои КП'],
    ['constructor', 'Конструктор КП'],
    ['catalog', 'Каталог'],
    ['discount', 'Расчёт скидки'],
    state.adminMode ? ['organizations', 'Админ'] : ['update', 'Обновить данные'],
    ['settings', 'Настройки'],
    ['help', 'Инструкция'],
  ];
  return items;
}
const ADMIN_ONLY = ['organizations']; // доступно только в режиме админа
const RENDER = {
  'kp-list': renderKpList,
  'constructor': renderConstructor,
  'catalog': renderCatalog,
  'discount': renderDiscount,
  'update': renderUpdate,
  'organizations': renderOrganizations,
  'settings': renderSettings,
  'help': renderHelp,
};

function renderNav(){
  const nav = document.getElementById('nav');
  const items = navItems().map(([r, label]) => `<button class="navbtn ${state.route === r ? 'active' : ''}" data-r="${r}">${label}</button>`).join('');
  const adminBtn = state.adminMode
    ? '<button class="navbtn navbtn-admin" data-admin="exit" title="Выйти из режима администратора">🔓 Выйти из админа</button>'
    : '<button class="navbtn navbtn-admin" data-admin="enter" title="Войти в режим администратора">🔒 Администратор</button>';
  nav.innerHTML = items + adminBtn;
  nav.querySelectorAll('button[data-r]').forEach(b => b.onclick = () => setRoute(b.dataset.r));
  const ab = nav.querySelector('[data-admin]');
  if (ab) ab.onclick = async () => {
    if (ab.dataset.admin === 'exit'){ if (state.route === 'organizations') setRoute('kp-list'); exitAdminMode(); return; }
    const r = await enterAdminMode();
    if (r === 'wrong') toast('Неверный пароль');
    else if (r === 'nolocal') toast('Режим администратора доступен только в локальной версии');
    else if (r === 'set') toast('Пароль администратора задан, режим включён');
    else if (r === 'ok') toast('Режим администратора включён');
  };
}
function renderView(){
  const root = document.getElementById('view');
  root.__epoch = (root.__epoch || 0) + 1; // метка против устаревших async-рендеров
  // Админ-разделы недоступны без режима администратора.
  if (ADMIN_ONLY.includes(state.route) && !state.adminMode){ state.route = 'update'; }
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

// Офлайн-кэш (service worker) отключён — приложение всегда грузится свежим из сети.
// Снимаем любой ранее зарегистрированный SW, чтобы старый кэш не залипал.
if ('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistrations()
    .then(rs => rs.forEach(r => r.unregister()))
    .catch(() => {});
}
if (window.caches && caches.keys){
  caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {}); // чистим старые кэши приложения
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
  try { sessionStorage.removeItem('kp-selfheal'); } catch (e) {} // успешный старт — снять флаг самовосстановления
})();
