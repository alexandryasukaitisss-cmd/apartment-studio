import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, area, rooms, inside, canWalk, parseProject, validateProject, duplicateVariant, resizeRoom, roomSize, makeFurniture, boundFurniture, fitsFurniture, furnitureFootprint, L, Q, R, H, Z, X, F, J } from '../src/model';
test('new projects use a 2.8 m ceiling while saved 2.7 m projects round trip unchanged', () => {
  const fresh = createProject();
  assert.equal(fresh.ceilingHeight, 2.8);
  assert.deepEqual(parseProject(JSON.stringify(fresh)), fresh);
  const saved = structuredClone(fresh);
  saved.ceilingHeight = 2.7;
  const imported = parseProject(JSON.stringify(saved));
  assert.equal(imported.ceilingHeight, 2.7);
  assert.deepEqual(parseProject(JSON.stringify(imported)), saved);
});

test('reconstruction agrees with all ten source floor areas', () => {
  const targets = [11.9, 3.6, 3.36, 6.39, 1.77, 12.05, 20.05, 5, 11.84, 3.6];
  rooms.forEach((r, i) => assert.ok(Math.abs(area(r.polygon) - targets[i]) < .000001, `${r.id}: ${area(r.polygon)}`));
  assert.ok(inside([.8, L - .2], rooms[0].polygon));
  assert.ok(!inside([2.5, L - .2], rooms[0].polygon));
  assert.ok(!inside([2.5, Q + .15], rooms[5].polygon))
});
test('room interiors do not overlap', () => {
  for (let x = .03; x < F; x += .09)
    for (let z = .03; z < H + 1.2; z += .09)
      assert.ok(rooms.filter(r => inside([x, z], r.polygon)).length <= 1, `overlap ${x},${z}`)
});
test('seeded objects fit stepped room polygons and rotate inside bounds', () => {
  const p = createProject();
  for (const f of p.variants[0].furniture)
    assert.ok(fitsFurniture(f, p), f.kind + ' ' + f.roomId);
  const f = boundFurniture({ ...makeFurniture('bed', 'bed1', 2.9, L - .1), width: 1.4, depth: 2, rotation: 90 }, p);
  assert.ok(fitsFurniture(f, p));
  assert.ok(!furnitureFootprint(f).some(pt => inside(pt, rooms[3].polygon)))
});
test('walk has connected access to each room and never crosses solid perimeter', () => {
  const p = createProject();
  const step = .09;
  const start: [number, number] = [2.4, 5];
  const visited = new Set<string>();
  const queue: [number, number][] = [start];
  const reached = new Set<string>();
  for (let q = 0; q < queue.length; q++) {
    const [x, z] = queue[q];
    for (const r of rooms)
      if (inside([x, z], r.polygon))
        reached.add(r.id);
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = Math.round((x + dx) * 1000) / 1000, nz = Math.round((z + dz) * 1000) / 1000, k = `${nx},${nz}`;
      if (nx < 0 || nz < 0 || nx > F || nz > H + 1.2 || visited.has(k))
        continue;
      visited.add(k);
      if (canWalk([nx, nz], p))
        queue.push([nx, nz])
    }
  }
  assert.equal(reached.size, 10, `missing ${rooms.filter(r => !reached.has(r.id)).map(r => r.id)}`);
  assert.equal(canWalk([-.2, 4], p), false);
  assert.equal(canWalk([.04, 2], p), false);
  assert.equal(canWalk([1.5, -.05], p), false)
});
test('portable project validates and round trips without shared variant mutations', () => {
  const p = createProject();
  const copy = duplicateVariant(p.variants[0]);
  p.variants.push(copy);
  copy.finishes.living.floor = 'green';
  copy.furniture[0].color = '#abcdef';
  assert.equal(p.variants[0].finishes.living.floor, 'oak');
  assert.notEqual(p.variants[0].furniture[0].color, '#abcdef');
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
  assert.throws(() => parseProject('garbage'));
  const bad = structuredClone(p);
  bad.variants[0].furniture[0].x = -100;
  assert.throws(() => validateProject(bad));
  assert.throws(() => parseProject(JSON.stringify({ ...p, scale: '1' })))
});
test('room resize moves shared lines and openings; object physical size remains unchanged', () => {
  const p = createProject();
  const f = p.variants[0].furniture.find(f => f.roomId === 'living')!;
  const original = [f.width, f.depth, f.height];
  const width = roomSize(p.rooms.find(r => r.id === 'living')!)[0];
  resizeRoom(p, 'living', 0, width + .4);
  assert.ok(Math.abs(roomSize(p.rooms.find(r => r.id === 'living')!)[0] - width - .4) < 1e-10);
  assert.deepEqual([f.width, f.depth, f.height], original);
  const living = p.rooms.find(r => r.id === 'living')!, entry = p.rooms.find(r => r.id === 'entry')!;
  assert.equal(living.polygon[1][0], entry.polygon[0][0]);
  assert.doesNotThrow(() => validateProject(p));
  p.scale = 1.2;
  assert.deepEqual([f.width, f.depth, f.height], original)
});
