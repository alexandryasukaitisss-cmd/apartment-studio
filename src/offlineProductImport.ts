import { extractProduct } from '../server/extract.mjs';
import { retailerFor } from '../server/retailer.mjs';
import type { MaterialQuote } from './model';

export interface ImportedProduct {
  retailer?: string;
  offer?: { price: number; currency: string; unit: MaterialQuote['priceUnit']; observedAt: string; source?: string };
  pack?: { coverageM2?: number; pieces?: number; source?: string };
  title: string;
  url: string;
  category: string;
  brand?: string;
  description?: string;
  color?: string;
  dimensions: { widthCm?: number; depthCm?: number; heightCm?: number; lengthCm?: number; thicknessMm?: number };
  image: { dataUrl: string; sourceUrl: string } | null;
  warnings: string[];
  evidence: string[];
}

function detectSavedUrl(raw: string, fallbackUrl?: string): string {
  if (fallbackUrl && /^https?:\/\//i.test(fallbackUrl.trim())) return fallbackUrl.trim();
  const savedComment = raw.match(/saved from url=\(\d+\)(https?:\/\/[^\s>"']+)/i)?.[1];
  if (savedComment) return savedComment;
  const canonical = raw.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["'](https?:\/\/[^"']+)["']/i)?.[1]
    ?? raw.match(/<link\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
  if (canonical) return canonical;
  const ogUrl = raw.match(/<meta\b[^>]*property=["']og:url["'][^>]*content=["'](https?:\/\/[^"']+)["']/i)?.[1]
    ?? raw.match(/<meta\b[^>]*content=["'](https?:\/\/[^"']+)["'][^>]*property=["']og:url["']/i)?.[1];
  if (ogUrl) return ogUrl;
  const domainMention = raw.match(/\bhttps?:\/\/(?:www\.)?(?:oma\.by|21vek\.by|mile\.by)\/[^\s"'<>)]*/i)?.[0];
  if (domainMention) return domainMention;
  return 'https://local.saved/product';
}

function toCm(amountRaw: string, unitRaw = 'см'): number | undefined {
  const num = Number(amountRaw.replace(/\s+/g, '').replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return undefined;
  const u = unitRaw.trim().toLowerCase();
  const factor = (u === 'мм' || u === 'mm') ? .1 : (u === 'м' || u === 'm') ? 100 : 1;
  const cm = Math.round(num * factor * 10000) / 10000;
  return cm > 0 && cm <= 3000 ? cm : undefined;
}

function parseUnit(raw = ''): MaterialQuote['priceUnit'] {
  const t = raw.trim().toLowerCase().replace(/²/g, '2').replace(/\.$/, '');
  if (/^(?:м2|m2|кв\.?\s?м)$/.test(t)) return 'm2';
  if (/^(?:уп|упак|упаковка|упаковку|pack)$/.test(t)) return 'pack';
  if (/^(?:шт|штука|штуку|item|pcs?)$/.test(t)) return 'item';
  return 'unknown';
}

function inferCategory(text: string): string {
  if (/ванн[аыу]|унитаз|сантехник|раковин|душев|смесител/i.test(text)) return 'plumbing';
  if (/плитк|керамогранит/i.test(text)) return 'tile';
  if (/ламинат|паркет|напольн|винилов|кварцвинил|линолеум/i.test(text)) return 'flooring';
  if (/мебел|диван|кроват|стул|стол|шкаф|кресл|комод|тумб|матрас/i.test(text)) return 'furniture';
  return 'unknown';
}

/**
 * Parse a saved HTML file or copied product text from OMA, 21vek, Mile or any store page
 * locally without making network requests.
 */
export function parseOfflineProduct(input: string, providedUrl?: string, observedAt = new Date().toISOString()): ImportedProduct {
  const trimmed = input.trim();
  if (!trimmed) throw Error('Вставьте текст карточки или выберите сохранённый HTML-файл.');
  if (trimmed.length > 8_000_000) throw Error('Содержимое страницы слишком большое (до 8 МБ).');

  const url = detectSavedUrl(trimmed, providedUrl);
  const looksLikeHtml = /<(?:!doctype|html|head|body|script|meta|title|h1|table|div|dl|section|article|span|p)\b/i.test(trimmed);
  const base: ImportedProduct = looksLikeHtml
    ? (extractProduct(trimmed, url, { observedAt }).result as ImportedProduct)
    : {
        title: 'Товар по ссылке',
        url,
        category: 'unknown',
        dimensions: {},
        image: null,
        warnings: [],
        evidence: [],
      };

  const retailer = base.retailer ?? retailerFor(url)
    ?? (/\b21vek\.by\b|21\s*век/i.test(trimmed) ? '21vek' : /\boma\.by\b|\bома\b/i.test(trimmed) ? 'oma' : /\bmile\.by\b|\bмиле\b/i.test(trimmed) ? 'mile' : undefined);
  if (retailer) base.retailer = retailer;
  if (url === 'https://local.saved/product' && !providedUrl) base.url = '';

  // Extract plain lines from HTML or raw text, stripping related/recommendation/shipping sections first.
  const textContent = looksLikeHtml
    ? trimmed
        .replace(/<(?:section|div|aside)\b[^>]*(?:related|recommend|similar|shipping|package|packaging|похожие|рекоменд|доставк|упаковк)[^>]*>[\s\S]*?<\/(?:section|div|aside)>/gi, '\n')
        .replace(/<script\b[\s\S]*?<\/script>/gi, '\n')
        .replace(/<style\b[\s\S]*?<\/style>/gi, '\n')
        .replace(/<\/(?:td|th|dt|span)>/gi, '\t')
        .replace(/<\/(?:tr|dd|li|p|div|h[1-6]|br)>/gi, '\n')
        .replace(/<[^<>]+>/g, ' ')
    : trimmed;

  const lines = textContent
    .split(/\r?\n/)
    .map(l => l.replace(/[\u00a0\u202f]/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);

  if (!base.title || base.title === 'Товар по ссылке') {
    const h1 = looksLikeHtml ? trimmed.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^<>]+>/g, ' ').replace(/\s+/g, ' ').trim() : undefined;
    const firstHeading = h1 || lines.find(l => l.length >= 4 && l.length <= 160 && !/^(?:ширина|глубина|высота|длина|толщина|цена|артикул|код|характеристики|цвет)\b/i.test(l));
    if (firstHeading) {
      base.title = firstHeading.slice(0, 240);
      base.evidence.push('Название: заголовок из сохранённой карточки');
    }
  }

  const needsFallbackDims = Object.keys(base.dimensions).length === 0;
  for (const line of lines) {
    if (/габариты доставки|размеры упаковки|вес брутто/i.test(line)) continue;

    // 1. Explicit single dimension line: "Ширина: 180 см" or "Ширина, мм 194" or "Длина 1292 мм"
    const singleDim = needsFallbackDims ? line.match(/^(?:габаритная\s+)?(ширина|глубина|высота|длина|толщина|width|depth|height|length|thickness)(?:\s*[,(/]\s*(мм|см|м|mm|cm|m)\s*\)?)?\s*[:.\t-]?\s*(\d+(?:[.,]\d+)?)\s*(мм|см|м|mm|cm|m)?$/i) : null;
    if (singleDim) {
      const label = singleDim[1].toLowerCase();
      const unit = singleDim[4] || singleDim[2] || (label.startsWith('толщ') || label === 'thickness' ? 'мм' : 'см');
      const cm = toCm(singleDim[3], unit);
      if (cm !== undefined) {
        if ((label === 'ширина' || label === 'width') && base.dimensions.widthCm === undefined) {
          base.dimensions.widthCm = cm;
          base.evidence.push(`widthCm: строка «${line}»`);
        } else if ((label === 'глубина' || label === 'depth') && base.dimensions.depthCm === undefined) {
          base.dimensions.depthCm = cm;
          base.evidence.push(`depthCm: строка «${line}»`);
        } else if ((label === 'высота' || label === 'height') && base.dimensions.heightCm === undefined) {
          base.dimensions.heightCm = cm;
          base.evidence.push(`heightCm: строка «${line}»`);
        } else if ((label === 'длина' || label === 'length') && base.dimensions.lengthCm === undefined) {
          base.dimensions.lengthCm = cm;
          base.evidence.push(`lengthCm: строка «${line}»`);
        } else if ((label === 'толщина' || label === 'thickness') && base.dimensions.thicknessMm === undefined) {
          base.dimensions.thicknessMm = Math.round(cm * 10 * 1000) / 1000;
          base.evidence.push(`thicknessMm: строка «${line}»`);
        }
      }
    }

    // 2. Combined WxDxH or WxL pattern: "Размеры (ШхГхВ): 180х90х75 см" or "Формат: 60×120 см"
    const triple = line.match(/(?:размеры|габариты|ш\s*[xх×*]\s*г\s*[xх×*]\s*в)[^0-9]*(\d+(?:[.,]\d+)?)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)\s*(мм|см|м|mm|cm|m)/i);
    if (triple) {
      const w = toCm(triple[1], triple[4]), d = toCm(triple[2], triple[4]), h = toCm(triple[3], triple[4]);
      if (w && base.dimensions.widthCm === undefined) base.dimensions.widthCm = w;
      if (d && base.dimensions.depthCm === undefined) base.dimensions.depthCm = d;
      if (h && base.dimensions.heightCm === undefined) base.dimensions.heightCm = h;
      base.evidence.push(`Габариты Ш×Г×В: «${line}»`);
    }
    const pair = line.match(/(?:формат|размер(?:\s+плитки|\s+доски)?)\s*[:.\t-]?\s*(\d+(?:[.,]\d+)?)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)\s*(мм|см|м|mm|cm|m)/i);
    if (pair) {
      const w = toCm(pair[1], pair[3]), l = toCm(pair[2], pair[3]);
      if (w && base.dimensions.widthCm === undefined) base.dimensions.widthCm = w;
      if (l && base.dimensions.lengthCm === undefined) base.dimensions.lengthCm = l;
      base.evidence.push(`Формат: «${line}»`);
    }

    // 3. Pack coverage and pieces
    const packArea = line.match(/(?:площадь\s+(?:покрытия\s+)?(?:в\s+)?упаковк[еи]|в\s+упаковке|упаковка)(?:\s*[,(/]\s*(?:м2|м²|m2|кв\.?\s?м)\s*\)?)?\s*[:.\t-]?\s*(\d+(?:[.,]\d+)?)\s*(?:м2|м²|m2|кв\.?\s?м)?/i);
    if (packArea && (/площадь/i.test(line) || /(?:м2|м²|m2|кв)/i.test(line))) {
      const val = Number(packArea[1].replace(',', '.'));
      if (Number.isFinite(val) && val > 0 && val <= 100 && base.pack?.coverageM2 === undefined) {
        base.pack = { ...base.pack, coverageM2: val };
        base.evidence.push(`Площадь упаковки: «${line}»`);
      }
    }
    const packPcs = line.match(/(?:количество\s+(?:планок|панелей|плиток|штук|досок)?\s*в\s+упаковке|(?:планок|плиток|штук)\s+в\s+упаковке)(?:\s*[,(/]\s*(?:шт\.?|pcs?)\s*\)?)?\s*[:.\t-]?\s*(\d+)\s*(?:шт\.?|pcs?)?$/i);
    if (packPcs) {
      const pcs = Number(packPcs[1]);
      if (Number.isInteger(pcs) && pcs > 0 && base.pack?.pieces === undefined) {
        base.pack = { ...base.pack, pieces: pcs };
        base.evidence.push(`Штук в упаковке: «${line}»`);
      }
    }

    // 4. Price and unit
    if (!base.offer) {
      const priceMatch = line.match(/(?:^(?:цена(?:\s+товара)?|стоимость|price)\s*[:.\t-]?\s*)?(\d{1,3}(?:[ ]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(BYN|EUR|USD|RUB|бел\.?\s*руб(?:ль|ля|лей)?\.?|р\.|руб\.)(?:\s*(?:\/|за|в)\s*(м2|м²|m2|кв\.?\s?м|уп\.?|упаковк[ау]|pack|шт\.?|штук[ау]))?$/i);
      if (priceMatch && (/цена|стоимость|price|\/|за\s+(?:м|уп|шт)|BYN|бел/i.test(line) || lines.length <= 15)) {
        const price = Number(priceMatch[1].replace(/\s+/g, '').replace(',', '.'));
        const rawCur = priceMatch[2].toUpperCase();
        const currency = /^(?:BYN|EUR|USD|RUB)$/.test(rawCur) ? rawCur : 'BYN';
        const unit = parseUnit(priceMatch[3] ?? '');
        if (Number.isFinite(price) && price > 0) {
          base.offer = { price, currency, unit, observedAt, source: `Из текста карточки: ${line}` };
          base.evidence.push(`Цена: «${line}» (${currency})`);
        }
      }
    }

    // 5. Color
    if (!base.color) {
      const colorMatch = line.match(/^(?:цвет|оттенок|color|colour)\s*[:.\t-]\s*(.{2,60})$/i);
      if (colorMatch) {
        base.color = colorMatch[1].trim();
        base.evidence.push(`Цвет: «${line}»`);
      }
    }
  }

  if (base.category === 'unknown') {
    base.category = inferCategory(`${base.title} ${lines.slice(0, 20).join(' ')}`);
  }

  if (!base.image && looksLikeHtml) {
    const dataImg = trimmed.match(/src=["'](data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]{32,2500000})["']/i)?.[1];
    if (dataImg) {
      base.image = { dataUrl: dataImg, sourceUrl: url };
      base.evidence.push('Фото: встроенное изображение из сохранённой страницы');
    }
  }

  // Clean out stale warnings that were resolved by fallback extraction.
  base.warnings = base.warnings.filter(w => {
    if (w.includes('Размеры с явными единицами не найдены') && Object.keys(base.dimensions).length > 0) return false;
    if (w.includes('Цвет не найден') && base.color) return false;
    if (w.includes('Цена с явной валютой не найдена') && base.offer) return false;
    return true;
  });

  if (!Object.keys(base.dimensions).length && !base.warnings.some(w => w.includes('Размеры')))
    base.warnings.push('Размеры с явными единицами не найдены: укажите их вручную.');
  if (!base.offer && !base.warnings.some(w => w.includes('Цена')))
    base.warnings.push('Цена не распознана автоматически: при необходимости укажите её вручную.');

  return base;
}
