import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, duplicateVariant, makeFurniture, boundFurniture, fitsFurniture, replaceFurniture, duplicateFurniture, moveFurniture, validateProject, parseProject, L, type Project } from '../src/model';
import { catalog } from '../src/furnitureCatalog';
import { commitProjectEdit, undoProject, redoProject, type ProjectHistory } from '../src/projectEdits';
import { saveProject, loadProject, importPhoto } from '../src/storage';

const history = (): ProjectHistory => ({ past: [], future: [] });

test('catalogue replacement retains room, identity, position and rotation with exact model dimensions; one undo restores it', () => {
  const original = createProject();
  const bed = original.variants[0].furniture.find(f => f.kind === 'bed' && f.roomId === 'bed1')!;
  bed.rotation = 180;
  original.variants.push(duplicateVariant(original.variants[0]));
  const preset = catalog.find(p => p.name === 'Кровать 140 × 200')!;
  const h = history();
  const next = commitProjectEdit(original, h, p => { replaceFurniture(p, bed.id, preset) });
  const replacement = next.variants[0].furniture.find(f => f.id === bed.id)!;
  assert.deepEqual([replacement.id, replacement.roomId, replacement.x, replacement.z, replacement.rotation], [bed.id, bed.roomId, bed.x, bed.z, bed.rotation]);
  assert.deepEqual([replacement.width, replacement.depth, replacement.height], preset.dims);
  assert.deepEqual(next.variants[1], original.variants[1]);
  assert.deepEqual(original.variants[0].furniture.find(f => f.id === bed.id), bed);
  assert.equal(h.past.length, 1);
  assert.deepEqual(undoProject(next, h), original);
  assert.deepEqual(redoProject(original, h), next);
  assert.deepEqual(parseProject(JSON.stringify(next)), next);
});

test('replacement clamps at room edges and rejects a nonfitting model without changing state or undo history', () => {
  const original = createProject();
  const plant = original.variants[0].furniture.find(f => f.kind === 'plant' && f.roomId === 'living')!;
  const h = history();
  const next = commitProjectEdit(original, h, p => { replaceFurniture(p, plant.id, catalog.find(p => p.name === 'Шкаф 150')!) });
  const replacement = next.variants[0].furniture.find(f => f.id === plant.id)!;
  assert.equal(replacement.kind, 'wardrobe');
  assert.ok(fitsFurniture(replacement, next));
  assert.notEqual(replacement.x, plant.x);
  const toilet = original.variants[0].furniture.find(f => f.roomId === 'bath2' && f.kind === 'toilet')!;
  const before = structuredClone(original);
  const emptyHistory = history();
  assert.throws(() => commitProjectEdit(original, emptyHistory, p => { replaceFurniture(p, toilet.id, { kind: 'table', dims: [3.5, 3.5, .7] }) }), /не помещается/);
  assert.deepEqual(original, before);
  assert.deepEqual(emptyHistory, history());
});

test('duplicate places a visibly separate copy, preserves original and other variants, and undoes once', () => {
  const original = createProject();
  original.scale = 1.2;
  original.variants.push(duplicateVariant(original.variants[0]));
  const chair = original.variants[0].furniture.find(f => f.kind === 'chair' && f.roomId === 'living')!;
  const h = history();
  let selectedId = '';
  const next = commitProjectEdit(original, h, p => { selectedId = duplicateFurniture(p, chair.id).id });
  const copied = next.variants[0].furniture.find(f => f.id === selectedId)!;
  assert.notEqual(copied.id, chair.id);
  assert.equal(next.variants[0].furniture.length, original.variants[0].furniture.length + 1);
  assert.deepEqual(next.variants[0].furniture.find(f => f.id === chair.id), chair);
  assert.deepEqual([copied.width, copied.depth, copied.height, copied.rotation, copied.color, copied.roomId], [chair.width, chair.depth, chair.height, chair.rotation, chair.color, chair.roomId]);
  assert.ok(Math.hypot(copied.x - chair.x, copied.z - chair.z) * next.scale > .48);
  assert.ok(fitsFurniture(copied, next));
  assert.deepEqual(next.variants[1], original.variants[1]);
  assert.equal(h.past.length, 1);
  assert.deepEqual(undoProject(next, h), original);
});

test('duplicate rejects a room without space without removing or changing the original', () => {
  const original = createProject();
  const oversized = boundFurniture({ ...makeFurniture('table', 'closet', 3.7, 8), width: 1.3, depth: 1.1 }, original);
  original.variants[0].furniture = [oversized];
  validateProject(original);
  const before = structuredClone(original);
  const h = history();
  assert.throws(() => commitProjectEdit(original, h, p => { duplicateFurniture(p, oversized.id) }), /нет места/);
  assert.deepEqual(original, before);
  assert.deepEqual(h, history());
});

