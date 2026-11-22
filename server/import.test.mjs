import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicFetcher, isPublicAddress, parsePublicUrl, pinnedLookup, ImportError } from './network.mjs';
import { extractProduct, dimensionCm } from './extract.mjs';
import { createProductImporter, rasterDimensions } from './import-product.mjs';

const PUBLIC = [{ address: '93.184.216.34', family: 4 }];
const htmlHeaders = { 'content-type': 'text/html; charset=utf-8' };
function reply({ status = 200, headers = htmlHeaders, chunks = ['<title>Product</title>'] } = {}) {
  let destroyed = false;
  return { status, headers, body: (async function* () { for (const chunk of chunks) yield Buffer.from(chunk); })(),
    destroy() { destroyed = true; }, get destroyed() { return destroyed; } };
}
function fetcher(response, options = {}) {
  return createPublicFetcher({ lookup: async () => PUBLIC, request: async () => response, ...options });
}
function code(expected) { return error => error instanceof ImportError && error.code === expected; }
function productHtml(product) { return `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', ...product })}</script>`; }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hn4AAAAASUVORK5CYII=', 'base64');

test('public address policy rejects private, reserved, multicast and transition ranges', () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '100.64.2.1', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '192.168.0.1', '192.0.2.3', '192.88.99.2',
    '198.18.1.1', '198.51.100.4', '203.0.113.7', '224.0.0.1', '240.1.1.1',
    '::', '::1', '::ffff:8.8.8.8', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1',
    'ff02::1', '2001:db8::1', '2001::1', '2001:20::1', '2002:0808:0808::1', '3ffe::1', '3fff::1']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['8.8.8.8', '93.184.216.34', '172.15.1.1', '172.32.1.1', '2001:4860:4860::8888', '2606:4700:4700::1111']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test('URL canonicalization blocks credentials, alternate IP spelling, local names and unusual ports', () => {
  for (const url of ['file:///etc/passwd', 'ftp://public.shop/item', 'https://user:pass@public.shop/',
    'http://127.1/', 'http://2130706433/', 'http://0x7f000001/', 'http://[::1]/',
    'http://localhost./', 'https://a.local/', 'https://a.internal/', 'https://a.home/',
    'https://a.arpa/', 'https://singlelabel/', 'https://public.shop:8080/', 'https://public.shop/a\n']) {
    assert.throws(() => parsePublicUrl(url), error => error instanceof ImportError, url);
  }
  assert.equal(parsePublicUrl('https://public.shop/item#image').href, 'https://public.shop/item');
  assert.equal(parsePublicUrl('https://public.shop:443/item').href, 'https://public.shop/item');
});

test('all DNS addresses must be public before any request runs', async () => {
  let calls = 0;
  const fetchPublic = createPublicFetcher({ lookup: async () => [...PUBLIC, { address: '10.0.0.1', family: 4 }],
    request: async () => { calls++; return reply(); } });
  await assert.rejects(fetchPublic('https://shop.public/item'), code('BLOCKED_URL'));
  assert.equal(calls, 0);
});

test('the approved DNS result is passed to the real connection lookup', async () => {
  let lookups = 0;
  const fetchPublic = createPublicFetcher({ lookup: async () => { lookups++; return PUBLIC; },
    request: async (url, destination) => {
      assert.equal(url.hostname, 'shop.public');
      assert.deepEqual(destination, PUBLIC[0]);
      pinnedLookup(destination.address, destination.family)('shop.public', {}, (error, address, family) => {
        assert.equal(error, null); assert.equal(address, PUBLIC[0].address); assert.equal(family, 4);
      });
      pinnedLookup(destination.address, destination.family)('shop.public', { all: true }, (error, addresses) => {
        assert.equal(error, null); assert.deepEqual(addresses, PUBLIC);
      });
      return reply();
    } });
  await fetchPublic('https://shop.public/item');
  assert.equal(lookups, 1);
});

test('redirect target is revalidated and private targets never receive a connection', async () => {
  let calls = 0;
  const fetchPublic = createPublicFetcher({ lookup: async host => host === 'private.public'
    ? [{ address: '192.168.1.1', family: 4 }] : PUBLIC,
  request: async () => { calls++; return reply({ status: 302, headers: { location: 'http://private.public/secret' } }); } });
  await assert.rejects(fetchPublic('https://shop.public/item'), code('BLOCKED_URL'));
  assert.equal(calls, 1);
  const direct = fetcher(reply({ status: 302, headers: { location: 'http://169.254.169.254/latest' } }));
  await assert.rejects(direct('https://shop.public/item'), code('BLOCKED_URL'));
});

test('relative redirects work, redirect loops and missing targets fail', async () => {
  let calls = 0;
  const fetchPublic = createPublicFetcher({ lookup: async () => PUBLIC, request: async url => {
    calls++; return url.pathname === '/item' ? reply({ status: 302, headers: { location: '/final' } }) : reply();
  } });
  const page = await fetchPublic('https://shop.public/item');
  assert.equal(page.url, 'https://shop.public/final'); assert.equal(calls, 2);
  await assert.rejects(fetcher(reply({ status: 302, headers: { location: '/item' } }))('https://shop.public/item'), code('REDIRECT_LIMIT'));
  await assert.rejects(fetcher(reply({ status: 302, headers: {} }))('https://shop.public/item'), code('INVALID_REDIRECT'));
});

