// Retailer identity is informational. It never changes the network policy or
// supplies missing currency, price unit, dimensions, or pack coverage.
export function retailerFor(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return [['oma.by', 'oma'], ['21vek.by', '21vek'], ['mile.by', 'mile']]
      .find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1];
  } catch { return undefined; }
}

function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim().replace(/[\u00a0\u202f]/g, ' ');
  if (!/^(?:\d+|\d{1,3}(?: \d{3})+)(?:[.,]\d+)?$/.test(text)) return undefined;
  const result = Number(text.replace(/ /g, '').replace(',', '.'));
  return Number.isFinite(result) && result > 0 ? result : undefined;
}

function currency(value) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (/^[a-z]{3}$/i.test(text)) return text.toUpperCase();
  if (/^бел(?:орусск(?:ий|их|ие))?\.?\s*руб(?:ль|ля|лей|ли)?\.?$/i.test(text)) return 'BYN';
  return undefined; // руб., р. and $ do not identify a currency.
}

function unit(value) {
  if (typeof value !== 'string') return 'unknown';
  const text = value.trim().toLowerCase().replace(/²/g, '2').replace(/\s+/g, ' ').replace(/\.$/, '');
  if (/^(?:mtk|m2|м2|кв\.?\s?м|square met(?:er|re)s?)$/.test(text)) return 'm2';
  if (/^(?:pk|xpk|pack|package|уп|упак|упаковка|упаковку)$/.test(text)) return 'pack';
  if (/^(?:c62|h87|ea|item|piece|pieces|шт|штука|штуку)$/.test(text)) return 'item';
  return 'unknown';
}

function explicitUnit(record) {
  const quantity = record?.referenceQuantity;
  if (quantity !== undefined) {
    if (typeof quantity !== 'object' || number(quantity.value) !== 1) return 'unknown';
    return unit(quantity.unitCode ?? quantity.unitText);
  }
  if (record?.billingIncrement !== undefined && number(record.billingIncrement) !== 1) return 'unknown';
  return unit(record?.unitCode ?? record?.unitText);
}

function samePage(value, url) {
  if (typeof value !== 'string') return false;
  try { const a = new URL(value, url), b = new URL(url); a.hash = ''; b.hash = ''; return a.href === b.href; }
  catch { return false; }
}

function structuredOffer(product, url) {
  const values = Array.isArray(product?.offers) ? product.offers : product?.offers ? [product.offers] : [];
  const matching = values.filter(value => samePage(value?.url, url));
  const selected = matching.length === 1 ? matching : values;
  if (selected.length !== 1) return { ambiguous: values.length > 1 };
  const offer = selected[0];
  if (!offer || typeof offer !== 'object') return {};
  if (/AggregateOffer$/.test(String(offer['@type'] ?? '')) || offer.validForMemberTier || offer.eligibleCustomerType) return { ambiguous: true };
  const specs = Array.isArray(offer.priceSpecification) ? offer.priceSpecification : offer.priceSpecification ? [offer.priceSpecification] : [];
  // List prices, instalments and multiple price components do not identify a
  // single current sale price. Do not combine one component's price with another unit.
  if (specs.length > 1) return { ambiguous: true };
  const spec = specs[0];
  if (spec?.validForMemberTier || spec?.priceComponentType || spec?.billingDuration) return { ambiguous: true };
  const safeSpec = spec && !spec.validForMemberTier && !spec.priceComponentType &&
    !spec.billingDuration && !spec.priceType;
  const record = safeSpec && spec.price !== undefined ? spec : offer;
  const price = number(record.price), money = currency(record.priceCurrency ?? offer.priceCurrency);
  if (!price || !money) return {};
  let priceUnit = explicitUnit(record);
  if (record === offer && safeSpec && spec.price === undefined) priceUnit = explicitUnit(spec);
  const unitRecord = record === offer && safeSpec && spec.price === undefined ? spec : record;
  const unitCannotInfer = unitRecord.referenceQuantity !== undefined || unitRecord.billingIncrement !== undefined;
  return { offer: { price, currency: money, unit: priceUnit,
    source: record === offer ? 'JSON-LD Product.offers.price' : 'JSON-LD Product.offers.priceSpecification.price' }, unitCannotInfer };
}

const PRICE_LINE = /^(?:цена(?: товара)?|price)\s*:?\s*((?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d+)?)\s*(BYN|USD|EUR|RUB|GBP|PLN|бел(?:орусск(?:ий|их|ие))?\.?\s*руб(?:ль|ля|лей|ли)?\.?)\s*(?:(?:\/|за|per)\s*(.+))?$/i;
function textOffers(lines) {
  return lines.flatMap(line => {
    const match = line.match(PRICE_LINE);
    if (!match) return [];
    const price = number(match[1]), money = currency(match[2]);
    return price && money ? [{ price, currency: money, unit: unit(match[3]), source: `Подписанная цена: ${line}` }] : [];
  });
}

