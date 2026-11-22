import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { visibleSurfacePick as pickSurface, isSelectionClick, sceneContextTarget, hasPointerDragged, surfaceClickAction } from '../src/surfacePicking';
import { wallFaceSpans } from '../src/wallSides';
import { createProject, A, Z, H } from '../src/model';

/** Original selection assertions check tags; position behavior has separate ray tests. */
function visibleSurfacePick(intersections: THREE.Intersection[]) {
  const pick = pickSurface(intersections);
  if (!pick) return null;
  const { point: _point, ...target } = pick;
  return target;
}

function hits(objects: THREE.Object3D[], origin: THREE.Vector3, direction: THREE.Vector3) {
  for (const object of objects) object.updateMatrixWorld(true);
  return new THREE.Raycaster(origin, direction.normalize()).intersectObjects(objects, true);
}
function box(z: number, data: Record<string, unknown> = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, .2), new THREE.MeshBasicMaterial());
  mesh.position.z = z;
  mesh.userData = data;
  return mesh;
}

test('a visible unselectable wall blocks room and furniture behind it', () => {
  const wall = box(0);
  const furniture = box(-2, { roomId: 'living', furnitureId: 'sofa' });
  const intersections = hits([wall, furniture], new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1));
  assert.ok(intersections.some(hit => hit.object === furniture));
  assert.equal(visibleSurfacePick(intersections), null);
});

test('wall face selection follows room ownership on either side of a rotated wall', () => {
  const project = createProject();
  const wall = project.walls.find(w => w.a[0] === A && w.a[1] === Z && w.b[1] === H)!;
  const span = wallFaceSpans(wall, project, 0, H - Z).find(s => s.positive === 'corridor' && s.negative === 'living')!;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(span.end - span.start, 2, .13), Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial()));
  mesh.rotation.y = -Math.PI / 2;
  mesh.userData.wallRooms = { positive: span.positive, negative: span.negative };
  assert.deepEqual(visibleSurfacePick(hits([mesh], new THREE.Vector3(-2, 0, 0), new THREE.Vector3(1, 0, 0))), { roomId: 'corridor', surface: 'walls' });
  assert.deepEqual(visibleSurfacePick(hits([mesh], new THREE.Vector3(2, 0, 0), new THREE.Vector3(-1, 0, 0))), { roomId: 'living', surface: 'walls' });
});

test('neutral wall caps and exterior faces occlude instead of selecting a room behind them', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, .13), Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial()));
  mesh.userData.wallRooms = { positive: 'living', negative: null };
  const behind = box(2, { roomId: 'bed2', furnitureId: 'bed' });
  assert.equal(visibleSurfacePick(hits([mesh, behind], new THREE.Vector3(0, 0, -3), new THREE.Vector3(0, 0, 1))), null);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2;
  floor.userData = { roomId: 'living', surface: 'floor' };
  assert.equal(visibleSurfacePick(hits([mesh, floor], new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, -1, 0))), null);
});

test('furniture wins over its underlying floor and retains both selection identifiers', () => {
  const furniture = box(1, { roomId: 'living', furnitureId: 'sofa' });
  const floor = box(-1, { roomId: 'living', surface: 'floor' });
  assert.deepEqual(visibleSurfacePick(hits([floor, furniture], new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1))), { roomId: 'living', furnitureId: 'sofa' });
});

test('floor and ceiling select from inside the room', () => {
  for (const surface of ['floor', 'ceiling'] as const) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = surface === 'floor' ? 0 : 3;
    mesh.userData = { roomId: 'living', surface };
    assert.deepEqual(visibleSurfacePick(hits([mesh], new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, surface === 'floor' ? -1 : 1, 0))), { roomId: 'living', surface });
  }
});

test('hidden parents and invisible materials do not block a drawn surface', () => {
  const hidden = new THREE.Group();
  hidden.add(box(1));
  hidden.visible = false;
  const invisible = box(0);
  invisible.material.visible = false;
  const floor = box(-1, { roomId: 'living', surface: 'floor' });
  assert.deepEqual(visibleSurfacePick(hits([hidden, invisible, floor], new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1))), { roomId: 'living', surface: 'floor' });
});

