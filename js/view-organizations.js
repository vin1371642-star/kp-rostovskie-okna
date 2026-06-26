// Экран «Организации-продавцы» — CRUD реквизитов продавцов для подстановки в КП.
import { dbAll, dbPut, dbDel, uid } from './db.js';
import { toast, modal, escapeHtml, readFileAsDataURL, el, watchPasteImage } from './util.js';
import { state, saveSettings } from './store.js';
import { publishShared, pullShared } from './publish.js';

const VAT_RATES = [0, 5, 7, 22];

// Поля формы: ключ схемы → подпись. brand зашит '=Ростовские окна'.
const FIELDS = [
  { k: 'name',    label: 'Юридическое лицо',      ph: 'ИП Иванов И.И. / ООО «…»', col: 'full' },
  { k: 'inn',     label: 'ИНН',                   ph: '6100000000' },
  { k: 'kpp',     label: 'КПП',                   ph: '610001001' },
  { k: 'ogrn',    label: 'ОГРН / ОГРНИП',         ph: '1156100000000' },
  { k: 'address', label: 'Юридический адрес',      ph: 'г. Ростов-на-Дону, …', col: 'full' },
  { k: 'rs',      label: 'Расчётный счёт',         ph: '40802810000000000000' },
  { k: 'bank',    label: 'Банк',                  ph: 'АО «…»', col: 'full' },
  { k: 'bik',     label: 'БИК',                   ph: '046015000' },
  { k: 'ks',      label: 'Корр. счёт',            ph: '30101810000000000000' },
  { k: 'phone',   label: 'Телефон',               ph: '+7 863 000-00-00' },
  { k: 'email',   label: 'E-mail',                ph: 'info@example.ru' },
  // Руководитель (для подписи в счёте-оферте; для ООО должность выводится у подписи). Необязательно.
  { k: 'director_title', label: 'Должность руководителя', ph: 'Генеральный директор' },
  { k: 'director_name',  label: 'ФИО руководителя',       ph: 'Иванов Иван Иванович' },
];

