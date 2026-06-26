// amount-in-words.js — сумма прописью на русском (рубли + копейки).
// Чистая функция, без импортов и зависимостей.
//
// Примеры:
//   amountInWords(96005)  → «Девяносто шесть тысяч пять рублей 00 копеек.»
//   amountInWords(793000) → «Семьсот девяносто три тысячи рублей 00 копеек.»
//   amountInWords(1234.5) → «Одна тысяча двести тридцать четыре рубля 50 копеек.»
//   amountInWords(0)      → «Ноль рублей 00 копеек.»

const ONES = [
  '', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'
];

// Женские формы 1 и 2 (для тысяч: «одна тысяча», «две тысячи»).
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];

const TENS = [
  '', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят',
  'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'
];

const HUNDREDS = [
  '', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот',
  'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'
];

// Разряды (триады): род + формы [для 1, для 2-4, для 5+].
// gender: 'm' — мужской, 'f' — женский.
const SCALES = [
  { gender: 'm', forms: ['', '', ''] },                          // единицы (рубли склоняются отдельно)
  { gender: 'f', forms: ['тысяча', 'тысячи', 'тысяч'] },
  { gender: 'm', forms: ['миллион', 'миллиона', 'миллионов'] },
  { gender: 'm', forms: ['миллиард', 'миллиарда', 'миллиардов'] },
  { gender: 'm', forms: ['триллион', 'триллиона', 'триллионов'] }
];

// Выбор формы слова по числу (1 рубль / 2 рубля / 5 рублей).
function pluralForm(n, forms) {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

// Прописью одна триада 0..999. gender влияет на формы 1 и 2.
function tripletToWords(n, gender) {
  const parts = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const t = Math.floor(rest / 10);
  const o = rest % 10;

  if (h) parts.push(HUNDREDS[h]);

  if (rest >= 10 && rest <= 19) {
    parts.push(ONES[rest]);
  } else {
    if (t) parts.push(TENS[t]);
    if (o) {
      parts.push(gender === 'f' ? ONES_F[o] : ONES[o]);
    }
  }

  return parts.join(' ');
}

// Целое число прописью с разрядами.
// unitForms — формы единицы измерения (рубль/рубля/рублей);
// unitGender — род единицы измерения (рубли — мужской).
function integerToWords(intValue, unitForms, unitGender) {
  if (intValue === 0) {
    return ('ноль ' + unitForms[2]).trim();
  }

  // Разбиваем на триады справа налево.
  const triplets = [];
  let n = intValue;
  while (n > 0) {
    triplets.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  const words = [];
  for (let i = triplets.length - 1; i >= 0; i--) {
    const trip = triplets[i];
    if (trip === 0) continue;

    const scale = SCALES[i] || SCALES[SCALES.length - 1];
    // Род триады: для разряда единиц — род единицы измерения; иначе род разряда.
    const gender = i === 0 ? unitGender : scale.gender;

    words.push(tripletToWords(trip, gender));

    if (i > 0) {
      words.push(pluralForm(trip, scale.forms));
    }
  }

  // Форма единицы измерения определяется младшей триадой (разряд единиц).
  words.push(pluralForm(triplets[0], unitForms));

  return words.join(' ');
}

function capitalizeFirst(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function amountInWords(rub) {
  const value = Number(rub) || 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);

  // Округляем до копеек, разделяем рубли и копейки без плавающих артефактов.
  const totalKopecks = Math.round(abs * 100);
  const rubles = Math.floor(totalKopecks / 100);
  const kopecks = totalKopecks % 100;

  const RUBLE_FORMS = ['рубль', 'рубля', 'рублей'];
  const KOPECK_FORMS = ['копейка', 'копейки', 'копеек'];

  let rublesText = integerToWords(rubles, RUBLE_FORMS, 'm');
  if (sign < 0) rublesText = 'минус ' + rublesText;

  const kopecksStr = String(kopecks).padStart(2, '0');
  const kopeckWord = pluralForm(kopecks, KOPECK_FORMS);

  return capitalizeFirst(rublesText) + ' ' + kopecksStr + ' ' + kopeckWord + '.';
}
