import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, resizeRoom, roomSize, validateProject } from '../src/model';
import { addOpening, openingLimits, removeOpening, roomOpenings, roomWalls, updateOpening, wallLength, wallTitle } from '../src/openings';

// The long west wall of the children's room has no openings in the source plan.
function freeWall() {
  const p = createProject();
  const wall = roomWalls(p, 'bed2').find(info => !(info.wall.openings?.length) && info.length > 6);
  assert.ok(wall, 'expected a long wall without openings');
  return { p, index: wall.index, length: wall.length };
}

test('room walls list only the walls that bound the room, with readable titles', () => {
  const p = createProject();
  const walls = roomWalls(p, 'living');
  assert.ok(walls.length >= 4);
  assert.ok(walls.every(w => w.wall.rooms.includes('living') && w.length > 0));
  const shared = walls.find(w => w.otherRooms.includes('bed3'));
  assert.ok(shared);
  assert.match(wallTitle(p, shared), /Кабинет/);
  assert.equal(wallLength(p.walls[shared.index]), shared.length);
});

test('adding a door centres it in the widest free span and keeps openings sorted', () => {
  const { p, index, length } = freeWall();
  const first = addOpening(p, index, 'door', 1);
  const opening = p.walls[index].openings![first];
  assert.equal(opening.kind, 'door');
  assert.ok(Math.abs(opening.end - opening.start - 1) < 1e-9);
  assert.ok(Math.abs((opening.start + opening.end) / 2 - length / 2) < 1e-9);
  const second = addOpening(p, index, 'door', 1);
  assert.equal(p.walls[index].openings!.length, 2);
  const sorted = p.walls[index].openings!.map(o => o.start);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => a - b));
  assert.notEqual(p.walls[index].openings![second], opening);
  assert.ok(p.walls[index].openings!.includes(opening));
  validateProject(p);
});

test('neighbouring openings cannot overlap, leave the wall, or become too narrow', () => {
  const { p, index } = freeWall();
  addOpening(p, index, 'door', 1);
  addOpening(p, index, 'door', 1);
  const openings = p.walls[index].openings!;
  const right = openings.find(o => o.start > 1)!;
  const rightIndex = openings.indexOf(right);
  const leftIndex = rightIndex === 0 ? 1 : 0;
  const left = openings[leftIndex];
  const limits = openingLimits(p, index, leftIndex);
  assert.ok(limits.maxWidth > 0);
  assert.throws(() => updateOpening(p, index, leftIndex, { start: right.start - .5, end: right.end }), /пересекаться/);
  assert.throws(() => updateOpening(p, index, leftIndex, { start: -0.2 }), /за пределы/);
  assert.throws(() => updateOpening(p, index, leftIndex, { end: left.start + .3 }), /Ширина двери/);
  const before = structuredClone(p);
  assert.throws(() => updateOpening(p, index, leftIndex, { end: 99 }), /за пределы/);
  assert.deepEqual(p, before);
});

test('a window can be wider than a door; switching type keeps the wall contract', () => {
  const { p, index } = freeWall();
  const openingIndex = addOpening(p, index, 'window', 2.4);
  const opening = p.walls[index].openings![openingIndex];
  assert.ok(Math.abs(opening.end - opening.start - 2.4) < 1e-9);
  updateOpening(p, index, openingIndex, { kind: 'door', end: opening.start + 1.2 });
  assert.equal(p.walls[index].openings![openingIndex].kind, 'door');
  assert.throws(() => updateOpening(p, index, openingIndex, { kind: 'door', end: opening.start + 2.4 }), /Ширина двери/);
});

test('adding fails when the largest free span is too small, and removal deletes the empty list', () => {
  const { p, index } = freeWall();
  addOpening(p, index, 'door', 1);
  const free = p.walls[index].openings![0];
  const largest = Math.max(free.start, wallLength(p.walls[index]) - free.end);
  assert.throws(() => addOpening(p, index, 'window', Math.min(6, largest + .2)), /нет свободного места/);
  while (p.walls[index].openings?.length) removeOpening(p, index, 0);
  assert.equal(p.walls[index].openings, undefined);
});

