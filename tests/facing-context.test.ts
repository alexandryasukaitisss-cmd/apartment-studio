import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addFurnitureAt, boundFurniture, center, createProject, duplicateVariant, faceFurnitureInRoom, fitsFurniture, furnitureFront, inside, makeFurniture, parseProject, roomInteriorTarget, type Furniture } from '../src/model';
import { furnitureMesh } from '../src/furniture';
import { catalog } from '../src/furnitureCatalog';
import { commitProjectEdit, undoProject, redoProject } from '../src/projectEdits';
import { contextMenuPosition, validContextTarget } from '../src/contextMenu';
import SceneContextMenu from '../src/SceneContextMenu';
import ObjectActions from '../src/ObjectActions';
import Plan from '../src/Plan';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function dispose(group: THREE.Group) {
  const materials = new Set<THREE.Material>();
  group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  for (const material of materials) material.dispose();
}

test('front vectors agree with the actual scene rotation and SVG rotation at cardinal and arbitrary angles', () => {
  for (const [rotation, expected] of [[0, [0, 1]], [90, [-1, 0]], [180, [0, -1]], [270, [1, 0]]] as const) {
    const vector = furnitureFront(rotation);
    vector.forEach((n, i) => near(n, expected[i]));
  }
  for (const rotation of [0, 38, 90, 180, 270, 359]) {
    const mesh = furnitureMesh({ ...makeFurniture('chair', 'living', 5, 10), rotation });
    const scene = new THREE.Vector3(0, 0, 1).applyEuler(mesh.rotation);
    const front = furnitureFront(rotation);
    near(front[0], scene.x); near(front[1], scene.z);
    const a = rotation * Math.PI / 180;
    near(front[0], -Math.sin(a)); near(front[1], Math.cos(a));
    dispose(mesh);
  }
});

test('sofa back, chair back and toilet tank lie behind +Z; wardrobe doors and monitor screen lie in front', () => {
  for (const kind of ['sofa', 'chair', 'toilet', 'wardrobe', 'workstation', 'bookcase', 'vanity', 'washer'] as const) {
    const f = makeFurniture(kind, 'living', 5, 10), mesh = furnitureMesh(f);
    const parts: THREE.Mesh[] = [];
    mesh.traverse(child => { if (child instanceof THREE.Mesh) parts.push(child) });
    if (kind === 'sofa') assert.ok(parts.some(part => part.position.z < -f.depth * .35 && part.position.y > f.height * .6));
    if (kind === 'chair') assert.ok(parts.some(part => part.position.z < -f.depth * .35 && part.position.y > f.height * .7));
    if (kind === 'toilet') assert.ok(parts.some(part => part.position.z < -f.depth * .3 && part.position.y > f.height * .7));
    if (kind === 'wardrobe') assert.equal(parts.filter(part => part.position.z > f.depth * .45 && part.position.y > f.height * .45).length, 4);
    if (kind === 'workstation') assert.ok(mesh.getObjectByName('monitor-screen')!.position.z > mesh.getObjectByName('monitor-body')!.position.z);
    if (kind === 'bookcase') assert.ok(mesh.getObjectByName('book-spine-label')!.position.z > mesh.getObjectByName('bookcase-back')!.position.z);
    if (kind === 'vanity' || kind === 'washer') assert.ok(parts.some(part => part.position.z > f.depth * .49));
    near(mesh.rotation.y, 0);
    dispose(mesh);
  }
});

