import { retailerMetadata } from './retailer.mjs';

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
function decode(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity.toLowerCase()] ?? all;
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : '';
  });
}

function plain(value, max = 1000) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return decode(String(value).replace(/<[^<>]*>/g, ' ')).replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

function attributes(tag) {
  const result = Object.create(null);
  let index = 0;
  while (index < tag.length) {
    while (index < tag.length && /[\s<>/]/.test(tag[index])) index++;
    const start = index;
    while (index < tag.length && !/[\s=<>/]/.test(tag[index])) index++;
    const name = tag.slice(start, index).toLowerCase();
    while (index < tag.length && /\s/.test(tag[index])) index++;
    if (tag[index] !== '=') {
      if (name && name.length <= 80) result[name] = '';
      if (index === start) index++;
      continue;
    }
    index++;
    while (index < tag.length && /\s/.test(tag[index])) index++;
    const quote = tag[index] === '"' || tag[index] === "'" ? tag[index++] : '';
    const valueStart = index;
    if (quote) {
      index = tag.indexOf(quote, index);
      if (index < 0) break;
    } else while (index < tag.length && !/[\s<>]/.test(tag[index])) index++;
    if (name && name.length <= 80) result[name] = decode(tag.slice(valueStart, Math.min(index, valueStart + 4096)));
    if (quote) index++;
  }
  return result;
}

// A single forward scan keeps malformed/unclosed tags from causing repeated
// searches across the whole document. This is metadata parsing, not an HTML
// renderer: comments and executable/style content never become visible text.
function* htmlTokens(html) {
  const lower = html.toLowerCase();
  let position = 0;
  while (position < html.length) {
    const start = html.indexOf('<', position);
    if (start < 0) { yield { text: html.slice(position) }; return; }
    if (start > position) yield { text: html.slice(position, start) };
    if (lower.startsWith('<!--', start)) {
      const end = lower.indexOf('-->', start + 4);
      if (end < 0) return;
      position = end + 3; continue;
    }
    let end = start + 1;
    let quote = '';
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === html.length) return;
    const markup = html.slice(start, end + 1);
    const match = markup.match(/^<\s*(\/?)\s*([a-z][a-z0-9:-]*)/i);
    position = end + 1;
    if (!match) continue;
    const name = match[2].toLowerCase();
    const closing = Boolean(match[1]);
    if (!closing && ['script', 'style', 'noscript', 'title'].includes(name)) {
      const close = lower.indexOf(`</${name}`, position);
      const closeEnd = close < 0 ? -1 : lower.indexOf('>', close);
      if (closeEnd < 0) return;
      yield { name, markup, raw: html.slice(position, close) };
      position = closeEnd + 1;
    } else yield { name, markup, closing };
  }
}

const UNIT_CM = { mm: 0.1, мм: 0.1, mmt: 0.1, millimeter: 0.1, millimeters: 0.1,
  cm: 1, см: 1, cmt: 1, centimeter: 1, centimeters: 1,
  m: 100, м: 100, mtr: 100, meter: 100, meters: 100,
  in: 2.54, inch: 2.54, inches: 2.54, inh: 2.54, '"': 2.54, '″': 2.54,
  ft: 30.48, foot: 30.48, feet: 30.48, fot: 30.48, "'": 30.48 };

