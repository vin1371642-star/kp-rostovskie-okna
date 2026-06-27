// doc-templates.js — рендер готового документа КП «Ростовские окна».
// Экспорт: renderDocument(kp, items, settings, org) → строка HTML.
// Три варианта по kp.doc_variant: 'premium' (физлицо), 'kp' (юрлицо), 'oferta'.
// Вёрстка воспроизводит дизайн-эталон _design_kp/KP-Rostovskie-okna.dc.html
// чистым HTML с подстановкой реальных данных. Печать-CSS — внутри document-style.
import { computeKpTotals } from './calc.js';
import { amountInWords } from './amount-in-words.js';
import { money, money2, num, fmtDate, escapeHtml } from './util.js';

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

const e = escapeHtml;

// Текст с поддержкой переноса строк (\n → <br>), безопасно экранированный.
function eMulti(s) {
  return e(s).replace(/\r?\n/g, '<br>');
}

// Непустое значение или запасной вариант.
function val(v, fallback) {
  const s = v == null ? '' : String(v).trim();
  return s || (fallback == null ? '' : fallback);
}

// Настраиваемые подписи (ярлыки) документа. Переопределяются в Настройках (settings.doc_labels).
const DOC_LABELS = {
  secProducts: 'Продукция', secMaterials: 'Дополнительные материалы', secServices: 'Услуги',
  addr: 'Адрес объекта', valid: 'Действительно до',
  seller: 'Продавец', buyer: 'Покупатель',
  termProduce: 'Срок изготовления', termWarranty: 'Гарантия', termPayment: 'Условия оплаты',
  colNum: '№', colName: 'Наименование / комплектация', colNameService: 'Наименование',
  colSketch: 'Эскиз', colSize: 'Размер, мм', colBasis: 'Основание',
  colQty: 'Кол-во', colUnit: 'Ед.', colPrice: 'Цена, ₽', colSum: 'Сумма, ₽',
};
// Метки, заданные в настройках, имеют приоритет (пустые — запасной вариант).
let _labels = DOC_LABELS;
function L(key){ const v = _labels[key]; return (v != null && String(v).trim()) ? v : (DOC_LABELS[key] || ''); }
// Список ярлыков для редактора в Настройках: ключ + человекочитаемое описание.
export const DOC_LABEL_FIELDS = [
  ['secProducts', 'Раздел «Продукция»'], ['secMaterials', 'Раздел «Доп. материалы»'], ['secServices', 'Раздел «Услуги»'],
  ['addr', 'Адрес объекта'], ['valid', 'Действительно до'],
  ['seller', 'Сторона «Продавец»'], ['buyer', 'Сторона «Покупатель»'],
  ['termProduce', 'Условия: срок изготовления'], ['termWarranty', 'Условия: гарантия'], ['termPayment', 'Условия: оплата'],
  ['colNum', 'Колонка №'], ['colName', 'Колонка «Наименование» (продукция)'], ['colNameService', 'Колонка «Наименование» (услуги)'],
  ['colSketch', 'Колонка «Эскиз»'], ['colSize', 'Колонка «Размер»'], ['colBasis', 'Колонка «Основание»'],
  ['colQty', 'Колонка «Кол-во»'], ['colUnit', 'Колонка «Ед.»'], ['colPrice', 'Колонка «Цена»'], ['colSum', 'Колонка «Сумма»'],
];
export const DOC_LABEL_DEFAULTS = DOC_LABELS;

// Блок условий (Срок изготовления / Гарантия / Условия оплаты) из kp.terms.
// Единый для всех вариантов документа, поэтому правки условий всегда видны в печати.
function termsGrid(terms) {
  const t = terms || {};
  const col = (label, value) =>
    `<div><div style="font-family:Montserrat,sans-serif;font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;color:#9a9895;font-weight:700;margin-bottom:7px;">${label}</div><span style="display:inline-block;font-family:Montserrat,sans-serif;font-size:13px;font-weight:700;color:#2B2A29;padding:0 6px;border-radius:2px;">${value}</span></div>`;
  return `<div style="padding:24px 16mm 0;">
    <div data-keep style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;border:1px solid #EDEDED;padding:16px 20px;background:#fcfbfa;">
      ${col(e(L('termProduce')), e(val(t.produce, '5–7 рабочих дней')))}
      ${col(e(L('termWarranty')), e(val(t.warranty, 'до 10 лет')))}
      ${col(e(L('termPayment')), eMulti(val(t.payment, 'предоплата 70%')))}
    </div>
  </div>`;
}

// Условия для печати: переопределение из КП (kp.terms) → значения из Настроек
// (terms_person для физлиц, terms_legal для юрлиц) → запасной вариант в шаблоне.
function effectiveTerms(kp, settings, kind) {
  const over = (kp && kp.terms) || {};
  const def = (settings && settings[kind === 'legal' ? 'terms_legal' : 'terms_person']) || {};
  const pick = f => val(over[f]) || val(def[f]) || '';
  return { produce: pick('produce'), warranty: pick('warranty'), payment: pick('payment') };
}

// Блок условий для юрлиц/оферты — формальные формулировки (прозой).
function legalTermsBlock(terms) {
  const t = terms || {};
  const h3 = 'font-family:Cuprum,sans-serif;font-weight:700;font-size:13px;text-transform:uppercase;color:#2B2A29;letter-spacing:.03em;margin:0 0 6px;';
  const p = 'font-family:Montserrat,sans-serif;font-size:10.5px;line-height:1.6;color:#5a5856;margin:0;';
  return `<div style="padding:20px 16mm 0;">
    <div data-keep style="display:grid;grid-template-columns:1fr 1fr;gap:28px;">
      <div>
        <h3 style="${h3}">Срок и условия оплаты</h3>
        <p style="${p}">Срок изготовления: ${e(val(t.produce, '5–7 рабочих дней'))}.<br>${eMulti(val(t.payment, 'Предоплата 70% — основание для запуска в производство. Остаток 30% — по факту доставки и монтажа. Оплата на расчётный счёт Продавца.'))}</p>
      </div>
      <div>
        <h3 style="${h3}">Гарантийные обязательства</h3>
        <p style="${p}">${eMulti(val(t.warranty, 'Гарантия до 10 лет на изделия и монтажные работы при соблюдении правил эксплуатации. Сервисное обслуживание — по заявке.'))}</p>
      </div>
    </div>
  </div>`;
}