test('new seeds face room interiors and desk chairs face their tables without changing exact geometry', () => {
  const p = createProject();
  const item = (roomId: string, kind: Furniture['kind']) => p.variants[0].furniture.find(f => f.roomId === roomId && f.kind === kind)!;
  for (const [roomId, kind, rotation] of [
    ['living', 'sofa', 270], ['bed2', 'wardrobe', 270], ['bed1', 'wardrobe', 180], ['closet', 'wardrobe', 90],
    ['entry', 'wardrobe', 90], ['bed3', 'bookcase', 270], ['bed3', 'workstation', 90], ['bed3', 'chair', 270],
    ['bath1', 'vanity', 180], ['bath1', 'toilet', 0], ['bath2', 'toilet', 180], ['bath2', 'washer', 180], ['balcony', 'chair', 90],
  ] as const) assert.equal(item(roomId, kind).rotation, rotation, `${roomId}/${kind}`);
  const closet = item('closet', 'wardrobe'), closetTarget = roomInteriorTarget(p.rooms.find(r => r.id === 'closet')!);
  const [frontX, frontZ] = furnitureFront(closet.rotation);
  assert.ok(frontX * (closetTarget[0] - closet.x) + frontZ * (closetTarget[1] - closet.z) > 0, 'wardrobe doors face the closet interior');
  for (const roomId of ['living', 'bed2', 'bed3']) {
    const table = item(roomId, roomId === 'bed3' ? 'workstation' : 'table');
    for (const chair of p.variants[0].furniture.filter(f => f.roomId === roomId && f.kind === 'chair')) {
      const [x, z] = furnitureFront(chair.rotation);
      assert.ok(x * (table.x - chair.x) + z * (table.z - chair.z) > 0);
    }
  }
  assert.ok(p.variants[0].furniture.every(f => fitsFurniture(f, p)));
  assert.deepEqual([item('living', 'sofa').width, item('living', 'sofa').depth], [2.2, .9]);
});

test('interior targets remain inside a concave bedroom when its bounding-box centre is outside', () => {
  const room = { id: 'bed1', name: 'Ниша', sourceArea: '', polygon: [[0, 0], [3, 0], [3, .5], [.5, .5], [.5, 4], [0, 4]] as [number, number][] };
  assert.equal(inside(center(room), room.polygon), false);
  assert.equal(inside(roomInteriorTarget(room), room.polygon), true);
});

test('facing uses the current scale, dimensions and polygon in one undo edit, preserving unrelated data', () => {
  for (const scale of [.5, 1, 2]) {
    const p = createProject(); p.scale = scale;
    const f = boundFurniture({ ...makeFurniture('wardrobe', 'bed1', 1.1, 2), width: .45, depth: .3, rotation: 73, elevation: .1, height: 1.2 }, p);
    p.variants[0].furniture = [f]; p.variants.push(duplicateVariant(p.variants[0]));
    const before = structuredClone(p), h = { past: [], future: [] };
    const next = commitProjectEdit(p, h, draft => { faceFurnitureInRoom(draft, f.id) });
    const faced = next.variants[0].furniture[0], target = roomInteriorTarget(next.rooms[0]);
    const delta = [target[0] - faced.x, target[1] - faced.z], length = Math.hypot(...delta);
    const front = furnitureFront(faced.rotation);
    near(front[0], delta[0] / length); near(front[1], delta[1] / length);
    assert.ok(fitsFurniture(faced, next));
    assert.deepEqual([faced.id, faced.width, faced.depth, faced.height, faced.elevation, faced.color], [f.id, f.width, f.depth, f.height, f.elevation, f.color]);
    assert.deepEqual(next.variants[1], p.variants[1]); assert.deepEqual(next.rooms, p.rooms);
    assert.deepEqual(p, before); assert.equal(h.past.length, 1);
    assert.deepEqual(undoProject(next, h), before); assert.deepEqual(redoProject(before, h), next);
  }
  const p = createProject(), sofa = p.variants[0].furniture.find(f => f.kind === 'sofa')!;
  const h = { past: [], future: [] };
  const next = commitProjectEdit(p, h, draft => { faceFurnitureInRoom(draft, sofa.id) });
  const moved = next.variants[0].furniture.find(f => f.id === sofa.id)!;
  assert.ok(Math.hypot(moved.x - sofa.x, moved.z - sofa.z) > .01);
  assert.ok(fitsFurniture(moved, next)); assert.deepEqual(boundFurniture(moved, next), moved);
  const target = roomInteriorTarget(p.rooms.find(r => r.id === moved.roomId)!);
  const length = Math.hypot(target[0] - moved.x, target[1] - moved.z), front = furnitureFront(moved.rotation);
  near(front[0], (target[0] - moved.x) / length); near(front[1], (target[1] - moved.z) / length);
  assert.deepEqual(undoProject(next, h), p);
});