test('remote errors, MIME, compression and byte limits are clear and bounded', async () => {
  for (const [response, expected] of [
    [reply({ status: 403 }), 'REMOTE_STATUS'], [reply({ status: 429 }), 'REMOTE_STATUS'],
    [reply({ headers: { 'content-type': 'application/json' } }), 'UNSUPPORTED_CONTENT'],
    [reply({ headers: { ...htmlHeaders, 'content-encoding': 'gzip' } }), 'UNSUPPORTED_ENCODING'],
    [reply({ headers: { ...htmlHeaders, 'content-length': '300' } }), 'TOO_LARGE'],
    [reply({ chunks: ['abc', 'def'] }), 'TOO_LARGE'],
  ]) {
    await assert.rejects(fetcher(response)('https://shop.public/item', { maxBytes: 5 }), code(expected));
    assert.equal(response.destroyed, true);
  }
  await assert.rejects(fetcher(reply({ headers: { 'content-type': 'image/svg+xml' } }))('https://shop.public/image', { kind: 'image' }), code('UNSUPPORTED_CONTENT'));
});

test('DNS, connection and stalled body all obey the overall request timeout', async () => {
  const never = () => new Promise(() => {});
  await assert.rejects(createPublicFetcher({ lookup: never })('https://shop.public/item', { timeoutMs: 10 }), code('TIMEOUT'));
  await assert.rejects(createPublicFetcher({ lookup: async () => PUBLIC, request: never })('https://shop.public/item', { timeoutMs: 10 }), code('TIMEOUT'));
  const body = { [Symbol.asyncIterator]: () => ({ next: never }) };
  await assert.rejects(fetcher({ status: 200, headers: htmlHeaders, body })('https://shop.public/item', { timeoutMs: 10 }), code('TIMEOUT'));
});

test('network and DNS exceptions do not leak internal details', async () => {
  const fetchPublic = createPublicFetcher({ lookup: async () => { throw new Error('secret path /Users/person/.ssh'); } });
  await assert.rejects(fetchPublic('https://shop.public/item'), error => error.code === 'FETCH_FAILED' && !error.message.includes('secret'));
});

test('structured Product metadata and explicit dimensions convert accurately', () => {
  const html = `<script type='application/ld+json'>${JSON.stringify({ '@graph': [{ '@type': 'WebPage', name: 'Store' }, {
    '@type': ['Product', 'Thing'], name: 'Ламинат Эванс &amp; дуб', category: 'Ламинат', brand: { name: 'Tarkett' },
    color: 'Бежевый', description: '<b>Покрытие</b>', image: [{ '@type': 'ImageObject', contentUrl: '/plank.png' }],
    width: { value: 194, unitCode: 'MMT' }, length: '1292 mm',
    additionalProperty: [{ name: 'Толщина, мм', value: '12' }],
    offers: { shippingDetails: { width: '90 cm' } },
  }] })}</script>`;
  const { result, candidateImage } = extractProduct(html, 'https://shop.public/item');
  assert.equal(result.title, 'Ламинат Эванс & дуб'); assert.equal(result.brand, 'Tarkett');
  assert.equal(result.color, 'Бежевый'); assert.equal(result.description, 'Покрытие');
  assert.equal(result.category, 'flooring');
  assert.deepEqual(result.dimensions, { widthCm: 19.4, lengthCm: 129.2, thicknessMm: 12 });
  assert.equal(candidateImage, 'https://shop.public/plank.png');
  assert.ok(result.evidence.some(value => value.includes('Product.width')));
});

test('units include decimal comma, metres and inches; absent units or ambiguous sizes stay missing', () => {
  assert.equal(dimensionCm('1,8 м'), 180);
  assert.equal(dimensionCm({ value: 20, unitCode: 'INH' }), 50.8);
  assert.equal(dimensionCm('3 ft'), 91.44);
  for (const value of [50, '50', '180x90 cm', '-2 cm', '4 kg', 'Infinity cm', '0 cm', '5000 m']) assert.equal(dimensionCm(value), undefined);
  const { result } = extractProduct(productHtml({ name: 'Chair', width: 50, size: '50x90 cm' }), 'https://shop.public/');
  assert.deepEqual(result.dimensions, {}); assert.equal(result.color, undefined);
});

