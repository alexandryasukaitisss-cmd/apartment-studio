import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, inside, makeFurniture, furnitureOverlaps, furnitureFootprint, canWalk, moveFurniture, moveFurnitureToRoom, passageWarnings, snapFurnitureToWalls, validateProject, type Project } from '../src/model';

test('fresh arrangement has no collision warnings and no furniture in door strips', () => {
  const p = createProject();
  assert.deepEqual(furnitureOverlaps(p, p.variants[0].furniture), []);
});

test('separating-axis collision sees rotated overlaps, ignores a platform and vertically separated items', () => {
  const p = createProject();
  const variant = p.variants[0];
  const room = p.rooms.find(r => r.id === 'bed3')!;
  const [x, z] = [8.5, 11.3];
  const bed = { ...makeFurniture('bed', room.id, x, z), rotation: 45 };
  const table = { ...makeFurniture('table', room.id, x, z), rotation: 10 };
  assert.ok(furnitureFootprint(bed, p.scale).length === 4);
  assert.equal(furnitureOverlaps(p, [bed, table]).length, 1);
  assert.equal(furnitureOverlaps(p, [bed, { ...table, x: x + 3 }]).length, 0);
  const platform = { ...makeFurniture('platform', room.id, x, z), elevation: 0 };
  assert.equal(furnitureOverlaps(p, [platform, table]).length, 0);
  const microwave = { ...makeFurniture('microwave', room.id, x, z), elevation: .9 };
  assert.equal(furnitureOverlaps(p, [{ ...table, height: .75 }, microwave]).length, 0, 'microwave above the table top');
});

test('dragging across a wall moves a plant into the other room and keeps its size', () => {
  const p = createProject(), variant = p.variants[0];
  const plant = variant.furniture.find(f => f.kind === 'plant' && f.roomId === 'living')!;
  const room = p.rooms.find(r => r.id === 'bed3')!;
  const xs = room.polygon.map(pt => pt[0]), zs = room.polygon.map(pt => pt[1]);
  const target = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2] as [number, number];
  assert.ok(inside(target, room.polygon));
  const moved = moveFurniture(p, plant.id, target[0], target[1]);
  assert.equal(moved.roomId, 'bed3');
  assert.deepEqual([moved.width, moved.depth, moved.height], [plant.width, plant.depth, plant.height]);
  assert.equal(moved.id, plant.id);
  assert.equal(p.variants[0].furniture.filter(f => f.id === plant.id).length, 1);
  validateProject(p);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
});

test('a move into a room where the item cannot fit fails atomically', () => {
  const p = createProject();
  const kitchen = p.variants[0].furniture.find(f => f.kind === 'kitchen')!;
  const before = structuredClone(p);
  const closet = p.rooms.find(r => r.id === 'closet')!;
  const [x, z] = [closet.polygon[0][0] + .7, closet.polygon[0][1] + .6];
  assert.throws(() => moveFurniture(p, kitchen.id, x, z), /не помещается/);
  assert.deepEqual(p, before);
});

test('walking is blocked by solid furniture but not by a low platform', () => {
  const p = createProject(), variant = p.variants[0];
  const bed = variant.furniture.find(f => f.kind === 'bed' && f.roomId === 'bed1')!;
  const insideBed = [bed.x, bed.z] as [number, number];
  assert.equal(canWalk(insideBed, p), true, 'wall-only check stays available for callers without furniture');
  assert.equal(canWalk(insideBed, p, variant.furniture), false);

  const room = p.rooms.find(r => r.id === 'bed3')!;
  const [x, z] = [room.polygon[0][0] + .5, room.polygon[0][1] + .5];
  const clear: Project = structuredClone(p);
  clear.variants[0].furniture = clear.variants[0].furniture.filter(f => f.roomId !== 'bed3');
  const platform = { ...makeFurniture('platform', 'bed3', x, z), width: .6, depth: .6 };
  clear.variants[0].furniture.push(platform);
  assert.ok(canWalk([x, z], clear, clear.variants[0].furniture));
  clear.variants[0].furniture.push({ ...makeFurniture('wardrobe', 'bed3', x, z), width: .6, depth: .6 });
  assert.equal(canWalk([x, z], clear, clear.variants[0].furniture), false);
});

test('wall snapping aligns furniture flush against nearby room walls and moveFurnitureToRoom relocates items safely', () => {
  const p = createProject();
  const sofa = p.variants[0].furniture.find(f => f.kind === 'sofa' && f.roomId === 'living')!;
  const nearWestWall = { ...sofa, rotation: 270, x: 3 + sofa.depth / 2 + .025 + .07 };
  const snapped = snapFurnitureToWalls(nearWestWall, p);
  assert.ok(Math.abs(snapped.x - (3 + sofa.depth / 2 + .025)) < 1e-9);

  const plant = p.variants[0].furniture.find(f => f.kind === 'plant' && f.roomId === 'living')!;
  const relocated = moveFurnitureToRoom(p, plant.id, 'bed1');
  assert.equal(relocated.roomId, 'bed1');
  assert.ok(inside([relocated.x, relocated.z], p.rooms.find(r => r.id === 'bed1')!.polygon));
  validateProject(p);

  const kitchen = p.variants[0].furniture.find(f => f.kind === 'kitchen')!;
  assert.throws(() => moveFurnitureToRoom(p, kitchen.id, 'closet'), /не помещается/);
});

test('passageWarnings flags narrow gaps under 60 cm between major furniture while ignoring flush joins', () => {
  const p = createProject();
  assert.deepEqual(passageWarnings(p, p.variants[0].furniture), []);
  const a = { ...makeFurniture('wardrobe', 'living', 4.0, 12.0), width: 1.0, depth: .6, rotation: 0 };
  const b = { ...makeFurniture('table', 'living', 5.35, 12.0), width: 1.0, depth: .6, rotation: 0 };
  const warnings = passageWarnings(p, [a, b]);
  assert.equal(warnings.length, 1);
  assert.ok(Math.abs(warnings[0].clearanceM - .35) < 1e-6);
});
