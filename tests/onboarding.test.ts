import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Onboarding from '../src/Onboarding';

const markup = renderToStaticMarkup(createElement(Onboarding, { onClose: () => {}, onOpenSizes: () => {}, onImport: () => {} }));

test('onboarding explains the three working areas and the measurement limit', () => {
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /Примерочная вашей квартиры/);
  assert.match(markup, /Сверьте геометрию/);
  assert.match(markup, /Примерьте отделку и мебель/);
  assert.match(markup, /Посчитайте материалы/);
  assert.match(markup, /Проверить размеры/);
  assert.match(markup, /Импортировать свой проект/);
  assert.match(markup, /Открыть демо/);
  assert.match(markup, /демонстрационная квартира/);
  assert.match(markup, /До заказа нужны реальные обмеры/);
});
