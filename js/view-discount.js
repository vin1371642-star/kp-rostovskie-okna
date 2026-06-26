// view-discount.js — вкладка «Расчёт скидки».
// Методика файла базы знаний «НДС 2026.xlsx»: скидка при продаже юрлицам с НДС
// + агентское вознаграждение. Сотрудники видят упрощённый вид; админ (по паролю) —
// полный вид и редактор самих формул (текстовые выражения, живой пересчёт).
import { money2, num, el, toast } from './util.js';
import { state, saveSettings, enterAdminMode, exitAdminMode } from './store.js';

// Локальное состояние ввода (живёт между перерисовками).
const inp = { rate: 5, base: 0, goods: 0, mount: 0, agent: 0 };

// Режим администратора — общий (state.adminMode). Рабочая копия формул при правке админом:
let workFormulas = null;

function n(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
function pct2(x){ return Number.isFinite(x) ? (Math.round(x * 100) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %' : '—'; }
function m2(x){ return Number.isFinite(x) ? money2(x) : '—'; }

// ── Формулы по умолчанию (порядок = порядок вычисления; имена = переменные) ──
const ORDER = ['total','vatGoods','vatMount','vatBuy','agentSum','saleGoods','saleMount','saleTotal','discountPct','contractGoods','contractMount','contractTotal','contractVat'];
const DEFAULT_EXPR = {
  total:        'goods + mount',
  vatGoods:     'goods*rate/(100+rate)',
  vatMount:     'mount*rate/(100+rate)',
  vatBuy:       'rate==22 ? base/2.22*22/122 : 0',
  agentSum:     '(goods - vatGoods)*agentPct/100',
  saleGoods:    'goods - vatGoods + vatBuy - agentSum',
  saleMount:    'mount - vatMount',
  saleTotal:    'saleGoods + saleMount',
  discountPct:  'base ? (base - saleGoods)/base*100 : 0',
  contractGoods:'rate==22 ? goods : total',
  contractMount:'rate==22 ? mount : 0',
  contractTotal:'total',
  contractVat:  'total*rate/(100+rate)',
};
const LABEL = {
  total:'Итого для клиента (с НДС)', vatGoods:'НДС в изделиях', vatMount:'НДС в монтаже', vatBuy:'НДС в закупке (входящий)',
  agentSum:'Вознаграждение агента', saleGoods:'Для показателей — изделия', saleMount:'Для показателей — монтаж',
  saleTotal:'Для показателей — итого', discountPct:'Скидка к базе, %', contractGoods:'Для договора — изделия',
  contractMount:'Для договора — монтаж', contractTotal:'Для договора — итого', contractVat:'Для договора — в т.ч. НДС',
};
const FUNCS = { min:Math.min, max:Math.max, abs:Math.abs, round:(x,d=2)=>{ const p=Math.pow(10, d||0); return Math.round(x*p)/p; } };

// Слитые формулы: переопределения из настроек поверх значений по умолчанию.
function savedFormulas(){ return Object.assign({}, DEFAULT_EXPR, (state.settings && state.settings.disc_formulas) || {}); }

// Безопасный вычислитель выражения: только числа/операторы/скобки/тернарник и известные имена.
function evalFormula(expr, scope){
  if (typeof expr !== 'string' || !expr.trim()) throw new Error('пусто');
  if (/[^0-9\s+\-*/%().,?:<>=!&|a-zA-Z_]/.test(expr)) throw new Error('недопустимый символ');
  const ids = expr.match(/[A-Za-z_]\w*/g) || [];
  for (const id of ids){ if (!(id in scope)) throw new Error('неизвестное имя «' + id + '»'); }
  const names = Object.keys(scope);
  const fn = new Function(...names, 'return (' + expr + ');'); // имена ограничены scope (см. проверку выше)
  const v = Number(fn(...names.map(k => scope[k])));
  return Number.isFinite(v) ? v : NaN;
}

// Расчёт по формулам (переданным или сохранённым). Возвращает значения + ошибки по ключам.
export function computeDiscount(i, formulas){
  const F = formulas || savedFormulas();
  const scope = { rate: i.rate === 22 ? 22 : 5, base: n(i.base), goods: n(i.goods), mount: n(i.mount), agentPct: n(i.agent), ...FUNCS };
  const errors = {};
  for (const key of ORDER){
    try { scope[key] = evalFormula(F[key], scope); }
    catch (e){ scope[key] = NaN; errors[key] = e.message; }
  }
  scope._errors = errors;
  return scope;
}

let _styled = false;
function injectStyles(){
  if (_styled) return; _styled = true;
  const css = `
    .disc-wrap{display:grid;grid-template-columns:minmax(280px,360px) 1fr;gap:18px;align-items:start}
    @media(max-width:820px){.disc-wrap{grid-template-columns:1fr}}
    .disc-seg{display:flex;background:#eceae8;border-radius:8px;padding:3px;gap:2px;max-width:220px}
    .disc-seg button{flex:1;padding:9px 0;border:none;border-radius:6px;font:600 13px/1 var(--sans);cursor:pointer;background:transparent;color:#6b6a68}
    .disc-seg button.on{background:var(--ink);color:#fff}
    .disc-rows{display:flex;flex-direction:column}
    .disc-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0;border-bottom:1px dashed #e7e4e1}
    .disc-row:last-child{border-bottom:none}
    .disc-row .lab{color:var(--muted2);font-size:13px}
    .disc-row .v{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
    .disc-grp{font-family:var(--head);font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink);margin:14px 0 2px}
    .disc-grp:first-child{margin-top:0}
    .disc-big{display:flex;justify-content:space-between;align-items:baseline;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px 14px;margin-top:10px}
    .disc-big .lab{font-family:var(--head);font-weight:700;font-size:14px}
    .disc-big .v{font-family:var(--head);font-weight:700;font-size:22px;color:var(--red);font-variant-numeric:tabular-nums}
    .disc-neg{color:#1f8a4c}
    .disc-var{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#6b6a68;background:#f0eeec;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:500}
    .disc-adminbar{display:flex;align-items:center;gap:10px;margin-top:18px}
    .disc-flink{background:none;border:none;color:var(--muted2);cursor:pointer;font-size:12.5px;text-decoration:underline;padding:0}
    .disc-frow{display:grid;grid-template-columns:230px 1fr;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}
    .disc-frow:last-child{border-bottom:none}
    .disc-frow label{color:var(--ink);font-size:13px;font-weight:600}
    .disc-frow .fexpr{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}
    .disc-ferr{grid-column:2;color:var(--red);font-size:11.5px;margin-top:-4px}
    @media(max-width:680px){.disc-frow{grid-template-columns:1fr}}
  `;
  const s = document.createElement('style'); s.id = 'disc-styles'; s.textContent = css; document.head.appendChild(s);
}

export function renderDiscount(root){
  injectStyles();
  root.innerHTML = '';
  root.appendChild(el('<div class="h1">Расчёт скидки</div>'));
  root.appendChild(el('<p class="muted" style="margin:0 0 16px">Скидка при продаже юрлицам с НДС и агентское вознаграждение. По методике «НДС 2026». Введите исходные данные.</p>'));

  const wrap = el('<div class="disc-wrap"></div>');
  root.appendChild(wrap);

  // В админ-режиме рядом с подписями показываем имя переменной формулы (goods, saleGoods…).
  const vTag = name => (state.adminMode && name) ? ` <span class="disc-var">${name}</span>` : '';

  // ── Ввод ──
  const cIn = el('<div class="card"></div>');
  cIn.appendChild(el('<div class="h2">Исходные данные</div>'));
  const segWrap = el(`<div class="field"><label>Ставка НДС${vTag('rate')}</label></div>`);
  const seg = el('<div class="disc-seg"><button type="button" data-rate="5">5 %</button><button type="button" data-rate="22">22 %</button></div>');
  segWrap.appendChild(seg); cIn.appendChild(segWrap);
  const mkNum = (label, key, hint, varName) => {
    const f = el(`<div class="field"><label>${label}${vTag(varName)}</label><input class="input" type="number" min="0" step="0.01" value="${inp[key] || ''}" placeholder="0"></div>`);
    if (hint) f.appendChild(el(`<div class="muted" style="font-size:11px;margin-top:2px">${hint}</div>`));
    const input = f.querySelector('input');
    input.addEventListener('input', () => { inp[key] = n(input.value); paint(); });
    return f;
  };
  cIn.appendChild(mkNum('База за изделия (закупка), ₽', 'base', 'Себестоимость изделий', 'base'));
  cIn.appendChild(mkNum('Изделия для клиента (с НДС), ₽', 'goods', '', 'goods'));
  cIn.appendChild(mkNum('Монтаж для клиента (с НДС), ₽', 'mount', '', 'mount'));
  cIn.appendChild(mkNum('Агент, %', 'agent', 'Вознаграждение агента', 'agentPct'));
  wrap.appendChild(cIn);

  // ── Результат ──
  const cOut = el('<div class="card"></div>');
  cOut.appendChild(el('<div class="h2">Результат</div>'));
  const out = el('<div data-out></div>');
  cOut.appendChild(out);
  wrap.appendChild(cOut);

  // ── Редактор формул (только админ) ──
  const editorHost = el('<div data-feditor></div>');
  root.appendChild(editorHost);

  // ── Нижняя панель: разблокировка/выход из режима админа ──
  const adminBar = el('<div class="disc-adminbar"></div>');
  root.appendChild(adminBar);

  function syncSeg(){ seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.rate) === inp.rate)); }
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { inp.rate = Number(b.dataset.rate); syncSeg(); paint(); }));

  const row = (lab, val, varName, cls) => `<div class="disc-row"><span class="lab">${lab}${vTag(varName)}</span><span class="v ${cls || ''}">${val}</span></div>`;

  function paint(){
    const t = computeDiscount(inp, state.adminMode ? workFormulas : null);
    const discCls = t.discountPct < 0 ? 'disc-neg' : '';
    let html = '';
    if (state.adminMode){
      html += `<div class="disc-grp">Итого для клиента (с НДС)</div><div class="disc-rows">
        ${row('Изделия', m2(t.goods), 'goods')}${row('Монтаж', m2(t.mount), 'mount')}${row('Итого', m2(t.total), 'total')}</div>
        <div class="disc-grp">НДС</div><div class="disc-rows">
        ${row('НДС в изделиях', m2(t.vatGoods), 'vatGoods')}${row('НДС в монтаже', m2(t.vatMount), 'vatMount')}${row('НДС в закупке (вход.)', m2(t.vatBuy), 'vatBuy')}</div>`;
    }
    html += `<div class="disc-grp">Для показателей</div><div class="disc-rows">
        ${row('Изделия', m2(t.saleGoods), 'saleGoods')}${row('Монтаж', m2(t.saleMount), 'saleMount')}${row('Итого', m2(t.saleTotal), 'saleTotal')}</div>
      <div class="disc-grp">Для договора</div><div class="disc-rows">
        ${row('Изделия', m2(t.contractGoods), 'contractGoods')}${row('Монтаж', m2(t.contractMount), 'contractMount')}${row('ИТОГО', m2(t.contractTotal), 'contractTotal')}${row('в т.ч. НДС ' + num(t.rate) + '%', m2(t.contractVat), 'contractVat')}</div>
      <div class="disc-grp">Агент</div><div class="disc-rows">${row('Вознаграждение агента', m2(t.agentSum), 'agentSum')}</div>
      <div class="disc-big"><span class="lab">Скидка к базе${vTag('discountPct')}</span><span class="v ${discCls}">${pct2(t.discountPct)}</span></div>`;
    out.innerHTML = html;
  }

  function buildEditor(){
    editorHost.innerHTML = '';
    if (!state.adminMode) return;
    const card = el('<div class="card"></div>');
    card.appendChild(el('<div class="h2">Формулы расчёта (админ)</div>'));
    card.appendChild(el('<p class="muted" style="margin:0 0 10px">Переменные: <b>rate, base, goods, mount, agentPct</b> и вычисленные выше. Можно <b>+ − * / ( )</b>, сравнение и тернарник (напр. <code>rate==22 ? x : y</code>), функции min/max/abs/round. Изменения применяются сразу; «Сохранить» — чтобы записать и затем раздать сотрудникам по ссылке.</p>'));
    ORDER.forEach(key => {
      const frow = el(`<div class="disc-frow"><label>${LABEL[key]} <span class="disc-var">${key}</span></label><input class="input fexpr" value="${(workFormulas[key] || '').replace(/"/g, '&quot;')}"></div>`);
      const errEl = el('<div class="disc-ferr" style="display:none"></div>');
      frow.appendChild(errEl);
      const input = frow.querySelector('input');
      input.addEventListener('input', () => {
        workFormulas[key] = input.value;
        paint();
        const err = computeDiscount(inp, workFormulas)._errors[key];
        errEl.style.display = err ? '' : 'none';
        errEl.textContent = err ? 'Ошибка: ' + err : '';
      });
      card.appendChild(frow);
    });
    const bar = el('<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"></div>');
    const save = el('<button class="btn btn-red">Сохранить формулы</button>');
    save.onclick = async () => {
      const diff = {};
      ORDER.forEach(k => { const v = (workFormulas[k] || '').trim(); if (v && v !== DEFAULT_EXPR[k]) diff[k] = v; });
      const s = Object.assign({}, state.settings, { disc_formulas: diff }); s.id = 'app';
      try { await saveSettings(s); toast('Формулы сохранены'); } // saveSettings перерисует вкладку
      catch (e){ console.error('[disc formulas]', e); toast('Ошибка сохранения'); }
    };
    const reset = el('<button class="btn">Сбросить к стандартным</button>');
    reset.onclick = () => { workFormulas = Object.assign({}, DEFAULT_EXPR); renderDiscount(root); };
    bar.appendChild(save); bar.appendChild(reset);
    card.appendChild(bar);
    editorHost.appendChild(card);
  }

  function buildAdminBar(){
    adminBar.innerHTML = '';
    if (state.adminMode){
      const lock = el('<button class="disc-flink">Выйти из режима администратора</button>');
      lock.onclick = () => exitAdminMode(); // эмитит перерисовку
      adminBar.appendChild(el('<span class="muted" style="font-size:12.5px">🔓 Режим администратора</span>'));
      adminBar.appendChild(lock);
    } else {
      const unlock = el('<button class="disc-flink">Режим администратора</button>');
      unlock.onclick = async () => {
        const r = await enterAdminMode();
        if (r === 'wrong') toast('Неверный пароль');
        else if (r === 'nolocal') toast('Режим администратора доступен только в локальной версии');
        else if (r === 'set') toast('Пароль администратора задан, режим включён');
      };
      adminBar.appendChild(unlock);
    }
  }

  if (state.adminMode){ if (!workFormulas) workFormulas = savedFormulas(); } else { workFormulas = null; }
  syncSeg();
  paint();
  buildEditor();
  buildAdminBar();
}