test('facing a footprint that cannot fit toward the interior fails without project or history edits', () => {
  const p = createProject();
  const f = boundFurniture({ ...makeFurniture('table', 'balcony', 4, 15), width: 2.8, depth: 1.1 }, p);
  p.variants[0].furniture = [f];
  const before = structuredClone(p), h = { past: [], future: [structuredClone(p)] }, beforeHistory = structuredClone(h);
  assert.throws(() => commitProjectEdit(p, h, draft => { faceFurnitureInRoom(draft, f.id) }), /Не удалось повернуть/);
  assert.deepEqual(p, before); assert.deepEqual(h, beforeHistory);
});

test('import retains arbitrary old facing angles and positions until the user explicitly acts', () => {
  const p = createProject();
  for (const f of p.variants[0].furniture.filter(f => ['sofa', 'wardrobe', 'chair'].includes(f.kind))) {
    const moved = boundFurniture({ ...f, rotation: 73 }, p);
    if (fitsFurniture(moved, p)) Object.assign(f, moved);
  }
  assert.ok(p.variants[0].furniture.filter(f => f.rotation === 73).length >= 3);
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
});

test('context additions use source model coordinates once, preserve preset elevation/colour and undo once', () => {
  for (const scale of [.5, 1, 2]) {
    const p = createProject(); p.scale = scale; p.variants[0].furniture = [];
    p.variants.push(duplicateVariant(p.variants[0]));
    const room = p.rooms.find(r => r.id === 'living')!, [x, z] = center(room), preset = catalog.find(p => p.name === 'Телевизор 43″ · приблизительно')!;
    const h = { past: [], future: [] };
    let newId = '';
    const next = commitProjectEdit(p, h, draft => { newId = addFurnitureAt(draft, room.id, x, z, preset).id });
    const f = next.variants[0].furniture.find(f => f.id === newId)!;
    assert.deepEqual([f.x, f.z], [x, z]); assert.deepEqual([f.width, f.depth, f.height], preset.dims);
    assert.equal(f.elevation, 1); assert.equal(f.color, makeFurniture(preset.kind, room.id, x, z).color);
    assert.ok(fitsFurniture(f, next)); assert.deepEqual(next.variants[1], p.variants[1]);
    assert.equal(h.past.length, 1); assert.deepEqual(undoProject(next, h), p);
  }
});

test('edge and concave context additions clamp full footprints and reject oversized or elevated items atomically', () => {
  const p = createProject(), chair = catalog.find(p => p.name === 'Стул')!;
  for (const [roomId, x, z] of [['bed1', 3, 4], ['living', 40, 40]] as const) {
    const draft = structuredClone(p), f = addFurnitureAt(draft, roomId, x, z, chair);
    assert.ok(fitsFurniture(f, draft));
    assert.deepEqual(boundFurniture(f, draft), f);
  }
  for (const preset of [{ kind: 'table' as const, dims: [3.5, 3.5, .8] as [number, number, number] }, { kind: 'hood' as const, dims: [.6, .5, 2] as [number, number, number], elevation: 1.55 }]) {
    const before = structuredClone(p), h = { past: [], future: [structuredClone(p)] }, oldHistory = structuredClone(h);
    assert.throws(() => addFurnitureAt(p, 'closet', 3.7, 8, preset)); assert.deepEqual(p, before);
    assert.throws(() => commitProjectEdit(p, h, draft => { addFurnitureAt(draft, 'closet', 3.7, 8, preset) }));
    assert.deepEqual(p, before); assert.deepEqual(h, oldHistory);
  }
});

