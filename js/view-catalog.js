// view-catalog.js — Каталог: аккордеон категорий/комплектации/шаблонов + списки услуг и оснований.
// Каталог — перечень НАЗВАНИЙ для выбора (без цен). Стоимость вводится в КП по каждой позиции.
import { dbAll, dbPut, dbDel, uid } from './db.js';
import { toast, modal, escapeHtml, el } from './util.js';
import { state, saveSettings } from './store.js';

const UNITS = ['шт', 'м²', 'м.п.', 'компл', 'усл.'];
const openState = {}; // ключ секции -> открыта ли (по умолчанию свёрнуто)
const isOpen = key => !!openState[key];

let _styleInjected = false;
function injectStyle(){
  if (_styleInjected) return; _styleInjected = true;
  const css = `
  .cat-wrap{display:flex;flex-direction:column;gap:16px}
  .cat-spacer{flex:1}
  .cat-iconbtn{cursor:pointer;border:1px solid var(--line);background:#fff;border-radius:6px;padding:3px 8px;font-size:13px;line-height:1}
  .cat-iconbtn:hover{background:var(--surface)}
  .acc{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff;margin-bottom:8px}
  .acc-head{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;user-select:none}
  .acc-head:hover{background:var(--surface)}
  .acc-caret{color:var(--muted);width:12px;display:inline-block;font-size:11px}
  .acc-title{font-weight:600}
  .acc-body{padding:8px 12px 12px;border-top:1px solid var(--line)}
  .cat-comp-row{display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid var(--line)}
  .cat-comp-row:last-child{border-bottom:none}
  .cat-add-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-top:10px}
  .cat-grow{flex:1;min-width:160px}
  .cat-empty{padding:10px;color:var(--muted);font-style:italic}
  .cat-modal-grid{display:flex;flex-direction:column;gap:10px}
  .cat-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
  `;
  const s = document.createElement('style'); s.id = 'cat-style'; s.textContent = css; document.head.appendChild(s);
}

function rerender(root){ renderCatalog(root); }

export async function renderCatalog(root){
  injectStyle();
  const epoch = root.__epoch;
  const [cats, comps, kits] = await Promise.all([dbAll('categories'), dbAll('components'), dbAll('product_kits')]);
  if (root.__epoch !== epoch) return; // навигация ушла дальше
  cats.sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(a.name).localeCompare(String(b.name), 'ru'));

  root.innerHTML = '';
  const header = el(`<div class="toolbar"><div class="h1">Каталог</div><div class="cat-spacer"></div><button class="btn btn-red" id="cat-add-cat">+ Категория</button></div>`);
  header.querySelector('#cat-add-cat').onclick = () => addCategory(root, cats);
  root.appendChild(header);
  root.appendChild(el('<p class="muted" style="margin:0 0 14px">Перечень названий для выбора (без цен). Стоимость вводится в КП по каждой позиции.</p>'));

  const wrap = el('<div class="cat-wrap"></div>'); root.appendChild(wrap);

  // ── Комплектация по категориям (аккордеон) ──
  const compCard = el('<div class="card"><div class="h2">Комплектация по категориям</div></div>');
  if (!cats.length) compCard.appendChild(el('<div class="cat-empty">Категорий пока нет. Добавьте первую кнопкой «+ Категория».</div>'));
  cats.forEach(c => compCard.appendChild(categoryAcc(root, c, comps.filter(x => x.category_id === c.id), cats)));
  const orphan = comps.filter(x => !cats.some(c => c.id === x.category_id));
  if (orphan.length) compCard.appendChild(categoryAcc(root, { id: '', name: 'Без категории', _orphan: true }, orphan, cats));
  const addCatRow = el('<div class="cat-add-row" style="margin-top:12px"><button class="btn btn-red" id="cat-add-cat2">+ Добавить категорию</button></div>');
  addCatRow.querySelector('button').onclick = () => addCategory(root, cats);
  compCard.appendChild(addCatRow);
  wrap.appendChild(compCard);

  // ── Шаблоны изделий (аккордеон) ──
  wrap.appendChild(accCard(root, 'kits', 'Шаблоны изделий', () => kitsBody(root, kits)));
  // ── Услуги (аккордеон) ──
  wrap.appendChild(accCard(root, 'services', 'Услуги', () => listEditorBody('service_items', ['Монтаж', 'Доставка', 'Демонтаж'], 'Услуги для выбора в КП (в разделе «Услуги»). Один пункт на строку.')));
  // ── Основания услуг (аккордеон) ──
  wrap.appendChild(accCard(root, 'bases', 'Основания услуг', () => listEditorBody('service_bases', ['10% от изделий', 'фикс', 'за шт'], 'Варианты колонки «Основание» при добавлении услуги в КП. Один на строку.')));
}

