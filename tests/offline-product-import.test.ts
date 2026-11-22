import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseOfflineProduct } from '../src/offlineProductImport';

test('parseOfflineProduct extracts saved HTML cards from OMA, 21vek and Mile fixtures', async () => {
  const omaHtml = await readFile(new URL('../server/fixtures/retailer-synthetic/oma.html', import.meta.url), 'utf8');
  const oma = parseOfflineProduct(`<!-- saved from url=(0037)https://www.oma.by/synthetic-product -->\n${omaHtml}`);
  assert.equal(oma.retailer, 'oma');
  assert.equal(oma.offer?.price, 34.5);
  assert.equal(oma.offer?.currency, 'BYN');
  assert.equal(oma.offer?.unit, 'm2');
  assert.equal(oma.pack?.coverageM2, 2.005);
  assert.equal(oma.pack?.pieces, 8);
  assert.deepEqual(oma.dimensions, { widthCm: 19.4, lengthCm: 129.2, thicknessMm: 8 });
});

test('parseOfflineProduct extracts pasted plain-text characteristics from Belarus store pages', () => {
  const text = `
    Керамогранит Kerama Marazzi Монте Тиберио 60x120
    Артикул: KM-60120
    Формат: 60×120 см
    Толщина: 9,5 мм
    Цвет: серый
    Площадь в упаковке: 1,44 м²
    Количество плиток в упаковке: 2 шт.
    Цена: 78,40 р. / м²
    https://www.21vek.by/tiles/kerama_marazzi_60120.html
  `;
  const parsed = parseOfflineProduct(text);
  assert.equal(parsed.retailer, '21vek');
  assert.equal(parsed.category, 'tile');
  assert.equal(parsed.title, 'Керамогранит Kerama Marazzi Монте Тиберио 60x120');
  assert.deepEqual(parsed.dimensions, { widthCm: 60, lengthCm: 120, thicknessMm: 9.5 });
  assert.equal(parsed.color, 'серый');
  assert.equal(parsed.pack?.coverageM2, 1.44);
  assert.equal(parsed.pack?.pieces, 2);
  assert.equal(parsed.offer?.price, 78.4);
  assert.equal(parsed.offer?.currency, 'BYN');
  assert.equal(parsed.offer?.unit, 'm2');
});

test('parseOfflineProduct parses furniture WxDxH lines from pasted store text', () => {
  const text = `
    Диван угловой Атланта (Mile.by)
    Размеры (ШхГхВ): 245х160х88 см
    Цвет: бежевый
    Цена: 1 890,00 бел. руб. за шт.
  `;
  const parsed = parseOfflineProduct(text);
  assert.equal(parsed.retailer, 'mile');
  assert.equal(parsed.category, 'furniture');
  assert.deepEqual(parsed.dimensions, { widthCm: 245, depthCm: 160, heightCm: 88 });
  assert.equal(parsed.offer?.price, 1890);
  assert.equal(parsed.offer?.currency, 'BYN');
  assert.equal(parsed.offer?.unit, 'item');
});