test('only a gesture under five pixels with no prior drag selects', () => {
  const start = { x: 10, y: 10 };
  assert.equal(isSelectionClick(start, { x: 12, y: 13 }, false), true);
  assert.equal(isSelectionClick(start, { x: 13, y: 14 }, false), false);
  assert.equal(isSelectionClick(start, start, true), false);
});

test('nearest selectable intersection preserves the hit point rather than the object centre', () => {
  const furniture = box(1, { roomId: 'living', furnitureId: 'sofa' });
  const floor = box(-1, { roomId: 'living', surface: 'floor' });
  const intersections = hits([floor, furniture], new THREE.Vector3(.25, .1, 3), new THREE.Vector3(0, 0, -1));
  const pick = pickSurface(intersections)!;
  assert.equal(pick.furnitureId, 'sofa');
  assert.ok(pick.point.distanceTo(new THREE.Vector3(.25, .1, 1.1)) < 1e-7);
  assert.notEqual(pick.point, intersections[0].point);
  intersections[0].point.set(9, 9, 9);
  assert.ok(pick.point.distanceTo(new THREE.Vector3(.25, .1, 1.1)) < 1e-7);
});

test('context positions invert the complete apartment root transform and retain client coordinates', () => {
  const parent = new THREE.Group();
  parent.position.set(10, 2, -4);
  parent.rotation.y = .7;
  parent.scale.setScalar(2);
  const root = new THREE.Group();
  root.scale.setScalar(1.25);
  root.position.set(3, 0, 2);
  root.rotation.y = -.25;
  parent.add(root);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  floor.rotation.x = -Math.PI / 2;
  floor.userData = { roomId: 'living', surface: 'floor' };
  root.add(floor);
  parent.updateMatrixWorld(true);
  const worldPoint = root.localToWorld(new THREE.Vector3(2, 0, -1));
  const pick = pickSurface(hits([parent], worldPoint.clone().add(new THREE.Vector3(0, 5, 0)), new THREE.Vector3(0, -1, 0)))!;
  const originalWorldPoint = pick.point.clone();
  const target = sceneContextTarget(pick, root, { clientX: 413, clientY: 287 });
  assert.equal(target.roomId, 'living');
  assert.equal(target.surface, 'floor');
  assert.ok(Math.abs(target.x - 2) < 1e-7);
  assert.ok(Math.abs(target.z + 1) < 1e-7);
  assert.equal(target.clientX, 413);
  assert.equal(target.clientY, 287);
  assert.ok(pick.point.equals(originalWorldPoint));
});

test('context targets retain wall ownership and optional furniture identity without an invented surface', () => {
  const root = new THREE.Group();
  root.scale.setScalar(1.5);
  const furniture = sceneContextTarget({ roomId: 'living', furnitureId: 'sofa', point: new THREE.Vector3(3, .6, 6) }, root, { clientX: 0, clientY: 0 });
  assert.deepEqual(furniture, { roomId: 'living', furnitureId: 'sofa', x: 2, z: 4, clientX: 0, clientY: 0 });
  const wall = sceneContextTarget({ roomId: 'bed2', surface: 'walls', point: new THREE.Vector3(6, 2, 3) }, root, { clientX: 20, clientY: 30 });
  assert.deepEqual(wall, { roomId: 'bed2', surface: 'walls', x: 4, z: 2, clientX: 20, clientY: 30 });
});

test('right click has a separate context action and the five pixel boundary is strict', () => {
  const start = { x: 10, y: 10 };
  assert.equal(surfaceClickAction(2, start, start, false), 'context');
  assert.equal(surfaceClickAction(0, start, start, false), 'select');
  assert.equal(surfaceClickAction(1, start, start, false), null);
  assert.equal(surfaceClickAction(2, start, { x: 14.999, y: 10 }, false), 'context');
  assert.equal(surfaceClickAction(2, start, { x: 13, y: 14 }, false), null);
});

test('a right drag that returns to its start cannot open a menu or select', () => {
  const start = { x: 50, y: 60 };
  let dragged = hasPointerDragged(start, { x: 51, y: 61 }, false);
  assert.equal(dragged, false);
  dragged = hasPointerDragged(start, { x: 56, y: 60 }, dragged);
  assert.equal(dragged, true);
  dragged = hasPointerDragged(start, start, dragged);
  assert.equal(dragged, true);
  assert.equal(surfaceClickAction(2, start, start, dragged), null);
  assert.equal(surfaceClickAction(0, start, start, dragged), null);
});
