// print.js — предпросмотр (WYSIWYG) и печать КП в PDF.
// Экспорт: openPreview(kp, items) — модальное окно с переключателем вариантов
// и тумблером эскизов; printKp(kp, items) — печать только документа в новом окне.
import { renderDocument } from './doc-templates.js';
import { dbGet } from './db.js';
import { state } from './store.js';
import { modal } from './util.js';

// Загрузить org + settings для текущего КП.
async function loadContext(kp) {
  const org = kp && kp.org_id ? await dbGet('organizations', kp.org_id) : null;
  const settings = state.settings || {};
  return { org: org || {}, settings };
}

// Заменить относительные пути ассетов на абсолютные (для окна печати).
function absolutizeAssets(html) {
  return html.replace(/(["'(])assets\//g, '$1/assets/');
}

// Стили оболочки предпросмотра (тулбар + «бумага»), один раз на документ.
function injectPreviewStyles() {
  if (document.getElementById('rok-print-styles')) return;
  const css = `
    .rok-prev-wrap{ display:flex; flex-direction:column; height:100%; min-height:0; }
    .rok-prev-bar{ display:flex; align-items:center; gap:14px; flex-wrap:wrap;
      padding:10px 14px; border-bottom:1px solid #dededc; background:#f8f8f9;
      position:sticky; top:0; z-index:5; font-family:Montserrat,Arial,sans-serif; }
    .rok-prev-title{ font-family:Cuprum,sans-serif; font-weight:700; font-size:13px;
      color:#2B2A29; letter-spacing:.02em; }
    .rok-seg{ display:flex; background:#eceae8; border-radius:8px; padding:3px; gap:2px; }
    .rok-seg button{ padding:8px 13px; border:none; border-radius:6px;
      font:600 12px/1 Montserrat,sans-serif; cursor:pointer; white-space:nowrap;
      background:transparent; color:#6b6a68; }
    .rok-seg button.on{ background:#2B2A29; color:#fff; }
    .rok-sk-toggle{ padding:8px 14px; border:none; border-radius:8px;
      font:600 12px/1 Montserrat,sans-serif; cursor:pointer; white-space:nowrap;
      background:#eceae8; color:#6b6a68; }
    .rok-sk-toggle.on{ background:#B50900; color:#fff; }
    .rok-prev-spacer{ flex:1; }
    .rok-print-btn{ padding:9px 18px; border:none; border-radius:8px;
      font:700 12.5px/1 Montserrat,sans-serif; cursor:pointer;
      background:#B50900; color:#fff; letter-spacing:.02em; }
    .rok-prev-scroll{ flex:1; min-height:0; overflow:auto; background:#e6e6e8;
      padding:24px; }
    .rok-paper{ width:210mm; margin:0 auto; background:#fff;
      box-shadow:0 6px 30px rgba(0,0,0,.14); }
    .rok-modal-doc .modal{ width:auto; max-width:calc(210mm + 64px);
      padding:0; overflow:hidden; }
  `;
  const tag = document.createElement('style');
  tag.id = 'rok-print-styles';
  tag.textContent = css;
  document.head.appendChild(tag);
}

export function openPreview(kp, items) {
  injectPreviewStyles();
  const list = Array.isArray(items) ? items : [];

  // Рабочая копия kp — чтобы переключение вариантов/эскизов не трогало оригинал.
  const draft = { ...(kp || {}) };

  const bg = modal(`
    <div class="rok-prev-wrap">
      <div class="rok-prev-bar">
        <span class="rok-prev-title">Предпросмотр</span>
        <div class="rok-seg" data-seg>
          <button data-variant="premium">Премиум · физлицо</button>
          <button data-variant="kp">КП · юрлицо</button>
          <button data-variant="oferta">Счёт-оферта</button>
        </div>
        <button class="rok-sk-toggle" data-sk>Эскизы</button>
        <span class="rok-prev-spacer"></span>
        <button class="rok-print-btn" data-print>Печать в PDF</button>
      </div>
      <div class="rok-prev-scroll">
        <div class="rok-paper" data-paper></div>
      </div>
    </div>
  `);
  bg.classList.add('rok-modal-doc');

  const paper = bg.querySelector('[data-paper]');
  const segBtns = Array.from(bg.querySelectorAll('[data-variant]'));
  const skBtn = bg.querySelector('[data-sk]');

  let ctx = { org: {}, settings: {} };

  function syncControls() {
    const v = draft.doc_variant || 'premium';
    segBtns.forEach(b => b.classList.toggle('on', b.dataset.variant === v));
    const sk = draft.show_sketches !== false;
    skBtn.classList.toggle('on', sk);
    skBtn.textContent = sk ? 'Эскизы: вкл' : 'Эскизы: выкл';
  }

  function rerender() {
    paper.innerHTML = renderDocument(draft, list, ctx.settings, ctx.org);
    syncControls();
  }

  segBtns.forEach(b => b.addEventListener('click', () => {
    draft.doc_variant = b.dataset.variant;
    rerender();
  }));
  skBtn.addEventListener('click', () => {
    draft.show_sketches = !(draft.show_sketches !== false);
    rerender();
  });
  bg.querySelector('[data-print]').addEventListener('click', () => {
    printKp(draft, list);
  });

  // Загрузить контекст и отрисовать.
  loadContext(draft).then(c => { ctx = c; rerender(); });
  syncControls();

  return bg;
}

export async function printKp(kp, items) {
  const list = Array.isArray(items) ? items : [];
  const { org, settings } = await loadContext(kp);

  // renderDocument уже включает DOC_STYLE; делаем пути ассетов абсолютными.
  const docHtml = absolutizeAssets(renderDocument(kp, list, settings, org));

  const win = window.open('', '_blank');
  if (!win) {
    // Блокировщик всплывающих окон — печать текущей вкладки как запасной вариант.
    window.print();
    return;
  }

  // docHtml уже содержит <style id="rok-doc-style"> (печать-CSS и @page A4),
  // потому отдельно DOC_STYLE в <head> не вставляем — только базовый сброс.
  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="ru"><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Коммерческое предложение — Ростовские окна</title>
    <style>html,body{ margin:0; padding:0; background:#fff; }</style>
  </head><body>${docHtml}
  <script>
    window.addEventListener('load', function(){
      setTimeout(function(){ window.focus(); window.print(); }, 300);
    });
    window.addEventListener('afterprint', function(){ window.close(); });
  </script>
  </body></html>`);
  win.document.close();
}