const STYLE_ID = 'org-view-style';
function injectStyle(){
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    .org-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
    .org-card{display:flex;flex-direction:column;gap:0}
    .org-card .org-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}
    .org-card .org-name{font-family:var(--head);font-weight:700;font-size:16px;line-height:1.15;color:var(--ink)}
    .org-card .org-brand{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-top:2px}
    .org-req{font-size:12.5px;color:var(--ink);line-height:1.55}
    .org-req .r{display:flex;gap:6px}
    .org-req .r b{color:var(--muted);font-weight:600;min-width:42px;flex:none}
    .org-req .r.todo span{color:var(--warn)}
    .org-imgs{display:flex;gap:14px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
    .org-imgs figure{margin:0;text-align:center}
    .org-imgs figcaption{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-top:4px}
    .org-imgs img{display:block;max-height:64px;max-width:120px;object-fit:contain;border:1px solid var(--line);border-radius:6px;background:#fff;padding:4px}
    .org-actions{display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
    .org-actions .spacer{flex:1}
    .modal .file-pick{display:flex;align-items:center;gap:12px}
    .modal .file-pick .prev{width:84px;height:60px;border:1px dashed #d8d6d2;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--surface);flex:none}
    .modal .file-pick .prev img{max-width:100%;max-height:100%;object-fit:contain}
    .modal .file-pick .prev span{font-size:10px;color:var(--muted)}
  `;
  document.head.appendChild(s);
}

function isTodo(v){ return String(v || '').trim().toUpperCase() === 'TODO'; }
function reqLine(label, value){
  const todo = isTodo(value);
  const v = value == null || value === '' ? '—' : value;
  return `<div class="r${todo ? ' todo' : ''}"><b>${escapeHtml(label)}</b><span>${escapeHtml(todo ? 'TODO — заполнить' : v)}</span></div>`;
}

function renderCard(o){
  const vatLabel = `НДС ${Number(o.vat_rate) || 0}%`;
  const imgs = [];
  if (o.stamp_img) imgs.push(`<figure><img src="${escapeHtml(o.stamp_img)}" alt="Печать"><figcaption>Печать</figcaption></figure>`);
  if (o.signature_img) imgs.push(`<figure><img src="${escapeHtml(o.signature_img)}" alt="Подпись"><figcaption>Подпись</figcaption></figure>`);
  const imgsHtml = imgs.length ? `<div class="org-imgs">${imgs.join('')}</div>` : '';

  return el(`
    <div class="card org-card" data-id="${escapeHtml(o.id)}">
      <div class="org-top">
        <div>
          <div class="org-name">${escapeHtml(o.name || 'Без названия')}</div>
          <div class="org-brand">${escapeHtml(o.brand || 'Ростовские окна')}</div>
        </div>
        <span class="pill">${escapeHtml(vatLabel)}</span>
      </div>
      <div class="org-req">
        ${reqLine('ИНН', o.inn)}
        ${o.kpp ? reqLine('КПП', o.kpp) : ''}
        ${reqLine('ОГРН', o.ogrn)}
        ${reqLine('Адрес', o.address)}
        ${reqLine('Р/с', o.rs)}
        ${reqLine('Банк', o.bank)}
        ${reqLine('БИК', o.bik)}
        ${o.ks ? reqLine('К/с', o.ks) : ''}
        ${reqLine('Тел.', o.phone)}
        ${reqLine('Email', o.email)}
        ${(o.director_name || o.director_title) ? reqLine('Рук-ль', [o.director_title, o.director_name].filter(Boolean).join(' ')) : ''}
      </div>
      ${imgsHtml}
      <div class="org-actions">
        <button class="btn btn-sm" data-act="edit">Редактировать</button>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-act="del">Удалить</button>
      </div>
    </div>
  `);
}

function fieldHtml(f, o){
  const val = o[f.k] == null ? '' : o[f.k];
  return `
    <div class="field ${f.col === 'full' ? '' : 'col'}">
      <label>${escapeHtml(f.label)}</label>
      <input class="input" name="${f.k}" value="${escapeHtml(val)}" placeholder="${escapeHtml(f.ph || '')}">
    </div>`;
}

function openForm(o, onSaved){
  const isNew = !o;
  const data = Object.assign(
    { id: '', name: '', brand: 'Ростовские окна', inn: '', kpp: '', ogrn: '', address: '',
      rs: '', bank: '', bik: '', ks: '', phone: '', email: '', director_title: '', director_name: '', vat_rate: 5,
      stamp_img: '', signature_img: '', logo_color: '', logo_white: '' },
    o || {}
  );

  // Группируем поля по строкам: full на всю ширину, остальные парами.
  let body = '';
  let buffer = [];
  const flush = () => { if (buffer.length){ body += `<div class="row">${buffer.join('')}</div>`; buffer = []; } };
  for (const f of FIELDS){
    if (f.col === 'full'){ flush(); body += fieldHtml(f, data); }
    else { buffer.push(fieldHtml(f, data)); if (buffer.length === 2) flush(); }
  }
  flush();

  const vatOptions = VAT_RATES.map(r =>
    `<option value="${r}"${Number(data.vat_rate) === r ? ' selected' : ''}>${r}%</option>`).join('');

  const imgPicker = (key, label) => `
    <div class="field col">
      <label>${escapeHtml(label)}</label>
      <div class="file-pick">
        <div class="prev" data-prev="${key}">
          ${data[key] ? `<img src="${escapeHtml(data[key])}" alt="">` : '<span>нет</span>'}
        </div>
        <div>
          <input type="file" accept="image/*" name="${key}" class="input" style="border:none;padding:0">
          ${data[key] ? `<button type="button" class="btn btn-sm" data-clear="${key}" style="margin-top:6px">Убрать</button>` : ''}
        </div>
      </div>
    </div>`;

  const bg = modal(`
    <div class="h2">${isNew ? 'Новая организация' : 'Редактирование организации'}</div>
    <form id="org-form">
      ${body}
      <div class="row">
        <div class="field col">
          <label>Ставка НДС</label>
          <select class="select" name="vat_rate">${vatOptions}</select>
        </div>
        <div class="col"></div>
      </div>
      <div class="row">
        ${imgPicker('stamp_img', 'Печать (файл или Ctrl+V)')}
        ${imgPicker('signature_img', 'Подпись (файл или Ctrl+V)')}
      </div>
      <div class="toolbar" style="margin:18px 0 0;justify-content:flex-end">
        <button type="button" class="btn" data-cancel>Отмена</button>
        <button type="submit" class="btn btn-red">Сохранить</button>
      </div>
    </form>
  `);

  const form = bg.querySelector('#org-form');

  // Превью/загрузка изображений.
  form.querySelectorAll('input[type=file]').forEach(inp => {
    inp.addEventListener('change', async e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        data[inp.name] = await readFileAsDataURL(file);
        const prev = form.querySelector(`[data-prev="${inp.name}"]`);
        if (prev) prev.innerHTML = `<img src="${data[inp.name]}" alt="">`;
      } catch { toast('Не удалось прочитать файл'); }
    });
  });
  form.querySelectorAll('[data-clear]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-clear');
      data[key] = '';
      const prev = form.querySelector(`[data-prev="${key}"]`);
      if (prev) prev.innerHTML = '<span>нет</span>';
      btn.remove();
    });
  });

  // Вставка печати/подписи через Ctrl+V и перетаскивание (как для эскизов).
  let activeImgKey = null;
  const setImg = (key, dataURI) => {
    data[key] = dataURI;
    const prev = form.querySelector(`[data-prev="${key}"]`);
    if (prev) prev.innerHTML = `<img src="${dataURI}" alt="">`;
  };
  const setActive = key => {
    activeImgKey = key;
    form.querySelectorAll('.prev').forEach(p => {
      p.style.outline = p.getAttribute('data-prev') === key ? '2px solid var(--red)' : 'none';
    });
  };
  form.querySelectorAll('.prev').forEach(prev => {
    const key = prev.getAttribute('data-prev');
    prev.setAttribute('tabindex', '0');
    prev.style.cursor = 'pointer';
    prev.title = 'Кликните и нажмите Ctrl+V, либо перетащите файл';
    prev.addEventListener('click', () => setActive(key));
    prev.addEventListener('focus', () => setActive(key));
    prev.addEventListener('dragover', e => e.preventDefault());
    prev.addEventListener('drop', e => {
      e.preventDefault();
      const f = [...(e.dataTransfer.files || [])].find(x => x.type.indexOf('image') === 0);
      if (f) readFileAsDataURL(f).then(d => setImg(key, d));
    });
  });
  const stopOrgPaste = watchPasteImage(d => {
    if (activeImgKey) setImg(activeImgKey, d);
    else toast('Сначала кликните «Печать» или «Подпись», затем Ctrl+V');
  });
  const moOrg = new MutationObserver(() => {
    if (!document.body.contains(bg)) { stopOrgPaste(); moOrg.disconnect(); }
  });
  moOrg.observe(document.body, { childList: true });

  bg.querySelector('[data-cancel]').addEventListener('click', () => bg.remove());

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    for (const f of FIELDS) data[f.k] = String(fd.get(f.k) || '').trim();
    data.vat_rate = Number(fd.get('vat_rate')) || 0;
    data.brand = 'Ростовские окна';
    if (!data.id) data.id = uid();
    if (!data.name){ toast('Укажите юридическое лицо'); return; }
    try {
      await dbPut('organizations', data);
      bg.remove();
      toast(isNew ? 'Организация добавлена' : 'Сохранено');
      onSaved && onSaved();
    } catch { toast('Ошибка сохранения'); }
  });
}

// Карточка «Публикация по ссылке» (пароль + опубликовать + получить).
function buildPublishCard(host){
  const s = Object.assign({ access_password: '', published_version: 0 }, state.settings || {});
  host.innerHTML = `
    <div class="card">
      <div class="h2">Публикация по ссылке</div>
      <p class="muted">Общие данные (организации, каталог, основания, настройки, клиенты) раздаются сотрудникам под паролем. КП у сотрудников при обновлении сохраняются.</p>
      <div class="field" style="max-width:340px"><label>Пароль доступа</label><input class="input" id="pub-pwd" value="${escapeHtml(s.access_password || '')}" placeholder="придумайте пароль"></div>
      <p class="muted">Текущая версия публикации: <b id="pub-ver">v${Number(s.published_version) || 0}</b></p>
      <div class="toolbar">
        <button class="btn btn-red" id="pub-do">🔄 Опубликовать по ссылке</button>
        <span class="muted" id="pub-status"></span>
      </div>
      <hr style="border:none;border-top:1px solid #EDEDED;margin:14px 0">
      <p class="muted">Получить обновление по ссылке (КП у вас сохранятся):</p>
      <div class="toolbar">
        <select class="input" id="pull-mode" style="max-width:220px" title="Как применить обновление каталога">
          <option value="replace">Заменить каталог целиком</option>
          <option value="add">Только добавить новое</option>
        </select>
        <button class="btn" id="pub-pull">Получить обновление</button>
      </div>
      <p class="muted" style="font-size:12px">«Заменить» — каталог и организации станут как у администратора. «Добавить новое» — ваши правки сохранятся, добавятся только новые позиции.</p>
    </div>`;
  const pwd = host.querySelector('#pub-pwd');
  const verEl = host.querySelector('#pub-ver');
  const status = host.querySelector('#pub-status');
  host.querySelector('#pub-do').addEventListener('click', async () => {
    const pw = pwd.value.trim();
    if (!pw){ toast('Задайте пароль доступа'); return; }
    status.textContent = 'Публикую…';
    try {
      const cur = Object.assign({}, state.settings, { access_password: pw }); cur.id = 'app';
      await saveSettings(cur);
      const v = await publishShared(pw);
      verEl.textContent = 'v' + v; status.textContent = 'Опубликовано · v' + v;
      toast('Опубликовано по ссылке: v' + v);
    } catch (e){ console.error('[publish]', e); status.textContent = 'Ошибка'; toast(e.message || 'Ошибка публикации'); }
  });
  host.querySelector('#pub-pull').addEventListener('click', async () => {
    const pw = pwd.value.trim();
    if (!pw){ toast('Введите пароль доступа'); return; }
    const mode = (host.querySelector('#pull-mode') || {}).value || 'replace';
    status.textContent = 'Получаю…';
    try {
      const v = await pullShared(pw, mode);
      status.textContent = 'Обновлено · v' + v;
      toast('Данные обновлены: v' + v + ' — перезагрузка…');
      setTimeout(() => location.reload(), 900);
    } catch (e){ console.error('[pull]', e); status.textContent = 'Ошибка'; toast(e.message || 'Не удалось обновить'); }
  });
}

// Карточка «Пароль администратора» — отдельный пароль расширенного режима. НЕ раздаётся.
function buildAdminPasswordCard(host){
  const cur = state.settings || {};
  host.innerHTML = `
    <div class="card">
      <div class="h2">Пароль администратора</div>
      <p class="muted">Отдельный пароль для расширенного режима (полный расчёт и редактирование формул во вкладке «Расчёт скидки»). Отличается от пароля публикации и НЕ раздаётся сотрудникам.</p>
      <div class="field" style="max-width:340px"><label>Пароль администратора</label><input class="input" id="adm-pwd" value="${escapeHtml(cur.admin_password || '')}" placeholder="придумайте пароль"></div>
      <div class="toolbar"><button class="btn btn-red" id="adm-save">Сохранить пароль</button><span class="muted" id="adm-status"></span></div>
    </div>`;
  host.querySelector('#adm-save').addEventListener('click', async () => {
    const pw = host.querySelector('#adm-pwd').value.trim();
    const s = Object.assign({}, state.settings, { admin_password: pw }); s.id = 'app';
    try { await saveSettings(s); host.querySelector('#adm-status').textContent = 'Сохранено'; toast('Пароль администратора сохранён'); }
    catch (e){ console.error('[admin pwd]', e); toast('Ошибка сохранения'); }
  });
}

// Карточка «Низ КП — оформление» (блок о компании + подвал). Раздаётся по ссылке.
function buildBrandingCard(host){
  const s = JSON.parse(JSON.stringify(state.settings || {}));
  s.about = s.about || {}; s.footer = s.footer || {};
  const fld = (label, obj, key, opts) => {
    opts = opts || {};
    const w = el(`<div class="field"><label>${escapeHtml(label)}</label></div>`);
    const inp = el(opts.textarea ? '<textarea class="input" rows="2"></textarea>' : '<input class="input">');
    if (opts.ph) inp.setAttribute('placeholder', opts.ph);
    inp.value = obj[key] != null ? obj[key] : '';
    inp.addEventListener('input', () => { obj[key] = inp.value; });
    w.appendChild(inp); return w;
  };
  const imgFld = (label, obj, key) => {
    const w = el(`<div class="field"><label>${escapeHtml(label)}</label></div>`);
    const box = el('<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"></div>');
    const thumb = el('<div style="width:90px;height:60px;border:1px solid var(--line);border-radius:6px;background:var(--surface) center/contain no-repeat;flex:none"></div>');
    const setThumb = () => { thumb.style.backgroundImage = obj[key] ? `url("${obj[key]}")` : ''; };
    setThumb();
    const file = el('<input type="file" accept="image/*" hidden>');
    const load = el('<button class="btn btn-sm">Загрузить</button>');
    const clear = el('<button class="btn btn-sm">Убрать</button>');
    load.onclick = () => file.click();
    file.onchange = async () => { const f = file.files && file.files[0]; if (!f) return; try { obj[key] = await readFileAsDataURL(f); setThumb(); } catch { toast('Не удалось прочитать'); } file.value = ''; };
    clear.onclick = () => { obj[key] = ''; setThumb(); };
    const acts = el('<div style="display:flex;gap:8px"></div>'); acts.appendChild(load); acts.appendChild(clear);
    box.appendChild(thumb); box.appendChild(acts); box.appendChild(file); w.appendChild(box); return w;
  };
  host.innerHTML = '';
  const card = el('<div class="card"></div>');
  card.appendChild(el('<div class="h2">Низ КП — оформление</div>'));
  card.appendChild(el('<p class="muted">Блок «о компании» и подвал документа КП. Раздаётся сотрудникам по ссылке.</p>'));
  card.appendChild(el('<div style="font-weight:600;margin:8px 0 4px">Блок о компании</div>'));
  card.appendChild(fld('Слоган', s.about, 'slogan', { textarea: true, ph: 'Мы существуем, чтобы…' }));
  const g1 = el('<div class="org-grid"></div>');
  g1.appendChild(fld('Лет на рынке', s.about, 'years', { ph: 'более 15 лет' }));
  g1.appendChild(fld('Объектов', s.about, 'objects', { ph: '9 000+' }));
  g1.appendChild(fld('Рейтинг', s.about, 'rating', { ph: '5,0' }));
  g1.appendChild(fld('Отзывы', s.about, 'reviews', { ph: '437 оценок' }));
  card.appendChild(g1);
  card.appendChild(imgFld('Фото (hero)', s.about, 'hero_img'));
  card.appendChild(imgFld('QR-код', s.about, 'qr_img'));
  card.appendChild(el('<div style="font-weight:600;margin:14px 0 4px">Подвал</div>'));
  const g2 = el('<div class="org-grid"></div>');
  g2.appendChild(fld('Бренд', s.footer, 'brand', { ph: 'РОСТОВСКИЕ ОКНА' }));
  g2.appendChild(fld('Слоган (tagline)', s.footer, 'tagline', { ph: 'Светопрозрачные конструкции под ключ' }));
  g2.appendChild(fld('Сайт', s.footer, 'site', { ph: 'rostovskie-okna.ru' }));
  g2.appendChild(fld('Телефон', s.footer, 'phone', { ph: '+7 988 …' }));
  card.appendChild(g2);
  const bar = el('<div class="toolbar" style="margin-top:12px"></div>');
  const save = el('<button class="btn btn-red">Сохранить оформление</button>');
  save.onclick = async () => {
    const cur = Object.assign({}, state.settings, { about: s.about, footer: s.footer }); cur.id = 'app';
    try { await saveSettings(cur); toast('Сохранено'); } catch (e){ console.error('[branding]', e); toast('Ошибка сохранения'); }
  };
  bar.appendChild(save); card.appendChild(bar);
  host.appendChild(card);
}

export async function renderOrganizations(root){
  injectStyle();
  const epoch = root.__epoch;
  const repaint = () => renderOrganizations(root);

  let orgs = [];
  try { orgs = await dbAll('organizations'); }
  catch { orgs = []; }
  if (root.__epoch !== epoch) return; // навигация ушла дальше
  orgs.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));

  root.innerHTML = `
    <div class="h1">Админ</div>
    <p class="muted" style="margin:0 0 16px">
      Организации-продавцы (реквизиты, печати, подписи), пароль доступа и публикация общих данных по ссылке.
      Реквизиты подставляются в КП по выбору продавца в конструкторе.
    </p>
    <div id="pub-card"></div>
    <div id="admin-pwd-card"></div>
    <div class="h2" style="margin:18px 0 8px">Организации-продавцы</div>
    <div class="toolbar">
      <button class="btn btn-red" id="org-add">+ Организация</button>
    </div>
    <div id="org-list"></div>
    <div id="branding-card"></div>
  `;

  buildPublishCard(root.querySelector('#pub-card'));
  buildAdminPasswordCard(root.querySelector('#admin-pwd-card'));
  buildBrandingCard(root.querySelector('#branding-card'));
  root.querySelector('#org-add').addEventListener('click', () => openForm(null, repaint));

  const list = root.querySelector('#org-list');
  if (!orgs.length){
    list.innerHTML = `
      <div class="card empty">
        <div class="big">Пока нет организаций-продавцов</div>
        <p class="muted">Добавьте юрлицо с реквизитами, ставкой НДС, печатью и подписью.</p>
      </div>`;
    return;
  }

  const grid = el('<div class="org-grid"></div>');
  orgs.forEach(o => {
    const card = renderCard(o);
    card.querySelector('[data-act="edit"]').addEventListener('click', () => openForm(o, repaint));
    card.querySelector('[data-act="del"]').addEventListener('click', async () => {
      if (!confirm(`Удалить организацию «${o.name || 'без названия'}»?`)) return;
      try { await dbDel('organizations', o.id); toast('Удалено'); repaint(); }
      catch { toast('Ошибка удаления'); }
    });
    grid.appendChild(card);
  });
  list.appendChild(grid);
}