// Аккордеон-секция верхнего уровня.
function accCard(root, key, title, bodyFn){
  const open = isOpen(key);
  const card = el('<div class="acc"></div>');
  const head = el(`<div class="acc-head"><span class="acc-caret">${open ? '▾' : '▸'}</span><span class="acc-title">${escapeHtml(title)}</span></div>`);
  head.addEventListener('click', () => { openState[key] = !open; rerender(root); });
  card.appendChild(head);
  if (open){ const body = el('<div class="acc-body"></div>'); body.appendChild(bodyFn()); card.appendChild(body); }
  return card;
}

// Категория-аккордеон со своей комплектацией.
function categoryAcc(root, cat, comps, cats){
  const key = 'cat-' + (cat.id || 'orphan');
  const open = isOpen(key);
  const box = el('<div class="acc"></div>');
  const head = el(`<div class="acc-head">
    <span class="acc-caret">${open ? '▾' : '▸'}</span>
    <span class="acc-title">${escapeHtml(cat.name)}</span>
    <span class="muted">${comps.length}</span>
    <span class="cat-spacer"></span>
    ${cat._orphan ? '' : `<button class="cat-iconbtn" data-act="rename" title="Переименовать">✎</button><button class="cat-iconbtn" data-act="del" title="Удалить">🗑</button>`}
  </div>`);
  head.addEventListener('click', e => { if (e.target.closest('[data-act]')) return; openState[key] = !open; rerender(root); });
  if (!cat._orphan){
    const rb = head.querySelector('[data-act="rename"]'); if (rb) rb.onclick = () => renameCategory(root, cat);
    const db = head.querySelector('[data-act="del"]'); if (db) db.onclick = () => delCategory(root, cat, comps.length);
  }
  box.appendChild(head);
  if (open){
    const body = el('<div class="acc-body"></div>');
    if (!comps.length) body.appendChild(el('<div class="cat-empty">Комплектации пока нет.</div>'));
    comps.sort((a, b) => (a.sort || 0) - (b.sort || 0) || String(a.name).localeCompare(String(b.name), 'ru'));
    comps.forEach(comp => {
      const row = el(`<div class="cat-comp-row"><span>${escapeHtml(comp.name)}${comp.code ? ` <span class="muted">· ${escapeHtml(comp.code)}</span>` : ''}</span><span class="muted">${escapeHtml(comp.unit || '')}</span><span class="cat-spacer"></span><button class="cat-iconbtn" data-act="edit" title="Редактировать">✎</button><button class="cat-iconbtn" data-act="del" title="Удалить">🗑</button></div>`);
      row.querySelector('[data-act="edit"]').onclick = () => openComponentForm(cats, comp, null, () => rerender(root));
      row.querySelector('[data-act="del"]').onclick = () => delComponent(root, comp);
      body.appendChild(row);
    });
    if (!cat._orphan){
      const add = el('<button class="btn btn-sm" style="margin-top:10px">+ Комплектация</button>');
      add.onclick = () => openComponentForm(cats, null, cat.id, () => rerender(root));
      body.appendChild(add);
    }
    box.appendChild(body);
  }
  return box;
}

// Тело списка-редактора (Услуги / Основания) — текстовое, один пункт на строку.
function listEditorBody(key, def, hint){
  const wrap = el('<div></div>');
  wrap.appendChild(el(`<div class="muted">${escapeHtml(hint)}</div>`));
  const cur = (state.settings && Array.isArray(state.settings[key]) && state.settings[key].length) ? state.settings[key] : def;
  const ta = el('<textarea class="input" rows="5" style="margin-top:8px"></textarea>');
  ta.value = cur.join('\n');
  wrap.appendChild(ta);
  const bar = el('<div class="cat-add-row"></div>');
  const save = el('<button class="btn btn-red">Сохранить</button>');
  save.onclick = async () => {
    const list = ta.value.split('\n').map(x => x.trim()).filter(Boolean);
    const s = Object.assign({}, state.settings, { [key]: list }); s.id = 'app';
    try { await saveSettings(s); toast('Сохранено'); }
    catch (e){ console.error('[list editor]', e); toast('Ошибка сохранения'); }
  };
  bar.appendChild(save);
  wrap.appendChild(bar);
  return wrap;
}

