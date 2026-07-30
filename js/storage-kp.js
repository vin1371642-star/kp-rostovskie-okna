// storage-kp.js — слой хранения КП (kp, kp_items, kp_versions).
// Контракт: см. CONTRACT.md. Импорты — относительные, с расширением .js.
import { dbAll, dbGet, dbPut, dbDel, dbByIndex, dbReplaceByIndex, uid } from './db.js';
import { state } from './store.js';
import { download, todayISO } from './util.js';
import { vatMode } from './calc.js';

// Убрать внутренние/несериализуемые поля перед записью в IndexedDB:
// ключи с '_' (напр. _tr — ссылка на DOM-строку), функции и DOM-узлы.
// Без этого put() падает с DataCloneError и ломает всё сохранение.
function clean(obj){
  const out = {};
  for (const k in obj){
    if (k[0] === '_') continue;
    const v = obj[k];
    if (typeof v === 'function') continue;
    if (v && typeof v === 'object' && v.nodeType) continue;
    out[k] = v;
  }
  return out;
}

// Создать новое КП с дефолтами, сохранить в БД и вернуть.
export async function newKp(){
  const orgs = await dbAll('organizations');
  const org = orgs[0] || null;
  const manager = (state.settings && state.settings.manager)
    ? { ...state.settings.manager }
    : { name: '', phone: '', position: 'Менеджер отдела продаж' };
  const now = new Date().toISOString();
  const kp = {
    id: uid(),
    client_request_no: '',
    date: todayISO(),
    org_id: org ? org.id : '',
    buyer_type: 'person',
    buyer: {},
    doc_variant: 'premium',
    manager,
    show_sketches: true,
    // Способ вывода НДС: 'line' — «Плюс НДС» (цены без НДС, налог сверху строкой),
    // 'included' — «в т.ч. НДС» (цены уже с НДС, налог выделяется внутри итога),
    // 'none' — «Без НДС» (не считается и не показывается, напр. физлицо/наличные).
    vat_mode: 'line',
    vat_display: 'line', // legacy-поле, оставлено для .kp старых версий
    vat_show: true,      // legacy-поле, оставлено для .kp старых версий
    vat_rate: org && org.vat_rate != null ? org.vat_rate : 0,
    object_address: '',
    valid_until: '',
    discount: 0,
    status: 'draft',
    version: 1,
    created_at: now,
    updated_at: now,
    // Пусто — условия берутся из Настроек (terms_person/terms_legal) по варианту документа.
    // Заполнение в карточке «Условия и сроки» КП переопределяет настройки для этого КП.
    terms: {}
  };
  await dbPut('kp', kp);
  return kp;
}

// Загрузить КП и его позиции (отсортированы по section затем sort).
export async function loadKp(id){
  const kp = await dbGet('kp', id);
  if (!kp) return { kp: null, items: [] };
  const items = (await dbByIndex('kp_items', 'kp_id', id))
    .sort((a, b) => {
      const s = String(a.section || '').localeCompare(String(b.section || ''));
      if (s !== 0) return s;
      return (a.sort || 0) - (b.sort || 0);
    });
  return { kp, items };
}

// Сохранить КП и пере-сохранить его позиции.
// Позиции заменяются АТОМАРНО (удаление старых + запись новых в одной транзакции) —
// сбой/закрытие вкладки посередине не оставит КП с потерянными позициями.
export async function saveKp(kp, items){
  kp.updated_at = new Date().toISOString();
  await dbPut('kp', clean(kp));
  const list = (items || []).map((src, i) => ({ ...clean(src), id: src.id || uid(), kp_id: kp.id, sort: i }));
  await dbReplaceByIndex('kp_items', 'kp_id', kp.id, list);
  return kp;
}

// Список всех КП, отсортированный по updated_at по убыванию.
export async function listKp(){
  const all = await dbAll('kp');
  return all.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

// Дублировать КП (новый id, version=1, status='draft', + копии позиций). Вернуть новый id.
export async function duplicateKp(id){
  const { kp, items } = await loadKp(id);
  if (!kp) return null;
  const now = new Date().toISOString();
  const newId = uid();
  const copy = {
    ...kp,
    id: newId,
    version: 1,
    status: 'draft',
    client_request_no: (kp.client_request_no || '') + ' (копия)',
    created_at: now,
    updated_at: now
  };
  await dbPut('kp', copy);
  const list = items.map((it, i) => ({ ...it, id: uid(), kp_id: newId, sort: i }));
  await dbReplaceByIndex('kp_items', 'kp_id', newId, list);
  return newId;
}

// Обновить статус КП.
export async function setStatus(id, status){
  const kp = await dbGet('kp', id);
  if (!kp) return null;
  kp.status = status;
  kp.updated_at = new Date().toISOString();
  await dbPut('kp', kp);
  return kp;
}

// Удалить КП со всеми его позициями и версиями (атомарно по индексу kp_id).
export async function deleteKp(id){
  await dbDel('kp', id);
  await dbReplaceByIndex('kp_items', 'kp_id', id, []);
  await dbReplaceByIndex('kp_versions', 'kp_id', id, []);
}

// Сохранить версию КП (снимок) и инкрементировать kp.version.
export async function saveVersion(id, note){
  const { kp, items } = await loadKp(id);
  if (!kp) return null;
  const versionNo = kp.version || 1;
  const record = {
    id: uid(),
    kp_id: id,
    version_no: versionNo,
    snapshot: JSON.stringify({ kp: clean(kp), items: items.map(clean) }),
    note: note || '',
    created_at: new Date().toISOString()
  };
  await dbPut('kp_versions', record);
  kp.version = versionNo + 1;
  kp.updated_at = new Date().toISOString();
  await dbPut('kp', kp);
  return record;
}

// Собрать {kp, items} и скачать как .kp (JSON).
export async function exportKpFile(id){
  const { kp, items } = await loadKp(id);
  if (!kp) return;
  const label = kp.client_request_no || kp.id;
  download('КП-' + label + '.kp', JSON.stringify({ kp, items }, null, 2));
}

// Импортировать .kp файл: прочитать, распарсить, записать kp+items под новым id. Вернуть id.
export async function importKpFile(file){
  const text = await file.text();
  const data = JSON.parse(text);
  const srcKp = data.kp || {};
  const srcItems = Array.isArray(data.items) ? data.items : [];
  const now = new Date().toISOString();
  const newId = uid();
  // Файл .kp — обычный JSON, его могли править вручную. Санируем то, что участвует
  // в расчётах: иначе отрицательная скидка раздувает итог, а позиция с чужим
  // section молча выпадает из всех подытогов, оставаясь в списке.
  const num = (v, min) => { const x = Number(v); return Number.isFinite(x) ? Math.max(min, x) : min; };
  const SECTIONS = ['product', 'material', 'service'];
  const kp = {
    ...srcKp,
    id: newId,
    discount: num(srcKp.discount, 0),
    vat_rate: num(srcKp.vat_rate, 0),
    // .kp мог быть выгружен до появления трёх режимов НДС (или правлен вручную):
    // приводим к текущему полю, восстанавливая режим из legacy vat_show/vat_display.
    vat_mode: vatMode(srcKp),
    created_at: srcKp.created_at || now,
    updated_at: now
  };
  await dbPut('kp', kp);
  const list = srcItems.map((it, i) => ({
    ...it,
    section: SECTIONS.includes(it && it.section) ? it.section : 'product',
    amount: num(it && it.amount, 0),
    id: uid(), kp_id: newId, sort: i
  }));
  await dbReplaceByIndex('kp_items', 'kp_id', newId, list);
  return newId;
}
