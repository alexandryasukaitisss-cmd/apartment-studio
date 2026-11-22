import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, A, Z, H } from '../src/model';
import { wallFaceSpans } from '../src/wallSides';
test('long wall has stable distinct room finishes on each face', () => {
  const p = createProject();
  const wall = p.walls.find(w => w.a[0] === A && w.a[1] === Z && w.b[1] === H)!;
  const spans = wallFaceSpans(wall, p, 0, H - Z);
  assert.ok(spans.some(s => s.positive === 'corridor' && s.negative === 'living'));
  assert.ok(spans.some(s => s.positive === 'bed2' && s.negative === 'living'));
  p.variants[0].finishes.bed2.walls = 'green';
  p.variants[0].finishes.living.walls = 'plaster';
  assert.deepEqual(wallFaceSpans(wall, p, 0, H - Z), spans);
});
