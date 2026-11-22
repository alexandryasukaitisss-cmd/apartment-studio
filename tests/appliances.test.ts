import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject, makeFurniture, center, boundFurniture, fitsFurniture, furnitureFootprint,
  validateProject, parseProject, replaceFurniture, duplicateFurniture, duplicateVariant,
  moveFurniture, resizeRoom, roomSize, setCeilingHeight, addElectricalPoint,
  type Project, type Kind,
} from '../src/model';
import { catalog } from '../src/furnitureCatalog';
import { commitProjectEdit, undoProject, redoProject, type ProjectHistory } from '../src/projectEdits';

const kinds: Kind[] = ['television', 'oven', 'microwave', 'dishwasher', 'hood'];
const history = (): ProjectHistory => ({ past: [], future: [] });
function fixture(scale = 1) {
  const p = createProject();
  p.scale = scale;
  const room = p.rooms.find(r => r.id === 'living')!;
  const [x, z] = center(room);
  p.variants[0].furniture = kinds.map(kind => boundFurniture(makeFurniture(kind, room.id, x, z), p));
  return validateProject(p);
}

test('appliance dimensions and elevations are editable defaults; baseline receives no new objects', () => {
  assert.ok(!createProject().variants[0].furniture.some(f => kinds.includes(f.kind)));
  const p = fixture();
  assert.deepEqual(p.variants[0].furniture.map(f => [f.kind, f.width, f.depth, f.height, f.elevation]), [
    ['television', 1.23, .08, .72, 1], ['oven', .6, .58, .6, 0],
    ['microwave', .5, .4, .3, .9], ['dishwasher', .6, .6, .85, 0], ['hood', .6, .5, .7, 1.55],
  ]);
  assert.deepEqual(catalog.filter(c => c.kind === 'television').map(c => c.dims), [
    [.97, .07, .57], [1.23, .08, .72], [1.45, .08, .84],
  ]);
});

test('version 1 files without elevation keep floor semantics and unrelated materials, lighting and electrical data', () => {
  const old = fixture();
  addElectricalPoint(old, 'living', 'socket');
  old.materials.push({ ...old.materials[0], id: 'personal-photo', name: 'Образец', pattern: 'image', image: 'data:image/png;base64,YQ==' });
  old.variants[0].finishes.living.walls = 'personal-photo';
  old.variants.push(duplicateVariant(old.variants[0]));
  for (const variant of old.variants)
    for (const f of variant.furniture) delete f.elevation;
  const before = structuredClone(old);
  const normalized = parseProject(JSON.stringify(old));
  assert.deepEqual(normalized, before);
  assert.deepEqual(old, before);
  assert.ok(normalized.variants.every(v => v.furniture.every(f => (f.elevation ?? 0) === 0)));
});

test('invalid elevation and tops above the ceiling reject atomically and preserve redo history', () => {
  const original = fixture();
  const television = original.variants[0].furniture[0];
  const before = structuredClone(original);
  const patches = [
    { elevation: NaN }, { elevation: Infinity }, { elevation: -Infinity }, { elevation: -.01 },
    { elevation: 4.01 }, { elevation: null }, { elevation: '1' },
    { elevation: original.ceilingHeight - television.height + .01 },
    { height: original.ceilingHeight - television.elevation! + .01 },
  ];
  for (const patch of patches) {
    const h = { past: [structuredClone(original)], future: [structuredClone(original)] };
    const historyBefore = structuredClone(h);
    assert.throws(() => commitProjectEdit(original, h, p => {
      Object.assign(p.variants[0].furniture[0], patch);
    }), /Высота от пола|выше потолка/);
    assert.deepEqual(original, before);
    assert.deepEqual(h, historyBefore);
  }
  const exact = commitProjectEdit(original, history(), p => {
    p.variants[0].furniture[0].elevation = p.ceilingHeight - television.height;
  });
  assert.equal(exact.variants[0].furniture[0].elevation! + exact.variants[0].furniture[0].height, exact.ceilingHeight);
});

test('lowering ceiling clamps elevated objects and electrical heights in every variant; undo restores them', () => {
  const original = fixture();
  addElectricalPoint(original, 'living', 'light');
  original.variants.push(duplicateVariant(original.variants[0]));
  original.variants[1].furniture[0].elevation = 1.95;
  const h = history();
  const next = commitProjectEdit(original, h, p => setCeilingHeight(p, 2));
  assert.equal(next.ceilingHeight, 2);
  for (const v of next.variants) {
    const hood = v.furniture.find(f => f.kind === 'hood')!;
    assert.equal(hood.elevation, 1.3);
    assert.equal(v.furniture.find(f => f.kind === 'oven')!.elevation, 0);
    assert.equal(v.electrical.points[0].height, 2);
    assert.ok(v.furniture.every(f => (f.elevation ?? 0) + f.height <= 2));
  }
  assert.deepEqual(undoProject(next, h), original);
  assert.deepEqual(redoProject(original, h), next);
});

test('impossible or nonfinite ceiling changes reject before altering any variant or electrical point', () => {
  const original = fixture();
  addElectricalPoint(original, 'living', 'light');
  original.variants.push(duplicateVariant(original.variants[0]));
  Object.assign(original.variants[1].furniture[0], { height: 2.5, elevation: .2 });
  validateProject(original);
  const before = structuredClone(original);
  for (const height of [2, NaN, Infinity, 1.99, 4.01]) {
    const direct = structuredClone(original);
    assert.throws(() => setCeilingHeight(direct, height), /выше нового потолка|Высота потолка/);
    assert.deepEqual(direct, before);
    const h = history();
    assert.throws(() => commitProjectEdit(original, h, p => setCeilingHeight(p, height)));
    assert.deepEqual(h, history());
    assert.deepEqual(original, before);
  }
});

