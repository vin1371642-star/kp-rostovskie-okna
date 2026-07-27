// publish.js — публикация общего слоя «по ссылке» и подтягивание у сотрудника.
// Админ (локальная программа) публикует: общий слой шифруется паролем, версия растёт,
// зашифрованный бандл отдаётся хостом по ссылке (shared.json). КП не входят и не трогаются.
import { dbGet, dbPut } from './db.js';
import { buildSharedBundle, applySharedBundle, encryptBundle, decryptBundle } from './share.js';

const SHARED_URL = 'shared.json';

async function getSettings(){ return (await dbGet('settings', 'app')) || { id: 'app' }; }
const vnum = v => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };

// Узнать версию, опубликованную по ссылке (открыто, без пароля). null — ничего не опубликовано.
export async function fetchPublishedVersion(){
  try {
    const r = await fetch(SHARED_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j.version || null;
  } catch { return null; }
}

// Админ: собрать + зашифровать + версия +1 + отправить на хост.
export async function publishShared(password){
  if (!password) throw new Error('Не задан пароль доступа');
  const s = await getSettings();
  // Считаем от максимума локальной и уже опубликованной версии: публикация с другой
  // машины (или после переустановки) иначе начала бы счётчик заново и перезаписала свежую.
  const published = await fetchPublishedVersion();
  const version = Math.max(vnum(s.published_version), vnum(published)) + 1;
  const bundle = await buildSharedBundle();
  const payload = await encryptBundle({ version, published_at: new Date().toISOString(), data: bundle }, password);
  payload.version = version; // версия в открытом виде — для сравнения без пароля
  const res = await fetch('api/publish', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-KP-Publish': '1' }, body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Публикация доступна только из локальной программы (хост не ответил)');
  // Хост отвечает 200 и при неудавшемся git push — версию запоминаем только если
  // по ссылке реально выложено, иначе локально числилась бы версия, которой нет в проде.
  const info = await res.json().catch(() => ({}));
  if (info && info.state === 'error') throw new Error('Не выложено по ссылке: ' + (info.msg || 'неизвестная ошибка'));
  s.published_version = version; s.access_password = password; s.id = 'app';
  await dbPut('settings', s);
  return version;
}

// Сотрудник: скачать + расшифровать паролем + применить общий слой (КП сохраняются).
// mode='replace' — заменить каталог/организации целиком; mode='add' — только добавить новое.
export async function pullShared(password, mode = 'replace'){
  if (!password) throw new Error('Введите пароль доступа');
  const r = await fetch(SHARED_URL + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('По ссылке пока ничего не опубликовано');
  const payload = await r.json();
  let obj;
  try { obj = await decryptBundle(payload, password); }
  catch { throw new Error('Неверный пароль'); }
  await applySharedBundle(obj.data, mode);
  const s = await getSettings();
  s.published_version = obj.version; s.access_password = password; s.id = 'app';
  await dbPut('settings', s);
  return obj.version;
}