test('bounded drag previews respect concave rooms and scale, and release commits one undo transaction', () => {
  const original = createProject();
  original.scale = 1.4;
  const bed = original.variants[0].furniture.find(f => f.roomId === 'bed1' && f.kind === 'bed')!;
  const h = history();
  const before = structuredClone(original);
  let preview = original;
  for (let i = 1; i <= 100; i++) {
    preview = structuredClone(original);
    const moved = moveFurniture(preview, bed.id, 2.9, L - i / 500);
    assert.ok(fitsFurniture(moved, preview));
    assert.deepEqual([moved.width, moved.depth, moved.height], [bed.width, bed.depth, bed.height]);
  }
  assert.deepEqual(original, before);
  assert.equal(h.past.length, 0);
  const next = commitProjectEdit(original, h, p => { moveFurniture(p, bed.id, 2.9, L - .2) });
  assert.equal(h.past.length, 1);
  assert.deepEqual(next, preview);
  assert.deepEqual(undoProject(next, h), original);
  assert.deepEqual(redoProject(original, h), next);
  const plant = original.variants[0].furniture.find(f => f.kind === 'plant' && f.roomId === 'living')!;
  const physicalDelta = .28;
  const moved = moveFurniture(structuredClone(original), plant.id, plant.x - physicalDelta / original.scale, plant.z);
  assert.ok(Math.abs((plant.x - moved.x) * original.scale - physicalDelta) < 1e-10);
  assert.deepEqual(parseProject(JSON.stringify(next)), next);
});

test('cancelled previews and click without movement leave history intact; deletion restores the original on undo', () => {
  const original = createProject();
  const h = history();
  const selected = original.variants[0].furniture[0];
  const preview = structuredClone(original);
  moveFurniture(preview, selected.id, 0, 0);
  assert.deepEqual(h, history());
  assert.equal(commitProjectEdit(original, h, () => {}), original);
  assert.deepEqual(h, history());
  const removed = commitProjectEdit(original, h, p => {
    p.variants[0].furniture = p.variants[0].furniture.filter(f => f.id !== selected.id)
  });
  assert.equal(removed.variants[0].furniture.some(f => f.id === selected.id), false);
  assert.deepEqual(undoProject(removed, h), original);
  const changed = commitProjectEdit(original, h, p => { replaceFurniture(p, selected.id, catalog[0]) });
  assert.equal(h.future.length, 0);
  assert.equal(redoProject(changed, h), changed);
});

function installGlobal(name: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (previous)
      Object.defineProperty(globalThis, name, previous);
    else
      Reflect.deleteProperty(globalThis, name)
  }
}

test('edited projects and undo state round trip through local storage with independent saved copies', async () => {
  let saved: Project | null = null;
  let closed = 0;
  const db = {
    close: () => closed++,
    transaction: () => {
      const tx = {
        oncomplete: null as null | (() => void),
        objectStore: () => ({
          put: (p: Project, key: string) => {
            assert.equal(key, 'current');
            saved = structuredClone(p);
            queueMicrotask(() => tx.oncomplete?.())
          },
          get: () => {
            const request = { result: structuredClone(saved), onsuccess: null as null | (() => void) };
            queueMicrotask(() => request.onsuccess?.());
            return request
          }
        })
      };
      return tx
    }
  };
  const restore = installGlobal('indexedDB', {
    open: () => {
      const request = { result: db, onsuccess: null as null | (() => void) };
      queueMicrotask(() => request.onsuccess?.());
      return request
    }
  });
  try {
    const original = createProject();
    const room = original.rooms.find(r => r.id === 'living')!;
    const x = (room.polygon[0][0] + room.polygon[2][0]) / 2;
    const z = (room.polygon[0][1] + room.polygon[2][1]) / 2;
    for (const kind of ['television', 'oven', 'microwave', 'dishwasher', 'hood'] as const)
      original.variants[0].furniture.push(boundFurniture(makeFurniture(kind, room.id, x, z), original));
    const h = history();
    const selected = original.variants[0].furniture.find(f => f.kind === 'chair' && f.roomId === 'living')!;
    const next = commitProjectEdit(original, h, p => {
      replaceFurniture(p, selected.id, catalog.find(p => p.name === 'Растение')!);
      const copy = duplicateFurniture(p, selected.id);
      moveFurniture(p, copy.id, copy.x - .1, copy.z)
    });
    await saveProject(next);
    assert.deepEqual(await loadProject(), next);
    assert.deepEqual((await loadProject())?.variants[0].furniture.filter(f => ['television', 'oven', 'microwave', 'dishwasher', 'hood'].includes(f.kind)),
      original.variants[0].furniture.filter(f => ['television', 'oven', 'microwave', 'dishwasher', 'hood'].includes(f.kind)));
    const undone = undoProject(next, h);
    const savedName = undone.name;
    await saveProject(undone);
    undone.name = 'Changed after saving';
    const reloaded = await loadProject();
    assert.equal(reloaded?.name, savedName);
    assert.deepEqual(reloaded?.variants[0].furniture, original.variants[0].furniture);
    assert.equal(closed, 5);
  } finally { restore() }
});

test('photo decode failure has a Russian actionable message', async () => {
  const restore = installGlobal('createImageBitmap', async () => { throw Error('The source image could not be decoded.') });
  try {
    await assert.rejects(importPhoto(new File(['broken'], 'texture.png', { type: 'image/png' })), /Не удалось прочитать фото/)
  } finally { restore() }
});
