// view-configurator.js — модалка сборки изделия для КП «Ростовские окна».
// Экспорт: openConfigurator(onAdd) — открывает модальное окно; по «Добавить в КП»
// формирует item и вызывает onAdd(item), затем закрывает модалку.
import { dbAll, dbPut, uid } from './db.js';
import { modal, money, num, toast, el, watchPasteImage, readFileAsDataURL } from './util.js';
import { state } from './store.js';
import { componentSum, retail } from './calc.js';
import { openComponentForm } from './view-catalog.js';

// Группы компонентов конфигуратора и соответствие категориям (по имени).
// «Прочее» собирает все категории, не попавшие в первые три (и компоненты без категории).
// Корневые группы окна — по одному выбору. Допы (подоконник/отлив/москитка/откосы и пр.)
// добавляются отдельно и в любом количестве (см. блок «Допы»).
const GROUPS = [
  { key: 'profile',  label: 'Профиль',    match: ['профиль'] },
  { key: 'hardware', label: 'Фурнитура',  match: ['фурнитура'] },
  { key: 'filling',  label: 'Заполнение', match: ['заполнение'] },
];

const norm = s => String(s || '').trim().toLowerCase();

// один <style> на модуль с префиксом cfg-
function injectStyles() {
  if (document.getElementById('cfg-styles')) return;
  const css = `
    .cfg-grp{display:flex;align-items:flex-end;gap:8px;margin-bottom:12px}
    .cfg-grp .field{flex:1;margin-bottom:0}
    .cfg-add{flex:0 0 auto}
    .cfg-calc{background:var(--surface);border:1px solid var(--line);border-radius:8px;
      padding:12px 14px;margin:14px 0 6px;font:500 13.5px/1.5 var(--sans);color:var(--ink)}
    .cfg-calc .cfg-flow{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
    .cfg-calc b{font-weight:700}
    .cfg-calc .cfg-total{font-family:var(--head);font-weight:700;font-size:18px;color:var(--red);
      margin-top:8px;padding-top:8px;border-top:1px dashed #ddd9d5;display:flex;
      justify-content:space-between;align-items:baseline}
    .cfg-arrow{color:var(--muted2)}
    .cfg-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
    .cfg-extra{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;margin-top:6px;background:#fff;font-size:13px}
    .cfg-extra span{flex:1}
    .cfg-x{border:none;background:none;color:var(--red);cursor:pointer;font-size:14px;line-height:1}
  `;
  const tag = document.createElement('style');
  tag.id = 'cfg-styles';
  tag.textContent = css;
  document.head.appendChild(tag);
}

// Какой группе принадлежит категория по её имени.
function groupKeyForCategory(catName) {
  const n = norm(catName);
  for (const g of GROUPS) {
    if (g.match && g.match.some(m => n.includes(m))) return g.key;
  }
  return 'other';
}

