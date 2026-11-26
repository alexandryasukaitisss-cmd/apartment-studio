import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createProject, parseProject } from '../src/model';
import { commitProjectEdit, undoProject } from '../src/projectEdits';
import {
  A2UI_VERSION,
  APARTMENT_CATALOG_ID,
  applyDataModelPatch,
  getByJsonPointer,
  reduceA2UIMessages,
  resolveBindableString,
  type A2UIMessage,
} from '../src/a2ui/protocol';
import { executeA2UIAgentFunction } from '../src/a2ui/actions';
import { buildAgentContext, generateOfflineA2UISurface } from '../src/a2ui/offlineAdvisor';
import A2UIRenderer from '../src/a2ui/A2UIRenderer';
import AgentPanel from '../src/AgentPanel';

test('A2UI v1.0 reducer handles createSurface, updateComponents, updateDataModel JSON Pointer, and deleteSurface', () => {
  const messages: A2UIMessage[] = [
    {
      version: A2UI_VERSION,
      createSurface: {
        surfaceId: 's1',
        catalogId: APARTMENT_CATALOG_ID,
        components: [
          { id: 'root', component: 'Column', children: ['t1'] },
          { id: 't1', component: 'Text', variant: 'h2', text: { '@path': '/header/title' } },
        ],
        dataModel: { header: { title: 'Initial' } },
      },
    },
    {
      version: A2UI_VERSION,
      updateDataModel: { surfaceId: 's1', path: '/header/title', value: 'Updated Title' },
    },
    {
      version: A2UI_VERSION,
      updateComponents: {
        surfaceId: 's1',
        components: [
          { id: 'root', component: 'Column', children: ['t1', 'b1'] },
          { id: 'b1', component: 'Badge', tone: 'success', text: 'OK' },
        ],
      },
    },
  ];
  const surfaces = reduceA2UIMessages(messages);
  const s1 = surfaces.get('s1')!;
  assert.ok(s1);
  assert.equal(getByJsonPointer(s1.dataModel, '/header/title'), 'Updated Title');
  assert.equal(resolveBindableString(s1.components.get('t1')?.text, s1.dataModel), 'Updated Title');
  assert.equal(s1.components.get('b1')?.component, 'Badge');

  const patched = applyDataModelPatch(s1.dataModel, '/header/title', null);
  assert.equal(getByJsonPointer(patched, '/header/title'), undefined);

  const afterDelete = reduceA2UIMessages([...messages, { version: '1.0', deleteSurface: { surfaceId: 's1' } }]);
  assert.equal(afterDelete.size, 0);
});

test('A2UI v1.0 sanitizes unknown components and disallowed callAgentFunction actions', () => {
  const malicious = [
    {
      version: '1.0',
      createSurface: {
        surfaceId: 'sec',
        components: [
          { id: 'root', component: 'Column', children: ['evil', 'btn'] },
          { id: 'evil', component: 'ScriptTag', text: 'alert(1)' },
          { id: 'btn', component: 'Button', label: 'Run', action: { callAgentFunction: { name: 'execShell', args: { cmd: 'rm -rf' } } } },
        ],
      },
    },
  ] as unknown as A2UIMessage[];
  const surfaces = reduceA2UIMessages(malicious);
  const sec = surfaces.get('sec')!;
  assert.equal(sec.components.has('evil'), false, 'strips unknown component');
  assert.equal(sec.components.get('btn')?.action, undefined, 'strips disallowed function');
});

test('executeA2UIAgentFunction applies domain actions atomically with full undo support', () => {
  const initial = createProject();
  const history = { past: [], future: [] };
  let current = initial;
  const mutate = (fn: (p: typeof current) => void) => {
    current = commitProjectEdit(current, history, fn);
    return true;
  };
  const handlers = { mutate, notify: () => {} };

  assert.equal(executeA2UIAgentFunction('applyStylePreset', { presetId: 'japandi' }, current, handlers), true);
  assert.equal(current.variants[0].doorColor, '#b99f7e');
  current = undoProject(current, history);
  assert.deepEqual(current.variants[0].finishes, initial.variants[0].finishes);

  const beforeCount = current.variants[0].furniture.length;
  assert.equal(executeA2UIAgentFunction('addFurniture', { kind: 'round_table', roomId: 'living' }, current, handlers), true);
  assert.equal(current.variants[0].furniture.length, beforeCount + 1);
  assert.ok(parseProject(JSON.stringify(current)));

  assert.equal(executeA2UIAgentFunction('setFinishAllowance', { wallCm: 3.5, floorCm: 7 }, current, handlers), true);
  assert.equal(current.finishAllowance?.wallCm, 3.5);

  assert.equal(executeA2UIAgentFunction('setStorageNote', { key: 'vacuum', value: 'Гардеробная' }, current, handlers), true);
  assert.equal(current.storageChecklist?.vacuum, 'Гардеробная');
});

test('offline A2UI 1.0 advisor, buildAgentContext, A2UIRenderer, and AgentPanel render cleanly', () => {
  const project = createProject();
  const variant = project.variants[0];
  const ctx = buildAgentContext(project, variant, 'living');
  assert.equal(ctx.rooms.length, 10);
  assert.ok(ctx.availableStylePresets.length >= 5);

  const msgs = generateOfflineA2UISurface('Проведи аудит, предложи стиль и мебель', project, variant, 'living');
  assert.equal(msgs[0].version, '1.0');
  const rendered = renderToStaticMarkup(createElement(A2UIRenderer, { messages: msgs, onAction: () => {} }));
  assert.match(rendered, /data-a2ui-version="1\.0"/);
  assert.match(rendered, /A2UI-подборка/);
  assert.match(rendered, /Готовые стили всей квартиры/);

  const panelMarkup = renderToStaticMarkup(createElement(AgentPanel, {
    project, variant, roomId: 'living', actionHandlers: { mutate: () => true, notify: () => {} },
  }));
  assert.match(panelMarkup, /AI-помощник \(A2UI 1\.0\)/);
  assert.match(panelMarkup, /Codex CLI/);
  assert.match(panelMarkup, /Claude Code/);
  assert.match(panelMarkup, /OpenCode/);
  assert.match(panelMarkup, /Gemini CLI/);
});