test('context target guards reject stale, wrong-room and invalid targets without guessing another object', () => {
  const p = createProject(), f = p.variants[0].furniture[0];
  const target = { roomId: f.roomId, furnitureId: f.id, x: f.x, z: f.z, clientX: 30, clientY: 50 };
  assert.equal(validContextTarget(p, target), true);
  assert.equal(validContextTarget(p, { ...target, roomId: 'living' }), false);
  assert.equal(validContextTarget(p, { ...target, furnitureId: 'removed' }), false);
  assert.equal(validContextTarget(p, { ...target, x: NaN }), false);
  assert.equal(validContextTarget(p, { ...target, surface: 'floor' }), false);
  assert.equal(validContextTarget(p, { ...target, furnitureId: undefined, surface: 'walls' }), true);
  assert.equal(validContextTarget(p, { ...target, furnitureId: undefined }), false);
});

test('menu anchors remain bounded at viewport edges including a narrow phone', () => {
  for (const [width, height, menuWidth, menuHeight] of [[1280, 800, 310, 260], [320, 480, 304, 360], [320, 160, 304, 144]]) {
    for (const [x, y] of [[0, 0], [width, height], [-10, -10], [width + 50, height + 50]]) {
      const position = contextMenuPosition(x, y, menuWidth, menuHeight, width, height);
      assert.ok(position.left >= 8 && position.left + menuWidth <= width - 8);
      assert.ok(position.top >= 8 && position.top + menuHeight <= height - 8);
    }
  }
});

test('menu, object actions and selected plan expose accessible controls and the front marker', () => {
  const p = createProject(), f = p.variants[0].furniture[0], noop = () => {};
  const markup = renderToStaticMarkup(createElement(SceneContextMenu, {
    target: { roomId: 'living', surface: 'floor', x: 5, z: 10, clientX: 10, clientY: 10 },
    roomName: 'Кухня-гостиная', onSurface: noop, onFurniture: noop, onAdd: () => true, onClose: noop,
  }));
  assert.match(markup, /role="dialog"/); assert.match(markup, /Изменить пол/);
  assert.match(markup, /Каталог для добавления в выбранном месте/); assert.match(markup, /Добавить предмет/);
  for (const [surface, label] of [['walls', 'Изменить стены комнаты'], ['ceiling', 'Изменить потолок']] as const) {
    const markup = renderToStaticMarkup(createElement(SceneContextMenu, {
      target: { roomId: 'living', surface, x: 5, z: 10, clientX: 10, clientY: 10 },
      roomName: 'Кухня-гостиная', onSurface: noop, onFurniture: noop, onAdd: () => true, onClose: noop,
    }));
    assert.ok(markup.includes(label));
  }
  const furnitureMenu = renderToStaticMarkup(createElement(SceneContextMenu, {
    target: { roomId: f.roomId, furnitureId: f.id, x: f.x, z: f.z, clientX: 10, clientY: 10 },
    roomName: 'Спальня', furnitureName: 'Кровать', onSurface: noop, onFurniture: noop, onAdd: () => true, onClose: noop,
  }));
  assert.match(furnitureMenu, /Настроить предмет: Кровать/); assert.doesNotMatch(furnitureMenu, /Изменить пол/);
  const actions = renderToStaticMarkup(createElement(ObjectActions, { selected: f, onDelete: noop, onDuplicate: noop, onRotate: noop, onFaceRoom: noop, onReplace: () => true, onPlan: noop }));
  assert.match(actions, /Лицом в комнату/);
  assert.match(actions, /Повернуть предмет на 15°/);
  const plan = renderToStaticMarkup(createElement(Plan, { project: p, variant: p.variants[0], selectedRoom: f.roomId, selectedFurniture: f.id, onSelect: noop, onFurniture: noop }));
  assert.match(plan, /aria-label="Передняя сторона"/);
  assert.match(plan, /class="door-swing"/);
  const miniPlan = renderToStaticMarkup(createElement(Plan, { project: p, variant: p.variants[0], selectedRoom: f.roomId, selectedFurniture: f.id, onSelect: noop, onFurniture: noop, mini: true }));
  assert.doesNotMatch(miniPlan, /class="door-swing"/);
});
