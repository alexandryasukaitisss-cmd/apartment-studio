import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, parseProject, validateProject, addElectricalPoint, moveElectricalPoint, electricalPointInRoom, connectElectricalPoints, removeElectricalPoint, duplicateElectricalPoint, duplicateVariant, resizeRoom, roomSize, setCeilingHeight, boundFurniture, MAX_ELECTRICAL_POINTS, MAX_ELECTRICAL_CONNECTIONS, L, type Project, type ElectricalType } from '../src/model';
import { commitProjectEdit, undoProject, redoProject, type ProjectHistory } from '../src/projectEdits';
import { saveProject, loadProject } from '../src/storage';

const history = (): ProjectHistory => ({ past: [], future: [] });
function fixture() {
  const p = createProject();
  const a = addElectricalPoint(p, 'bed1', 'socket');
  const b = addElectricalPoint(p, 'bed1', 'switch');
  const c = addElectricalPoint(p, 'living', 'light');
  connectElectricalPoints(p, a.id, b.id);
  connectElectricalPoints(p, b.id, c.id);
  return { p, a, b, c };
}

test('old version 1 projects normalize missing electrical layers without mutating their input', () => {
  const old = createProject();
  Reflect.deleteProperty(old.variants[0], 'electrical');
  const before = structuredClone(old);
  const normalized = validateProject(old);
  assert.deepEqual(normalized.variants[0].electrical, { points: [], connections: [] });
  assert.deepEqual(old, before);
  assert.deepEqual(parseProject(JSON.stringify(old)), normalized);
  const h = history();
  assert.deepEqual(commitProjectEdit(old, h, p => { p.name = 'Legacy edit' }).variants[0].electrical, normalized.variants[0].electrical);
});

test('all five point types get editable physical heights and preserve furniture and finishes', () => {
  const p = createProject(), before = structuredClone(p.variants[0]);
  for (const type of ['socket', 'switch', 'light', 'network', 'appliance'] as ElectricalType[]) {
    const pt = addElectricalPoint(p, 'bed1', type);
    assert.equal(pt.type, type);
    assert.ok(pt.height >= 0 && pt.height <= p.ceilingHeight);
    assert.ok(electricalPointInRoom([pt.x, pt.z], p.rooms[0]));
  }
  assert.deepEqual(p.variants[0].furniture, before.furniture);
  assert.deepEqual(p.variants[0].finishes, before.finishes);
  assert.doesNotThrow(() => validateProject(p));
});

test('point coordinates, heights, types, labels, room and identity are validated', () => {
  const { p } = fixture();
  const patches = [{ x: NaN }, { z: Infinity }, { x: 30 }, { height: -.01 }, { height: p.ceilingHeight + .01 }, { height: NaN }, { type: 'breaker' }, { type: '__proto__' }, { roomId: 'missing' }, { label: 'x'.repeat(61) }, { label: 3 }, { id: '' }, { id: 'x'.repeat(101) }];
  for (const patch of patches) {
    const bad = structuredClone(p);
    Object.assign(bad.variants[0].electrical.points[0], patch);
    assert.throws(() => validateProject(bad), /электрики/, JSON.stringify(patch));
  }
  const bad = structuredClone(p);
  bad.variants[0].electrical.points[1].id = bad.variants[0].electrical.points[0].id;
  assert.throws(() => validateProject(bad), /электрики/);
  p.variants[0].electrical.points[0].height = 0;
  p.variants[0].electrical.points[1].height = p.ceilingHeight;
  assert.doesNotThrow(() => validateProject(p));
});

test('malformed and oversized layers and point lists are rejected', () => {
  for (const layer of [null, {}, [], { points: {}, connections: [] }, { points: [null], connections: [] }, { points: [], connections: {} }]) {
    const p = createProject();
    Object.assign(p.variants[0], { electrical: layer });
    assert.throws(() => validateProject(p), /электрики/);
  }
  const p = createProject();
  const pt = addElectricalPoint(p, 'bed1', 'socket');
  p.variants[0].electrical.points = Array.from({ length: MAX_ELECTRICAL_POINTS + 1 }, (_, i) => ({ ...pt, id: `point-${i}` }));
  assert.throws(() => validateProject(p), /электрики/);
});