export function openConfigurator(onAdd, existing) {
  injectStyles();
  const isEdit = !!existing;

  // Локальное состояние данных (перезагружается при ручном добавлении).
  let kits = [];          // product_kits
  let components = [];     // components
  let categories = [];     // categories
  let catById = new Map(); // id -> category

  const defMarkup = (state.settings && state.settings.default_markup != null)
    ? state.settings.default_markup : 30;

  const bg = modal(`
    <div class="h1">${isEdit ? 'Редактирование изделия' : 'Сборка изделия'}</div>
    <div class="muted" style="margin-bottom:16px">Соберите изделие из комплектующих — расчёт обновляется автоматически.</div>

    <div class="field">
      <label>Наименование изделия</label>
      <select class="select" data-cfg="kit"></select>
    </div>

    <div data-cfg="groups"></div>

    <div class="field">
      <label>Допы / прочие комплектующие (подоконник, отлив, москитка, откосы…)</label>
      <select class="select" data-cfg="extra-sel"></select>
      <div class="muted" style="font-size:11px;margin-top:4px">Выберите доп — он добавится сразу. Можно добавить несколько.</div>
      <div data-cfg="extras-list"></div>
    </div>

    <div class="row">
      <div class="col field"><label>Размер (Ш×В)</label>
        <input class="input" data-cfg="size" placeholder="напр. 1300×1400"></div>
      <div class="col field" style="max-width:140px"><label>Количество</label>
        <input class="input" type="number" min="1" step="1" data-cfg="qty" value="1"></div>
    </div>
    <div class="row">
      <div class="col field"><label>Закупочная цена за ед., ₽</label>
        <input class="input" type="number" min="0" step="1" data-cfg="purchase" value="0" placeholder="введите закупку"></div>
      <div class="col field" style="max-width:140px"><label>Наценка, %</label>
        <input class="input" type="number" min="0" step="1" data-cfg="markup" value="${num(defMarkup)}"></div>
    </div>

    <div class="field">
      <label>Эскиз изделия (необязательно — вставьте скриншот Ctrl+V)</label>
      <div data-cfg="skzone" tabindex="0" style="border:2px dashed #d8c6c4;border-radius:8px;min-height:80px;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--muted2);padding:10px;background:#fcfbfa;cursor:pointer;font-size:12.5px">Кликните сюда и нажмите Ctrl+V (скриншот), либо перетащите картинку</div>
      <input type="file" accept="image/*" data-cfg="skfile" style="margin-top:6px">
    </div>

    <div class="cfg-calc" data-cfg="calc"></div>

    <div class="cfg-foot">
      <button class="btn" data-cfg="cancel">Отмена</button>
      <button class="btn btn-red" data-cfg="add">${isEdit ? 'Сохранить' : 'Добавить в КП'}</button>
    </div>
  `);

  const q = sel => bg.querySelector(`[data-cfg="${sel}"]`);
  const kitSel = q('kit');
  const groupsBox = q('groups');
  const sizeInp = q('size');
  const qtyInp = q('qty');
  const purchaseInp = q('purchase');
  const markupInp = q('markup');
  const calcBox = q('calc');

  // --- эскиз изделия: вставка Ctrl+V / файл / drag-drop ---
  let sketchImg = '';
  const skZone = q('skzone');
  const SK_HINT = 'Кликните сюда и нажмите Ctrl+V (скриншот), либо перетащите картинку';
  function showSketch(){
    skZone.innerHTML = sketchImg
      ? `<img src="${sketchImg}" alt="эскиз" style="max-width:100%;max-height:120px;display:block">`
      : SK_HINT;
  }
  const stopPaste = watchPasteImage(d => { sketchImg = d; showSketch(); toast('Эскиз вставлен'); });
  skZone.addEventListener('click', () => skZone.focus());
  skZone.addEventListener('dragover', e => e.preventDefault());
  skZone.addEventListener('drop', e => {
    e.preventDefault();
    const f = [...(e.dataTransfer.files || [])].find(x => x.type.indexOf('image') === 0);
    if (f) readFileAsDataURL(f).then(d => { sketchImg = d; showSketch(); });
  });
  q('skfile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) readFileAsDataURL(f).then(d => { sketchImg = d; showSketch(); });
  });
  // снять слушатель вставки при закрытии модалки (любым способом)
  const moCfg = new MutationObserver(() => { if (!document.body.contains(bg)) { stopPaste(); moCfg.disconnect(); } });
  moCfg.observe(document.body, { childList: true });

  // --- допы (прочие комплектующие): можно добавить сколько угодно ---
  let extras = []; // [{id, name}]
  const extraSel = q('extra-sel');
  const extrasList = q('extras-list');

  function otherComponents() {
    return components.filter(c => groupKeyForCategory((catById.get(c.category_id) || {}).name) === 'other');
  }
  function fillExtraSelect() {
    extraSel.innerHTML =
      '<option value="">— выберите доп —</option>' +
      otherComponents().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('') +
      '<option value="__new__">+ создать новую комплектацию…</option>';
  }
  function renderExtras() {
    extrasList.innerHTML = '';
    extras.forEach((e, i) => {
      const row = el(`<div class="cfg-extra"><span>${esc(e.name)}</span><button class="cfg-x" title="Убрать">✕</button></div>`);
      row.querySelector('.cfg-x').addEventListener('click', () => { extras.splice(i, 1); renderExtras(); recalc(); });
      extrasList.appendChild(row);
    });
  }
  function addExtra() {
    const v = extraSel.value;
    if (!v) return;
    if (v === '__new__') {
      extraSel.value = '';
      // открыть форму создания комплектации в каталоге; после сохранения — добавить в допы
      const cat = categories.find(c => groupKeyForCategory(c.name) === 'other');
      openComponentForm(categories, null, cat ? cat.id : '', async (saved) => {
        components = await dbAll('components');
        catById = new Map(categories.map(c => [c.id, c]));
        fillExtraSelect();
        extras.push({ id: saved.id, name: saved.name });
        renderExtras();
        recalc();
      });
      return;
    }
    const c = components.find(x => x.id === v);
    if (c && !extras.some(e => e.id === c.id)) extras.push({ id: c.id, name: c.name });
    extraSel.value = '';
    renderExtras();
    recalc();
  }
  extraSel.addEventListener('change', addExtra);

  // --- наполнение выпадающего списка наименований ---
  function fillKits() {
    kitSel.innerHTML =
      '<option value="">— выберите изделие —</option>' +
      kits.map(k => `<option value="${k.id}">${esc(k.name)}</option>`).join('') +
      '<option value="__new__">+ создать новое изделие…</option>';
  }

  // --- наполнение одного select группы ---
  function fillGroupSelect(sel, groupKey) {
    const list = components.filter(c => {
      const cat = catById.get(c.category_id);
      return groupKeyForCategory(cat && cat.name) === groupKey;
    });
    const cur = sel.value;
    sel.innerHTML =
      '<option value="">— не выбрано —</option>' +
      list.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('') +
      '<option value="__new__">+ создать новую комплектацию…</option>';
    // сохранить выбор, если он ещё доступен
    if (cur && cur !== '__new__' && sel.querySelector(`option[value="${cssEsc(cur)}"]`)) sel.value = cur;
  }

  // --- построить блоки групп ---
  function buildGroups() {
    groupsBox.innerHTML = '';
    GROUPS.forEach(g => {
      const wrap = el(`
        <div class="cfg-grp">
          <div class="field">
            <label>${esc(g.label)}</label>
            <select class="select" data-grp="${g.key}"></select>
          </div>
        </div>
      `);
      groupsBox.appendChild(wrap);
      const sel = wrap.querySelector('select');
      fillGroupSelect(sel, g.key);
      sel.addEventListener('change', () => {
        if (sel.value === '__new__') { sel.value = ''; addComponent(g, sel); return; }
        recalc();
      });
    });
  }

  // --- собрать выбранные компоненты ---
  function selectedComponents() {
    const out = [];
    groupsBox.querySelectorAll('select[data-grp]').forEach(sel => {
      if (!sel.value) return;
      const c = components.find(x => x.id === sel.value);
      if (c) out.push({ name: c.name, purchase_price: 0 });
    });
    extras.forEach(e => out.push({ name: e.name, purchase_price: 0 }));
    return out;
  }

  // --- живой пересчёт ---
  function recalc() {
    const comps = selectedComponents();
    const purchase = Number(purchaseInp.value) || 0; // закупка вводится в КП (не из каталога)
    const markup = Number(markupInp.value) || 0;
    const unitPrice = retail(purchase, markup);     // розница за ед.
    const qty = Math.max(0, Math.floor(Number(qtyInp.value) || 0));
    const amount = unitPrice * qty;

    calcBox.innerHTML = `
      <div class="cfg-flow">
        <span>Закупка за ед. <b>${money(purchase)}</b></span>
        <span class="cfg-arrow">→</span>
        <span>наценка <b>${num(markup)}%</b></span>
        <span class="cfg-arrow">→</span>
        <span>Розница за ед. <b>${money(unitPrice)}</b></span>
      </div>
      <div class="cfg-total"><span>Сумма (${num(qty)} шт)</span><span>${money(amount)}</span></div>
    `;
    return { comps, purchase, markup, unitPrice, qty, amount };
  }

  // --- описание из выбранных компонентов ---
  function buildDescr(comps) {
    return comps.map(c => c.name).join(', ');
  }

  // --- предзаполнение формы при редактировании ---
  function prefill(ex) {
    if (!ex) return;
    // Наименование: совпадение с шаблоном, иначе временная опция с тем же названием.
    const kit = kits.find(k => k.name === ex.name);
    if (kit) {
      kitSel.value = kit.id;
    } else if (ex.name) {
      const opt = document.createElement('option');
      opt.value = '__keep__'; opt.textContent = ex.name; opt.selected = true;
      kitSel.insertBefore(opt, kitSel.firstChild ? kitSel.firstChild.nextSibling : null);
      kitSel.value = '__keep__';
    }
    // Компоненты: корневые — в группы (по имени), остальные — в допы.
    const itemComps = Array.isArray(ex.components) ? ex.components : [];
    const placed = new Set();
    groupsBox.querySelectorAll('select[data-grp]').forEach(sel => {
      const groupKey = sel.dataset.grp;
      for (const ic of itemComps) {
        if (placed.has(ic.name)) continue;
        const cc = components.find(c => c.name === ic.name);
        if (cc && groupKeyForCategory((catById.get(cc.category_id) || {}).name) === groupKey) {
          sel.value = cc.id; placed.add(ic.name); break;
        }
      }
    });
    extras = [];
    itemComps.forEach(ic => {
      if (placed.has(ic.name)) return;
      const cc = components.find(c => c.name === ic.name);
      extras.push({ id: cc ? cc.id : '', name: ic.name });
    });
    renderExtras();
    sizeInp.value = ex.size_wh || '';
    qtyInp.value = ex.qty != null ? ex.qty : 1;
    purchaseInp.value = ex.purchase_sum != null ? ex.purchase_sum : 0;
    markupInp.value = ex.markup_pct != null ? ex.markup_pct : defMarkup;
    sketchImg = ex.sketch_img || '';
    showSketch();
    recalc();
  }

  // --- создание наименования изделия (product_kits) через форму каталога ---
  function addKit() {
    openKitForm(async (saved) => {
      kits = await dbAll('product_kits');
      fillKits();
      kitSel.value = saved.id;
      recalc();
    });
  }

  // --- создание комплектации в группе (через форму каталога) ---
  function addComponent(group, sel) {
    const cat = categories.find(c => groupKeyForCategory(c.name) === group.key);
    openComponentForm(categories, null, cat ? cat.id : '', async (saved) => {
      components = await dbAll('components');
      catById = new Map(categories.map(c => [c.id, c]));
      fillGroupSelect(sel, group.key);
      sel.value = saved.id;
      recalc();
    });
  }

  // --- обработчики ---
  kitSel.addEventListener('change', () => {
    if (kitSel.value === '__new__') { kitSel.value = ''; addKit(); }
  });
  [qtyInp, purchaseInp, markupInp].forEach(inp => inp.addEventListener('input', recalc));
  sizeInp.addEventListener('input', () => {}); // размер в расчёте не участвует

  q('cancel').addEventListener('click', () => bg.remove());

  q('add').addEventListener('click', () => {
    const r = recalc();
    const opt = kitSel.options[kitSel.selectedIndex];
    const finalName = (kitSel.value && kitSel.value !== '__new__' && opt && opt.text)
      ? opt.text
      : ((existing && existing.name) || 'Изделие');

    if ((!kitSel.value || kitSel.value === '__new__') && !(existing && existing.name)) {
      toast('Выберите наименование изделия');
      kitSel.focus();
      return;
    }
    if (r.qty < 1) {
      toast('Укажите количество');
      qtyInp.focus();
      return;
    }

    // Компоненты: выбранные; при редактировании без изменений — сохраняем прежние.
    let comps = r.comps;
    let descr = buildDescr(comps);
    if (comps.length === 0 && existing && Array.isArray(existing.components) && existing.components.length) {
      comps = existing.components;
      descr = existing.descr || buildDescr(comps);
    }

    const item = {
      id: uid(),
      section: 'product',
      name: finalName,
      descr,
      components: comps,
      size_wh: (sizeInp.value || '').trim(),
      qty: r.qty,
      unit: 'шт',
      markup_pct: r.markup,
      purchase_sum: r.purchase,
      price: r.unitPrice,                  // розница за ед.
      amount: r.amount,
      sketch_img: sketchImg,
    };

    onAdd(item);
    bg.remove();
  });

  // --- загрузка данных и первичная отрисовка ---
  (async () => {
    [kits, components, categories] = await Promise.all([
      dbAll('product_kits'),
      dbAll('components'),
      dbAll('categories'),
    ]);
    catById = new Map(categories.map(c => [c.id, c]));
    fillKits();
    buildGroups();
    fillExtraSelect();
    prefill(existing);
    recalc();
  })();

  return bg;
}

// Форма создания изделия (product_kit) — единый стиль с формой комплектации.
// onSaved(savedObj) вызывается после сохранения в каталог.
function openKitForm(onSaved) {
  const m = modal(`
    <div class="h2">Новое изделие</div>
    <div class="field"><label>Наименование изделия</label><input class="input" id="kf-name" placeholder="Например: Окно ПВХ двухстворчатое"></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px"><button class="btn" id="kf-cancel">Отмена</button><button class="btn btn-red" id="kf-save">Сохранить</button></div>
  `);
  const nameInp = m.querySelector('#kf-name');
  nameInp.focus();
  m.querySelector('#kf-cancel').onclick = () => m.remove();
  const save = async () => {
    const name = nameInp.value.trim();
    if (!name) { toast('Введите наименование'); return; }
    const obj = { id: uid(), name, component_ids: [], note: '' };
    await dbPut('product_kits', obj);
    m.remove();
    toast('Изделие добавлено в каталог');
    if (onSaved) onSaved(obj);
  };
  m.querySelector('#kf-save').onclick = save;
  nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
}

// безопасная вставка в HTML-атрибуты/текст опций
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// экранирование для использования id в CSS-селекторе querySelector
function cssEsc(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}
