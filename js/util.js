// Утилиты — общий контракт. НЕ редактировать в модулях-агентах.
export function num(n){ return (Math.round(Number(n) || 0)).toLocaleString('ru-RU'); }
export function money(n){ return num(n) + ' ₽'; }
// Денежный формат с копейками (2 знака) — для НДС и итога с НДС.
export function money2(n){ return (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽'; }
export function fmtDate(d){ const x = d ? new Date(d) : new Date(); return isNaN(x) ? '' : x.toLocaleDateString('ru-RU'); }
export function todayISO(){ return new Date().toISOString().slice(0,10); }
export function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function el(html){ const t = document.createElement('template'); t.innerHTML = String(html).trim(); return t.content.firstElementChild; }
export function toast(msg){
  let t = document.getElementById('toast');
  if (!t){ t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'show';
  clearTimeout(t._h); t._h = setTimeout(() => { t.className = ''; }, 2200);
}
export function modal(innerHTML){
  const bg = el('<div class="modal-bg"><div class="modal"></div></div>');
  bg.querySelector('.modal').innerHTML = innerHTML;
  // Закрывать по клику на фон ТОЛЬКО если нажатие началось на фоне.
  // Иначе выделение текста (мышь отпущена на фоне) ошибочно закрывало окно.
  let downOnBg = false;
  bg.addEventListener('mousedown', e => { downOnBg = (e.target === bg); });
  bg.addEventListener('click', e => { if (e.target === bg && downOnBg) close(); });
  // Закрытие по Escape — только верхнюю (последнюю) модалку в стеке.
  function onKey(e){
    if (e.key !== 'Escape') return;
    const all = document.querySelectorAll('.modal-bg');
    if (all[all.length - 1] === bg) close();
  }
  function close(){ document.removeEventListener('keydown', onKey); bg.remove(); }
  document.addEventListener('keydown', onKey);
  // Если модалку убрали в обход close() (прямой bg.remove() у кнопок) — снять слушатель.
  const mo = new MutationObserver(() => {
    if (!document.body.contains(bg)){ document.removeEventListener('keydown', onKey); mo.disconnect(); }
  });
  mo.observe(document.body, { childList: true });
  document.body.appendChild(bg);
  return bg;
}

// Слушает вставку изображения из буфера (Ctrl+V) на уровне документа.
// onImage(dataURI) вызывается при вставке картинки. Возвращает функцию остановки.
export function watchPasteImage(onImage){
  function handler(e){
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++){
      const it = items[i];
      if (it.type && it.type.indexOf('image') === 0){
        const f = it.getAsFile();
        if (f){ readFileAsDataURL(f).then(onImage); e.preventDefault(); }
        return;
      }
    }
  }
  document.addEventListener('paste', handler);
  return () => document.removeEventListener('paste', handler);
}
export function readFileAsDataURL(file){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
export function download(filename, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
