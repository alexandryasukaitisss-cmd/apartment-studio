import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractProduct } from './extract.mjs';
import { retailerFor } from './retailer.mjs';
import { createProductImporter } from './import-product.mjs';
import { createPublicFetcher, ImportError } from './network.mjs';

const url = 'https://www.oma.by/synthetic-product';
const observedAt = '2026-10-03T07:00:00.000Z';
const ld = product => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Synthetic laminate', ...product })}</script>`;
const extract = (product, text = '', page = url) => extractProduct(ld(product) + text, page, { observedAt }).result;

test('retailer identity uses exact host boundaries and never infers identity from paths', () => {
  for (const [address, retailer] of [['https://www.oma.by/x', 'oma'], ['https://oma.by/x', 'oma'],
    ['https://www.21vek.by/x', '21vek'], ['https://mile.by/x', 'mile']]) assert.equal(retailerFor(address), retailer);
  for (const address of ['https://oma.by.evil.shop/x', 'https://eviloma.by/x', 'https://shop.public/oma.by', 'garbage']) assert.equal(retailerFor(address), undefined);
});

test('three named-store synthetic fixtures preserve explicitly evidenced offers, packs and dimensions', async () => {
  const oma = extractProduct(await readFile(new URL('./fixtures/retailer-synthetic/oma.html', import.meta.url), 'utf8'), url, { observedAt }).result;
  assert.equal(oma.retailer, 'oma'); assert.equal(oma.offer.price, 34.5); assert.equal(oma.offer.currency, 'BYN'); assert.equal(oma.offer.unit, 'm2');
  assert.equal(oma.offer.observedAt, observedAt); assert.ok(oma.offer.source.includes(url));
  assert.deepEqual(oma.dimensions, { widthCm: 19.4, lengthCm: 129.2, thicknessMm: 8 });
  assert.equal(oma.pack.coverageM2, 2.005); assert.equal(oma.pack.pieces, 8);
  const vek = extractProduct(await readFile(new URL('./fixtures/retailer-synthetic/21vek.html', import.meta.url), 'utf8'), 'https://www.21vek.by/synthetic-product', { observedAt }).result;
  assert.equal(vek.retailer, '21vek'); assert.equal(vek.offer.price, 73.8); assert.equal(vek.offer.unit, 'pack');
  assert.deepEqual(vek.dimensions, { widthCm: 60, lengthCm: 60 }); assert.equal(vek.color, undefined);
  assert.equal(vek.pack.coverageM2, 1.44); assert.equal(vek.pack.pieces, 4);
  const mile = extractProduct(await readFile(new URL('./fixtures/retailer-synthetic/mile.html', import.meta.url), 'utf8'), 'https://mile.by/synthetic-product', { observedAt }).result;
  assert.equal(mile.retailer, 'mile'); assert.equal(mile.offer.price, 250); assert.equal(mile.offer.unit, 'item');
  assert.deepEqual(mile.dimensions, { widthCm: 80, depthCm: 40, heightCm: 180 }); assert.equal(mile.pack, undefined);
});

test('bare structured price keeps unknown unit; country and flooring category supply nothing', () => {
  const result = extract({ category: 'Ламинат', offers: { price: '29.99', priceCurrency: 'BYN' } });
  assert.equal(result.offer.unit, 'unknown'); assert.ok(result.warnings.some(value => value.includes('Единица цены')));
  assert.equal(result.pack, undefined);
  assert.equal(extract({ offers: { price: '29.99' } }).offer, undefined);
  assert.equal(extract({ offers: { price: '29.99', priceCurrency: 'руб.' } }).offer, undefined);
});

test('reference quantities other than one, billing increments and unrecognized units stay unknown', () => {
  for (const priceSpecification of [{ referenceQuantity: { value: 2, unitCode: 'MTK' } },
    { referenceQuantity: { unitCode: 'MTK' } }, { unitCode: 'MTK', billingIncrement: 10 }, { unitText: 'kg' }]) {
    assert.equal(extract({ offers: { price: 30, priceCurrency: 'EUR', priceSpecification } }).offer.unit, 'unknown');
  }
});

test('zero, negative, infinite, ambiguous and labelled range prices are never numeric offers', () => {
  for (const price of [0, -1, Infinity, 'Infinity', 'от 20', '10–30', '1,234.56', 'NaN', '20 BYN', '1e6']) {
    assert.equal(extract({ offers: { price, priceCurrency: 'BYN' } }).offer, undefined, String(price));
  }
  assert.equal(extract({ offers: { price: '1 234,56', priceCurrency: 'EUR', unitText: 'pack' } }).offer.price, 1234.56);
});