// Дата прописью «25 июня 2026» (для строки № … от …).
const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля',
  'августа','сентября','октября','ноября','декабря'];
function dateLong(d) {
  const x = d ? new Date(d) : new Date();
  if (isNaN(x)) return '';
  return x.getDate() + ' ' + MONTHS_GEN[x.getMonth()] + ' ' + x.getFullYear();
}

// Реквизиты организации одной строкой-блоком (для шапки premium/kp).
function orgContactLines(org) {
  const o = org || {};
  const lines = [];
  const idParts = [];
  if (val(o.inn)) idParts.push('ИНН ' + e(o.inn));
  if (val(o.kpp)) idParts.push('КПП ' + e(o.kpp));
  if (val(o.ogrn)) idParts.push('ОГРН ' + e(o.ogrn));
  if (idParts.length) lines.push(idParts.join(' · '));
  if (val(o.address)) lines.push(e(o.address));
  const contact = [];
  if (val(o.phone)) contact.push(e(o.phone));
  if (val(o.email)) contact.push(e(o.email));
  if (contact.length) lines.push(contact.join(' · '));
  return lines;
}

// Полные банковские реквизиты организации (для оферты), массив строк HTML.
function orgFullRequisites(o) {
  const x = o || {};
  const lines = [];
  const innKpp = [];
  if (val(x.inn)) innKpp.push('ИНН: ' + e(x.inn));
  if (val(x.kpp)) innKpp.push('КПП: ' + e(x.kpp));
  if (innKpp.length) lines.push(innKpp.join(' / '));
  if (val(x.ogrn)) lines.push('ОГРН: ' + e(x.ogrn));
  if (val(x.address)) lines.push('Адрес: ' + e(x.address));
  if (val(x.rs)) lines.push('Р/с: ' + e(x.rs));
  if (val(x.bank)) lines.push('Банк: ' + e(x.bank));
  const bikKs = [];
  if (val(x.bik)) bikKs.push('БИК: ' + e(x.bik));
  if (val(x.ks)) bikKs.push('К/с: ' + e(x.ks));
  if (bikKs.length) lines.push(bikKs.join(' · '));
  const contact = [];
  if (val(x.phone)) contact.push(e(x.phone));
  if (val(x.email)) contact.push(e(x.email));
  if (contact.length) lines.push(contact.join(' · '));
  return lines;
}

// Полные реквизиты покупателя-юрлица (buyer) для оферты, массив строк.
function buyerFullRequisites(b) {
  const x = b || {};
  const lines = [];
  const innKpp = [];
  if (val(x.inn)) innKpp.push('ИНН: ' + e(x.inn));
  if (val(x.kpp)) innKpp.push('КПП: ' + e(x.kpp));
  if (innKpp.length) lines.push(innKpp.join(' / '));
  if (val(x.ogrn)) lines.push('ОГРН: ' + e(x.ogrn));
  if (val(x.address)) lines.push('Адрес: ' + e(x.address));
  if (val(x.rs)) lines.push('Р/с: ' + e(x.rs));
  if (val(x.bank)) lines.push('Банк: ' + e(x.bank));
  const bikKs = [];
  if (val(x.bik)) bikKs.push('БИК: ' + e(x.bik));
  if (val(x.ks)) bikKs.push('К/с: ' + e(x.ks));
  if (bikKs.length) lines.push(bikKs.join(' / '));
  const contact = [];
  if (val(x.phone)) contact.push(e(x.phone));
  if (val(x.email)) contact.push(e(x.email));
  if (contact.length) lines.push(contact.join(' · '));
  return lines;
}

// Размер в формате «1300 × 1400» из size_wh (может быть уже строкой).
function sizeText(s) {
  const v = val(s);
  if (!v) return '—';
  return e(v).replace(/\s*[x×х*]\s*/i, ' × ');
}

// Ячейка эскиза: картинка (sketch_img) либо плейсхолдер-плашка / прочерк.
function sketchCell(item, isService, big) {
  const w = big ? 120 : 110;
  const h = big ? 92 : 84;
  const fz = big ? 10 : 9;
  if (item && val(item.sketch_img)) {
    return `<img src="${e(item.sketch_img)}" alt="эскиз" style="width:${w}px;height:${h}px;object-fit:contain;margin:0 auto;display:block;border:1px solid #e4e1dd;background:#fff;">`;
  }
  if (isService) {
    return `<div style="font-family:Montserrat,sans-serif;font-size:${big ? 11 : 10}px;color:#c4c1bd;">—</div>`;
  }
  return `<div style="width:${w}px;height:${h}px;margin:0 auto;background:repeating-linear-gradient(135deg,#f1efec 0 6px,#e8e5e1 6px 12px);border:1px solid #e4e1dd;display:flex;align-items:center;justify-content:center;font-family:ui-monospace,monospace;font-size:${fz}px;color:#b6b2ae;">эскиз</div>`;
}

// Основание услуги с подсветкой «10% от изделий».
function basisText(basis) {
  const v = val(basis);
  if (!v) return { html: '—', red: false };
  const red = /%/.test(v);
  return { html: e(v), red };
}

// Печать-стили и базовые правила документа (вставляются один раз в документ).
// Используются и в превью, и в окне печати (id фиксирован → не дублируется).
export const DOC_STYLE = `
<style id="rok-doc-style">
@import url('https://fonts.googleapis.com/css2?family=Cuprum:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&display=swap');
.rok-doc, .rok-doc *{ box-sizing:border-box; }
.rok-doc{ width:210mm; margin:0 auto; background:#fff; color:#2B2A29;
  font-family:Montserrat,Arial,sans-serif; }
.rok-doc table{ border-collapse:collapse; }
.rok-doc h1,.rok-doc h2,.rok-doc h3{ margin:0; }
@page{ size:A4; margin:12mm 0; }
@media print{
  html,body{ margin:0; padding:0; background:#fff;
    -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .rok-doc{ width:auto; margin:0; box-shadow:none !important; }
  .rok-doc thead{ display:table-header-group; }
  .rok-doc tr, .rok-doc .keep, .rok-doc [data-keep]{ break-inside:avoid; }
  .rok-doc h1,.rok-doc h2,.rok-doc h3{ break-after:avoid; }
}
</style>`;

