import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, setupOffice, furnitureFootprint, fitsFurniture, duplicateVariant,
  parseProject, validateProject, makeFurniture, boundFurniture, resizeRoom, moveFurniture,
  replaceFurniture, duplicateFurniture, setCeilingHeight, doorwayObstructions, type Furniture, type Kind } from '../src/model';
import { catalog } from '../src/furnitureCatalog';
import { commitProjectEdit, undoProject, redoProject } from '../src/projectEdits';

const kinds: Kind[] = ['workstation', 'bookcase', 'rack', 'bench', 'platform', 'kettlebell'];
const office = (p: ReturnType<typeof createProject>) =>
  p.variants.find(v => v.id === p.activeVariantId)!.furniture.filter(f => f.roomId === 'bed3');
function bounds(f: Furniture, scale = 1) {
  const corners = furnitureFootprint(f, scale);
  return { x0: Math.min(...corners.map(p => p[0])), x1: Math.max(...corners.map(p => p[0])),
    z0: Math.min(...corners.map(p => p[1])), z1: Math.max(...corners.map(p => p[1])) };
}
function separate(a: Furniture, b: Furniture, scale = 1) {
  const A = bounds(a, scale), B = bounds(b, scale);
  return A.x1 <= B.x0 || B.x1 <= A.x0 || A.z1 <= B.z0 || B.z1 <= A.z0;
}

test('fresh office has all requested objects, exact envelopes, platform elevation and a computed gap', t => {
  const p = createProject(), items = office(p);
  const expected = [[1.5, .75, 1.3], [.8, .3, 2], [2, 1.15, 2.14],
    [.55, 1.25, .45], [2, 2, .04], [.2, .2, .3]];
  kinds.forEach((kind, i) => {
    const f = items.find(f => f.kind === kind)!;
    assert.ok(f, kind);
    assert.deepEqual([f.width, f.depth, f.height], expected[i]);
    assert.equal(f.elevation, ['rack', 'bench', 'kettlebell'].includes(kind) ? .04 : 0);
    const preset = catalog.find(c => c.kind === kind)!;
    assert.deepEqual(preset.dims, expected[i]);
  });
  assert.equal(items.length, 7); // Six requested assemblies and a desk chair.
  assert.ok(items.every(f => fitsFurniture(f, p)));
  assert.ok(!items.some(f => ['bed', 'sofa', 'wardrobe', 'table'].includes(f.kind)));
  const platform = items.find(f => f.kind === 'platform')!, P = bounds(platform);
  for (const f of items.filter(f => ['rack', 'bench', 'kettlebell'].includes(f.kind))) {
    const b = bounds(f);
    assert.ok(b.x0 >= P.x0 - 1e-9 && b.x1 <= P.x1 + 1e-9 && b.z0 >= P.z0 && b.z1 <= P.z1, f.kind);
  }
  for (const a of items.filter(f => ['workstation', 'bookcase', 'chair'].includes(f.kind)))
    for (const b of items.filter(f => ['rack', 'bench', 'platform', 'kettlebell'].includes(f.kind)))
      assert.ok(separate(a, b), `${a.kind}/${b.kind}`);
  const desk = items.find(f => f.kind === 'workstation')!, gap = P.z0 - bounds(desk).z1;
  assert.ok(gap > .25 && gap < .35, String(gap));
  const chair = items.find(f => f.kind === 'chair')!, chairGap = P.z0 - bounds(chair).z1;
  assert.ok(chairGap > .8);
  assert.deepEqual(doorwayObstructions(p, items), []);
  t.diagnostic(`Desk/platform gap ${gap.toFixed(6)} m; chair/platform gap ${chairGap.toFixed(6)} m (static envelopes only)`);
  assert.deepEqual(validateProject(p), p);
});

test('explicit setup replaces only the active office and undoes in one transaction', () => {
  const p = createProject();
  p.variants[0].furniture = p.variants[0].furniture.filter(f => f.roomId !== 'bed3');
  p.variants[0].furniture.push(boundFurniture(makeFurniture('sofa', 'bed3', 8, 10), p));
  p.variants.push(duplicateVariant(p.variants[0]));
  p.activeVariantId = p.variants[1].id;
  const h = { past: [], future: [] }, before = structuredClone(p);
  const next = commitProjectEdit(p, h, setupOffice);
  assert.deepEqual(p, before);
  assert.deepEqual(next.variants[0], before.variants[0]);
  assert.deepEqual(next.variants[1].furniture.filter(f => f.roomId !== 'bed3'), before.variants[1].furniture.filter(f => f.roomId !== 'bed3'));
  const { furniture: ignoredBefore, ...variantBefore } = before.variants[1];
  const { furniture: ignoredNext, ...variantNext } = next.variants[1];
  assert.deepEqual(variantNext, variantBefore);
  assert.deepEqual(next.rooms, before.rooms); assert.deepEqual(next.walls, before.walls);
  assert.equal(office(next).length, 7); assert.equal(h.past.length, 1);
  assert.deepEqual(undoProject(next, h), before);
  assert.deepEqual(redoProject(before, h), next);
  assert.deepEqual(parseProject(JSON.stringify(next)), next);
});