test('multiple offers/specifications and AggregateOffer never choose the cheapest or first price', () => {
  for (const offers of [[{ price: 10, priceCurrency: 'BYN' }, { price: 20, priceCurrency: 'BYN' }],
    { '@type': 'AggregateOffer', lowPrice: 10, highPrice: 30, price: 10, priceCurrency: 'BYN' },
    { price: 30, priceCurrency: 'BYN', priceSpecification: [{ price: 10 }, { price: 30 }] }]) {
    assert.equal(extract({ offers }, '<p>Цена: 10 BYN / м²</p>').offer, undefined);
  }
});

test('member and subscription prices do not supply an automatic quote', () => {
  assert.equal(extract({ offers: { price: 30, priceCurrency: 'BYN', validForMemberTier: 'VIP' } }).offer, undefined);
  const result = extract({ offers: { priceSpecification: { price: 10, priceCurrency: 'BYN', billingDuration: 'P1M' } } });
  assert.equal(result.offer, undefined);
  assert.equal(extract({ offers: { price: 10, priceCurrency: 'BYN', priceSpecification: { unitText: 'item', billingDuration: 'P1M' } } }).offer, undefined);
});

test('selected product URL beats a preceding recommendation and shipping offers', () => {
  const html = `<script type="application/ld+json">${JSON.stringify([
    { '@type': 'Product', url: 'https://www.oma.by/unrelated', name: 'Chair', width: '90 cm', offers: { price: 999, priceCurrency: 'BYN' } },
    { '@type': 'Product', '@id': `${url}#product`, name: 'Actual laminate', width: '194 mm', offers: { price: 30, priceCurrency: 'BYN', unitText: 'm2', shippingDetails: { price: 999, width: '300 cm' } } },
  ])}</script><p>Площадь упаковки: 99 м²</p>`;
  const result = extractProduct(html, url).result;
  assert.equal(result.title, 'Actual laminate'); assert.deepEqual(result.dimensions, { widthCm: 19.4 });
  assert.equal(result.offer.price, 30); assert.equal(result.pack, undefined);
});

test('ambiguous product lists cannot leak first product prices, images, color or dimensions', () => {
  const html = `<script type="application/ld+json">${JSON.stringify([
    { '@type': 'Product', name: 'Chair', width: '90 cm', color: 'Red', image: '/chair.png', offers: { price: 999, priceCurrency: 'BYN' } },
    { '@type': 'Product', name: 'Laminate', width: '194 mm' },
  ])}</script><p>Цена: 20 BYN / м²</p><p>Цвет: Red</p><p>Ширина: 999 cm</p>`;
  const { result, candidateImage } = extractProduct(html, url);
  assert.equal(result.offer, undefined); assert.equal(result.color, undefined); assert.equal(candidateImage, undefined);
  assert.deepEqual(result.dimensions, {});
});

test('unrelated containers and headings suppress metadata regardless of distance from their heading', () => {
  const result = extract({}, `<section class="related-products">${ld({ name: 'Recommendation', width: '999 cm' })}<p>Цена: 8 BYN / м²</p><p>Площадь упаковки: 9 м²</p></section>
    <h2>Рекомендуем</h2><p>One</p><p>Two</p><p>Three</p><p>Four</p><p>Ширина: 900 cm</p><p>Цвет: Purple</p><p>Цена: 10 BYN / м²</p>`);
  assert.equal(result.offer, undefined); assert.equal(result.pack, undefined); assert.equal(result.color, undefined);
  assert.deepEqual(result.dimensions, {});
});

test('shipping sections persist past three lines and product characteristics restore installed dimensions', () => {
  const result = extract({}, `<h2>Размeры упаковки</h2><p>Ширина упаковки: 100 cm</p>
    <h2>Размеры упаковки</h2><p>One</p><p>Two</p><p>Three</p><p>Four</p><p>Ширина: 999 cm</p>
    <h2>Характеристики товара</h2><p>Ширина: 19,4 cm</p><p>Длина: 1292 мм</p><p>Толщина: 8 мм</p>`);
  assert.deepEqual(result.dimensions, { widthCm: 19.4, lengthCm: 129.2, thicknessMm: 8 });
});

test('pack coverage needs area-per-pack label and explicit area unit; pieces need integers', () => {
  const result = extract({ additionalProperty: [{ name: 'Площадь упаковки', value: 2.1, unitCode: 'MTK' },
    { name: 'Площадь плитки', value: '99 m2' }, { name: 'Количество планок в упаковке', value: '8' },
    { name: 'Ширина упаковки', value: '99 cm' }] });
  assert.equal(result.pack.coverageM2, 2.1); assert.equal(result.pack.pieces, 8); assert.deepEqual(result.dimensions, {});
  for (const value of ['2.1', 2.1, '-3 m2', '0 m2', '2.1 cm2']) assert.equal(extract({ additionalProperty: { name: 'Площадь упаковки', value } }).pack, undefined);
  assert.equal(extract({ additionalProperty: { name: 'Плиток в упаковке', value: 2.5 } }).pack, undefined);
  assert.equal(extract({ additionalProperty: { name: 'Количество планок', value: 8 } }).pack, undefined);
  assert.equal(extract({ additionalProperty: { name: 'Количество в упаковке', value: 8 } }).pack, undefined);
  assert.equal(extract({ additionalProperty: { name: 'Количество в упаковке, шт.', value: 8 } }).pack.pieces, 8);
});

test('conflicting pack fields stay missing rather than silently choosing first evidence', () => {
  const result = extract({ additionalProperty: [{ name: 'Площадь упаковки', value: '2 m2' }, { name: 'Площадь упаковки', value: '3 m2' }, { name: 'Штук в упаковке', value: 8 }] });
  assert.equal(result.pack.coverageM2, undefined); assert.equal(result.pack.pieces, 8);
  assert.ok(result.warnings.some(value => value.includes('противоречат')));
});

test('OpenGraph price has explicit currency and unknown unit; catalogue pages do not gain a quote', () => {
  const meta = '<meta property="product:price:amount" content="30"><meta property="product:price:currency" content="BYN">';
  assert.equal(extractProduct(meta, url).result.offer, undefined);
  const result = extractProduct('<meta property="og:type" content="product">' + meta, url, { observedAt }).result;
  assert.equal(result.offer.price, 30); assert.equal(result.offer.unit, 'unknown');
});

test('labelled price currency is explicit; bare rubles or page country never imply BYN', () => {
  assert.equal(extract({}, '<p>Цена: 30 руб. / м²</p><p>Беларусь</p>').offer, undefined);
  assert.equal(extract({}, '<p>Цена: 30 бел. руб. / м²</p>').offer.currency, 'BYN');
  const result = extract({}, '<p>Цена: 30 EUR / м²</p><p>Цена: 40 EUR / м²</p>');
  assert.equal(result.offer, undefined);
});

test('importer returns additive quote metadata without requiring an image or extra requests', async () => {
  let calls = 0;
  const importer = createProductImporter({ fetchPublic: async address => {
    calls++; return { url: address, headers: { 'content-type': 'text/html' }, body: Buffer.from(ld({ offers: { price: 30, priceCurrency: 'BYN', unitCode: 'MTK' } })) };
  } });
  const result = await importer(url);
  assert.equal(result.offer.unit, 'm2'); assert.equal(result.image, null); assert.equal(calls, 1);
  assert.ok(Number.isFinite(Date.parse(result.offer.observedAt)));
});

test('retailer identity cannot relax private redirects or blocked HTTP status errors', async () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  for (const status of [403, 429]) {
    const importer = createProductImporter({ fetchPublic: createPublicFetcher({ lookup, request: async () => ({ status, headers: {}, destroy() {} }) }) });
    await assert.rejects(importer(url), error => error instanceof ImportError && error.code === 'REMOTE_STATUS' && error.message.includes(String(status)));
  }
  const importer = createProductImporter({ fetchPublic: createPublicFetcher({ lookup, request: async () => ({ status: 302, headers: { location: 'http://127.0.0.1/price' }, destroy() {} }) }) });
  await assert.rejects(importer(url), error => error.code === 'BLOCKED_URL');
});

test('conflicting visible price/currency/unit never silently creates a usable quote', () => {
  const offers = { price: 30, priceCurrency: 'BYN', unitCode: 'MTK' };
  for (const line of ['Цена: 31 BYN / м²', 'Цена: 30 EUR / м²']) {
    const result = extract({ offers }, `<p>${line}</p>`);
    assert.equal(result.offer, undefined); assert.ok(result.warnings.some(value => value.includes('противоречат')));
  }
  assert.equal(extract({ offers }, '<p>Цена: 30 BYN / упаковка</p>').offer.unit, 'unknown');
  assert.equal(extract({ offers: { price: 30, priceCurrency: 'BYN', priceSpecification: { referenceQuantity: { value: 2, unitCode: 'MTK' } } } }, '<p>Цена: 30 BYN / м²</p>').offer.unit, 'unknown');
});

test('hidden cards and a sole explicitly unrelated Product do not supply metadata', () => {
  const result = extract({}, '<div hidden><p>Цена: 30 BYN / м²</p><p>Ширина: 90 cm</p></div>');
  assert.equal(result.offer, undefined); assert.deepEqual(result.dimensions, {});
  const unrelated = extract({ url: 'https://www.oma.by/other', width: '90 cm', offers: { price: 30, priceCurrency: 'BYN' } }, '<p>Цена: 30 BYN / м²</p><p>Ширина: 90 cm</p><p>Цвет: Красный</p>');
  assert.equal(unrelated.offer, undefined); assert.deepEqual(unrelated.dimensions, {});
  assert.equal(unrelated.color, undefined);
});