test('connections reject missing endpoints, self-links, duplicate IDs and reverse duplicate pairs', () => {
  const { p, a, b } = fixture();
  for (const link of [null, { id: '', from: a.id, to: b.id }, { id: 'new', from: 'missing', to: b.id }, { id: 'new', from: a.id, to: a.id }, { id: 'new', from: b.id, to: a.id }, { id: p.variants[0].electrical.connections[0].id, from: a.id, to: p.variants[0].electrical.points[2].id }]) {
    const bad = structuredClone(p);
    bad.variants[0].electrical.connections.push(link as never);
    assert.throws(() => validateProject(bad), /электрики/);
  }
  const bad = structuredClone(p);
  bad.variants[0].electrical.connections = Array.from({ length: MAX_ELECTRICAL_CONNECTIONS + 1 }, (_, i) => ({ id: `link-${i}`, from: a.id, to: b.id }));
  assert.throws(() => validateProject(bad), /электрики/);
  const collision = structuredClone(p);
  collision.variants[0].electrical.connections[0].id = a.id;
  assert.throws(() => validateProject(collision), /электрики/);
});

test('deleting a point cleans its links only in the active variant and one undo restores everything', () => {
  const { p, b } = fixture();
  p.variants.push(duplicateVariant(p.variants[0]));
  const h = history();
  const next = commitProjectEdit(p, h, draft => removeElectricalPoint(draft, b.id));
  assert.equal(next.variants[0].electrical.points.length, 2);
  assert.equal(next.variants[0].electrical.connections.length, 0);
  assert.deepEqual(next.variants[0].furniture, p.variants[0].furniture);
  assert.deepEqual(next.variants[1], p.variants[1]);
  assert.equal(h.past.length, 1);
  assert.deepEqual(undoProject(next, h), p);
  assert.deepEqual(redoProject(p, h), next);
});

test('point copy is separate and unlinked; variant copies deeply isolate points and connections', () => {
  const { p, a } = fixture();
  a.label = 'У кровати';
  a.height = .45;
  const copy = duplicateVariant(p.variants[0]);
  p.variants.push(copy);
  const h = history();
  let copiedId = '';
  const next = commitProjectEdit(p, h, draft => { copiedId = duplicateElectricalPoint(draft, a.id).id });
  const duplicated = next.variants[0].electrical.points.find(pt => pt.id === copiedId)!;
  assert.notEqual(duplicated.id, a.id);
  assert.ok(Math.hypot(duplicated.x - a.x, duplicated.z - a.z) > .1);
  assert.equal(duplicated.label, a.label);
  assert.equal(duplicated.height, a.height);
  assert.equal(next.variants[0].electrical.connections.some(c => c.from === copiedId || c.to === copiedId), false);
  assert.deepEqual(next.variants[1], copy);
  copy.electrical.points[0].label = 'Другое место';
  copy.electrical.connections.pop();
  assert.equal(p.variants[0].electrical.points[0].label, 'У кровати');
  assert.equal(p.variants[0].electrical.connections.length, 2);
  assert.deepEqual(undoProject(next, h).variants[0].electrical.points, p.variants[0].electrical.points);
});

test('drag previews stay in concave polygons, including wall edges, and a release creates one undo entry', () => {
  const { p, a } = fixture();
  const h = history(), before = structuredClone(p);
  for (const [x, z] of [[2.8, L - .2], [-20, -20], [100, 100], [1.1, 1.4]]) {
    const preview = structuredClone(p);
    const moved = moveElectricalPoint(preview, a.id, x, z);
    assert.ok(electricalPointInRoom([moved.x, moved.z], p.rooms[0]));
    assert.equal(moved.height, a.height);
    assert.equal(h.past.length, 0);
  }
  assert.deepEqual(p, before);
  const next = commitProjectEdit(p, h, draft => { moveElectricalPoint(draft, a.id, 2.8, L - .2) });
  assert.equal(h.past.length, 1);
  assert.deepEqual(undoProject(next, h), p);
  assert.deepEqual(redoProject(p, h), next);
  assert.deepEqual(parseProject(JSON.stringify(next)), next);
});

test('room resize remaps electrical positions across shared lines in all variants; scale keeps heights physical', () => {
  const { p, a, c } = fixture();
  const entry = addElectricalPoint(p, 'entry', 'network');
  const copy = duplicateVariant(p.variants[0]);
  p.variants.push(copy);
  const original = structuredClone(p);
  const living = p.rooms.find(r => r.id === 'living')!;
  const lo = Math.min(...living.polygon.map(pt => pt[0])), width = roomSize(living)[0];
  const oldX = c.x, entryX = entry.x;
  resizeRoom(p, 'living', 0, width + .4);
  assert.equal(p.variants[0].electrical.points[0].x, a.x);
  assert.ok(Math.abs(p.variants[0].electrical.points.find(pt => pt.id === c.id)!.x - (lo + (oldX - lo) * (width + .4) / width)) < 1e-10);
  assert.ok(Math.abs(p.variants[0].electrical.points.find(pt => pt.id === entry.id)!.x - entryX - .4) < 1e-10);
  resizeRoom(p, 'bed1', 1, roomSize(p.rooms[0])[1] + .2);
  p.scale = 1.4;
  for (let v = 0; v < p.variants.length; v++) {
    assert.deepEqual(p.variants[v].electrical.points.map(pt => pt.height), original.variants[v].electrical.points.map(pt => pt.height));
    for (const pt of p.variants[v].electrical.points)
      assert.ok(electricalPointInRoom([pt.x, pt.z], p.rooms.find(r => r.id === pt.roomId)!));
  }
  assert.deepEqual(p.variants[0].electrical, p.variants[1].electrical);
  // Furniture uses physical extents, so apply the same fitting operation as the existing scale control.
  for (const v of p.variants)
    v.furniture = v.furniture.map(f => boundFurniture(f, p));
  assert.doesNotThrow(() => validateProject(p));
});

