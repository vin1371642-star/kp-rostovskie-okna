// IndexedDB layer — общий контракт данных. НЕ редактировать в модулях-агентах.
export const DB_NAME = 'rostov_kp';
export const DB_VERSION = 2; // v2: индекс kp_id для kp_items/kp_versions
export const STORES = ['organizations','categories','components','product_kits','kp','kp_items','kp_item_components','kp_versions','clients','settings'];

// Хранилища с индексом kp_id (быстрые выборки/удаление позиций конкретного КП).
const KP_INDEXED = ['kp_items', 'kp_item_components', 'kp_versions'];

let _db = null;
export function openDB(){
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      const tx = e.target.transaction; // версионная транзакция — доступ к существующим store
      STORES.forEach(s => {
        const store = db.objectStoreNames.contains(s)
          ? tx.objectStore(s)
          : db.createObjectStore(s, { keyPath: 'id' });
        if (KP_INDEXED.includes(s) && !store.indexNames.contains('kp_id')){
          store.createIndex('kp_id', 'kp_id', { unique: false });
        }
      });
    };
    // Повышение версии блокируется другой открытой вкладкой — без этого обработчика
    // промис висел бы вечно, а watchdog в index.html перезагружал страницу по кругу.
    r.onblocked = () => rej(new Error('База данных открыта в другой вкладке приложения. Закройте лишние вкладки и обновите страницу.'));
    r.onsuccess = e => { _db = e.target.result; res(_db); };
    r.onerror = e => rej(e.target.error);
  });
}
function os(store, mode){ return openDB().then(db => db.transaction(store, mode).objectStore(store)); }
function wrap(req){ return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

export function dbAll(store){ return os(store,'readonly').then(s => wrap(s.getAll()).then(r => r || [])); }
export function dbGet(store, id){ return os(store,'readonly').then(s => wrap(s.get(id))); }
export function dbPut(store, obj){ if (!obj.id) obj.id = uid(); return os(store,'readwrite').then(s => wrap(s.put(obj)).then(() => obj)); }
export function dbDel(store, id){ return os(store,'readwrite').then(s => wrap(s.delete(id))); }
export function dbClear(store){ return os(store,'readwrite').then(s => wrap(s.clear())); }
export function dbBulk(store, arr){ return Promise.all((arr||[]).map(o => dbPut(store, o))); }

// Все записи store по индексу (key — значение индекса, напр. kp_id).
export function dbByIndex(store, index, key){
  return os(store,'readonly').then(s => wrap(s.index(index).getAll(key)).then(r => r || []));
}

// Атомарно в ОДНОЙ транзакции: удалить все записи store с index===key и записать rows.
// Защищает от потери данных при сбое между «удалить старое» и «записать новое».
export function dbReplaceByIndex(store, index, key, rows){
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const st = tx.objectStore(store);
    const cur = st.index(index).openCursor(IDBKeyRange.only(key));
    cur.onsuccess = e => {
      const c = e.target.result;
      if (c){ c.delete(); c.continue(); }
      else { for (const row of (rows || [])) st.put(row); }
    };
    cur.onerror = e => rej(e.target.error);
    tx.oncomplete = () => res(rows || []);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  }));
}

// Атомарно в одной транзакции: очистить store и записать rows.
export function dbReplaceStore(store, rows){
  return openDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const st = tx.objectStore(store);
    st.clear();
    for (const row of (rows || [])) st.put(row);
    tx.oncomplete = () => res(rows || []);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  }));
}

export function uid(){ return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