test('thin television footprints remain physical and valid at each scale, including rotation', () => {
  for (const scale of [.5, 1, 2]) {
    const p = fixture(scale), television = p.variants[0].furniture[0];
    const points = furnitureFootprint(television, scale);
    assert.ok(Math.abs((points[2][1] - points[0][1]) * scale - .08) < 1e-9);
    television.depth = .01;
    assert.doesNotThrow(() => validateProject(p));
    television.rotation = 90;
    assert.ok(fitsFurniture(television, p));
    assert.doesNotThrow(() => validateProject(p));
    television.depth = .009;
    assert.throws(() => validateProject(p), /мебель/);
  }
});

test('project scale and shared room resizing preserve physical elevation and all appliance dimensions', () => {
  const original = fixture();
  original.variants.push(duplicateVariant(original.variants[0]));
  for (const scale of [.5, 1, 2]) {
    const p = structuredClone(original);
    p.scale = scale;
    const room = p.rooms.find(r => r.id === 'living')!;
    resizeRoom(p, room.id, 0, roomSize(room)[0] + .6);
    for (let i = 0; i < p.variants.length; i++) {
      assert.deepEqual(p.variants[i].furniture.map(f => [f.width, f.depth, f.height, f.elevation]),
        original.variants[i].furniture.map(f => [f.width, f.depth, f.height, f.elevation]));
    }
    assert.doesNotThrow(() => validateProject(p));
  }
});

test('all new kinds support drag, rotation, duplication, deletion and undo without changing other variants', () => {
  for (const kind of kinds) {
    const original = fixture();
    original.variants.push(duplicateVariant(original.variants[0]));
    const old = original.variants[0].furniture.find(f => f.kind === kind)!;
    const h = history();
    let copyId = '';
    const next = commitProjectEdit(original, h, p => {
      const moved = moveFurniture(p, old.id, old.x - .3, old.z + .3);
      Object.assign(moved, boundFurniture({ ...moved, rotation: 90 }, p));
      copyId = duplicateFurniture(p, old.id).id;
    });
    const copy = next.variants[0].furniture.find(f => f.id === copyId)!;
    assert.notEqual(copy.id, old.id);
    assert.equal(copy.kind, kind);
    assert.equal(copy.elevation, old.elevation);
    assert.equal(copy.rotation, 90);
    assert.ok(fitsFurniture(copy, next));
    assert.deepEqual(next.variants[1], original.variants[1]);
    assert.deepEqual(parseProject(JSON.stringify(next)), next);
    assert.deepEqual(undoProject(next, h), original);
    assert.deepEqual(redoProject(original, h), next);
    const removed = commitProjectEdit(next, h, p => {
      p.variants[0].furniture = p.variants[0].furniture.filter(f => f.id !== copyId);
    });
    assert.ok(!removed.variants[0].furniture.some(f => f.id === copyId));
    assert.deepEqual(undoProject(removed, h), next);
  }
});

test('replacement uses explicit preset elevation or the kind default and resets floor presets to zero', () => {
  const p = fixture(), h = history(), original = p.variants[0].furniture[0];
  const elevated = commitProjectEdit(p, h, next => {
    replaceFurniture(next, original.id, { kind: 'microwave', dims: [.5, .4, .3], elevation: 1.2 });
  });
  const replacement = elevated.variants[0].furniture[0];
  assert.deepEqual([replacement.id, replacement.roomId, replacement.x, replacement.z, replacement.rotation],
    [original.id, original.roomId, original.x, original.z, original.rotation]);
  assert.equal(replacement.elevation, 1.2);
  replaceFurniture(elevated, original.id, catalog.find(c => c.kind === 'hood')!);
  assert.equal(elevated.variants[0].furniture[0].elevation, 1.55);
  replaceFurniture(elevated, original.id, { kind: 'microwave', dims: [.5, .4, .3] });
  assert.equal(elevated.variants[0].furniture[0].elevation, .9);
  replaceFurniture(elevated, original.id, catalog.find(c => c.kind === 'oven')!);
  assert.equal(elevated.variants[0].furniture[0].elevation, 0);
  const before = structuredClone(elevated), historyBefore = structuredClone(h);
  assert.throws(() => commitProjectEdit(elevated, h, next => {
    replaceFurniture(next, original.id, { kind: 'television', dims: [1.23, .08, .72], elevation: next.ceilingHeight - .72 + .01 });
  }), /выше потолка/);
  assert.deepEqual(elevated, before);
  assert.deepEqual(h, historyBefore);
});

test('appliance variants isolate elevation and dimensions through portable JSON', () => {
  const p: Project = fixture();
  const copy = duplicateVariant(p.variants[0]);
  p.variants.push(copy);
  copy.furniture[0].elevation = .5;
  copy.furniture[0].width = .97;
  copy.finishes.living.walls = 'paint';
  assert.equal(p.variants[0].furniture[0].elevation, 1);
  assert.equal(p.variants[0].furniture[0].width, 1.23);
  assert.equal(p.variants[0].finishes.living.walls, 'plaster');
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
});