export function dimensionCm(value, inheritedUnit = '') {
  let amount, unit;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    amount = value.value;
    unit = value.unitCode ?? value.unitText ?? inheritedUnit;
  } else {
    const match = String(value ?? '').trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*([a-zа-я"'″]+)?$/i);
    if (!match) return undefined;
    amount = match[1]; unit = match[2] ?? inheritedUnit;
  }
  const numeric = Number(String(amount ?? '').replace(',', '.'));
  const factor = UNIT_CM[String(unit).trim().toLowerCase()];
  const result = numeric * factor;
  return factor && Number.isFinite(result) && result > 0 && result <= 3000
    ? Math.round(result * 10000) / 10000 : undefined;
}

const LABELS = [
  ['widthCm', /^(?:width|ширина)$/i], ['depthCm', /^(?:depth|глубина)$/i],
  ['heightCm', /^(?:height|высота)$/i], ['lengthCm', /^(?:length|длина)$/i],
  ['thicknessMm', /^(?:thickness|толщина)$/i],
];

function labelInfo(input) {
  const match = plain(input, 120).match(/^(.+?)(?:\s*[,(/]\s*(mm|cm|m|in|ft|мм|см|м)\s*\)?)?$/i);
  if (!match) return null;
  const label = match[1].trim();
  const unit = match[2] ?? '';
  const item = LABELS.find(([, regex]) => regex.test(label));
  return item ? { key: item[0], unit } : null;
}

function productCandidates(value, result = [], depth = 0) {
  if (!value || depth > 12 || result.length >= 20) return result;
  if (Array.isArray(value)) {
    for (const child of value) productCandidates(child, result, depth + 1);
  } else if (typeof value === 'object') {
    const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
    if (types.some(type => typeof type === 'string' && /(?:^|[/#])(?:Product|IndividualProduct)$/.test(type))) {
      result.push(value);
      // Related items and shipping packages are not the selected product.
      return result;
    }
    for (const [key, child] of Object.entries(value)) {
      if (['@graph', 'mainEntity', 'item', 'itemListElement', 'hasVariant'].includes(key)) {
        productCandidates(child, result, depth + 1);
      }
    }
  }
  return result;
}

function categoryOf(text) {
  if (/\b(?:bathtub|toilet|washbasin|shower|sanitary|faucet|sink)\b|ванн[аыу]|унитаз|сантехник|раковин|душев/i.test(text)) return 'plumbing';
  if (/\b(?:tile|tiles|porcelain|ceramic)\b|плитк|керамогранит/i.test(text)) return 'tile';
  if (/\b(?:laminate|flooring|parquet|engineered wood|vinyl floor)\b|ламинат|паркет|напольн|винилов.*пол/i.test(text)) return 'flooring';
  if (/\b(?:furniture|sofa|bed|chair|table|wardrobe|cabinet|desk|armchair|bookcase)\b|мебел|диван|кроват|стул|стол|шкаф|кресл|комод|тумб/i.test(text)) return 'furniture';
  return 'unknown';
}

function imageUrl(value, base) {
  const first = Array.isArray(value) ? value[0] : value;
  const source = first && typeof first === 'object' ? first.contentUrl ?? first.url : first;
  if (typeof source !== 'string' || source.length > 2048) return undefined;
  try {
    const url = new URL(decode(source), base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

function samePage(value, base) {
  const source = typeof value === 'object' ? value?.['@id'] ?? value?.url : value;
  if (typeof source !== 'string') return false;
  try {
    const candidate = new URL(source, base), page = new URL(base);
    candidate.hash = ''; page.hash = '';
    return candidate.href === page.href;
  } catch { return false; }
}

function selectProduct(candidates, url) {
  const matching = candidates.filter(product => [product.url, product['@id'], product.mainEntityOfPage]
    .some(value => samePage(value, url)));
  if (matching.length === 1) return matching[0];
  if (candidates.length !== 1) return undefined;
  const only = candidates[0];
  // A sole card explicitly pointing to another page can still be a recommendation.
  return only.url && !samePage(only.url, url) ? undefined : only;
}

const RELATED = /recommend|related|cross.?sell|up.?sell|similar|рекоменд|похожие|сопутствующ/i;
const SHIPPING = /shipping|delivery.?dimensions|package.?dimensions|packaging.?dimensions|габариты.?доставки|размеры.?упаковки/i;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// Keep dimensions and quotes out of unrelated cards and delivery containers.
// Unknown/malformed nesting fails conservatively by keeping the exclusion.
function visibleLines(text) {
  let related = false, shipping = false, packaged = false;
  const lines = [];
  for (const raw of decode(text).split('\n').slice(0, 15000)) {
    const line = plain(raw, 2000);
    if (/^(?:рекомендуем|рекомендации|похожие товары|с этим товаром|вам также|related products|recommended|you may also)/i.test(line)) related = true;
    if (related) continue;
    if (/^(?:package dimensions|packaging|shipping dimensions|габариты доставки|размеры упаковки|упаковка и доставка)$/i.test(line)) shipping = true;
    if (/^(?:характеристики(?: товара)?|product specifications|product characteristics|размеры товара)$/i.test(line)) { shipping = false; packaged = false; }
    if (/^(?:упаковка|pack information|package)$/i.test(line)) packaged = true;
    if (!shipping) lines.push({ text: line, packaged });
  }
  return lines;
}

export function extractProduct(html, url, { observedAt = new Date().toISOString() } = {}) {
  const warnings = [];
  const evidence = [];
  const candidates = [];
  const meta = Object.create(null);
  const textParts = [];
  const stack = [];
  let documentTitle;
  for (const token of htmlTokens(html)) {
    const excluded = stack.some(frame => frame.excluded);
    if (token.text !== undefined) { if (!excluded) textParts.push(token.text); continue; }
    if (token.closing) {
      const index = stack.findLastIndex(frame => frame.name === token.name);
      if (index >= 0) stack.splice(index);
      if (!excluded) textParts.push(/^(?:p|div|li|tr|dd|h[1-6]|section|article)$/.test(token.name) ? '\n' : ' ');
      continue;
    }
    const attrs = attributes(token.markup);
    const context = `${attrs.id ?? ''} ${attrs.class ?? ''} ${attrs['aria-label'] ?? ''}`;
    const ownExcluded = RELATED.test(context) || SHIPPING.test(context) || attrs.hidden !== undefined || attrs['aria-hidden'] === 'true';
    if (!VOID.has(token.name) && token.raw === undefined && !/\/\s*>$/.test(token.markup)) {
      if (stack.length < 512) stack.push({ name: token.name, excluded: excluded || ownExcluded });
      else if (ownExcluded) stack[stack.length - 1].excluded = true;
    }
    if (excluded || ownExcluded) continue;
    if (token.name === 'script' && attributes(token.markup).type?.trim().toLowerCase() === 'application/ld+json') {
      try { productCandidates(JSON.parse(token.raw), candidates); }
      catch { if (!warnings.length) warnings.push('Часть структурированных данных страницы повреждена.'); }
    } else if (token.name === 'meta' && !token.closing) {
      const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
      if (attrs.content && !meta[key]) meta[key] = attrs.content;
    } else if (token.name === 'title' && documentTitle === undefined) documentTitle = token.raw;
    else if (token.raw === undefined) {
      textParts.push(token.name === 'br' ? '\n' : ' ');
    }
  }
  const product = selectProduct(candidates, url);
  if (candidates.length > 1) warnings.push('На странице несколько товаров: проверьте, выбран ли нужный вариант.');
  const name = plain(product?.name, 240);
  const title = name || plain(meta['og:title'] ?? meta['twitter:title'] ?? documentTitle, 240) || 'Товар по ссылке';
  if (name) evidence.push('Название: JSON-LD Product.name');
  else if (meta['og:title']) evidence.push('Название: OpenGraph og:title');
  else if (documentTitle) evidence.push('Название: заголовок HTML страницы');
  const description = plain(product?.description ?? meta['og:description'] ?? meta.description, 1200);
  const brand = plain(typeof product?.brand === 'object' ? product.brand?.name : product?.brand, 120);
  const color = plain(product?.color, 120);
  const dimensions = {};
  const assign = (key, value, unit, source) => {
    if (dimensions[key] !== undefined) return;
    const cm = dimensionCm(value, unit);
    if (cm !== undefined) {
      dimensions[key] = key === 'thicknessMm' ? Math.round(cm * 100000) / 10000 : cm;
      evidence.push(`${key}: ${source}`);
    }
  };
  for (const [key] of LABELS) {
    const property = key.replace(/(?:Cm|Mm)$/, '');
    assign(key, product?.[property], '', `JSON-LD Product.${property}`);
  }
  const properties = product?.additionalProperty;
  for (const property of Array.isArray(properties) ? properties : properties ? [properties] : []) {
    const label = labelInfo(property?.name ?? property?.propertyID);
    if (label) assign(label.key, property.value, property.unitCode ?? property.unitText ?? label.unit,
      `JSON-LD additionalProperty: ${plain(property.name, 100)}`);
  }
  // Text fallback accepts explicit labels and units rather than guessing the
  // order of unlabelled "180x90" sizes. Ambiguous product lists are skipped.
  const scopedLines = visibleLines(textParts.join(''));
  const lines = scopedLines.map(line => line.text);
  const allowLoose = candidates.length === 0 || candidates.length === 1 && Boolean(product);
  for (let index = 0; allowLoose && index < lines.length; index++) {
    const line = lines[index];
    // Package and shipping measurements do not describe the installed object.
    if (scopedLines[index].packaged || /package|packaging|carton|shipping dimensions|упаковк|габариты доставки/i.test(line)) continue;
    const match = line.trim().match(/^(width|depth|height|length|thickness|ширина|глубина|высота|длина|толщина)\s*(?:[,(/]\s*(mm|cm|m|in|ft|мм|см|м)\s*\)?)?\s*:?\s*([0-9]+(?:[.,][0-9]+)?)\s*(mm|cm|m|in|ft|мм|см|м|inches|inch|"|″)?\s*$/i);
    if (!match) continue;
    const label = labelInfo(match[1]);
    assign(label.key, match[3], match[4] ?? match[2] ?? '', `Подписанная характеристика: ${match[1]}`);
  }
  let fallbackColor;
  if (!color && allowLoose) {
    for (const line of lines) {
      const match = line.trim().match(/^(?:color|colour|цвет)\s*:\s*([^:;]{1,100})$/i);
      if (match) { fallbackColor = plain(match[1], 120); break; }
    }
  }
  const category = categoryOf([plain(product?.category, 200), title].join(' '));
  const result = { title, url, category, ...(brand ? { brand } : {}), ...(description ? { description } : {}),
    ...(color || fallbackColor ? { color: color || fallbackColor } : {}), dimensions,
    image: null, warnings, evidence };
  Object.assign(result, retailerMetadata({ product, meta, lines, url, observedAt,
    allowText: candidates.length === 0 ? meta['og:type'] === 'product' : candidates.length === 1 && Boolean(product), warnings, evidence }));
  if (brand) evidence.push('Бренд: JSON-LD Product.brand');
  if (color) evidence.push('Цвет: JSON-LD Product.color');
  if (fallbackColor) evidence.push('Цвет: подписанная характеристика страницы');
  if (category !== 'unknown') evidence.push('Категория: предположение по названию или категории товара');
  if (!product) warnings.push(candidates.length ? 'Не удалось однозначно выбрать Product JSON-LD этой страницы: проверьте товар и вариант вручную.' : 'Страница не содержит Product JSON-LD: проверьте, что это конкретный товар, а не каталог.');
  if (!Object.keys(dimensions).length) warnings.push('Размеры с явными единицами не найдены: укажите их вручную.');
  if (!result.color) warnings.push('Цвет не найден: укажите его вручную.');
  const candidateImage = imageUrl(product?.image, url) ?? imageUrl(meta['og:image'] ?? meta['twitter:image'], url);
  if (candidateImage) evidence.push(product?.image ? 'Фото: JSON-LD Product.image' : 'Фото: OpenGraph/Twitter metadata');
  else warnings.push('Ссылка на фотографию товара не найдена.');
  warnings.push('Фото не является готовой бесшовной текстурой или точной 3D моделью. Проверьте характеристики перед применением.');
  return { result, candidateImage };
}
