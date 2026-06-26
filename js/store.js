// Состояние приложения — общий контракт. НЕ редактировать в модулях-агентах.
import { dbGet, dbPut } from './db.js';

export const state = { route: 'kp-list', params: {}, settings: null, editingKpId: null, adminMode: false };
const subs = new Set();

export function subscribe(fn){ subs.add(fn); return () => subs.delete(fn); }
export function emit(){ subs.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }
export function setRoute(route, params){
  // Автосохранение текущего экрана перед переходом (конструктор КП регистрирует _onLeave).
  if (typeof state._onLeave === 'function'){
    const fn = state._onLeave;
    state._onLeave = null;
    try { fn(); } catch (e){ console.error('[onLeave]', e); }
  }
  state.route = route; state.params = params || {}; emit();
}

export async function loadSettings(){
  const loaded = await dbGet('settings', 'app');
  // Подмешиваем недостающие поля из значений по умолчанию (для старых баз).
  state.settings = loaded ? Object.assign(defaultSettings(), loaded) : defaultSettings();
  // Миграция: прежний единый terms_default → условия для физлиц.
  if (loaded && loaded.terms_default && !loaded.terms_person){
    state.settings.terms_person = Object.assign({}, state.settings.terms_person, loaded.terms_default);
  }
  return state.settings;
}
export async function saveSettings(s){ s.id = 'app'; await dbPut('settings', s); state.settings = s; emit(); return s; }

// Вход в режим администратора (полный «Админ» + редактор формул).
// На СВОЁМ компьютере (localhost) — открывается сразу, без пароля. На публичной ссылке
// (github.io) недоступен, поэтому сотрудники «Админ» не видят. Возвращает: 'ok' | 'nolocal'.
export async function enterAdminMode(){
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!isLocal) return 'nolocal';
  state.adminMode = true; emit();
  return 'ok';
}
export function exitAdminMode(){ state.adminMode = false; emit(); }

export function defaultSettings(){
  return {
    id: 'app',
    default_markup: 30,
    admin_password: '', // отдельный пароль админ-режима (НЕ раздаётся сотрудникам)
    manager: { name: '', phone: '', position: 'Менеджер отдела продаж' },
    about: {
      slogan: 'Мы существуем, чтобы делать жизнь людей более комфортной.',
      years: 'более 15 лет', objects: '9 000+',
      hero_img: '', qr_img: '', rating: '5,0', reviews: '437 оценок'
    },
    footer: { brand: 'РОСТОВСКИЕ ОКНА', tagline: 'Светопрозрачные конструкции под ключ', site: '', phone: '' },
    // Условия по умолчанию: отдельно для физлиц (премиум) и для юрлиц (КП/оферта).
    terms_person: { produce: '5–7 рабочих дней', warranty: 'до 10 лет', payment: 'предоплата 70%' },
    terms_legal: {
      produce: '5–7 рабочих дней',
      warranty: 'Гарантия до 10 лет на изделия и монтажные работы при соблюдении правил эксплуатации. Сервисное обслуживание — по заявке.',
      payment: 'Предоплата 70% — основание для запуска в производство. Остаток 30% — по факту доставки и монтажа. Оплата на расчётный счёт Продавца.'
    },
    service_bases: ['10% от изделий', 'фикс', 'за шт'],
    service_items: ['Монтаж конструкций', 'Демонтаж старых конструкций', 'Доставка', 'Подъём на этаж', 'Откосы (монтаж)', 'Вывоз мусора'],
    columns_config: null,
    doc_labels: {},    // переопределения подписей (ярлыков) в документе КП
    disc_formulas: {}, // переопределения формул вкладки «Расчёт скидки» (по умолчанию — стандартные)
    catalog_seeded: false
  };
}