// ---------------------------------------------------------------------------
// Таблицы Продукция / Услуги
// ---------------------------------------------------------------------------

// Шапка таблицы. variant: 'premium' (крупнее) | 'legal' (компактнее).
function tableHead(isService, showSketch, variant) {
  const big = variant === 'premium';
  const pad = big ? '10px 8px' : '9px 7px';
  const padL = big ? '10px 10px' : '9px 9px';
  const fz = big ? '10px' : '9.5px';
  const ls = big ? '.05em' : '.04em';
  const th = (extra, align, text) =>
    `<th style="padding:${align === 'left' ? padL : pad};font-family:Cuprum,sans-serif;font-weight:700;font-size:${fz};letter-spacing:${ls};text-transform:uppercase;color:#fff;text-align:${align};${extra}">${text}</th>`;
  const wNo = big ? '32px' : '28px';
  const wSk = big ? '136px' : '126px';
  const wMid = big ? '80px' : '74px';
  const wQty = big ? '50px' : '46px';
  const wUnit = big ? '44px' : '46px';
  const wPrice = big ? '78px' : '76px';
  const wSum = big ? '92px' : '90px';
  const skHide = showSketch ? '' : 'display:none;';
  let cells = '';
  cells += th(`width:${wNo};`, 'center', e(L('colNum')));
  cells += th('', 'left', e(isService ? L('colNameService') : L('colName')));
  cells += th(`width:${wSk};${skHide}`, 'center', e(L('colSketch')));
  cells += th(`width:${wMid};`, 'center', e(isService ? L('colBasis') : L('colSize')));
  cells += th(`width:${wQty};`, 'center', e(L('colQty')));
  cells += th(`width:${wUnit};`, 'center', e(L('colUnit')));
  cells += th(`width:${wPrice};`, 'right', e(L('colPrice')));
  cells += th(`width:${wSum};`, 'right', e(L('colSum')));
  return `<thead><tr style="background:#2B2A29;">${cells}</tr></thead>`;
}

// Строка таблицы.
function tableRow(item, idx, isService, showSketch, variant) {
  const big = variant === 'premium';
  const pad = big ? '12px 8px' : '10px 7px';
  const padL = big ? '12px 10px' : '10px 9px';
  const nameFz = big ? '12.5px' : '11.5px';
  const descrFz = big ? '10.5px' : '10px';
  const cellFz = big ? '12px' : '11.5px';
  const skHide = showSketch ? '' : 'display:none;';
  const bb = 'border-bottom:1px solid #EDEDED;';

  const name = e(val(item.name, 'Изделие'));
  const descr = val(item.descr);
  const qty = num(item.qty == null ? 0 : item.qty);
  const unit = e(val(item.unit, isService ? 'усл.' : 'шт'));
  const price = num(item.price);
  const amount = num(item.amount);

  // Колонка «Размер» (продукция) / «Основание» (услуги).
  let midCell;
  if (isService) {
    const b = basisText(item.basis);
    const color = b.red ? '#B50900;font-weight:600;' : '#9a9895;';
    midCell = `<td style="padding:${pad};${bb}text-align:center;font-family:Montserrat,sans-serif;font-size:${big ? '11px' : '10.5px'};color:${color}vertical-align:top;">${b.html}</td>`;
  } else {
    midCell = `<td style="padding:${pad};${bb}text-align:center;font-family:Montserrat,sans-serif;font-size:${big ? '11.5px' : '11px'};color:#4a4846;vertical-align:top;">${sizeText(item.size_wh)}</td>`;
  }

  const descrHtml = descr
    ? `<div style="font-family:Montserrat,sans-serif;font-size:${descrFz};color:#7a7a78;margin-top:${big ? '3px' : '2px'};line-height:1.45;">${eMulti(descr)}</div>`
    : '';

  return `<tr>
    <td style="padding:${pad};${bb}text-align:center;font-family:Montserrat,sans-serif;font-size:${cellFz};color:#9a9895;vertical-align:top;">${idx}</td>
    <td style="padding:${padL};${bb}vertical-align:top;"><div style="font-family:Montserrat,sans-serif;font-weight:700;font-size:${nameFz};color:#2B2A29;">${name}</div>${descrHtml}</td>
    <td style="padding:${pad};${bb}text-align:center;vertical-align:top;${skHide}">${sketchCell(item, isService, big)}</td>
    ${midCell}
    <td style="padding:${pad};${bb}text-align:center;font-family:Montserrat,sans-serif;font-size:${cellFz};color:#2B2A29;vertical-align:top;">${qty}</td>
    <td style="padding:${pad};${bb}text-align:center;font-family:Montserrat,sans-serif;font-size:${big ? '11.5px' : '11px'};color:#6b6a68;vertical-align:top;">${unit}</td>
    <td style="padding:${padL};${bb}text-align:right;font-family:Montserrat,sans-serif;font-size:${cellFz};color:#2B2A29;white-space:nowrap;font-variant-numeric:tabular-nums;vertical-align:top;">${price}</td>
    <td style="padding:${padL};${bb}text-align:right;font-family:Montserrat,sans-serif;font-weight:700;font-size:${cellFz};color:#2B2A29;white-space:nowrap;font-variant-numeric:tabular-nums;vertical-align:top;">${amount}</td>
  </tr>`;
}

// Итоговая строка раздела.
function sectionTotalRow(label, sum, showSketch, variant) {
  const big = variant === 'premium';
  const pad = big ? '12px 10px' : '11px 9px';
  const labelFz = big ? '13px' : '12px';
  const sumFz = big ? '14px' : '13px';
  // Колонок до «Сумма»: №, Наименование, [Эскиз], Размер/Основание, Кол-во, Ед., Цена = 6 или 7.
  const span = showSketch ? 7 : 6;
  return `<tr style="background:#F6F5F4;">
    <td colspan="${span}" style="padding:${pad};border-top:2px solid #2B2A29;text-align:right;font-family:Cuprum,sans-serif;font-weight:700;font-size:${labelFz};color:#2B2A29;text-transform:uppercase;letter-spacing:.03em;">${e(label)}</td>
    <td style="padding:${pad};border-top:2px solid #2B2A29;text-align:right;font-family:Cuprum,sans-serif;font-weight:700;font-size:${sumFz};color:#2B2A29;white-space:nowrap;font-variant-numeric:tabular-nums;">${num(sum)}</td>
  </tr>`;
}

