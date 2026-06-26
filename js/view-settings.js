// view-settings.js — экран «Настройки».
// Контракт: см. CONTRACT.md. Импорты — относительные, с расширением .js.
import { state, saveSettings } from './store.js';
import { toast, readFileAsDataURL, el } from './util.js';
import { importKpFile } from './storage-kp.js';
import { DOC_LABEL_FIELDS, DOC_LABEL_DEFAULTS } from './doc-templates.js';

// Стили модуля (инъекция один раз, префикс .set-).
function injectStyles(){
  if (document.getElementById('set-styles')) return;
  const s = document.createElement('style');
  s.id = 'set-styles';
  s.textContent = `
    .set-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
    @media(max-width:680px){.set-grid{grid-template-columns:1fr}}
    .set-img{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .set-img .thumb{width:96px;height:64px;border:1px solid var(--line);border-radius:6px;background:var(--surface) center/contain no-repeat;flex:none}
    .set-img .thumb.qr{width:64px}
    .set-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
  `;
  document.head.appendChild(s);
}

// Глубокая копия settings, гарантируем наличие всех вложенных объектов.
function cloneSettings(src){
  const base = src ? JSON.parse(JSON.stringify(src)) : {};
  base.manager = base.manager || {};
  base.about = base.about || {};
  base.footer = base.footer || {};
  base.terms_person = base.terms_person || {};
  base.terms_legal = base.terms_legal || {};
  base.doc_labels = base.doc_labels || {};
  return base;
}

// Создать .field с подписью и инпутом, привязанным к obj[key].
function field(label, obj, key, opts){
  opts = opts || {};
  const wrap = el('<div class="field"></div>');
  wrap.appendChild(el('<label>' + label + '</label>'));
  const input = el(opts.textarea
    ? '<textarea class="input" rows="2"></textarea>'
    : '<input class="input" type="' + (opts.type || 'text') + '">');
  if (opts.placeholder) input.setAttribute('placeholder', opts.placeholder);
  input.value = obj[key] != null ? obj[key] : '';
  input.addEventListener('input', () => {
    obj[key] = (opts.type === 'number') ? Number(input.value) : input.value;
  });
  wrap.appendChild(input);
  return wrap;
}

