import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OpeningsEditor from '../src/OpeningsEditor';
import { createProject } from '../src/model';

const render = (roomId: string, project = createProject()) => renderToStaticMarkup(createElement(OpeningsEditor, {
  project, roomId, mutate: () => true, notify: () => {},
}));

test('openings editor lists room-facing openings with measured values and add controls', () => {
  const markup = render('living');
  assert.match(markup, /Двери и окна/);
  assert.match(markup, /Проём 1 · Дверь/);
  assert.match(markup, /Проём 5 · Окно/);
  assert.match(markup, /aria-label="Тип проёма 5"/);
  assert.match(markup, /aria-label="Отступ проёма 1"[^>]*value="60"/);
  assert.match(markup, /aria-label="Ширина проёма 1"[^>]*value="95"/);
  assert.match(markup, /aria-label="Стена для нового проёма"/);
  assert.match(markup, /aria-label="Тип нового проёма"/);
  assert.match(markup, /Добавить/);
});

test('a room without openings gets an empty hint but keeps the add form', () => {
  const project = createProject();
  for (const wall of project.walls) if (wall.rooms.includes('balcony')) delete wall.openings;
  const markup = render('balcony', project);
  assert.match(markup, /В этой комнате нет проёмов/);
  assert.match(markup, /Стена для нового проёма/);
  assert.doesNotMatch(markup, /Удалить проём/);
});
