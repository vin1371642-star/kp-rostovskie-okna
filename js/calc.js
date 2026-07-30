// calc.js — чистые функции расчётов КП «Ростовские окна».
// Без импортов, без побочных эффектов. Все суммы — целые рубли (Math.round).

/**
 * Приводит значение к числу; null/undefined/строки/мусор → 0.
 * @param {*} v
 * @returns {number}
 */
function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Сумма закупок выбранных компонентов.
 * @param {Array<{name?:string, purchase_price?:number}>} components
 * @returns {number} целые рубли
 */
export function componentSum(components) {
  if (!Array.isArray(components)) return 0;
  let sum = 0;
  for (const c of components) {
    if (c == null) continue;
    sum += n(c.purchase_price);
  }
  return Math.round(sum);
}

/**
 * Розничная цена от закупки с наценкой в процентах.
 * @param {number} purchase закупка, ₽
 * @param {number} markupPct наценка, %
 * @returns {number} целые рубли
 */
export function retail(purchase, markupPct) {
  return Math.round(n(purchase) * (1 + n(markupPct) / 100));
}

/**
 * Способ вывода НДС в КП. Читается из kp.vat_mode; для старых КП, где его ещё нет,
 * восстанавливается из прежних полей vat_show / vat_display.
 *  'line'     — «Плюс НДС»: цены позиций БЕЗ НДС, НДС начисляется сверху отдельной строкой;
 *  'included' — «в т.ч. НДС»: цены позиций уже С НДС, налог выделяется внутри итога;
 *  'none'     — «Без НДС»: налог не считается и не показывается.
 * @param {{vat_mode?:string, vat_show?:boolean, vat_display?:string}} kp
 * @returns {'line'|'included'|'none'}
 */
export function vatMode(kp) {
  const k = kp || {};
  if (k.vat_mode === 'line' || k.vat_mode === 'included' || k.vat_mode === 'none') return k.vat_mode;
  if (k.vat_show === false) return 'none';
  return k.vat_display === 'included' ? 'included' : 'line';
}

/**
 * Итоги по КП.
 * Ставка НДС берётся из kp.vat_rate (0/5/22), способ вывода — из kp.vat_mode (см. vatMode()).
 * @param {{vat_rate?:number, vat_mode?:string, vat_show?:boolean, discount?:number}} kp
 * @param {Array<{section?:string, amount?:number}>} items
 * @returns {{productSubtotal:number, materialSubtotal:number, serviceSubtotal:number,
 *            subtotal:number, discount:number, base:number, net:number, vatRate:number,
 *            vatMode:string, vat:number, total:number}}
 */
export function computeKpTotals(kp, items) {
  const k = kp || {};
  const list = Array.isArray(items) ? items : [];

  let productSubtotal = 0;
  let materialSubtotal = 0;
  let serviceSubtotal = 0;
  for (const it of list) {
    if (it == null) continue;
    const amount = n(it.amount);
    if (it.section === 'service') {
      serviceSubtotal += amount;
    } else if (it.section === 'material') {
      materialSubtotal += amount;
    } else if (it.section === 'product') {
      productSubtotal += amount;
    }
  }
  productSubtotal = Math.round(productSubtotal);
  materialSubtotal = Math.round(materialSubtotal);
  serviceSubtotal = Math.round(serviceSubtotal);

  const subtotal = productSubtotal + materialSubtotal + serviceSubtotal;
  // Скидка применяется к продукции И доп. материалам (на услуги НЕ распространяется)
  // и не может превышать их суммарную стоимость.
  // Границы с двух сторон: отрицательная скидка (например, из вручную правленного .kp)
  // не должна раздувать базу выше суммы позиций.
  const goodsSubtotal = productSubtotal + materialSubtotal;
  const discount = Math.min(Math.max(0, Math.round(n(k.discount))), goodsSubtotal);
  const base = (goodsSubtotal - discount) + serviceSubtotal;

  // Способ вывода НДС. 'none' — напр. для физлиц при наличной оплате: НДС не считается
  // и не отображается, итог = сумма КП.
  const mode = vatMode(k);
  const vatRate = mode === 'none' ? 0 : n(k.vat_rate);

  // vat  — сумма налога, с копейками (2 знака, без округления до рубля);
  // net   — сумма БЕЗ НДС; total — к оплате. Тождество net + vat = total верно в любом режиме.
  let vat = 0;
  let net = base;
  let total = base;
  if (vatRate > 0 && mode === 'included') {
    // Цены позиций уже включают НДС: налог ВЫДЕЛЯЕТСЯ изнутри базы по расчётной ставке
    // ставка/(100+ставка). Итог не меняется — он и есть сумма КП с НДС.
    vat = Math.round(base * vatRate * 100 / (100 + vatRate)) / 100;
    net = Math.round((base - vat) * 100) / 100;
    total = base;
  } else if (vatRate > 0) {
    // 'line' — цены позиций БЕЗ НДС, налог начисляется СВЕРХУ на сумму КП (база со скидкой).
    // Обратная сверка для бухгалтерии сходится: НДС, содержащийся в итоге,
    // = Итог × ставка / (100 + ставка) — то же самое число.
    vat = Math.round(base * vatRate) / 100;
    net = base;
    total = Math.round((base + vat) * 100) / 100;
  }

  return {
    productSubtotal,
    materialSubtotal,
    serviceSubtotal,
    subtotal,
    discount,
    base,
    net,
    vatRate,
    vatMode: mode,
    vat,
    total,
  };
}