// Тело «Шаблоны изделий».
function kitsBody(root, kits){
  const wrap = el('<div></div>');
  wrap.appendChild(el('<div class="muted">Готовые наименования изделий для быстрого выбора в конструкторе.</div>'));
  kits.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'));
  if (!kits.length) wrap.appendChild(el('<div class="cat-empty">Шаблонов пока нет.</div>'));
  kits.forEach(k => {
    const row = el(`<div class="cat-comp-row"><span>${escapeHtml(k.name)}</span><span class="cat-spacer"></span><button class="cat-iconbtn" data-act="rename" title="Переименовать">✎</button><button class="cat-iconbtn" data-act="del" title="Удалить">🗑</button></div>`);
    row.querySelector('[data-act="rename"]').onclick = () => renameKit(root, k);
    row.querySelector('[data-act="del"]').onclick = () => delKit(root, k);
    wrap.appendChild(row);
  });
  const add = el(`<div class="cat-add-row"><div class="field cat-grow"><label>Новый шаблон изделия</label><input class="input" id="kit-new" placeholder="Например: Окно ПВХ двухстворчатое"></div><div class="field"><label>&nbsp;</label><button class="btn btn-red" id="kit-add">+ Добавить</button></div></div>`);
  const doAdd = async () => {
    const name = add.querySelector('#kit-new').value.trim();
    if (!name){ toast('Введите наименование'); return; }
    await dbPut('product_kits', { id: uid(), name, component_ids: [], note: '' });
    toast('Шаблон добавлен'); rerender(root);
  };
  add.querySelector('#kit-add').onclick = doAdd;
  add.querySelector('#kit-new').addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
  wrap.appendChild(add);
  return wrap;
}

// ── Категории: добавить / переименовать / удалить (без «Тип» — всё продукция) ──
function addCategory(root, cats){
  const bg = modal(`
    <div class="h2">Новая категория</div>
    <div class="field"><label>Название</label><input class="input" id="nc-name" placeholder="Например: Подоконник"></div>
    <div class="cat-modal-actions"><button class="btn" id="nc-cancel">Отмена</button><button class="btn btn-red" id="nc-ok">Добавить</button></div>`);
  bg.querySelector('#nc-cancel').onclick = () => bg.remove();
  bg.querySelector('#nc-ok').onclick = async () => {
    const name = bg.querySelector('#nc-name').value.trim();
    if (!name){ toast('Введите название'); return; }
    const maxSort = cats.reduce((m, c) => Math.max(m, c.sort || 0), 0);
    await dbPut('categories', { id: uid(), name, default_type: 'product', sort: maxSort + 10 });
    bg.remove(); toast('Категория добавлена'); rerender(root);
  };
}

function renameCategory(root, c){
  const bg = modal(`
    <div class="h2">Переименовать категорию</div>
    <div class="field"><label>Название</label><input class="input" id="cm-name" value="${escapeHtml(c.name)}"></div>
    <div class="cat-modal-actions"><button class="btn" id="cm-cancel">Отмена</button><button class="btn btn-red" id="cm-save">Сохранить</button></div>`);
  bg.querySelector('#cm-cancel').onclick = () => bg.remove();
  bg.querySelector('#cm-save').onclick = async () => {
    const name = bg.querySelector('#cm-name').value.trim();
    if (!name){ toast('Введите название'); return; }
    c.name = name; if (!c.default_type) c.default_type = 'product';
    await dbPut('categories', c);
    bg.remove(); toast('Сохранено'); rerender(root);
  };
}

function delCategory(root, c, used){
  const warn = used ? ` К ней привязано комплектации: ${used}. Она останется без категории.` : '';
  const bg = modal(`<div class="h2">Удалить категорию?</div><p>«${escapeHtml(c.name)}» будет удалена.${escapeHtml(warn)}</p><div class="cat-modal-actions"><button class="btn" id="cd-cancel">Отмена</button><button class="btn btn-red" id="cd-ok">Удалить</button></div>`);
  bg.querySelector('#cd-cancel').onclick = () => bg.remove();
  bg.querySelector('#cd-ok').onclick = async () => { await dbDel('categories', c.id); bg.remove(); toast('Категория удалена'); rerender(root); };
}

