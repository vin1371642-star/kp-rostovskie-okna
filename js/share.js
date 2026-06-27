// share.js — ОБЩИЙ слой данных (раздаётся по ссылке) + шифрование паролем.
// КП (kp / kp_items / kp_versions) в общий слой НЕ входят и при применении НЕ трогаются.
import { dbAll, dbGet, dbPut, dbReplaceStore } from './db.js';

// Хранилища общего слоя.
export const SHARED_STORES = ['organizations', 'categories', 'components', 'product_kits', 'clients'];
// Ключ слияния для режима «Добавить новое»: компоненты — по стабильному code, остальное — по id.
const MERGE_KEY = { components: 'code' };
// Поля настроек, входящие в общий слой (manager/access_password/published_version — личные, не раздаём).
const SHARED_SETTINGS_KEYS = ['default_markup', 'about', 'footer', 'columns_config', 'service_bases', 'service_items', 'material_items', 'terms_person', 'terms_legal', 'disc_formulas', 'doc_labels'];

// Собрать общий слой в один объект.
export async function buildSharedBundle(){
  const data = {};
  for (const s of SHARED_STORES) data[s] = await dbAll(s);
  const settings = (await dbGet('settings', 'app')) || {};
  const shared = {};
  for (const k of SHARED_SETTINGS_KEYS) if (settings[k] !== undefined) shared[k] = settings[k];
  data.settings = shared;
  return data;
}

// Применить общий слой. КП (kp/kp_items/kp_versions) не входят и не трогаются.
// mode='replace' (по умолчанию) — заменить общие хранилища целиком.
// mode='add' — только добавить отсутствующее (по code/id), правки менеджера сохраняются.
export async function applySharedBundle(bundle, mode = 'replace'){
  if (!bundle) return;
  if (mode === 'add') return addSharedBundle(bundle);
  for (const s of SHARED_STORES){
    if (!Array.isArray(bundle[s])) continue;
    await dbReplaceStore(s, bundle[s]); // очистка + запись одной транзакцией
  }
  if (bundle.settings){
    const cur = (await dbGet('settings', 'app')) || { id: 'app' };
    Object.assign(cur, bundle.settings); cur.id = 'app';
    await dbPut('settings', cur);
  }
}

// Слияние «Добавить новое»: дописываем только записи, которых ещё нет (по ключу слияния),
// существующие не перетираем. Списки в настройках объединяем, скаляры/объекты не трогаем.
async function addSharedBundle(bundle){
  for (const s of SHARED_STORES){
    if (!Array.isArray(bundle[s])) continue;
    const key = MERGE_KEY[s] || 'id';
    const existing = await dbAll(s);
    const have = new Set(existing.map(r => r[key]).filter(v => v != null));
    for (const row of bundle[s]){
      const k = row[key];
      if (k != null && have.has(k)) continue; // уже есть — не трогаем
      await dbPut(s, row);
    }
  }
  if (bundle.settings){
    const cur = (await dbGet('settings', 'app')) || { id: 'app' };
    for (const [k, v] of Object.entries(bundle.settings)){
      if (Array.isArray(v)){
        cur[k] = [...new Set([...(Array.isArray(cur[k]) ? cur[k] : []), ...v])]; // объединяем списки
      } else if (cur[k] === undefined || cur[k] === null || cur[k] === ''){
        cur[k] = v; // заполняем только пустые поля
      }
    }
    cur.id = 'app';
    await dbPut('settings', cur);
  }
}

// ── Шифрование паролем: PBKDF2 (SHA-256) → AES-GCM 256 ──────────────────────
const _enc = new TextEncoder();
const _dec = new TextDecoder();
// base64 кодируем ПО ЧАСТЯМ: spread (...array) на большом бандле (печати/подписи/фото)
// переполняет стек — «Maximum call stack size exceeded» при публикации.
const _b64 = buf => {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000; // 32 КБ за раз
  for (let i = 0; i < bytes.length; i += CHUNK){
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
};
const _unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password, salt){
  const base = await crypto.subtle.importKey('raw', _enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBundle(obj, password){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, _enc.encode(JSON.stringify(obj)));
  return { enc: 'aes-gcm', salt: _b64(salt), iv: _b64(iv), ct: _b64(ct) };
}

export async function decryptBundle(payload, password){
  const key = await deriveKey(password, _unb64(payload.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: _unb64(payload.iv) }, key, _unb64(payload.ct));
  return JSON.parse(_dec.decode(pt));
}
