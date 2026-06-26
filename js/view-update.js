// view-update.js — экран «Обновить данные» для сотрудников.
// Получение общего слоя (каталог, организации, настройки) по ссылке. КП сохраняются.
import { el, toast } from './util.js';
import { state } from './store.js';
import { pullShared } from './publish.js';

export function renderUpdate(root){
  root.innerHTML = '';
  root.appendChild(el('<div class="h1">Обновить данные</div>'));
  root.appendChild(el('<p class="muted" style="margin:0 0 16px">Получить актуальный каталог, организации и настройки по ссылке. Ваши КП при этом сохраняются.</p>'));

  const card = el('<div class="card" style="max-width:480px"></div>');
  card.innerHTML = `
    <div class="field"><label>Пароль доступа</label>
      <input class="input" id="up-pwd" value="${escAttr((state.settings && state.settings.access_password) || '')}" placeholder="пароль (выдаёт руководитель)"></div>
    <div class="field"><label>Режим</label>
      <select class="select" id="up-mode">
        <option value="replace">Заменить каталог целиком</option>
        <option value="add">Только добавить новое</option>
      </select></div>
    <div class="toolbar"><button class="btn btn-red" id="up-do">Получить обновление</button><span class="muted" id="up-status"></span></div>
    <p class="muted" style="font-size:12px">«Заменить» — каталог и организации станут как у руководителя (рекомендуется при первом запуске). «Добавить новое» — ваши правки сохранятся, добавятся только новые позиции.</p>`;
  root.appendChild(card);

  const status = card.querySelector('#up-status');
  card.querySelector('#up-do').addEventListener('click', async () => {
    const pw = card.querySelector('#up-pwd').value.trim();
    if (!pw){ toast('Введите пароль доступа'); return; }
    const mode = card.querySelector('#up-mode').value;
    status.textContent = 'Получаю…';
    try {
      const v = await pullShared(pw, mode);
      status.textContent = 'Обновлено · v' + v;
      toast('Данные обновлены: v' + v + ' — перезагрузка…');
      setTimeout(() => location.reload(), 900);
    } catch (e){
      console.error('[update]', e);
      status.textContent = 'Ошибка';
      toast(e.message || 'Не удалось обновить');
    }
  });
}

function escAttr(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
