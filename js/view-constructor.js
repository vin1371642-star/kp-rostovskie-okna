// view-constructor.js — конструктор КП «Ростовские окна».
// Контракт: см. CONTRACT.md. Только этот файл редактируется данным агентом.
// Экспорт: renderConstructor(root, params).
import { state, setRoute, saveSettings } from './store.js';
import { dbAll } from './db.js';
import { money, money2, num, escapeHtml, toast, el, modal, watchPasteImage, readFileAsDataURL } from './util.js';
import { loadKp, saveKp, newKp } from './storage-kp.js';
import { openConfigurator } from './view-configurator.js';
import { computeKpTotals, componentSum, retail } from './calc.js';
import { openPreview, printKp } from './print.js';

// Локальные стили модуля (префикс .ctr-) — поверх классов theme.css.
const STYLE_ID = 'ctr-style';
function ensureStyle(){
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .ctr-sec{margin-bottom:16px}
  .ctr-sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px}
  .ctr-sub{display:flex;justify-content:flex-end;gap:14px;padding:8px 8px 2px;font-size:12.5px;color:var(--muted2)}
  .ctr-sub b{color:var(--ink);font-family:var(--head);font-size:14px}
  .ctr-num{max-width:96px;text-align:right}
  .ctr-cell-input{border:1px solid transparent;background:none;padding:6px 6px;border-radius:5px;font:400 12.5px/1.4 var(--sans);width:100%}
  .ctr-cell-input:hover{border-color:#e6e4e0;background:#fff}
  .ctr-cell-input:focus{outline:none;border-color:var(--red);background:#fff;box-shadow:0 0 0 3px rgba(181,9,0,.12)}
  .ctr-empty-row td{color:var(--muted);font-style:italic;background:#fcfbfa}
  .ctr-iconbtn{border:none;background:none;cursor:pointer;color:var(--muted2);padding:4px 6px;border-radius:5px;font-size:13px;line-height:1}
  .ctr-iconbtn:hover{background:var(--surface);color:var(--ink)}
  .ctr-iconbtn.del:hover{color:var(--red)}
  .ctr-tot-grid{display:flex;flex-direction:column;gap:6px;align-items:flex-end;font-size:13px}
  .ctr-tot-grid .row-t{display:flex;gap:24px;justify-content:space-between;min-width:280px}
  .ctr-tot-grid .row-t b{font-family:var(--head)}
  .ctr-seg{display:inline-flex;border:1px solid #d8d6d2;border-radius:6px;overflow:hidden}
  .ctr-seg button{border:none;background:#fff;color:var(--ink);font:500 12.5px/1 var(--sans);padding:8px 12px;cursor:pointer}
  .ctr-seg button.on{background:var(--ink);color:#fff}
  .ctr-discount{max-width:160px}
  @media print{ .ctr-noprint{display:none} }
  `;
  document.head.appendChild(s);
}

const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const UNITS = ['шт', 'м²', 'м.п.', 'компл', 'усл.'];
const DEFAULT_BASES = ['10% от изделий', 'фикс', 'за шт'];
// Список «оснований» услуг — редактируется в Каталоге, хранится в настройках.
function baseList(){
  const b = state.settings && state.settings.service_bases;
  return (Array.isArray(b) && b.length) ? b : DEFAULT_BASES;
}
// Список услуг — редактируется в Каталоге, хранится в настройках.
function serviceList(){
  const x = state.settings && state.settings.service_items;
  return (Array.isArray(x) && x.length) ? x : ['Монтаж', 'Доставка', 'Демонтаж'];
}
// Выпадающий список наименования услуги (выбор из списка + добавить новую).
function makeServiceNameSelect(ctx, it){
  const list = serviceList();
  const extra = (it.name && !list.includes(it.name))
    ? `<option value="${escapeHtml(it.name)}" selected>${escapeHtml(it.name)}</option>` : '';
  const sel = el(`<select class="ctr-cell-input">
    <option value="">— выберите услугу —</option>
    ${list.map(name => `<option value="${escapeHtml(name)}"${it.name === name ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}
    ${extra}
    <option value="__new__">+ добавить новую…</option>
  </select>`);
  sel.addEventListener('change', async () => {
    if (sel.value === '__new__'){
      const name = (prompt('Название новой услуги:') || '').trim();
      if (name){
        const cur = serviceList();
        if (!cur.includes(name)){
          const s = Object.assign({}, state.settings, { service_items: [...cur, name] });
          s.id = 'app';
          try { await saveSettings(s); } catch (e){ console.error('[service add]', e); }
        }
        it.name = name;
      }
      paint(ctx);
      return;
    }
    it.name = sel.value;
    persist(ctx, true);
  });
  return sel;
}

export function renderConstructor(root, params){
  ensureStyle();
  const epoch = root.__epoch;
  root.innerHTML = '<div class="card"><div class="h2">Конструктор КП</div><p class="muted">Загрузка…</p></div>';
  bootstrap(root, params, epoch).catch(err => {
    console.error('[constructor]', err);
    root.innerHTML = '<div class="card"><div class="h2">Конструктор КП</div>'
      + '<p class="muted">Не удалось загрузить КП.</p>'
      + '<pre style="font-size:11px;color:#b50900;white-space:pre-wrap">'
      + escapeHtml(err && err.message || String(err)) + '</pre></div>';
  });
}

async function bootstrap(root, params, epoch){
  const id = (params && params.id) || (state.params && state.params.id);
  let kp = null, items = [];
  if (id){
    const loaded = await loadKp(id);
    kp = loaded.kp;
    items = loaded.items || [];
  }
  if (!kp){
    kp = await newKp();
    items = [];
  }
  const orgs = await dbAll('organizations');

  // Замыкание состояния редактора.
  const ctx = { root, kp, items, orgs, epoch };
  // Автосохранение при переходе на другую страницу (вызывается из setRoute).
  state._onLeave = () => {
    try { const a = document.activeElement; if (a && a.blur) a.blur(); } catch (e) {}
    return persist(ctx, true);
  };
  paint(ctx);
}

// Полная перерисовка с текущим состоянием.
function paint(ctx){
  if (ctx.epoch != null && ctx.root.__epoch !== ctx.epoch) return; // навигация ушла дальше — не рисуем
  const { root } = ctx;
  root.innerHTML = '';
  root.appendChild(buildHeaderCard(ctx));
  root.appendChild(buildSection(ctx, 'product'));
  root.appendChild(buildSection(ctx, 'service'));
  root.appendChild(buildTermsCard(ctx));
  root.appendChild(buildTotals(ctx));
  root.appendChild(buildActions(ctx));
}

// Сохранить и сообщить.
async function persist(ctx, silent){
  try {
    await saveKp(ctx.kp, ctx.items);
    if (!silent) toast('Сохранено');
  } catch (e){
    console.error('[constructor save]', e);
    toast('Ошибка сохранения');
  }
}

/* ───────────────────────── Шапка-форма ───────────────────────── */

function buildHeaderCard(ctx){
  const { kp, orgs } = ctx;
  const card = el('<div class="card ctr-noprint"></div>');

  const orgOptions = orgs.length
    ? orgs.map(o => `<option value="${escapeHtml(o.id)}"${o.id === kp.org_id ? ' selected' : ''}>${escapeHtml(o.name || 'Без названия')}${o.vat_rate != null ? ' · НДС ' + n(o.vat_rate) + '%' : ''}</option>`).join('')
    : '<option value="">Нет организаций — добавьте в разделе «Организации»</option>';

  const buyerType = kp.buyer_type === 'org' ? 'org' : 'person';
  const buyer = kp.buyer || (kp.buyer = {});
  const mgr = kp.manager || (kp.manager = { name: '', phone: '', position: '' });
  const vatShow = kp.vat_show !== false;

  card.innerHTML = `
    <div class="h2">Конструктор КП</div>

    <div class="row">
      <div class="col field">
        <label>Продавец (организация)</label>
        <select class="select" data-f="org_id">${orgOptions}</select>
      </div>
      <div class="col field">
        <label>Тип покупателя</label>
        <select class="select" data-f="buyer_type">
          <option value="person"${buyerType === 'person' ? ' selected' : ''}>Физлицо</option>
          <option value="org"${buyerType === 'org' ? ' selected' : ''}>Организация</option>
        </select>
      </div>
    </div>

    <div data-buyer-fields></div>

    <div class="row">
      <div class="col field">
        <label>№ обращения</label>
        <input class="input" data-f="client_request_no" value="${escapeHtml(kp.client_request_no || '')}" placeholder="напр. 2026-001">
      </div>
      <div class="col field">
        <label>Дата</label>
        <input class="input" type="date" data-f="date" value="${escapeHtml(kp.date || '')}">
      </div>
      <div class="col field">
        <label>Действительно до</label>
        <input class="input" type="date" data-f="valid_until" value="${escapeHtml(kp.valid_until || '')}">
      </div>
    </div>

    <div class="field">
      <label>Адрес объекта</label>
      <input class="input" data-f="object_address" value="${escapeHtml(kp.object_address || '')}" placeholder="Город, улица, дом">
    </div>

    <div class="row">
      <div class="col field">
        <label>Менеджер — имя</label>
        <input class="input" data-mgr="name" value="${escapeHtml(mgr.name || '')}">
      </div>
      <div class="col field">
        <label>Менеджер — телефон</label>
        <input class="input" data-mgr="phone" value="${escapeHtml(mgr.phone || '')}">
      </div>
      <div class="col field">
        <label>Менеджер — должность</label>
        <input class="input" data-mgr="position" value="${escapeHtml(mgr.position || '')}">
      </div>
    </div>

    <div class="row" style="align-items:flex-end">
      <div class="col field">
        <label>Вариант документа</label>
        <select class="select" data-f="doc_variant">
          <option value="premium"${kp.doc_variant === 'premium' ? ' selected' : ''}>Премиум</option>
          <option value="kp"${kp.doc_variant === 'kp' ? ' selected' : ''}>КП</option>
          <option value="oferta"${kp.doc_variant === 'oferta' ? ' selected' : ''}>Оферта</option>
        </select>
      </div>
      <div class="col field">
        <label>НДС в документе</label>
        <div class="ctr-seg" data-vat-seg>
          <button type="button" data-vat="show"${vatShow ? ' class="on"' : ''}>Показывать</button>
          <button type="button" data-vat="hide"${vatShow ? '' : ' class="on"'}>Скрыть</button>
        </div>
      </div>
      <div class="col field">
        <label>Эскизы изделий</label>
        <div class="ctr-seg" data-sketch-seg>
          <button type="button" data-sk="on"${kp.show_sketches ? ' class="on"' : ''}>Вкл</button>
          <button type="button" data-sk="off"${kp.show_sketches ? '' : ' class="on"'}>Выкл</button>
        </div>
      </div>
    </div>
  `;

  renderBuyerFields(ctx, card.querySelector('[data-buyer-fields]'));

  // Простые текстовые/select поля kp.*
  card.querySelectorAll('[data-f]').forEach(inp => {
    inp.addEventListener('input', () => {
      const f = inp.dataset.f;
      if (f === 'org_id' || f === 'buyer_type') return; // селекты — через change
      kp[f] = inp.value;
    });
    inp.addEventListener('change', () => {
      const f = inp.dataset.f;
      if (f === 'org_id'){
        kp.org_id = inp.value;
        const org = ctx.orgs.find(o => o.id === inp.value);
        if (org && org.vat_rate != null) kp.vat_rate = n(org.vat_rate);
        paint(ctx); // НДС-ставка и итоги меняются
        persist(ctx, true);
        return;
      }
      if (f === 'buyer_type'){
        kp.buyer_type = inp.value === 'org' ? 'org' : 'person';
        renderBuyerFields(ctx, card.querySelector('[data-buyer-fields]'));
        persist(ctx, true);
        return;
      }
      kp[f] = inp.value;
      persist(ctx, true);
    });
  });

  // Поля менеджера.
  card.querySelectorAll('[data-mgr]').forEach(inp => {
    inp.addEventListener('input', () => { mgr[inp.dataset.mgr] = inp.value; kp.manager = mgr; });
    inp.addEventListener('change', () => {
      mgr[inp.dataset.mgr] = inp.value;
      kp.manager = mgr;
      persist(ctx, true);
    });
  });

  // Сегмент «НДС в документе»: показывать / скрыть полностью.
  card.querySelectorAll('[data-vat-seg] button').forEach(b => {
    b.addEventListener('click', () => {
      kp.vat_show = b.dataset.vat === 'show';
      paint(ctx); // итоги пересчитываются (НДС появляется/исчезает)
      persist(ctx, true);
    });
  });

  // Сегмент эскизов.
  card.querySelectorAll('[data-sketch-seg] button').forEach(b => {
    b.addEventListener('click', () => {
      kp.show_sketches = b.dataset.sk === 'on';
      card.querySelectorAll('[data-sketch-seg] button').forEach(x => x.classList.toggle('on', x.dataset.sk === b.dataset.sk));
      persist(ctx, true);
    });
  });

  return card;
}

function renderBuyerFields(ctx, host){
  const { kp } = ctx;
  const buyer = kp.buyer || (kp.buyer = {});
  if (kp.buyer_type === 'org'){
    host.innerHTML = `
      <div class="field">
        <label>Наименование организации-покупателя</label>
        <input class="input" data-buyer="name" value="${escapeHtml(buyer.name || '')}">
      </div>
      <div class="row">
        <div class="col field">
          <label>ИНН</label>
          <input class="input" data-buyer="inn" value="${escapeHtml(buyer.inn || '')}">
        </div>
        <div class="col field">
          <label>КПП</label>
          <input class="input" data-buyer="kpp" value="${escapeHtml(buyer.kpp || '')}">
        </div>
      </div>
      <div class="field">
        <label>Адрес</label>
        <input class="input" data-buyer="address" value="${escapeHtml(buyer.address || '')}">
      </div>`;
  } else {
    host.innerHTML = `
      <div class="row">
        <div class="col field">
          <label>Имя покупателя</label>
          <input class="input" data-buyer="name" value="${escapeHtml(buyer.name || '')}">
        </div>
        <div class="col field">
          <label>Телефон</label>
          <input class="input" data-buyer="phone" value="${escapeHtml(buyer.phone || '')}">
        </div>
      </div>`;
  }
  host.querySelectorAll('[data-buyer]').forEach(inp => {
    inp.addEventListener('input', () => { buyer[inp.dataset.buyer] = inp.value; kp.buyer = buyer; });
    inp.addEventListener('change', () => {
      buyer[inp.dataset.buyer] = inp.value;
      kp.buyer = buyer;
      persist(ctx, true);
    });
  });
}

/* ───────────────────────── Разделы позиций ───────────────────────── */

function sectionItems(ctx, section){
  return ctx.items.filter(it => it.section === section);
}

function buildSection(ctx, section){
  const isProduct = section === 'product';
  const wrap = el(`<div class="card ctr-sec"></div>`);
  const title = isProduct ? 'Продукция' : 'Услуги';
  const addLabel = isProduct ? '+ Добавить изделие' : '+ Добавить услугу';

  const head = el(`
    <div class="ctr-sec-head">
      <div class="h2" style="margin:0">${title}</div>
      <button class="btn btn-ghost btn-sm ctr-noprint" type="button">${addLabel}</button>
    </div>`);
  head.querySelector('button').addEventListener('click', () => {
    isProduct ? addProduct(ctx) : addService(ctx);
  });
  wrap.appendChild(head);

  const table = el(`
    <table class="table">
      <thead>
        <tr>
          <th style="width:34%">Наименование</th>
          ${isProduct
            ? '<th style="width:14%">Размер</th>'
            : '<th style="width:14%">Основание</th>'}
          <th style="width:8%" class="right">Кол-во</th>
          <th style="width:9%">Ед.</th>
          <th style="width:13%" class="right">Цена</th>
          <th style="width:14%" class="right">Сумма</th>
          <th style="width:8%" class="right ctr-noprint">—</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>`);
  const tbody = table.querySelector('tbody');
  const rows = sectionItems(ctx, section);

  if (!rows.length){
    tbody.appendChild(el(`<tr class="ctr-empty-row"><td colspan="7">${isProduct ? 'Пока нет изделий. Нажмите «Добавить изделие».' : 'Пока нет услуг. Нажмите «Добавить услугу».'}</td></tr>`));
  } else {
    rows.forEach(it => tbody.appendChild(buildRow(ctx, it, isProduct)));
  }
  wrap.appendChild(table);

  const subtotal = rows.reduce((s, it) => s + n(it.amount), 0);
  wrap.appendChild(el(`<div class="ctr-sub">Подытог «${title}»: <b>${money(subtotal)}</b></div>`));

  return wrap;
}

function buildRow(ctx, it, isProduct){
  const tr = el('<tr></tr>');

  // Наименование.
  const tdName = el('<td></td>');
  if (isProduct){
    tdName.appendChild(makeCellInput(it.name || '', v => { it.name = v; recalcRow(it); }, ctx, 'text', 'Наименование изделия'));
  } else {
    tdName.appendChild(makeServiceNameSelect(ctx, it));
  }
  if (it.descr){
    const d = document.createElement('div');
    d.className = 'muted'; d.style.fontSize = '11px'; d.style.padding = '0 6px';
    d.textContent = it.descr;
    tdName.appendChild(d);
  }
  tr.appendChild(tdName);

  // Размер (продукт) или Основание (услуга).
  const tdSecond = el('<td></td>');
  if (isProduct){
    tdSecond.appendChild(makeCellInput(it.size_wh || '', v => { it.size_wh = v; }, ctx, 'text', 'напр. 1300×1400'));
  } else {
    const sel = el(`<select class="ctr-cell-input">
      <option value="">—</option>
      ${baseList().map(b => `<option value="${escapeHtml(b)}"${it.basis === b ? ' selected' : ''}>${escapeHtml(b)}</option>`).join('')}
    </select>`);
    sel.addEventListener('change', () => { it.basis = sel.value; persist(ctx, true); });
    tdSecond.appendChild(sel);
  }
  tr.appendChild(tdSecond);

  // Кол-во.
  const tdQty = el('<td class="right"></td>');
  tdQty.appendChild(makeCellInput(it.qty != null ? it.qty : 1, v => { it.qty = n(v); recalcRow(it); rerenderTotalsAndSub(ctx); }, ctx, 'number', '', 'ctr-num'));
  tr.appendChild(tdQty);

  // Ед.
  const tdUnit = el('<td></td>');
  const unitSel = el(`<select class="ctr-cell-input">
    ${UNITS.map(u => `<option value="${escapeHtml(u)}"${it.unit === u ? ' selected' : ''}>${escapeHtml(u)}</option>`).join('')}
  </select>`);
  if (!it.unit) it.unit = isProduct ? 'шт' : 'усл.';
  unitSel.value = it.unit;
  unitSel.addEventListener('change', () => { it.unit = unitSel.value; persist(ctx, true); });
  tdUnit.appendChild(unitSel);
  tr.appendChild(tdUnit);

  // Цена.
  const tdPrice = el('<td class="right"></td>');
  tdPrice.appendChild(makeCellInput(n(it.price), v => {
    it.price = n(v);
    // Для изделия держим наценку согласованной с введённой ценой (розница = закупка×наценка),
    // чтобы при повторном открытии конфигуратора значения не расходились.
    if (isProduct && n(it.purchase_sum) > 0) it.markup_pct = Math.round((it.price / n(it.purchase_sum) - 1) * 100);
    recalcRow(it); rerenderTotalsAndSub(ctx);
  }, ctx, 'number', '', 'ctr-num'));
  tr.appendChild(tdPrice);

  // Сумма (read-only, amount = qty*price).
  const tdAmount = el(`<td class="right" data-amount><b>${money(n(it.amount))}</b></td>`);
  tr.appendChild(tdAmount);

  // Действия.
  const tdAct = el('<td class="right ctr-noprint"></td>');
  // Перемещение строки внутри раздела.
  const up = el('<button class="ctr-iconbtn" title="Выше">↑</button>');
  up.addEventListener('click', () => moveItem(ctx, it, -1));
  tdAct.appendChild(up);
  const down = el('<button class="ctr-iconbtn" title="Ниже">↓</button>');
  down.addEventListener('click', () => moveItem(ctx, it, +1));
  tdAct.appendChild(down);
  if (isProduct){
    const sk = el('<button class="ctr-iconbtn" title="Эскиз — вставить Ctrl+V">🖼</button>');
    if (it.sketch_img) sk.style.color = 'var(--red)';
    sk.addEventListener('click', () => openSketchModal(ctx, it));
    tdAct.appendChild(sk);
    const edit = el('<button class="ctr-iconbtn" title="Редактировать">✎</button>');
    edit.addEventListener('click', () => editProduct(ctx, it));
    tdAct.appendChild(edit);
  }
  const del = el('<button class="ctr-iconbtn del" title="Удалить">✕</button>');
  del.addEventListener('click', () => removeItem(ctx, it));
  tdAct.appendChild(del);
  tr.appendChild(tdAct);

  // Локальный пересчёт суммы в DOM при изменении qty/price без полной перерисовки.
  tr._refreshAmount = () => { tdAmount.innerHTML = '<b>' + money(n(it.amount)) + '</b>'; };
  it._tr = tr;

  return tr;
}

// Поле-ячейка с ленивым сохранением (change → персист).
function makeCellInput(value, onChange, ctx, type, placeholder, extraClass){
  const inp = document.createElement('input');
  inp.className = 'ctr-cell-input' + (extraClass ? ' ' + extraClass : '');
  inp.type = type === 'number' ? 'number' : 'text';
  if (type === 'number'){ inp.min = '0'; inp.step = '1'; }
  inp.value = value;
  if (placeholder) inp.placeholder = placeholder;
  // «Вживую» обновляем модель (для автосохранения), персист — по завершении ввода.
  inp.addEventListener('input', () => { onChange(inp.value); });
  inp.addEventListener('change', () => { onChange(inp.value); persist(ctx, true); });
  return inp;
}

// Пересчёт суммы строки.
function recalcRow(it){
  it.amount = Math.round(n(it.qty) * n(it.price));
  if (it._tr && it._tr._refreshAmount) it._tr._refreshAmount();
}

// Обновить подытоги разделов и итоговую панель без сброса фокуса в шапке.
function rerenderTotalsAndSub(ctx){
  // Подытоги — простая замена текста в обоих разделах.
  const cards = ctx.root.querySelectorAll('.ctr-sec');
  const prodSub = sectionItems(ctx, 'product').reduce((s, it) => s + n(it.amount), 0);
  const servSub = sectionItems(ctx, 'service').reduce((s, it) => s + n(it.amount), 0);
  const subs = ctx.root.querySelectorAll('.ctr-sub b');
  if (subs[0]) subs[0].textContent = money(prodSub);
  if (subs[1]) subs[1].textContent = money(servSub);
  refreshTotals(ctx);
}

/* ───────────────────────── Добавление/правка позиций ───────────────────────── */

function addProduct(ctx){
  try {
    openConfigurator(item => pushProductItem(ctx, item));
  } catch (e){
    console.error('[configurator]', e);
    toast('Конфигуратор недоступен');
  }
}

function pushProductItem(ctx, item){
  const src = item || {};
  const qty = src.qty != null ? n(src.qty) : 1;
  const price = n(src.price != null ? src.price : retail(componentSum(src.components), src.markup_pct));
  const it = {
    section: 'product',
    name: src.name || 'Изделие',
    descr: src.descr || '',
    components: Array.isArray(src.components) ? src.components : [],
    size_wh: src.size_wh || '',
    qty,
    unit: src.unit || 'шт',
    basis: '',
    markup_pct: src.markup_pct != null ? n(src.markup_pct) : null,
    purchase_sum: src.purchase_sum != null ? n(src.purchase_sum) : componentSum(src.components),
    price,
    amount: Math.round(qty * price),
    sketch_img: src.sketch_img || ''
  };
  ctx.items.push(it);
  persist(ctx);
  paint(ctx);
}

function editProduct(ctx, it){
  try {
    openConfigurator(updated => {
      if (!updated) return;
      const qty = updated.qty != null ? n(updated.qty) : n(it.qty) || 1;
      const price = n(updated.price != null ? updated.price : retail(componentSum(updated.components), updated.markup_pct));
      it.name = updated.name != null ? updated.name : it.name;
      it.descr = updated.descr != null ? updated.descr : it.descr;
      it.components = Array.isArray(updated.components) ? updated.components : it.components;
      it.size_wh = updated.size_wh != null ? updated.size_wh : it.size_wh;
      it.qty = qty;
      it.unit = updated.unit || it.unit;
      it.markup_pct = updated.markup_pct != null ? n(updated.markup_pct) : it.markup_pct;
      it.purchase_sum = updated.purchase_sum != null ? n(updated.purchase_sum) : it.purchase_sum;
      it.price = price;
      it.amount = Math.round(qty * price);
      it.sketch_img = updated.sketch_img != null ? updated.sketch_img : it.sketch_img;
      persist(ctx);
      paint(ctx);
    }, it);
  } catch (e){
    console.error('[configurator edit]', e);
    toast('Конфигуратор недоступен');
  }
}

function addService(ctx){
  const it = {
    section: 'service',
    name: '',
    descr: '',
    components: [],
    size_wh: '',
    qty: 1,
    unit: 'усл.',
    basis: '',
    markup_pct: null,
    purchase_sum: 0,
    price: 0,
    amount: 0
  };
  ctx.items.push(it);
  persist(ctx, true);
  paint(ctx);
}

function removeItem(ctx, it){
  const i = ctx.items.indexOf(it);
  if (i >= 0) ctx.items.splice(i, 1);
  persist(ctx, true);
  paint(ctx);
}

// Переместить позицию на одну строку вверх/вниз ВНУТРИ её раздела (dir = -1 / +1).
function moveItem(ctx, it, dir){
  const items = ctx.items;
  // Глобальные индексы позиций того же раздела, в текущем порядке.
  const idxs = items.map((x, i) => (x.section === it.section ? i : -1)).filter(i => i >= 0);
  const pos = idxs.indexOf(items.indexOf(it));
  const swapPos = pos + dir;
  if (pos < 0 || swapPos < 0 || swapPos >= idxs.length) return; // у края — никуда не двигаем
  const a = idxs[pos], b = idxs[swapPos];
  const tmp = items[a]; items[a] = items[b]; items[b] = tmp;
  persist(ctx, true);
  paint(ctx);
}

/* ───────────────────────── Условия и сроки ───────────────────────── */

function buildTermsCard(ctx){
  const kp = ctx.kp;
  const terms = kp.terms || (kp.terms = { produce: '', warranty: '', payment: '' });
  const card = el('<div class="card ctr-noprint"></div>');
  card.innerHTML = `
    <div class="h2">Условия и сроки</div>
    <div class="muted" style="margin:-6px 0 12px">Только для этого КП. Если оставить пусто — берутся из Настроек (для физлиц / для юрлиц по варианту документа).</div>
    <div class="row">
      <div class="col field"><label>Срок изготовления</label>
        <input class="input" data-term="produce" value="${escapeHtml(terms.produce || '')}" placeholder="напр. 5–7 рабочих дней"></div>
      <div class="col field"><label>Гарантия</label>
        <input class="input" data-term="warranty" value="${escapeHtml(terms.warranty || '')}" placeholder="напр. до 10 лет"></div>
    </div>
    <div class="field"><label>Условия оплаты</label>
      <textarea class="input" rows="2" data-term="payment" placeholder="напр. предоплата 70%, остаток по факту монтажа">${escapeHtml(terms.payment || '')}</textarea></div>
  `;
  card.querySelectorAll('[data-term]').forEach(inp => {
    inp.addEventListener('input', () => { terms[inp.dataset.term] = inp.value; kp.terms = terms; });
    inp.addEventListener('change', () => { terms[inp.dataset.term] = inp.value; kp.terms = terms; persist(ctx, true); });
  });
  return card;
}

/* ───────────────────────── Эскиз: вставка Ctrl+V ───────────────────────── */

function openSketchModal(ctx, it){
  const bg = modal(`
    <div class="h2">Эскиз изделия</div>
    <div class="muted" style="margin-bottom:12px">Сделайте скриншот (PrtScn или Win+Shift+S) и нажмите <b>Ctrl+V</b> — эскиз вставится в КП. Можно и выбрать файл.</div>
    <div data-sk-zone tabindex="0" style="border:2px dashed #d8c6c4;border-radius:8px;min-height:150px;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--muted2);padding:12px;background:#fcfbfa;cursor:pointer">Кликните сюда и нажмите Ctrl+V, либо перетащите картинку</div>
    <input type="file" accept="image/*" data-sk-file style="margin-top:10px">
    <div style="display:flex;gap:10px;margin-top:16px;align-items:center">
      <button class="btn" data-sk-clear>Удалить эскиз</button>
      <span style="flex:1"></span>
      <button class="btn" data-sk-cancel>Закрыть</button>
      <button class="btn btn-red" data-sk-save>Сохранить</button>
    </div>
  `);
  let img = it.sketch_img || '';
  const zone = bg.querySelector('[data-sk-zone]');
  const HINT = 'Кликните сюда и нажмите Ctrl+V, либо перетащите картинку';
  function show(){
    zone.innerHTML = img ? `<img src="${img}" alt="эскиз" style="max-width:100%;max-height:240px;display:block">` : HINT;
  }
  show();
  const stop = watchPasteImage(d => { img = d; show(); toast('Эскиз вставлен'); });
  zone.addEventListener('click', () => zone.focus());
  zone.addEventListener('dragover', e => e.preventDefault());
  zone.addEventListener('drop', e => {
    e.preventDefault();
    const f = [...(e.dataTransfer.files || [])].find(x => x.type.indexOf('image') === 0);
    if (f) readFileAsDataURL(f).then(d => { img = d; show(); });
  });
  bg.querySelector('[data-sk-file]').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) readFileAsDataURL(f).then(d => { img = d; show(); });
  });
  bg.querySelector('[data-sk-clear]').addEventListener('click', () => { img = ''; show(); });
  bg.querySelector('[data-sk-cancel]').addEventListener('click', () => { stop(); bg.remove(); });
  bg.querySelector('[data-sk-save]').addEventListener('click', () => {
    it.sketch_img = img; stop(); bg.remove(); persist(ctx); paint(ctx); toast('Эскиз сохранён');
  });
  const mo = new MutationObserver(() => { if (!document.body.contains(bg)) { stop(); mo.disconnect(); } });
  mo.observe(document.body, { childList: true });
}

/* ───────────────────────── Итоги ───────────────────────── */

function buildTotals(ctx){
  const card = el('<div class="card ctr-noprint"></div>');
  card.innerHTML = `
    <div class="row" style="align-items:flex-end">
      <div class="col field ctr-discount">
        <label>Скидка на изделия, ₽</label>
        <input class="input" type="number" min="0" step="1" data-discount value="${n(ctx.kp.discount)}">
      </div>
      <div class="col"></div>
    </div>
    <div class="ctr-tot-grid" data-tot></div>
  `;
  const disc = card.querySelector('[data-discount]');
  disc.addEventListener('input', () => { ctx.kp.discount = Math.max(0, n(disc.value)); refreshTotals(ctx); });
  disc.addEventListener('change', () => {
    ctx.kp.discount = Math.max(0, n(disc.value));
    disc.value = ctx.kp.discount;
    refreshTotals(ctx);
    persist(ctx, true);
  });
  fillTotals(ctx, card.querySelector('[data-tot]'));
  return card;
}

function fillTotals(ctx, host){
  const t = computeKpTotals(ctx.kp, ctx.items);
  // Все суммы — без НДС. НДС считается от суммы КП (с учётом скидки) отдельной строкой,
  // итог: Сумма КП без НДС + НДС = Сумма с НДС.
  const hasVat = t.vatRate > 0;
  let rows = '';
  if (t.discount){
    rows += `<div class="row-t"><span class="muted">Стоимость без НДС</span><span>${money(t.subtotal)}</span></div>`;
    rows += `<div class="row-t"><span class="muted">Скидка</span><b>−${money(t.discount)}</b></div>`;
  }
  if (hasVat){
    rows += `<div class="row-t"><span class="muted">Сумма КП без НДС</span><b>${money(t.base)}</b></div>`;
    rows += `<div class="row-t"><span class="muted">Плюс НДС ${num(t.vatRate)}%</span><b>${money2(t.vat)}</b></div>`;
    rows += `<div class="row-t" style="font-size:15px;margin-top:4px"><span>Сумма с НДС</span><b>${money2(t.total)}</b></div>`;
  } else {
    rows += `<div class="row-t" style="font-size:15px;margin-top:4px"><span>${t.discount ? 'Сумма КП' : 'Всего'}</span><b>${money(t.total)}</b></div>`;
  }
  host.innerHTML = rows;
}

// Перерисовать блок итогов и sticky-панель оплаты.
function refreshTotals(ctx){
  const host = ctx.root.querySelector('[data-tot]');
  if (host) fillTotals(ctx, host);
  const pay = ctx.root.querySelector('.tot-pay');
  if (pay){
    const t = computeKpTotals(ctx.kp, ctx.items);
    pay.textContent = 'К оплате: ' + money(t.total);
  }
}

/* ───────────────────────── Кнопки и sticky-итог ───────────────────────── */

// Проверка обязательных полей перед печатью/предпросмотром.
// Блокирует при отсутствии продавца или позиций; мягко предупреждает о пустых полях.
function validateBeforePreview(ctx){
  const { kp, items, orgs } = ctx;
  if (!kp.org_id || !orgs.some(o => o.id === kp.org_id)){
    toast('Выберите продавца (организацию)');
    return false;
  }
  if (!items.length){
    toast('Добавьте хотя бы одно изделие или услугу');
    return false;
  }
  const warn = [];
  if (!String((kp.buyer && kp.buyer.name) || '').trim()) warn.push('покупатель не указан');
  if (!String(kp.client_request_no || '').trim()) warn.push('нет № обращения');
  if (items.some(it => !n(it.price))) warn.push('есть позиции с нулевой ценой');
  if (warn.length){
    return confirm('Можно продолжить, но: ' + warn.join('; ') + '.\nОткрыть предпросмотр всё равно?');
  }
  return true;
}

function buildActions(ctx){
  const wrap = el('<div></div>');
  const t = computeKpTotals(ctx.kp, ctx.items);

  const bar = el(`
    <div class="totbar">
      <button class="btn ctr-noprint" data-act="back" type="button">← Назад к списку</button>
      <button class="btn ctr-noprint" data-act="save" type="button">Сохранить</button>
      <button class="btn btn-red ctr-noprint" data-act="preview" type="button">Предпросмотр</button>
      <span class="tot-pay">К оплате: ${money(t.total)}</span>
    </div>`);

  bar.querySelector('[data-act="back"]').addEventListener('click', async () => {
    await persist(ctx, true);
    setRoute('kp-list');
  });
  bar.querySelector('[data-act="save"]').addEventListener('click', () => persist(ctx, false));
  bar.querySelector('[data-act="preview"]').addEventListener('click', async () => {
    if (!validateBeforePreview(ctx)) return;
    await persist(ctx, true);
    try {
      openPreview(ctx.kp, ctx.items);
    } catch (e){
      console.error('[preview]', e);
      toast('Предпросмотр недоступен');
    }
  });

  wrap.appendChild(bar);
  return wrap;
}
