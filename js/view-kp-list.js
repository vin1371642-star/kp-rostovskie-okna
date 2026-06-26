// Экран «Мои КП» — список коммерческих предложений.
import { setRoute, state } from './store.js';
import { money, fmtDate, escapeHtml, toast, modal } from './util.js';
import { listKp, newKp, duplicateKp, deleteKp, exportKpFile, importKpFile, setStatus } from './storage-kp.js';
import { dbAll } from './db.js';
import { computeKpTotals } from './calc.js';

// Локальное UI-состояние экрана (живёт между перерисовками).
const ui = { q: '' };

injectStyles();

export function renderKpList(root){
  // Асинхронная сборка списка; пока идёт чтение из IndexedDB — каркас уже в DOM.
  build(root, root.__epoch);
}

async function build(root, epoch = root.__epoch){
  let kps = [];
  let orgs = [];
  let allItems = [];
  try {
    [kps, orgs, allItems] = await Promise.all([listKp(), dbAll('organizations'), dbAll('kp_items')]);
  } catch (e){
    console.error('[kp-list] load', e);
  }
  if (root.__epoch !== epoch) return; // навигация ушла дальше
  kps = Array.isArray(kps) ? kps : [];
  orgs = Array.isArray(orgs) ? orgs : [];
  allItems = Array.isArray(allItems) ? allItems : [];
  const orgById = {};
  orgs.forEach(o => { if (o && o.id != null) orgById[o.id] = o; });
  // Позиции по КП — для подсчёта суммы в списке.
  const itemsByKp = {};
  allItems.forEach(it => { (itemsByKp[it.kp_id] = itemsByKp[it.kp_id] || []).push(it); });

  root.innerHTML = '';
  root.appendChild(buildHeader(root));

  if (!kps.length){
    root.appendChild(buildEmpty(root));
    return;
  }

  root.appendChild(buildToolbar(root, kps));

  const filtered = applyFilters(kps);
  const card = document.createElement('div');
  card.className = 'card';
  if (!filtered.length){
    card.innerHTML = '<div class="muted center" style="padding:24px">Ничего не найдено. Измените поиск или фильтр.</div>';
  } else {
    card.appendChild(buildTable(root, filtered, orgById, itemsByKp));
  }
  root.appendChild(card);
}

// ---------- Шапка ----------
function buildHeader(root){
  const wrap = document.createElement('div');
  wrap.className = 'toolbar';
  wrap.style.justifyContent = 'space-between';
  wrap.innerHTML = `
    <div>
      <div class="h1">Мои КП</div>
      <div class="muted">Коммерческие предложения «Ростовские окна»</div>
    </div>`;
  const create = mkBtn('+ Создать КП', 'btn btn-red');
  create.onclick = () => createKp();
  wrap.appendChild(create);
  return wrap;
}

// ---------- Тулбар: поиск + фильтры + импорт ----------
function buildToolbar(root, kps){
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  const search = document.createElement('input');
  search.className = 'input';
  search.type = 'search';
  search.placeholder = 'Поиск по № обращения или клиенту…';
  search.value = ui.q;
  search.style.maxWidth = '300px';
  search.oninput = () => { ui.q = search.value; rerenderList(root); };
  bar.appendChild(search);

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  bar.appendChild(spacer);

  const storage = document.createElement('span');
  storage.className = 'muted';
  storage.style.fontSize = '12px';
  fillStorageIndicator(storage);
  bar.appendChild(storage);

  bar.appendChild(buildImportBtn(root));
  return bar;
}

// Индикатор заполнения локального хранилища (IndexedDB + кэш).
async function fillStorageIndicator(span){
  try {
    if (!(navigator.storage && navigator.storage.estimate)) return;
    const { usage, quota } = await navigator.storage.estimate();
    const mb = b => (b / 1048576);
    if (quota){
      const pct = Math.min(100, Math.round(usage / quota * 100));
      span.textContent = `💾 ${mb(usage).toFixed(1)} МБ из ${mb(quota).toFixed(0)} МБ (${pct}%)`;
      if (pct >= 80) span.style.color = 'var(--red)';
    } else {
      span.textContent = `💾 ${mb(usage).toFixed(1)} МБ`;
    }
  } catch (e){ /* storage API недоступен — индикатор просто пуст */ }
}

function buildImportBtn(root){
  const label = document.createElement('label');
  label.className = 'btn btn-sm';
  label.style.cursor = 'pointer';
  label.textContent = 'Импорт .kp';
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.kp,application/json';
  inp.style.display = 'none';
  inp.onchange = async () => {
    const file = inp.files && inp.files[0];
    if (!file) return;
    try {
      await importKpFile(file);
      toast('КП импортировано');
    } catch (e){
      console.error('[kp-list] import', e);
      toast('Не удалось импортировать файл');
    }
    inp.value = '';
    build(root);
  };
  label.appendChild(inp);
  return label;
}