test('added openings survive export and import without a schema change', () => {
  const { p, index } = freeWall();
  addOpening(p, index, 'window', 1.5);
  const round = validateProject(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(round.walls[index].openings, p.walls[index].openings);
});

test('room openings follow the room face, not every wall that lists the room', () => {
  const p = createProject();
  const living = roomOpenings(p, 'living');
  assert.equal(living.length, 5);
  assert.equal(living.filter(o => o.opening.kind === 'window').length, 1);
  assert.equal(living.filter(o => o.opening.kind === 'door').length, 4);
  assert.ok(living.every(o => o.otherRoom), 'every living opening faces another room');
  assert.equal(living.filter(o => o.wallIndex === 19).length, 2, 'facade door and window only');
  const bed2 = roomOpenings(p, 'bed2');
  assert.equal(bed2.filter(o => o.wallIndex === 19).length, 1, 'bed2 sees only its own facade window');
});

test('adding with a room id stays on a face of that room', () => {
  const p = createProject();
  const index = p.walls.findIndex(w => w.rooms.includes('living') && w.rooms.includes('closet'));
  assert.ok(index >= 0);
  const added = addOpening(p, index, 'door', .9, 'living');
  const opening = p.walls[index].openings![added];
  assert.ok(opening.start >= 1.4 - 1e-9, 'not inside the closet-only part of the shared wall');
  assert.ok(opening.end <= 3.58 + 1e-9, 'stays on the living face');
  const before = structuredClone(p);
  assert.throws(() => addOpening(p, index, 'window', 5, 'living'), /нет свободного места/);
  assert.deepEqual(p, before);
});

test('room-scoped limits and edits keep an opening inside its room segment on a shared wall', () => {
  const p = createProject();
  const entryDoor = roomOpenings(p, 'entry').find(o => o.wallIndex === 14)!;
  assert.ok(entryDoor);
  assert.ok(entryDoor.faceStart > 3.5);
  assert.ok(Math.abs(entryDoor.localStart - .8) < 1e-9);
  const limits = openingLimits(p, entryDoor.wallIndex, entryDoor.openingIndex, 'entry');
  assert.ok(Math.abs(limits.minStart - entryDoor.faceStart) < 1e-9);
  assert.throws(() => updateOpening(p, entryDoor.wallIndex, entryDoor.openingIndex, { start: .5, end: 1.45 }, 'entry'), /за пределы/);
});

test('resizing a room preserves physical door and window widths and neighbour room offsets', () => {
  const p = createProject();
  const beforeLiving = roomOpenings(p, 'living').map(o => o.opening.end - o.opening.start);
  const beforeEntry = roomOpenings(p, 'entry').find(o => o.wallIndex === 14)!;
  const beforeBed2 = roomOpenings(p, 'bed2').find(o => o.wallIndex === 19)!;
  const width = roomSize(p.rooms.find(r => r.id === 'living')!)[0];
  resizeRoom(p, 'living', 0, width + .6);
  validateProject(p);
  const afterLiving = roomOpenings(p, 'living').map(o => o.opening.end - o.opening.start);
  beforeLiving.forEach((w, i) => assert.ok(Math.abs(afterLiving[i] - w) < 1e-9));
  const afterEntry = roomOpenings(p, 'entry').find(o => o.wallIndex === 14)!;
  assert.ok(Math.abs((afterEntry.opening.end - afterEntry.opening.start) - (beforeEntry.opening.end - beforeEntry.opening.start)) < 1e-9);
  assert.ok(Math.abs(afterEntry.localStart - beforeEntry.localStart) < 1e-9);
  const afterBed2 = roomOpenings(p, 'bed2').find(o => o.wallIndex === 19)!;
  assert.ok(Math.abs(afterBed2.opening.start - beforeBed2.opening.start) < 1e-9);
  assert.ok(Math.abs(afterBed2.opening.end - beforeBed2.opening.end) < 1e-9);
});