test('lower ceiling clamps only heights above it in all variants, and undo restores their original heights', () => {
  const { p, a, c } = fixture();
  // Isolate electrical clamping from furniture too tall for the target ceiling.
  // The new 2.14 m office rack correctly rejects a 2 m ceiling in office tests.
  p.variants[0].furniture = p.variants[0].furniture.filter(f => !(f.elevation ?? 0) || f.height <= 2);
  a.height = 1.75;
  c.label = 'Потолочный свет';
  p.variants.push(duplicateVariant(p.variants[0]));
  const h = history();
  const next = commitProjectEdit(p, h, draft => setCeilingHeight(draft, 2));
  for (const v of next.variants) {
    assert.equal(v.electrical.points.find(pt => pt.id === c.id)!.height, 2);
    assert.equal(v.electrical.points.find(pt => pt.id === a.id)!.height, 1.75);
    assert.equal(v.electrical.points.find(pt => pt.id === c.id)!.label, c.label);
  }
  assert.deepEqual(undoProject(next, h), p);
  assert.deepEqual(parseProject(JSON.stringify(next)), next);
});

test('invalid electrical mutations are atomic and do not alter undo history or originals', () => {
  const { p, a } = fixture();
  const h = history(), before = structuredClone(p);
  assert.throws(() => commitProjectEdit(p, h, draft => {
    draft.variants[0].electrical.points[0].height = 10;
    draft.variants[0].furniture.pop();
  }), /электрики/);
  assert.throws(() => commitProjectEdit(p, h, draft => connectElectricalPoints(draft, a.id, a.id)), /электрики/);
  assert.throws(() => commitProjectEdit(p, h, draft => { moveElectricalPoint(draft, a.id, NaN, 1) }), /положение/);
  assert.deepEqual(p, before);
  assert.deepEqual(h, history());
  assert.equal(commitProjectEdit(p, h, () => {}), p);
});

test('renaming, changing type/height, unlinking and redoing round trip through portable JSON', () => {
  const { p, a } = fixture();
  const h = history();
  const next = commitProjectEdit(p, h, draft => {
    const pt = draft.variants[0].electrical.points.find(pt => pt.id === a.id)!;
    Object.assign(pt, { label: 'Рядом с рабочим столом', type: 'network', height: .8 });
    draft.variants[0].electrical.connections.splice(0, 1);
  });
  assert.equal(next.variants[0].electrical.connections.length, 1);
  assert.deepEqual(parseProject(JSON.stringify(next)), next);
  assert.deepEqual(undoProject(next, h), p);
  assert.deepEqual(redoProject(p, h), next);
});

test('local storage reload preserves independent electrical layers and normalizes legacy saved files', async () => {
  let stored: Project | null = null;
  const oldDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const db = {
    close: () => {},
    transaction: () => {
      const tx = {
        oncomplete: null as null | (() => void),
        objectStore: () => ({
          put: (p: Project) => { stored = structuredClone(p); queueMicrotask(() => tx.oncomplete?.()) },
          get: () => {
            const req = { result: structuredClone(stored), onsuccess: null as null | (() => void) };
            queueMicrotask(() => req.onsuccess?.());
            return req;
          }
        })
      };
      return tx;
    }
  };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    open: () => {
      const req = { result: db, onsuccess: null as null | (() => void) };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    }
  } });
  try {
    const { p } = fixture();
    p.variants.push(duplicateVariant(p.variants[0]));
    await saveProject(p);
    assert.deepEqual(await loadProject(), p);
    const loaded = (await loadProject())!;
    loaded.variants[0].electrical.points[0].label = 'After reload';
    assert.notEqual(loaded.variants[1].electrical.points[0].label, 'After reload');
    assert.deepEqual(await loadProject(), p);
    Reflect.deleteProperty(p.variants[0], 'electrical');
    await saveProject(p);
    assert.deepEqual((await loadProject())!.variants[0].electrical, { points: [], connections: [] });
  } finally {
    if (oldDescriptor) Object.defineProperty(globalThis, 'indexedDB', oldDescriptor);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
