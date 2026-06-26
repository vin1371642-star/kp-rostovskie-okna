// seed.js — наполнение базы демо-данными при первом запуске.
// Идемпотентно: если settings.catalog_seeded истинно — ничего не делает.
import { dbBulk, dbGet, dbAll, dbDel, uid } from './db.js';
import { defaultSettings, saveSettings } from './store.js';

// Убрать услуги из каталога: в КП они вводятся вручную (не выбираются из каталога).
async function removeSeededServices(){
  const [cats, comps] = await Promise.all([dbAll('categories'), dbAll('components')]);
  const svcNames = ['Монтаж', 'Доставка', 'Демонтаж'];
  const svcCatIds = cats.filter(c => c.default_type === 'service' && svcNames.includes(c.name)).map(c => c.id);
  for (const c of comps){
    if (svcCatIds.includes(c.category_id) || ['svc-install', 'svc-delivery', 'svc-dismantle'].includes(c.code)){
      await dbDel('components', c.id);
    }
  }
  for (const id of svcCatIds) await dbDel('categories', id);
}

export async function seedData() {
  const settings = (await dbGet('settings', 'app')) || defaultSettings();
  if (settings.catalog_seeded) {
    // Миграция для уже наполненных баз: вычистить услуги из каталога.
    if (!settings.service_seed_removed){
      await removeSeededServices();
      settings.service_seed_removed = true;
      await saveSettings(settings);
    }
    return;
  }

  // ---- Категории ----
  const catDefs = [
    { key: 'profile',   name: 'Профиль',         default_type: 'product', sort: 10 },
    { key: 'hardware',  name: 'Фурнитура',       default_type: 'product', sort: 20 },
    { key: 'filling',   name: 'Заполнение',      default_type: 'product', sort: 30 },
    { key: 'sill',      name: 'Подоконник',      default_type: 'product', sort: 40 },
    { key: 'ebb',       name: 'Отлив',           default_type: 'product', sort: 50 },
    { key: 'mosquito',  name: 'Москитная сетка', default_type: 'product', sort: 60 },
    { key: 'slopes',    name: 'Откосы',          default_type: 'product', sort: 70 },
  ];
  const catId = {}; // key -> id
  const categories = catDefs.map(c => {
    const id = uid();
    catId[c.key] = id;
    return { id, name: c.name, default_type: c.default_type, sort: c.sort };
  });
  await dbBulk('categories', categories);

  // ---- Компоненты ----
  const compDefs = [
    // Профиль
    { category: 'profile',   code: 'prof-blitz60',    name: 'REHAU Blitz 60 мм',                  type: 'product', unit: 'м²',    purchase_price: 2100, sort: 10 },
    { category: 'profile',   code: 'prof-grazio70',   name: 'REHAU Grazio 70 мм',                 type: 'product', unit: 'м²',    purchase_price: 2950, sort: 20 },
    // Фурнитура
    { category: 'hardware',  code: 'hw-maco-mm',      name: 'Maco Multi-Matic',                   type: 'product', unit: 'компл', purchase_price: 1450, sort: 10 },
    { category: 'hardware',  code: 'hw-roto-nx',      name: 'Roto NX',                            type: 'product', unit: 'компл', purchase_price: 1780, sort: 20 },
    // Заполнение
    { category: 'filling',   code: 'fill-spd2',       name: 'Стеклопакет 2-камерный (СПД)',        type: 'product', unit: 'м²',    purchase_price: 1250, sort: 10 },
    { category: 'filling',   code: 'fill-energy',     name: 'Стеклопакет энергосберегающий (СП)',  type: 'product', unit: 'м²',    purchase_price: 1650, sort: 20 },
    // Подоконник
    { category: 'sill',      code: 'sill-moeller300', name: 'Подоконник Moeller 300 мм',          type: 'product', unit: 'м.п.',  purchase_price: 620,  sort: 10 },
    { category: 'sill',      code: 'sill-werzalit400',name: 'Подоконник Werzalit 400 мм',         type: 'product', unit: 'м.п.',  purchase_price: 980,  sort: 20 },
    // Отлив
    { category: 'ebb',       code: 'ebb-steel150',    name: 'Отлив оцинкованный 150 мм',          type: 'product', unit: 'м.п.',  purchase_price: 280,  sort: 10 },
    // Москитная сетка
    { category: 'mosquito',  code: 'mosq-frame',      name: 'Москитная сетка рамочная',           type: 'product', unit: 'шт',    purchase_price: 750,  sort: 10 },
    // Откосы
    { category: 'slopes',    code: 'slopes-sandwich', name: 'Откосы сэндвич-панель',              type: 'product', unit: 'м.п.',  purchase_price: 540,  sort: 10 },
  ];
  const components = compDefs.map(c => ({
    id: uid(),
    category_id: catId[c.category],
    code: c.code,
    name: c.name,
    type: c.type,
    unit: c.unit,
    purchase_price: c.purchase_price,
    sketch_img: '',
    note: '',
    sort: c.sort,
  }));
  await dbBulk('components', components);

  // ---- Шаблонные наименования изделий (product_kits) ----
  const kits = [
    { id: uid(), name: 'Окно ПВХ двустворчатое поворотно-откидное', component_ids: [], note: '' },
    { id: uid(), name: 'Окно ПВХ одностворчатое глухое',            component_ids: [], note: '' },
    { id: uid(), name: 'Балконный блок ПВХ (дверь+окно)',           component_ids: [], note: '' },
    { id: uid(), name: 'Дверь ПВХ входная',                         component_ids: [], note: '' },
    { id: uid(), name: 'Витражная конструкция ПВХ',                 component_ids: [], note: '' },
  ];
  await dbBulk('product_kits', kits);

  // ---- Организации ----
  // Реквизиты-заглушки помечены 'TODO' — заказчик заполнит.
  // Контакты — образцы.
  const organizations = [
    {
      id: uid(),
      name: 'ИП Мизанов Р. В.',
      brand: 'Ростовские окна',
      inn: 'TODO',
      kpp: '',
      ogrn: 'TODO',
      address: 'г. Краснодар',
      rs: 'TODO',
      bank: 'TODO',
      bik: 'TODO',
      ks: 'TODO',
      phone: '+7 988 338-88-33',
      email: 'okna-023@yandex.ru',
      vat_rate: 5,
      stamp_img: '',
      signature_img: '',
      logo_color: '',
      logo_white: '',
    },
    {
      id: uid(),
      name: 'ИП Мизанова И. А.',
      brand: 'Ростовские окна',
      inn: 'TODO',
      kpp: '',
      ogrn: 'TODO',
      address: 'г. Славянск-на-Кубани',
      rs: 'TODO',
      bank: 'TODO',
      bik: 'TODO',
      ks: 'TODO',
      phone: '+7 988 338-88-33',
      email: 'okna-023@yandex.ru',
      vat_rate: 5,
      stamp_img: '',
      signature_img: '',
      logo_color: '',
      logo_white: '',
    },
    {
      id: uid(),
      name: 'ООО «ГК-РОСТОК»',
      brand: 'Ростовские окна',
      inn: 'TODO',
      kpp: 'TODO',
      ogrn: 'TODO',
      address: 'г. Краснодар',
      rs: 'TODO',
      bank: 'TODO',
      bik: 'TODO',
      ks: 'TODO',
      phone: '+7 988 338-88-33',
      email: 'okna-023@yandex.ru',
      vat_rate: 22,
      stamp_img: '',
      signature_img: '',
      logo_color: '',
      logo_white: '',
    },
  ];
  await dbBulk('organizations', organizations);

  // ---- Настройки: отметить, что каталог наполнен ----
  settings.catalog_seeded = true;
  settings.service_seed_removed = true; // в свежем каталоге услуг и так нет
  await saveSettings(settings);
}