// ---------- Таблица ----------
function buildTable(root, list, orgById, itemsByKp){
  const table = document.createElement('table');
  table.className = 'table';
  table.innerHTML = `
    <thead><tr>
      <th>№ обращения</th>
      <th>Клиент</th>
      <th>Продавец</th>
      <th>Дата</th>
      <th class="right">Сумма</th>
      <th>Статус</th>
      <th class="right">Действия</th>
    </tr></thead>`;
  const tbody = document.createElement('tbody');

  list.forEach(kp => {
    const tr = document.createElement('tr');
    const org = orgById[kp.org_id];
    const orgName = org ? (org.name || org.brand || '—') : '—';
    const sum = kpSum(kp, itemsByKp && itemsByKp[kp.id]);

    tr.appendChild(td(escapeHtml(kp.client_request_no || '—')));
    tr.appendChild(td(escapeHtml(buyerName(kp))));
    tr.appendChild(td(escapeHtml(orgName)));
    tr.appendChild(td(escapeHtml(fmtDate(kp.date || kp.created_at))));
    tr.appendChild(td(sum == null ? '—' : money(sum), 'right'));
    tr.appendChild(buildStatusCell(root, kp));

    tr.appendChild(buildActions(root, kp));
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  return table;
}

function buildActions(root, kp){
  const cell = document.createElement('td');
  cell.className = 'right';
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end';

  const open = mkBtn('Открыть', 'btn btn-sm btn-red');
  open.onclick = () => setRoute('constructor', { id: kp.id });
  box.appendChild(open);

  const send = mkBtn('Отправить', 'btn btn-sm');
  send.title = 'Отправить клиенту в WhatsApp или на почту';
  send.onclick = () => openSendModal(root, kp);
  box.appendChild(send);

  const dup = mkBtn('Дублировать', 'btn btn-sm');
  dup.onclick = async () => {
    if (dup.disabled) return;
    dup.disabled = true;
    try { await duplicateKp(kp.id); toast('КП дублировано'); }
    catch (e){ console.error('[kp-list] duplicate', e); toast('Не удалось дублировать'); }
    build(root);
  };
  box.appendChild(dup);

  const dl = mkBtn('Скачать .kp', 'btn btn-sm');
  dl.title = 'Скачать файл .kp';
  dl.onclick = async () => {
    try { await exportKpFile(kp.id); }
    catch (e){ console.error('[kp-list] export', e); toast('Не удалось скачать'); }
  };
  box.appendChild(dl);

  const del = mkBtn('Удалить', 'btn btn-sm');
  del.onclick = async () => {
    if (del.disabled) return;
    if (!confirm('Удалить КП «' + (kp.client_request_no || buyerName(kp)) + '»? Действие необратимо.')) return;
    del.disabled = true;
    try { await deleteKp(kp.id); toast('КП удалено'); }
    catch (e){ console.error('[kp-list] delete', e); toast('Не удалось удалить'); }
    build(root);
  };
  box.appendChild(del);

  cell.appendChild(box);
  return cell;
}

// ---------- Статусы ----------
const STATUS_LABEL = { draft: 'Черновик', sent: 'Отправлено', accepted: 'Принято', rejected: 'Отклонено' };

// Ячейка статуса — бейдж-выпадающий список (смена статуса прямо в списке).
function buildStatusCell(root, kp){
  const cell = document.createElement('td');
  const sel = document.createElement('select');
  const cur = kp.status || 'draft';
  sel.className = 'badge ' + cur;
  sel.style.cssText = 'border:none;cursor:pointer;appearance:none;-webkit-appearance:none;padding-right:8px';
  Object.keys(STATUS_LABEL).forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = STATUS_LABEL[s];
    if (cur === s) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = async () => {
    try {
      await setStatus(kp.id, sel.value);
      kp.status = sel.value;
      sel.className = 'badge ' + sel.value;
      toast('Статус: ' + STATUS_LABEL[sel.value]);
    } catch (e){ console.error('[kp-list] status', e); toast('Не удалось сменить статус'); }
  };
  cell.appendChild(sel);
  return cell;
}

// ---------- Отправка клиенту ----------
function normalizePhone(raw){
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;          // без кода страны → Россия
  return d.length >= 11 ? d : '';
}

function openSendModal(root, kp){
  const no = kp.client_request_no ? ' №' + kp.client_request_no : '';
  const mgrName = (kp.manager && kp.manager.name) ? kp.manager.name : '';
  const phone = normalizePhone(kp.buyer && kp.buyer.phone);
  const msg = `Здравствуйте! Направляю коммерческое предложение «Ростовские окна»${no}. `
    + `Буду рад(а) ответить на любые вопросы.` + (mgrName ? ` С уважением, ${mgrName}.` : '');
  const subject = 'Коммерческое предложение «Ростовские окна»' + no;
  const waUrl = (phone ? `https://wa.me/${phone}` : 'https://wa.me/') + '?text=' + encodeURIComponent(msg);
  const mailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;

  const bg = modal(`
    <div class="h2">Отправить клиенту</div>
    <p class="muted" style="margin:-4px 0 14px">Сначала скачайте PDF (кнопка «Скачать .kp» / печать → «Сохранить как PDF») и прикрепите его в мессенджере вручную — ссылки откроют готовое сообщение.</p>
    ${phone ? '' : '<p class="pill" style="margin-bottom:12px">У клиента не указан телефон — WhatsApp откроется без получателя</p>'}
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-red" data-send="wa">WhatsApp</button>
      <button class="btn" data-send="mail">Почта (e-mail)</button>
      <span style="flex:1"></span>
      <button class="btn" data-send="close">Закрыть</button>
    </div>`);
  const finishSent = async () => {
    try { await setStatus(kp.id, 'sent'); kp.status = 'sent'; } catch (e){ console.error('[kp-list] sent', e); }
    bg.remove();
    build(root);
  };
  bg.querySelector('[data-send="wa"]').onclick = () => { window.open(waUrl, '_blank'); finishSent(); };
  bg.querySelector('[data-send="mail"]').onclick = () => { window.location.href = mailUrl; finishSent(); };
  bg.querySelector('[data-send="close"]').onclick = () => bg.remove();
}

// ---------- Пустое состояние / онбординг ----------
function buildEmpty(root){
  const card = document.createElement('div');
  card.className = 'card';
  const wrap = document.createElement('div');
  wrap.className = 'empty';
  wrap.innerHTML = `
    <div class="big">Создайте первое КП</div>
    <p class="muted" style="max-width:440px;margin:0 auto 22px">
      Всего три шага до готового коммерческого предложения в фирменном стиле.
    </p>
    <div class="kp-steps">
      <div class="kp-step"><div class="kp-step-n">1</div><div>Выберите продавца</div></div>
      <div class="kp-step"><div class="kp-step-n">2</div><div>Добавьте изделия</div></div>
      <div class="kp-step"><div class="kp-step-n">3</div><div>Скачайте PDF</div></div>
    </div>`;
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;margin-top:26px;flex-wrap:wrap';

  const create = mkBtn('+ Создать КП', 'btn btn-red');
  create.onclick = () => createKp();
  btnRow.appendChild(create);

  btnRow.appendChild(buildImportBtn(root));
  wrap.appendChild(btnRow);
  card.appendChild(wrap);
  return card;
}

// ---------- Действия ----------
async function createKp(){
  try {
    const kp = await newKp();
    const id = kp && kp.id;
    if (id) setRoute('constructor', { id });
    else { console.error('[kp-list] newKp returned no id', kp); toast('Не удалось создать КП'); }
  } catch (e){
    console.error('[kp-list] createKp', e);
    toast('Не удалось создать КП');
  }
}

// ---------- Хелперы ----------
function rerenderList(root){ build(root); }

function applyFilters(kps){
  const q = ui.q.trim().toLowerCase();
  let out = kps.slice();
  if (q) out = out.filter(k => {
    const no = String(k.client_request_no || '').toLowerCase();
    const cl = buyerName(k).toLowerCase();
    return no.includes(q) || cl.includes(q);
  });
  // Сортировка: свежие сверху.
  out.sort((a, b) => dateVal(b) - dateVal(a));
  return out;
}

function dateVal(kp){
  const d = kp.updated_at || kp.created_at || kp.date;
  const t = d ? new Date(d).getTime() : 0;
  return isNaN(t) ? 0 : t;
}

function buyerName(kp){
  return String((kp.buyer && kp.buyer.name) || '').trim() || 'Без названия';
}

// Сумма по items (если приложены к kp); иначе по сохранённому total/amount. null → «—».
function kpSum(kp, items){
  const list = Array.isArray(items) ? items : (Array.isArray(kp.items) ? kp.items : []);
  if (list.length){
    try { return computeKpTotals(kp, list).total; } catch (e){ console.error('[kp-list] sum', e); return null; }
  }
  for (const key of ['total', 'amount', 'sum']){
    if (kp[key] != null && !isNaN(Number(kp[key]))) return Math.round(Number(kp[key]));
  }
  return null;
}

function td(html, cls){
  const c = document.createElement('td');
  if (cls) c.className = cls;
  c.innerHTML = html;
  return c;
}

function mkBtn(text, cls){
  const b = document.createElement('button');
  b.className = cls || 'btn';
  b.textContent = text;
  return b;
}

function injectStyles(){
  if (document.getElementById('kp-list-styles')) return;
  const s = document.createElement('style');
  s.id = 'kp-list-styles';
  s.textContent = `
    .kp-steps{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
    .kp-step{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--line);
      border-radius:8px;padding:12px 16px;font-weight:600;color:var(--ink);font-size:13px}
    .kp-step-n{width:26px;height:26px;flex:none;border-radius:50%;background:var(--red);color:#fff;
      font-family:var(--head);font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14px}
  `;
  document.head.appendChild(s);
}
