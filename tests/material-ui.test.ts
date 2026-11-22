import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Inspector from '../src/Inspector';
import EstimatePanel from '../src/EstimatePanel';
import { createProject } from '../src/model';

function renderFinish(photo = false) {
  const project = createProject(), variant = project.variants[0];
  if (photo) {
    project.materials.push({ ...project.materials[0], id: 'photo-fixture', name: 'Моя фактура',
      pattern: 'image', image: 'data:image/png;base64,YQ==', width: .6, height: 1.2 });
    variant.finishes.living.floor = 'photo-fixture';
  }
  const originalDocument = globalThis.document;
  const context = { fillStyle: '', strokeStyle: '', lineWidth: 1,
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {}, stroke() {} };
  globalThis.document = { createElement() { return { width: 0, height: 0,
    getContext() { return context; }, toDataURL() { return 'data:image/png;base64,YQ=='; } }; } } as unknown as Document;
  const mutate = () => true, noop = () => {};
  try {
    return renderToStaticMarkup(createElement(Inspector, {
      project, variant, roomId: 'living', furnitureId: null, mutate,
      onSelectFurniture: noop, notify: noop, onOpenElectrical: noop,
      objectActions: { onDelete: noop, onDuplicate: noop, onRotate: noop, onFaceRoom: noop, onReplace: mutate, onPlan: noop },
      electrical: { project, variant, roomId: 'living', pointId: null, visible: false,
        mutate, onSelect: noop, onVisible: noop, onDelete: noop, onDuplicate: noop },
    }));
  } finally { globalThis.document = originalDocument; }
}

test('finish editor exposes current material, colour, photo and physical repeat before the catalogue', () => {
  const markup = renderFinish(), catalogue = markup.indexOf('Материалы каталога');
  assert.ok(catalogue > 0);
  for (const label of ['Свой цвет и фактура', 'Текущая отделка', 'Дуб натуральный',
    'Загрузить фото фактуры', 'Цвет основы', 'Цвет или фактура',
    'Ширина образца', 'Длина образца', 'Поворот текстуры', 'Блеск и матовость поверхности']) {
    const index = markup.indexOf(label);
    assert.ok(index >= 0 && index < catalogue, label);
  }
  assert.match(markup, /Стены комнаты/);
  assert.match(markup, /Только цвет/);
  assert.match(markup, /слева блестящая, справа матовая/);
  assert.match(markup, /Размер образца задаёт повторение в сантиметрах/);
});

test('custom photo finish shows its current preview, selected photo mode and real sample dimensions', () => {
  const markup = renderFinish(true);
  assert.match(markup, /Моя фактура/);
  assert.match(markup, /<option value="image" selected="">Фото фактуры<\/option>/);
  assert.match(markup, /aria-label="Ширина образца"[^>]*value="60"/);
  assert.match(markup, /aria-label="Длина образца"[^>]*value="120"/);
  assert.match(markup, /src="data:image\/png;base64,YQ==" alt="Текущая отделка"/);
});

test('estimate panel shows measured room quantities and physical totals', () => {
  const project = createProject(), variant = project.variants[0];
  const markup = renderToStaticMarkup(createElement(EstimatePanel, {
    project, variant, roomId: 'living', surface: 'floor', onSurface: () => {}, onQuote: () => {},
  }));
  assert.match(markup, /Обмеры комнаты/);
  assert.match(markup, /Плинтус без дверей/);
  assert.match(markup, /14,71/);
  assert.match(markup, /Двери \/ окна/);
  assert.match(markup, /Обмеры всех комнат/);
  assert.match(markup, /79,56/);
  assert.match(markup, /11 дверей и 5 окон/);
  assert.match(markup, /Краска, обои, плинтус и клей/);
  assert.match(markup, /Загрузить сохранённый HTML карточки|Пол/);
  assert.match(markup, /балкон целиком|Балкон показан в физических метрах/);
});