export function renderSettings(root){
  injectStyles();
  const s = cloneSettings(state.settings);

  root.innerHTML = '';
  root.appendChild(el('<div class="h1">Настройки</div>'));
  root.appendChild(el('<p class="muted">Данные подставляются в новые КП и нижний блок документа.</p>'));

  // ── Профиль менеджера ──────────────────────────────────────────────
  const cMgr = el('<div class="card"></div>');
  cMgr.appendChild(el('<div class="h2">Профиль менеджера</div>'));
  cMgr.appendChild(el('<p class="muted">Авто-подставляется в новые КП.</p>'));
  const gMgr = el('<div class="set-grid"></div>');
  gMgr.appendChild(field('Имя', s.manager, 'name', { placeholder: 'Иван Иванов' }));
  gMgr.appendChild(field('Телефон', s.manager, 'phone', { placeholder: '+7 (___) ___-__-__' }));
  gMgr.appendChild(field('Должность', s.manager, 'position', { placeholder: 'Менеджер отдела продаж' }));
  cMgr.appendChild(gMgr);
  root.appendChild(cMgr);

  // ── Ценообразование ────────────────────────────────────────────────
  const cPrice = el('<div class="card"></div>');
  cPrice.appendChild(el('<div class="h2">Ценообразование</div>'));
  cPrice.appendChild(el('<p class="muted">Наценка по умолчанию для новых позиций. НДС берётся из выбранной организации.</p>'));
  const gPrice = el('<div class="set-grid"></div>');
  gPrice.appendChild(field('Наценка по умолчанию, %', s, 'default_markup', { type: 'number' }));
  cPrice.appendChild(gPrice);
  root.appendChild(cPrice);

  // ── Условия для физлиц (вариант «Премиум») ─────────────────────────
  const cTermsP = el('<div class="card"></div>');
  cTermsP.appendChild(el('<div class="h2">Условия для физлиц</div>'));
  cTermsP.appendChild(el('<p class="muted">Печатаются в варианте «Премиум». В каждом КП можно переопределить (карточка «Условия и сроки»).</p>'));
  const gTermsP = el('<div class="set-grid"></div>');
  gTermsP.appendChild(field('Срок изготовления', s.terms_person, 'produce', { placeholder: '5–7 рабочих дней' }));
  gTermsP.appendChild(field('Гарантия', s.terms_person, 'warranty', { placeholder: 'до 10 лет' }));
  gTermsP.appendChild(field('Условия оплаты', s.terms_person, 'payment', { placeholder: 'предоплата 70%' }));
  cTermsP.appendChild(gTermsP);
  root.appendChild(cTermsP);

  // ── Условия для юрлиц (варианты «КП» и «Счёт-оферта») ───────────────
  const cTermsL = el('<div class="card"></div>');
  cTermsL.appendChild(el('<div class="h2">Условия для юрлиц</div>'));
  cTermsL.appendChild(el('<p class="muted">Печатаются в вариантах «КП» и «Счёт-оферта». В каждом КП можно переопределить.</p>'));
  cTermsL.appendChild(field('Срок изготовления', s.terms_legal, 'produce', { placeholder: '5–7 рабочих дней' }));
  cTermsL.appendChild(field('Гарантийные обязательства', s.terms_legal, 'warranty', { textarea: true, placeholder: 'Гарантия до 10 лет на изделия и монтажные работы…' }));
  cTermsL.appendChild(field('Условия и порядок оплаты', s.terms_legal, 'payment', { textarea: true, placeholder: 'Предоплата 70% — запуск в производство; остаток по факту монтажа…' }));
  root.appendChild(cTermsL);

  // ── Подписи (ярлыки) в документе КП ────────────────────────────────
  const cLabels = el('<div class="card"></div>');
  cLabels.appendChild(el('<div class="h2">Подписи в документе КП</div>'));
  cLabels.appendChild(el('<p class="muted">Переименование подписей в печатном КП: разделы, колонки таблицы, поля и стороны. Пусто — берётся стандартное название. Раздаётся сотрудникам по ссылке.</p>'));
  const gLabels = el('<div class="set-grid"></div>');
  DOC_LABEL_FIELDS.forEach(([key, desc]) => {
    gLabels.appendChild(field(desc, s.doc_labels, key, { placeholder: DOC_LABEL_DEFAULTS[key] || '' }));
  });
  cLabels.appendChild(gLabels);
  root.appendChild(cLabels);

  // ── Данные (импорт .kp) ────────────────────────────────────────────
  const cData = el('<div class="card"></div>');
  cData.appendChild(el('<div class="h2">Данные</div>'));
  cData.appendChild(el('<p class="muted">Импорт ранее экспортированного коммерческого предложения (.kp).</p>'));
  const importBtn = el('<button class="btn">Импорт .kp</button>');
  const importInput = el('<input type="file" accept=".kp,application/json" hidden>');
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    try {
      await importKpFile(file);
      toast('КП импортировано');
    } catch (e) {
      console.error('[import .kp]', e);
      toast('Ошибка импорта файла');
    }
    importInput.value = '';
  });
  cData.appendChild(importBtn);
  cData.appendChild(importInput);
  root.appendChild(cData);

  // ── Кнопка «Сохранить» ─────────────────────────────────────────────
  const bar = el('<div class="toolbar"></div>');
  const saveBtn = el('<button class="btn btn-red">Сохранить</button>');
  saveBtn.addEventListener('click', async () => {
    try {
      await saveSettings(s);
      toast('Сохранено');
    } catch (e) {
      console.error('[save settings]', e);
      toast('Ошибка сохранения');
    }
  });
  bar.appendChild(saveBtn);
  root.appendChild(bar);
}

// Поле загрузки изображения: превью (dataURI) + «Загрузить» + «Убрать».
function imageField(label, obj, key, isQr){
  const wrap = el('<div class="field"></div>');
  wrap.appendChild(el('<label>' + label + '</label>'));
  const box = el('<div class="set-img"></div>');
  const thumb = el('<div class="thumb' + (isQr ? ' qr' : '') + '"></div>');
  const setThumb = () => {
    thumb.style.backgroundImage = obj[key] ? 'url("' + obj[key] + '")' : '';
  };
  setThumb();

  const input = el('<input type="file" accept="image/*" hidden>');
  const loadBtn = el('<button class="btn btn-sm">Загрузить</button>');
  const clearBtn = el('<button class="btn btn-sm">Убрать</button>');

  loadBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      obj[key] = await readFileAsDataURL(file);
      setThumb();
    } catch (e) {
      console.error('[image]', e);
      toast('Не удалось прочитать изображение');
    }
    input.value = '';
  });
  clearBtn.addEventListener('click', () => { obj[key] = ''; setThumb(); });

  const actions = el('<div class="set-actions"></div>');
  actions.appendChild(loadBtn);
  actions.appendChild(clearBtn);
  box.appendChild(thumb);
  box.appendChild(actions);
  box.appendChild(input);
  wrap.appendChild(box);
  return wrap;
}