// Заголовок раздела «Продукция» / «Услуги».
function sectionTitle(text, variant) {
  const big = variant === 'premium';
  const h = big ? '22px' : '20px';
  const fz = big ? '19px' : '17px';
  const mt = big ? '30px' : '24px';
  return `<div style="display:flex;align-items:center;gap:12px;margin:${mt} 0 ${big ? '12px' : '10px'};break-after:avoid;">
    <span style="width:7px;height:${h};background:#B50900;display:inline-block;"></span>
    <span style="font-family:Cuprum,sans-serif;font-weight:700;font-size:${fz};letter-spacing:.02em;color:#2B2A29;text-transform:uppercase;">${e(text)}</span>
    <span style="flex:1;height:1px;background:#EDEDED;"></span>
  </div>`;
}

// Полная таблица раздела (заголовок + thead + строки + итог).
function sectionTable(title, rows, totalLabel, total, isService, showSketch, variant) {
  if (!rows.length) return '';
  let body = '';
  rows.forEach((it, i) => { body += tableRow(it, i + 1, isService, showSketch, variant); });
  body += sectionTotalRow(totalLabel, total, showSketch, variant);
  return sectionTitle(title, variant)
    + `<table style="width:100%;border-collapse:collapse;">${tableHead(isService, showSketch, variant)}<tbody>${body}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Блок подписи + печать (М.П.)
// ---------------------------------------------------------------------------

// Поправка масштаба печати/подписи под реальные PNG конкретных организаций
// (в каждом файле штамп/подпись занимают разную долю картинки → визуально разный размер).
// stamp/sign — множители размера; signDrop — на сколько px опустить подпись
// (компенсация пустого поля снизу в PNG, чтобы чернила лежали на линии).
function orgMediaScale(org) {
  const name = String((org && org.name) || '').toLowerCase();
  if (name.includes('мизанова')) return { stamp: 1.4, sign: 1, signDrop: 0 }; // И.А.: печать крупнее (как у Ростока)
  if (name.includes('мизанов'))  return { stamp: 1.8, sign: 1, signDrop: 0 }; // Р.В.: печать крупнее; подпись — обычный размер
  return { stamp: 1, sign: 1, signDrop: 0 };                                  // Росток и прочие — без поправки
}

function stampBlock(org, size, label) {
  const o = org || {};
  const sc = orgMediaScale(o).stamp;
  // Масштаб печати — через transform: визуально крупнее, но место в разметке (size×size)
  // не меняется, поэтому строки во ВСЕХ КП и у всех организаций выровнены одинаково.
  const tf = sc !== 1 ? `transform:scale(${sc});transform-origin:center center;` : '';
  if (val(o.stamp_img)) {
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:9px;">
      <img src="${e(o.stamp_img)}" alt="Печать" style="width:${size}px;height:${size}px;object-fit:contain;${tf}">
      ${label ? `<div style="font-family:Montserrat,sans-serif;font-size:9px;color:#b6b2ae;letter-spacing:.08em;text-transform:uppercase;">${label}</div>` : ''}
    </div>`;
  }
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:9px;">
    <div style="width:${size}px;height:${size}px;border:2px dashed #cdb4b1;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#c5a8a5;font-family:ui-monospace,Menlo,monospace;font-size:${size > 100 ? 11 : 10}px;">М.П.</div>
    ${label ? `<div style="font-family:Montserrat,sans-serif;font-size:9px;color:#b6b2ae;letter-spacing:.08em;text-transform:uppercase;">${label}</div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// Подвал (на всех вариантах)
// ---------------------------------------------------------------------------

function footerBlock(settings) {
  const f = (settings && settings.footer) || {};
  const brand = val(f.brand, 'РОСТОВСКИЕ ОКНА');
  const tagline = val(f.tagline, 'Светопрозрачные конструкции под ключ');
  const site = val(f.site);
  const phone = val(f.phone);
  const right = [site, phone].filter(Boolean).map(e).join(' · ');
  return `<div data-keep style="border-top:2px solid #B50900;padding:11px 16mm 14px;display:flex;justify-content:space-between;align-items:center;font-family:Montserrat,sans-serif;font-size:10px;color:#8a8884;gap:16px;">
    <span style="font-family:Cuprum,sans-serif;font-weight:700;color:#2B2A29;font-size:11px;letter-spacing:.05em;white-space:nowrap;">${e(brand)}</span>
    <span style="text-align:center;">${e(tagline)}</span>
    <span style="white-space:nowrap;">${right}</span>
  </div>`;
}

// ---------------------------------------------------------------------------
// Блок итогов (общий генератор для premium и legal)
// ---------------------------------------------------------------------------

function totalsBlock(kp, totals, variant) {
  const big = variant === 'premium';
  const line = (label, value, accent) =>
    `<div style="display:flex;justify-content:space-between;padding:${big ? '9px' : '7px'} 0;border-bottom:1px dashed #e2e0dd;">
      <span style="font-family:Montserrat,sans-serif;font-size:${big ? '12.5px' : '12px'};color:#4a4846;">${label}</span>
      <span style="font-family:Montserrat,sans-serif;font-size:${big ? '12.5px' : '12px'};font-weight:600;color:${accent || '#2B2A29'};font-variant-numeric:tabular-nums;">${value}</span>
    </div>`;

  let rows = '';
  // Все суммы — БЕЗ НДС. НДС считается от суммы КП (с учётом скидки) отдельной строкой:
  // Сумма КП без НДС + НДС = Сумма с НДС.
  const hasVat = totals.vatRate > 0;

  if (totals.discount > 0) {
    rows += line('Стоимость без НДС', money(totals.subtotal));
    rows += line(variant === 'premium' ? 'Скидка по предложению' : 'Скидка по договору', '− ' + money(totals.discount), '#B50900');
  }
  if (hasVat) {
    rows += line('Сумма КП без НДС', money(totals.base));
    rows += line('Плюс НДС ' + num(totals.vatRate) + '%', money2(totals.vat), '#B50900');
  } else if (totals.discount > 0) {
    rows += line('Сумма КП без НДС', money(totals.base));
  }

  const totalLabel = hasVat ? 'Сумма с НДС' : 'Всего к оплате';

  return `<div data-keep style="padding:${big ? '26px' : '22px'} 16mm 0;">
    <div data-keep style="display:flex;justify-content:flex-end;">
      <div style="width:380px;">
        ${rows}
        <div style="display:flex;justify-content:space-between;align-items:center;background:#B50900;color:#fff;padding:${big ? '14px 18px' : '13px 18px'};margin-top:8px;">
          <span style="font-family:Cuprum,sans-serif;font-weight:700;font-size:${big ? '14px' : '13px'};text-transform:uppercase;letter-spacing:.03em;">${totalLabel}</span>
          <span style="font-family:Cuprum,sans-serif;font-weight:700;font-size:${big ? '22px' : '21px'};font-variant-numeric:tabular-nums;">${hasVat ? money2(totals.total) : money(totals.total)}</span>
        </div>
      </div>
    </div>
    <div style="margin-top:${big ? '14px' : '12px'};font-family:Montserrat,sans-serif;font-size:11.5px;color:#4a4846;background:#F6F5F4;padding:10px 16px;border-left:3px solid #B50900;">
      <span style="color:#9a9895;">Итого к оплате:</span> <span style="font-weight:600;color:#2B2A29;">${e(amountInWords(totals.total))}</span>
      ${hasVat ? `<div style="margin-top:4px;"><span style="color:#9a9895;">в т.ч. НДС ${num(totals.vatRate)}%:</span> <span style="font-weight:600;color:#2B2A29;">${e(amountInWords(totals.vat))}</span></div>` : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Вариант PREMIUM (физлицо) — тёмная шапка
// ---------------------------------------------------------------------------

function renderPremium(kp, items, settings, org) {
  const o = org || {};
  const about = (settings && settings.about) || {};
  const showSketch = kp.show_sketches !== false;
  const totals = computeKpTotals(kp, items);
  const products = items.filter(it => it.section === 'product');
  const materials = items.filter(it => it.section === 'material');
  const services = items.filter(it => it.section === 'service');

  const logoWhite = val(o.logo_white) || 'assets/logo-white.png';
  const heroImg = val(about.hero_img) || 'assets/hero-family.jpg';
  const qrImg = val(about.qr_img) || 'assets/qr-yandex.png';

  const orgName = val(o.name, 'ИП Мизанов Р. В.');
  const orgLines = orgContactLines(o);

  const buyer = kp.buyer || {};
  const buyerName = val(buyer.name, 'Покупатель');
  const buyerContact = [val(buyer.phone), val(buyer.email)].filter(Boolean).map(e).join(' · ');

  const mgr = kp.manager || {};
  const mgrName = val(mgr.name, val((settings && settings.manager && settings.manager.name)));
  const mgrPhone = val(mgr.phone, val(settings && settings.manager && settings.manager.phone));
  const mgrPos = val(mgr.position, 'Менеджер отдела продаж');

  const terms = effectiveTerms(kp, settings, 'person');
  const no = val(kp.client_request_no, kp.id);
  const objAddr = val(kp.object_address);

  // Реквизиты в шапке (справа).
  const headRight = `<div style="text-align:right;font-family:Montserrat,sans-serif;color:#bdbbb8;font-size:10.5px;line-height:1.75;">
    <div style="font-family:Cuprum,sans-serif;font-weight:700;font-size:15px;color:#fff;letter-spacing:.02em;margin-bottom:2px;">${e(orgName)}</div>
    ${orgLines.map(l => `<div>${l}</div>`).join('')}
  </div>`;

  let html = '';

  // Тёмная шапка.
  html += `<div style="background:#2B2A29;padding:24px 16mm 20px;display:flex;align-items:center;justify-content:space-between;gap:24px;">
    <img src="${e(logoWhite)}" alt="Ростовские окна" style="height:44px;width:auto;display:block;">
    ${headRight}
  </div>
  <div style="height:4px;background:#B50900;"></div>`;

  // Заголовок.
  html += `<div style="padding:42px 16mm 0;">
    <div style="font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#B50900;font-weight:600;margin-bottom:16px;">Пластиковые окна от завода-производителя</div>
    <h1 style="margin:0;font-family:Cuprum,sans-serif;font-weight:700;font-size:52px;line-height:.96;letter-spacing:.004em;color:#2B2A29;text-transform:uppercase;">Коммерческое<br>предложение</h1>
  </div>`;

  // Строка № / действительно до / менеджер.
  const metaCol = (label, valueHtml, dashed) =>
    `<div>
      <div style="font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#9a9895;font-weight:700;margin-bottom:5px;">${label}</div>
      ${dashed
        ? `<span style="display:inline-block;font-family:Cuprum,sans-serif;font-size:17px;font-weight:700;color:#2B2A29;padding:0 7px;border-radius:2px;">${valueHtml}</span>`
        : `<div style="font-family:Cuprum,sans-serif;font-size:17px;font-weight:700;color:#2B2A29;">${valueHtml}</div>`}
    </div>`;
  html += `<div style="padding:26px 16mm 0;display:flex;flex-wrap:wrap;gap:0;">
    <div style="padding-right:36px;border-right:1px solid #EDEDED;">${metaCol('№ предложения', e(no) + ' · от ' + e(dateLong(kp.date)), false)}</div>
    <div style="padding:0 36px;border-right:1px solid #EDEDED;">${metaCol(e(L('valid')), e(fmtDate(kp.valid_until)) || '—', true)}</div>
    <div style="padding-left:36px;">${metaCol('Менеджер', e(mgrName) || '—', false)}</div>
  </div>`;

  // Hero.
  html += `<div style="margin-top:30px;border-top:1px solid #eae7e4;border-bottom:1px solid #eae7e4;">
    <img src="${e(heroImg)}" alt="Пластиковые окна — Ростовские окна" style="display:block;width:100%;height:320px;object-fit:cover;object-position:center 42%;">
  </div>`;

  // Преимущества (статичный фирменный блок).
  const adv = (big, small) =>
    `<div><div style="width:11px;height:11px;background:#B50900;margin-bottom:14px;"></div><div style="font-family:Cuprum,sans-serif;font-weight:700;font-size:24px;color:#2B2A29;line-height:1.05;">${big}</div><div style="font-family:Montserrat,sans-serif;font-size:11.5px;color:#6b6a68;margin-top:6px;line-height:1.4;">${small}</div></div>`;
  html += `<div style="padding:30px 16mm 28px;display:grid;grid-template-columns:repeat(3,1fr);gap:28px;border-bottom:1px solid #EDEDED;">
    ${adv(e(val(terms.warranty, 'до 10 лет')), 'гарантия на изделия')}
    ${adv('Сервис', 'бесплатная профилактика изделий 1 раз в год')}
    ${adv('0 ₽', 'выезд замерщика бесплатно')}
  </div>`;

  // Подготовлено для + адрес объекта.
  html += `<div style="padding:24px 16mm 0;">
    <div data-keep style="display:flex;gap:20px;align-items:stretch;background:#F6F5F4;border-left:4px solid #B50900;padding:18px 22px;">
      <div style="flex:1;">
        <div style="font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#9a9895;font-weight:700;margin-bottom:7px;">Подготовлено для</div>
        <div style="font-family:Cuprum,sans-serif;font-weight:700;font-size:21px;color:#2B2A29;">${e(buyerName)}</div>
        ${buyerContact ? `<div style="font-family:Montserrat,sans-serif;font-size:12px;color:#6b6a68;margin-top:4px;">${buyerContact}</div>` : ''}
      </div>
      ${objAddr ? `<div style="width:1px;background:#e2e0dd;"></div>
      <div style="flex:1.25;">
        <div style="font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#9a9895;font-weight:700;margin-bottom:7px;">${e(L('addr'))}</div>
        <div style="font-family:Montserrat,sans-serif;font-size:13.5px;color:#2B2A29;font-weight:600;line-height:1.5;">${eMulti(objAddr)}</div>
      </div>` : ''}
    </div>
  </div>`;

  // Таблицы.
  html += `<div style="padding:0 16mm;">`;
  html += sectionTable(L('secProducts'), products, 'Итого по разделу «' + L('secProducts') + '»', totals.productSubtotal, false, showSketch, 'premium');
  html += sectionTable(L('secMaterials'), materials, 'Итого по разделу «' + L('secMaterials') + '»', totals.materialSubtotal, false, false, 'premium');
  html += sectionTable(L('secServices'), services, 'Итого по разделу «' + L('secServices') + '»', totals.serviceSubtotal, true, showSketch, 'premium');
  html += `</div>`;

  // Итоги.
  html += totalsBlock(kp, totals, 'premium');

  // Срок / гарантия / оплата (из kp.terms).
  html += termsGrid(terms);

  // Блок «о компании».
  html += `<div style="padding:0 16mm;">
    <div data-keep style="display:flex;gap:30px;align-items:center;border-top:1px solid #EDEDED;padding-top:26px;margin-top:28px;">
      <div style="flex:none;text-align:center;">
        <img src="${e(qrImg)}" alt="Отзывы на Яндексе" style="width:120px;height:auto;display:block;border:1px solid #eae7e4;">
        <div style="display:inline-flex;flex-direction:column;gap:5px;align-items:flex-start;margin-top:12px;">
          <div style="display:flex;align-items:center;gap:7px;">
            <span style="position:relative;width:14px;height:18px;display:inline-block;flex:none;">
              <span style="position:absolute;top:7px;left:4px;width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;border-top:8px solid #E5231B;"></span>
              <span style="position:absolute;top:0;left:1px;width:12px;height:12px;background:#E5231B;border-radius:50%;"></span>
              <span style="position:absolute;top:3px;left:4px;width:6px;height:6px;background:#fff;border-radius:50%;z-index:1;"></span>
            </span>
            <span style="font-family:Montserrat,sans-serif;font-weight:700;font-size:14px;color:#1f1f1f;">Яндекс Карты</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-family:Montserrat,sans-serif;font-weight:700;font-size:15px;color:#1f1f1f;">${e(val(about.rating, '5,0'))}</span>
            <span style="color:#FFB400;font-size:14px;letter-spacing:2px;">★★★★★</span>
            <span style="font-family:Montserrat,sans-serif;font-size:11px;color:#9a9a9a;">${e(val(about.reviews, '437 оценок'))}</span>
          </div>
        </div>
      </div>
      <div style="flex:1;">
        <div style="width:38px;height:4px;background:#B50900;margin-bottom:18px;"></div>
        <div style="font-family:Cuprum,sans-serif;font-weight:700;font-size:29px;line-height:1.14;color:#2B2A29;max-width:520px;">${e(val(about.slogan, 'Мы существуем, чтобы делать жизнь людей более комфортной.'))}</div>
        <div style="display:flex;gap:40px;margin-top:20px;">
          <div><div style="font-family:Cuprum,sans-serif;font-weight:700;font-size:22px;color:#B50900;">${e(val(about.years, 'более 15 лет'))}</div><div style="font-family:Montserrat,sans-serif;font-size:10.5px;color:#8a8884;">на рынке</div></div>
          <div><div style="font-family:Cuprum,sans-serif;font-weight:700;font-size:22px;color:#B50900;">${e(val(about.objects, '9 000+'))}</div><div style="font-family:Montserrat,sans-serif;font-size:10.5px;color:#8a8884;">выполненных объектов</div></div>
        </div>
      </div>
    </div>
  </div>`;

  // Подпись менеджера + М.П.
  const signCaption = ['С уважением,', mgrPos + (mgrName ? ' — ' + mgrName : ''), mgrPhone]
    .filter(Boolean).map(e).join('<br>');
  html += `<div style="padding:8px 16mm 36px;">
    <div data-keep style="display:flex;justify-content:space-between;align-items:flex-end;gap:30px;margin-top:30px;">
      <div style="flex:1;max-width:340px;">
        <div style="font-family:Montserrat,sans-serif;font-size:12px;color:#6b6a68;line-height:1.6;margin-bottom:32px;">${signCaption}</div>
        <div style="position:relative;height:${Math.max(Math.round(46 * orgMediaScale(o).sign), 34)}px;">
          ${val(o.signature_img) ? `<img src="${e(o.signature_img)}" alt="Подпись" style="position:absolute;left:14px;bottom:${1 - orgMediaScale(o).signDrop}px;height:${Math.round(46 * orgMediaScale(o).sign)}px;width:auto;max-width:94%;">` : ''}
          <div style="position:absolute;left:0;right:0;bottom:0;border-bottom:1.5px solid #2B2A29;"></div>
        </div>
        <div style="font-family:Montserrat,sans-serif;font-size:10px;color:#9a9895;margin-top:6px;letter-spacing:.06em;text-transform:uppercase;">Подпись · ${e(orgName)}</div>
      </div>
      ${stampBlock(o, 118, 'печать продавца')}
    </div>
  </div>`;

  return html;
}

// ---------------------------------------------------------------------------
// Варианты KP (юрлицо) и OFERTA — общая база
// ---------------------------------------------------------------------------

function renderLegal(kp, items, settings, org) {
  const isOferta = kp.doc_variant === 'oferta';
  const o = org || {};
  const showSketch = kp.show_sketches !== false;
  const totals = computeKpTotals(kp, items);
  const products = items.filter(it => it.section === 'product');
  const materials = items.filter(it => it.section === 'material');
  const services = items.filter(it => it.section === 'service');

  const logoColor = val(o.logo_color) || 'assets/logo-color.png';
  const orgName = val(o.name, 'ООО «ГК-РОСТОК»');
  const orgLines = orgContactLines(o);

  const buyer = kp.buyer || {};
  const buyerName = val(buyer.name, 'Покупатель');

  const terms = effectiveTerms(kp, settings, 'legal');
  const no = val(kp.client_request_no, kp.id);
  const objAddr = val(kp.object_address);

  let html = '';

  // Шапка: лого + реквизиты org справа.
  html += `<div style="padding:14mm 16mm 0;">
    <div style="display:flex;justify-content:space-between;gap:24px;align-items:flex-start;">
      <img src="${e(logoColor)}" alt="Ростовские окна" style="height:56px;width:auto;display:block;">
      <div style="text-align:right;font-family:Montserrat,sans-serif;font-size:10px;color:#3a3a38;line-height:1.6;max-width:320px;">
        <div style="font-family:Cuprum,sans-serif;font-weight:700;font-size:15px;color:#2B2A29;margin-bottom:2px;">${e(orgName)}</div>
        ${orgLines.map(l => `<div>${l}</div>`).join('')}
      </div>
    </div>
    <div style="height:3px;background:#B50900;margin-top:14px;"></div>
  </div>`;

  // Заголовок по центру + № от … + отметка оферты.
  const ofertaMark = isOferta
    ? `<div style="text-align:center;margin-top:10px;"><span style="display:inline-block;font-family:Montserrat,sans-serif;font-size:10.5px;color:#7a7a78;border:1px solid #e2dada;background:#fbf6f5;padding:4px 12px;border-radius:3px;">Счёт-оферта · является основанием для оплаты (ст. 434, 435 ГК&nbsp;РФ)</span></div>`
    : '';
  html += `<div style="text-align:center;padding:22px 16mm 4px;">
    <h1 style="font-family:Cuprum,sans-serif;font-weight:700;font-size:30px;letter-spacing:.05em;text-transform:uppercase;color:#2B2A29;margin:0;">Коммерческое предложение</h1>
    <div style="font-family:Montserrat,sans-serif;font-size:14px;color:#2B2A29;margin-top:7px;">№&nbsp;${e(no)} от ${e(dateLong(kp.date))} г.</div>
    ${ofertaMark}
  </div>`;

  // Стороны: для оферты — продавец+покупатель с реквизитами; для kp — только покупатель.
  const partiesCols = isOferta ? '1fr 1fr' : '1fr';
  const sellerBlock = isOferta
    ? `<div style="padding:16px 18px;border-right:1px solid #E2E0DD;">
        <div style="font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#B50900;font-weight:700;margin-bottom:9px;">${e(L('seller'))}</div>
        <div style="font-family:Cuprum,sans-serif;font-weight:700;font-size:16px;color:#2B2A29;margin-bottom:9px;">${e(orgName)}</div>
        <div style="font-family:Montserrat,sans-serif;font-size:11px;color:#4a4846;line-height:1.75;">${orgFullRequisites(o).join('<br>')}</div>
      </div>`
    : '';
  const buyerReq = isOferta
    ? `<div style="font-family:Montserrat,sans-serif;font-size:11px;color:#4a4846;line-height:1.75;">${buyerFullRequisites(buyer).join('<br>')}</div>`
    : '';
  html += `<div style="padding:18px 16mm 0;">
    <div data-keep style="display:grid;grid-template-columns:${partiesCols};border:1px solid #E2E0DD;">
      ${sellerBlock}
      <div style="padding:16px 18px;">
        <div style="font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#B50900;font-weight:700;margin-bottom:9px;">${e(L('buyer'))}</div>
        <div style="font-family:Cuprum,sans-serif;font-weight:700;font-size:16px;color:#2B2A29;margin-bottom:9px;">${e(buyerName)}</div>
        ${buyerReq}
      </div>
    </div>
  </div>`;

  // Адрес объекта / действительно до.
  html += `<div style="padding:16px 16mm 0;">
    <div data-keep style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px 28px;background:#F6F5F4;padding:16px 20px;border-left:4px solid #B50900;">
      <div><div style="font-family:Montserrat,sans-serif;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#9a9895;font-weight:700;margin-bottom:6px;">${e(L('addr'))}</div><span style="font-family:Montserrat,sans-serif;font-size:12px;font-weight:600;color:#2B2A29;padding:0 5px;border-radius:2px;">${e(objAddr) || '—'}</span></div>
      <div><div style="font-family:Montserrat,sans-serif;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#9a9895;font-weight:700;margin-bottom:6px;">${e(L('valid'))}</div><span style="font-family:Montserrat,sans-serif;font-size:12px;font-weight:600;color:#2B2A29;padding:0 5px;border-radius:2px;">${e(fmtDate(kp.valid_until)) || '—'}</span></div>
    </div>
  </div>`;

  // Фото объекта (презентация) — под адресом, если загружены.
  const photos = Array.isArray(kp.object_photos) ? kp.object_photos.filter(Boolean) : [];
  if (photos.length){
    html += `<div style="padding:14px 16mm 0;">
      <div style="font-family:Montserrat,sans-serif;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#9a9895;font-weight:700;margin-bottom:8px;">Фото объекта</div>
      <div data-keep style="display:grid;grid-template-columns:repeat(${photos.length === 1 ? 1 : 2},1fr);gap:10px;">
        ${photos.map(src => `<img src="${e(src)}" alt="" style="width:100%;height:auto;max-height:240px;object-fit:cover;border:1px solid #EDEDED;border-radius:6px;display:block;break-inside:avoid;">`).join('')}
      </div>
    </div>`;
  }

  // Таблицы.
  html += `<div style="padding:18px 16mm 0;">`;
  html += sectionTable(L('secProducts'), products, 'Итого по разделу «' + L('secProducts') + '»', totals.productSubtotal, false, showSketch, 'legal');
  html += `<div style="height:0;"></div>`;
  html += sectionTable(L('secMaterials'), materials, 'Итого по разделу «' + L('secMaterials') + '»', totals.materialSubtotal, false, false, 'legal');
  html += `<div style="height:0;"></div>`;
  html += sectionTable(L('secServices'), services, 'Итого по разделу «' + L('secServices') + '»', totals.serviceSubtotal, true, showSketch, 'legal');
  html += `</div>`;

  // Итоги (с НДС).
  html += totalsBlock(kp, totals, 'legal');

  // Условия для юрлиц/оферты — формальные формулировки (из настроек terms_legal / kp.terms).
  html += legalTermsBlock(terms);
  // Оферта: правовая отметка.
  if (isOferta) {
    html += `<div style="padding:14px 16mm 0;">
      <div style="font-family:Montserrat,sans-serif;font-size:10px;color:#8a8884;border-top:1px solid #EDEDED;padding-top:10px;line-height:1.6;">Настоящее коммерческое предложение является основанием для оплаты и имеет силу счёта (ст. 434, 435 ГК РФ). Акцептом признаётся оплата счёта Покупателем.</div>
    </div>`;
  }

  // Подписи.
  // Для ООО у подписи выводим должность руководителя; ФИО руководителя — в строке «подпись / …».
  // У ИП директора нет — просто наименование.
  const isOOO = /ооо|обществ/i.test(String(orgName));
  const dirTitle = val(o.director_title, isOOO ? 'Директор' : '');
  const dirName = val(o.director_name, '');
  const signerLine = (isOOO && dirTitle)
    ? `${e(orgName)}<br><span style="color:#5a5856;font-weight:500;">${e(dirTitle)}</span>`
    : e(orgName);
  const signerName = dirName || val(o.name, '');
  const sellerSign = `<div>
      <div style="font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#9a9895;font-weight:700;margin-bottom:4px;">${e(L('seller'))}</div>
      <div style="font-family:Montserrat,sans-serif;font-size:12px;color:#2B2A29;font-weight:600;line-height:1.5;min-height:36px;">${signerLine}</div>
      <div style="display:flex;align-items:flex-end;gap:18px;margin-top:30px;">
        <div style="flex:1;border-bottom:1.5px solid #2B2A29;height:30px;position:relative;">${val(o.signature_img) ? `<img src="${e(o.signature_img)}" alt="" style="position:absolute;bottom:${2 - orgMediaScale(o).signDrop}px;left:10px;height:${Math.round(40 * orgMediaScale(o).sign)}px;width:auto;">` : ''}</div>
        ${stampBlock(o, 118, '')}
      </div>
      <div style="font-family:Montserrat,sans-serif;font-size:10px;color:#9a9895;margin-top:6px;letter-spacing:.04em;">подпись / ${e(signerName)}</div>
    </div>`;
  const buyerIsOOO = /ооо|обществ/i.test(String(buyerName));
  const bDirTitle = val(buyer.director_title, buyerIsOOO ? 'Директор' : '');
  const bDirName = val(buyer.director_name, '');
  const buyerSignerLine = (buyerIsOOO && bDirTitle)
    ? `${e(buyerName)}<br><span style="color:#5a5856;font-weight:500;">${e(bDirTitle)}</span>`
    : e(buyerName);
  const buyerSign = isOferta
    ? `<div>
        <div style="font-family:Montserrat,sans-serif;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#9a9895;font-weight:700;margin-bottom:4px;">${e(L('buyer'))}</div>
        <div style="font-family:Montserrat,sans-serif;font-size:12px;color:#2B2A29;font-weight:600;line-height:1.5;min-height:36px;">${buyerSignerLine}</div>
        <div style="display:flex;align-items:flex-end;gap:18px;margin-top:30px;">
          <div style="flex:1;border-bottom:1.5px solid #2B2A29;height:30px;"></div>
          <div style="width:118px;height:118px;flex:none;border:2px dashed #c9c6c2;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#b6b3af;font-family:ui-monospace,Menlo,monospace;font-size:11px;">М.П.</div>
        </div>
        <div style="font-family:Montserrat,sans-serif;font-size:10px;color:#9a9895;margin-top:6px;letter-spacing:.04em;">подпись / ${e(bDirName) || 'Ф. И. О.'}</div>
      </div>`
    : '';
  const signCols = isOferta ? '1fr 1fr' : '1fr';
  html += `<div style="padding:24px 16mm 36px;">
    <div data-keep style="display:grid;grid-template-columns:${signCols};gap:44px;margin-top:20px;">
      ${sellerSign}
      ${buyerSign}
    </div>
  </div>`;

  return html;
}

// ---------------------------------------------------------------------------
// Главный экспорт
// ---------------------------------------------------------------------------

export function renderDocument(kp, items, settings, org) {
  const k = kp || {};
  _labels = Object.assign({}, DOC_LABELS, (settings && settings.doc_labels) || {}); // настраиваемые подписи
  const list = Array.isArray(items) ? items : [];
  const variant = k.doc_variant === 'kp' || k.doc_variant === 'oferta' ? k.doc_variant : 'premium';

  let body;
  if (variant === 'premium') {
    body = renderPremium(k, list, settings || {}, org || {});
  } else {
    body = renderLegal(k, list, settings || {}, org || {});
  }

  return `${DOC_STYLE}<div class="rok-doc">${body}${footerBlock(settings)}</div>`;
}
