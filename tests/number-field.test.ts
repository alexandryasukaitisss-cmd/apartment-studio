import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NumberField from '../src/NumberField';

const render = (props: Partial<Parameters<typeof NumberField>[0]> = {}) => renderToStaticMarkup(createElement(NumberField, {
  label: 'Ширина проёма', value: 95, min: 60, max: 200, onChange: () => {}, ...props,
}));

test('number field renders a labelled value with limits and a unit', () => {
  const markup = render();
  assert.match(markup, /<label class="field">/);
  assert.match(markup, /Ширина проёма/);
  assert.match(markup, /aria-label="Ширина проёма"/);
  assert.match(markup, /type="number"/);
  assert.match(markup, /min="60"/);
  assert.match(markup, /max="200"/);
  assert.match(markup, /value="95"/);
  assert.match(markup, /<small>см<\/small>/);
});

test('number field rounds long fractions for display and accepts a custom unit', () => {
  const markup = render({ label: 'Поворот', value: 123.456, min: 0, max: 360, step: 5, unit: '°' });
  assert.match(markup, /value="123.46"/);
  assert.match(markup, /step="5"/);
  assert.match(markup, /<small>°<\/small>/);
});