function packProperty(name, value, inheritedUnit = '') {
  const label = String(name ?? '').trim().replace(/²/g, '2').replace(/\s+/g, ' ');
  const coverage = /^(?:площадь (?:в )?упаковк[ие]|площадь покрытия (?:в )?упаковк[ие]|количество (?:м2|кв\.?\s?м|квадратных метров) в упаковке|pack coverage|area per pack)(?:\s*[,(/]\s*(м2|m2|кв\.?\s?м|mtk)\s*\)?)?$/i.exec(label);
  const pieces = /^(?:количество (?:планок|панелей|досок|плиток|штук) в упаковке|(?:планок|панелей|досок|плиток|штук) в упаковке|количество в упаковке|pieces per pack)(?:\s*[,(/]\s*(шт\.?|pieces?|c62|h87)\s*\)?)?$/i.exec(label);
  if (!coverage && !pieces) return undefined;
  let amount = value, explicit = inheritedUnit || coverage?.[1] || pieces?.[1] || '';
  if (value && typeof value === 'object') { amount = value.value; explicit = value.unitCode ?? value.unitText ?? explicit; }
  else if (typeof value === 'string') {
    const parsed = value.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(.*)$/);
    if (!parsed) return undefined;
    amount = parsed[1]; explicit = parsed[2] || explicit;
  }
  if (coverage && /количество (?:м2|кв\.?\s?м|квадратных метров)/i.test(label) && !explicit) explicit = 'm2';
  // A label explicitly naming pieces supplies the count unit.
  if (pieces && !explicit && !/^количество в упаковке$/i.test(label)) explicit = 'item';
  const result = number(amount), actualUnit = unit(explicit);
  if (!result) return undefined;
  if (coverage && actualUnit === 'm2') return ['coverageM2', result];
  if (pieces && actualUnit === 'item' && Number.isSafeInteger(result)) return ['pieces', result];
  return undefined;
}

export function retailerMetadata({ product, meta, lines, url, observedAt, allowText, warnings, evidence }) {
  const retailer = retailerFor(url), result = retailer ? { retailer } : {};
  const structured = structuredOffer(product, url);
  let offer = structured.offer;
  const visible = allowText && retailer ? textOffers(lines) : [];
  if (structured.ambiguous) warnings.push('На странице несколько цен или предложений: укажите цену и единицу вручную.');
  if (!offer && !structured.ambiguous && visible.length === 1) offer = visible[0];
  if (!offer && !structured.ambiguous && allowText) {
    const price = number(meta['product:price:amount']), money = currency(meta['product:price:currency']);
    if (price && money) offer = { price, currency: money, unit: 'unknown', source: 'OpenGraph product:price:amount / product:price:currency' };
  }
  if (offer && visible.some(value => value.price !== offer.price || value.currency !== offer.currency)) {
    warnings.push('Цена или валюта в данных страницы противоречат видимой цене: укажите предложение вручную.');
    offer = undefined;
  }
  if (offer?.unit === 'unknown' && !structured.unitCannotInfer && visible.length === 1 && offer.price === visible[0].price && offer.currency === visible[0].currency && visible[0].unit !== 'unknown') {
    offer = { ...offer, unit: visible[0].unit, source: `${offer.source}; ${visible[0].source}` };
  }
  if (offer && visible.some(value => value.unit !== 'unknown' && offer.unit !== 'unknown' && value.unit !== offer.unit)) {
    offer = { ...offer, unit: 'unknown' };
    warnings.push('Единицы цены в данных страницы противоречат друг другу: уточните единицу вручную.');
  }
  if (offer) {
    result.offer = { ...offer, source: `${url} — ${offer.source}`, observedAt };
    evidence.push(`Цена: ${offer.source}`);
    if (offer.unit === 'unknown') warnings.push('Единица цены не указана однозначно: уточните м², упаковку или штуку перед расчётом стоимости.');
  } else if (retailer) warnings.push('Цена с явной валютой не найдена однозначно: укажите цену, валюту и единицу вручную.');

  const pack = {}, sources = [], conflicts = new Set();
  const add = (entry, source) => {
    if (!entry) return;
    const [key, value] = entry;
    if (conflicts.has(key)) return;
    if (pack[key] !== undefined && pack[key] !== value) { delete pack[key]; conflicts.add(key); return; }
    pack[key] = value; sources.push(source);
  };
  const properties = product?.additionalProperty;
  for (const property of Array.isArray(properties) ? properties : properties ? [properties] : []) {
    add(packProperty(property?.name ?? property?.propertyID, property?.value, property?.unitCode ?? property?.unitText),
      `JSON-LD additionalProperty: ${String(property?.name ?? property?.propertyID ?? '').slice(0, 120)}`);
  }
  if (allowText && retailer) for (const line of lines) {
    // Colon, definition/table cell separators, or an explicit labelled unit.
    const normalized = line.replace(/²/g, '2');
    const match = normalized.match(/^(.+?)\s*:\s*([^:]+)$/) ?? normalized.match(/^(.+?(?:в упаковке|per pack|[,(/]\s*(?:м2|m2|шт\.?)\s*\)?))\s+([0-9]+(?:[.,][0-9]+)?(?:\s*(?:м2|m2|шт\.?))?)$/i);
    if (match) add(packProperty(match[1], match[2]), `Подписанная упаковка: ${line}`);
  }
  if (conflicts.size) warnings.push('Характеристики упаковки противоречат друг другу: проверьте их вручную.');
  if (Object.keys(pack).length) {
    result.pack = { ...pack, source: `${url} — ${[...new Set(sources)].join('; ')}` };
    evidence.push(`Упаковка: ${[...new Set(sources)].join('; ')}`);
  }
  return result;
}