// ── Форма создания/правки комплектации (без «Тип»). Экспортируется для конфигуратора.
// onSaved(savedObj) вызывается после сохранения.
export function openComponentForm(cats, comp, presetCatId, onSaved){
  cats = Array.isArray(cats) ? cats : [];
  const isNew = !comp;
  const c = comp || { id: uid(), category_id: presetCatId || (cats[0] ? cats[0].id : ''), name: '', unit: 'шт', code: '' };
  const bg = modal(`
    <div class="h2">${isNew ? 'Новая комплектация' : 'Редактировать комплектацию'}</div>
    <div class="cat-modal-grid">
      <div class="field"><label>Категория</label><select class="select" id="c-cat">${cats.length ? cats.map(x => `<option value="${x.id}"${x.id === c.category_id ? ' selected' : ''}>${escapeHtml(x.name)}</option>`).join('') : '<option value="">— нет категорий —</option>'}<option value="__newcat__">+ новая категория…</option></select></div>
      <div class="field"><label>Наименование</label><input class="input" id="c-name" value="${escapeHtml(c.name)}" placeholder="Например: REHAU Blitz 60 мм"></div>
      <div class="row">
        <div class="field col"><label>Единица</label><select class="select" id="c-unit">${UNITS.map(u => `<option${u === c.unit ? ' selected' : ''}>${u}</option>`).join('')}</select></div>
        <div class="field col"><label>Код (необязательно)</label><input class="input" id="c-code" value="${escapeHtml(c.code || '')}" placeholder="артикул"></div>
      </div>
    </div>
    <div class="cat-modal-actions"><button class="btn" id="c-cancel">Отмена</button><button class="btn btn-red" id="c-save">Сохранить</button></div>`);
  // Создание новой категории прямо из формы комплектации.
  const catSel = bg.querySelector('#c-cat');
  let lastCat = catSel.value;
  catSel.addEventListener('change', async () => {
    if (catSel.value !== '__newcat__') { lastCat = catSel.value; return; }
    const name = (prompt('Название новой категории:') || '').trim();
    if (!name) { catSel.value = lastCat; return; }
    const maxSort = cats.reduce((m, c) => Math.max(m, c.sort || 0), 0);
    const newCat = await dbPut('categories', { id: uid(), name, default_type: 'product', sort: maxSort + 10 });
    cats.push(newCat);
    const opt = document.createElement('option');
    opt.value = newCat.id; opt.textContent = name;
    catSel.insertBefore(opt, catSel.querySelector('option[value="__newcat__"]'));
    catSel.value = newCat.id;
    lastCat = newCat.id;
    toast('Категория добавлена');
  });
  bg.querySelector('#c-cancel').onclick = () => bg.remove();
  bg.querySelector('#c-save').onclick = async () => {
    const name = bg.querySelector('#c-name').value.trim();
    if (!name){ toast('Введите наименование'); return; }
    const obj = {
      id: c.id, category_id: bg.querySelector('#c-cat').value || '', code: bg.querySelector('#c-code').value.trim(),
      name, type: 'product', unit: bg.querySelector('#c-unit').value,
      purchase_price: 0, sketch_img: c.sketch_img || '', note: c.note || '', sort: c.sort || 0
    };
    await dbPut('components', obj);
    bg.remove(); toast(isNew ? 'Комплектация добавлена' : 'Сохранено');
    if (onSaved) onSaved(obj);
  };
  return bg;
}

function delComponent(root, c){
  const bg = modal(`<div class="h2">Удалить комплектацию?</div><p>«${escapeHtml(c.name)}» будет удалена из каталога.</p><div class="cat-modal-actions"><button class="btn" id="x-cancel">Отмена</button><button class="btn btn-red" id="x-ok">Удалить</button></div>`);
  bg.querySelector('#x-cancel').onclick = () => bg.remove();
  bg.querySelector('#x-ok').onclick = async () => { await dbDel('components', c.id); bg.remove(); toast('Комплектация удалена'); rerender(root); };
}

// ── Шаблоны: переименовать / удалить ──
function renameKit(root, k){
  const bg = modal(`<div class="h2">Переименовать шаблон</div><div class="field"><label>Наименование</label><input class="input" id="k-name" value="${escapeHtml(k.name)}"></div><div class="cat-modal-actions"><button class="btn" id="k-cancel">Отмена</button><button class="btn btn-red" id="k-save">Сохранить</button></div>`);
  bg.querySelector('#k-cancel').onclick = () => bg.remove();
  bg.querySelector('#k-save').onclick = async () => {
    const name = bg.querySelector('#k-name').value.trim();
    if (!name){ toast('Введите наименование'); return; }
    k.name = name; await dbPut('product_kits', k);
    bg.remove(); toast('Сохранено'); rerender(root);
  };
}

function delKit(root, k){
  const bg = modal(`<div class="h2">Удалить шаблон?</div><p>«${escapeHtml(k.name)}» будет удалён.</p><div class="cat-modal-actions"><button class="btn" id="kd-cancel">Отмена</button><button class="btn btn-red" id="kd-ok">Удалить</button></div>`);
  bg.querySelector('#kd-cancel').onclick = () => bg.remove();
  bg.querySelector('#kd-ok').onclick = async () => { await dbDel('product_kits', k.id); bg.remove(); toast('Шаблон удалён'); rerender(root); };
}