test('OpenGraph, labelled tables and definition pairs provide conservative fallback', () => {
  const { result, candidateImage } = extractProduct(`<meta content="White &amp; green sofa" property="og:title">
    <meta property='og:image' content='/sofa.jpg'><table><tr><td>Ширина, см</td><td>180</td></tr>
    <tr><td>Глубина</td><td>90 cm</td></tr></table><dl><dt>Height</dt><dd>0,8 m</dd></dl><p>Цвет: Green</p>`, 'https://shop.public/');
  assert.equal(result.title, 'White & green sofa'); assert.equal(result.category, 'furniture');
  assert.deepEqual(result.dimensions, { widthCm: 180, depthCm: 90, heightCm: 80 });
  assert.equal(result.color, 'Green'); assert.equal(candidateImage, 'https://shop.public/sofa.jpg');
  assert.ok(result.warnings.some(value => value.includes('не содержит Product')));
});

test('script/style text, malformed JSON and package labels do not invent dimensions', () => {
  const { result } = extractProduct(`<script type="application/ld+json">{broken}</script>
    <script>Width: 999 cm</script><style>Height: 990 cm</style><p>Package dimensions</p>
    <p>Width: 50 cm</p><p>Height: 30 cm</p>`, 'https://shop.public/');
  assert.deepEqual(result.dimensions, {});
  assert.ok(result.warnings.some(value => value.includes('повреждена')));
});

test('unclosed repeated script/title tags and HTML comments cannot create metadata', () => {
  for (const tag of ['script', 'title', 'style']) {
    const { result } = extractProduct(`<${tag}>`.repeat(100000) + '<p>Width: 80 cm</p>', 'https://shop.public/');
    assert.deepEqual(result.dimensions, {});
    assert.equal(result.title, 'Товар по ссылке');
  }
  const { result } = extractProduct('<!-- <meta property="og:title" content="Hidden"><p>Width: 80 cm</p> -->' +
    '<meta property="og:title" content="Actual chair">', 'https://shop.public/');
  assert.equal(result.title, 'Actual chair'); assert.deepEqual(result.dimensions, {});
  const largeAttribute = extractProduct('<meta ' + 'x'.repeat(500000) + '>' +
    productHtml({ name: 'Chair', description: '<'.repeat(500000) }), 'https://shop.public/').result;
  assert.equal(largeAttribute.title, 'Chair');
  assert.equal(largeAttribute.description.length, 1200);
});

test('multiple product variants are warned and loose dimensional text is skipped', () => {
  const { result } = extractProduct(`<script type="application/ld+json">${JSON.stringify([
    { '@type': 'Product', name: 'First chair' }, { '@type': 'Product', name: 'Second chair' },
  ])}</script><p>Width: 99 cm</p>`, 'https://shop.public/');
  assert.deepEqual(result.dimensions, {});
  assert.ok(result.warnings.some(value => value.includes('несколько товаров')));
});

test('raster validation rejects disguised HTML/SVG and excessive decoded pixel dimensions', () => {
  assert.deepEqual(rasterDimensions(png, 'image/png'), { width: 1, height: 1 });
  assert.throws(() => rasterDimensions(Buffer.from('<svg/>'), 'image/png'), code('INVALID_IMAGE'));
  assert.throws(() => rasterDimensions(png, 'image/jpeg'), code('INVALID_IMAGE'));
  const oversized = Buffer.from(png); oversized.writeUInt32BE(100000, 16);
  assert.throws(() => rasterDimensions(oversized, 'image/png'), code('INVALID_IMAGE'));
  const webp = Buffer.alloc(30); webp.write('RIFF', 0); webp.write('WEBPVP8X', 8); webp[20] = 2;
  assert.throws(() => rasterDimensions(webp, 'image/webp'), code('INVALID_IMAGE'));
});

test('importer embeds a safe raster locally and returns useful metadata when image is blocked', async () => {
  const calls = [];
  const importer = createProductImporter({ fetchPublic: async (url, options) => {
    calls.push({ url, options });
    return options.kind === 'html' ? { url, headers: htmlHeaders,
      body: Buffer.from(productHtml({ name: 'Tile', image: '/tile.png', width: '60 cm' })) }
      : { url, contentType: 'image/png', body: png };
  } });
  const result = await importer('https://shop.public/item');
  assert.equal(result.image.sourceUrl, 'https://shop.public/tile.png');
  assert.equal(result.image.dataUrl, `data:image/png;base64,${png.toString('base64')}`);
  assert.equal(result.dimensions.widthCm, 60); assert.equal(calls.length, 2);
  const blocked = createProductImporter({ fetchPublic: async (url, options) => {
    if (options.kind === 'image') throw new ImportError('BLOCKED_URL', 'Локальный адрес запрещён.');
    return { url, headers: htmlHeaders, body: Buffer.from(productHtml({ name: 'Tile', image: 'http://127.0.0.1/photo' })) };
  } });
  const fallback = await blocked('https://shop.public/item');
  assert.equal(fallback.title, 'Tile'); assert.equal(fallback.image, null);
  assert.ok(fallback.warnings.some(value => value.includes('Фото не импортировано')));
});

test('plumbing, tile and unknown categories remain distinct', () => {
  for (const [name, category] of [['Ванна Nike', 'plumbing'], ['Porcelain tile', 'tile'], ['Unspecified product', 'unknown']]) {
    assert.equal(extractProduct(productHtml({ name }), 'https://shop.public/').result.category, category);
  }
});