test('setup uses current resized geometry and physical scale and fails atomically without fit', () => {
  for (const scale of [1, 1.5, 2]) {
    const p = createProject(); p.scale = scale;
    resizeRoom(p, 'bed3', 0, 3.5 / scale);
    resizeRoom(p, 'bed3', 1, 4.5 / scale);
    setupOffice(p);
    assert.ok(office(p).every(f => fitsFurniture(f, p)));
    for (const a of office(p).filter(f => ['workstation', 'bookcase', 'chair'].includes(f.kind)))
      for (const b of office(p).filter(f => ['rack', 'bench', 'platform'].includes(f.kind)))
        assert.ok(separate(a, b, scale));
  }
  for (const axis of [0, 1] as const) {
    const p = createProject(); resizeRoom(p, 'bed3', axis, axis === 0 ? 1.8 : 2.5);
    const before = structuredClone(p), h = { past: [], future: [] };
    assert.throws(() => setupOffice(p), /не помещается/);
    assert.deepEqual(p, before);
    assert.throws(() => commitProjectEdit(p, h, setupOffice), /не помещается/);
    assert.deepEqual(h, { past: [], future: [] }); assert.deepEqual(p, before);
  }
  const p = createProject(); p.ceilingHeight = 2;
  const before = structuredClone(p);
  assert.throws(() => setupOffice(p), /потолка/); assert.deepEqual(p, before);
});

test('thin platform accepts editable heights while legacy physical limits and old office JSON remain intact', () => {
  const p = createProject(), platform = office(p).find(f => f.kind === 'platform')!;
  for (const height of [.01, .04, .19, .2]) {
    const copy = structuredClone(p); office(copy).find(f => f.id === platform.id)!.height = height;
    assert.doesNotThrow(() => validateProject(copy));
  }
  for (const height of [0, .009, NaN, Infinity, 3.01]) {
    const copy = structuredClone(p); office(copy).find(f => f.id === platform.id)!.height = height;
    assert.throws(() => validateProject(copy));
  }
  const copy = structuredClone(p); office(copy).find(f => f.kind === 'bench')!.height = .04;
  assert.throws(() => validateProject(copy));
  const old = createProject(); old.variants[0].furniture = [boundFurniture(makeFurniture('table', 'bed3', 8, 10), old)];
  delete old.variants[0].furniture[0].elevation;
  const decoded = parseProject(JSON.stringify(old));
  assert.deepEqual(decoded, old); assert.equal(office(decoded)[0].kind, 'table');
});

test('office rack rejects a ceiling below its own height before changing any variant or electrical layer', () => {
  const p = createProject(); p.variants.push(duplicateVariant(p.variants[0]));
  const before = structuredClone(p), h = { past: [], future: [structuredClone(p)] };
  const historyBefore = structuredClone(h);
  assert.throws(() => setCeilingHeight(p, 2), /выше нового потолка/);
  assert.deepEqual(p, before);
  assert.throws(() => commitProjectEdit(p, h, next => setCeilingHeight(next, 2)), /выше нового потолка/);
  assert.deepEqual(p, before); assert.deepEqual(h, historyBefore);
});

test('every office type reuses movement, rotation, dimensions, duplicate, replacement, delete and history', () => {
  for (const kind of kinds) {
    const p = createProject(), [room] = p.rooms.filter(r => r.id === 'living');
    const f = boundFurniture(makeFurniture(kind, room.id, 5, 10), p);
    p.variants[0].furniture = [f]; p.variants.push(duplicateVariant(p.variants[0]));
    const h = { past: [], future: [] };
    const moved = commitProjectEdit(p, h, next => { moveFurniture(next, f.id, 5.2, 10.2) });
    const rotated = commitProjectEdit(moved, h, next => {
      next.variants[0].furniture[0] = boundFurniture({ ...next.variants[0].furniture[0], rotation: 90, width: .8, depth: .5, height: kind === 'platform' ? .04 : .8, elevation: .04 }, next);
    });
    const copied = commitProjectEdit(rotated, h, next => { duplicateFurniture(next, f.id) });
    assert.equal(copied.variants[0].furniture.length, 2);
    assert.equal(copied.variants[0].furniture[1].elevation, .04);
    const replacement = commitProjectEdit(copied, h, next => { replaceFurniture(next, f.id, catalog.find(c => c.kind === kind)!) });
    assert.equal(replacement.variants[0].furniture[0].id, f.id);
    const removed = commitProjectEdit(replacement, h, next => { next.variants[0].furniture = next.variants[0].furniture.filter(item => item.id !== f.id) });
    assert.deepEqual(undoProject(removed, h), replacement);
    assert.deepEqual(replacement.variants[1], p.variants[1]);
    assert.deepEqual(parseProject(JSON.stringify(replacement)), replacement);
  }
});
