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
 * Итоги по КП.
 * Ставка НДС берётся из kp.vat_rate (0/5/22) и начисляется СВЕРХУ отдельной строкой.
 * kp.vat_show === false полностью убирает НДС из расчёта и из документа.
 * @param {{vat_rate?:number, vat_show?:boolean, discount?:number}} kp
 * @param {Array<{section?:string, amount?:number}>} items
 * @returns {{productSubtotal:number, materialSubtotal:number, serviceSubtotal:number,
 *            subtotal:number, discount:number, base:number, vatRate:number,
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

  // НДС можно полностью скрыть в конкретном КП (k.vat_show === false) — напр. для физлиц
  // при наличной оплате: НДС не считается и не отображается, итог = сумма КП.
  const vatShown = k.vat_show !== false;
  const vatRate = vatShown ? n(k.vat_rate) : 0;
  // НДС начисляется СВЕРХУ на сумму КП (база со скидкой): СуммаКП × ставка / 100,
  // с копейками (2 знака, без округления до рубля). Итог: Сумма КП без НДС + НДС = Сумма с НДС.
  // Цены позиций указаны БЕЗ НДС. Обратная сверка для бухгалтерии сходится:
  // НДС, содержащийся в итоге, = Итог × ставка / (100 + ставка) — то же самое число.
  const vat = vatRate > 0 ? Math.round(base * vatRate) / 100 : 0;
  const total = Math.round((base + vat) * 100) / 100;

  return {
    productSubtotal,
    materialSubtotal,
    serviceSubtotal,
    subtotal,
    discount,
    base,
    vatRate,
    vatMode: 'line', // НДС всегда строкой сверху
    vat,
    total,
  };
}
