import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createProject, parseProject, duplicateVariant, type Project } from '../src/model';
import { windowAssembly, windowInteriorSide, shadowEnclosure, includeEnclosureInShadows } from '../src/windowAssembly';
import { fixtureLocations, prioritizedFixtures, lampBudget, sceneLighting, MAX_ACTIVE_LAMPS, MAX_WINDOW_FILL_LIGHTS, MAX_LOCAL_SHADOWS } from '../src/sceneLighting';
import { disposeObjects } from '../src/sceneRendering';
import { commitProjectEdit, undoProject, redoProject, type ProjectHistory } from '../src/projectEdits';

function roomProject(scale = 1): Project {
  const project = createProject();
  project.scale = scale;
  project.rooms = [{ id: 'room', name: 'Room', sourceArea: '16', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]] }];
  project.walls = [
    { a: [0, 0], b: [4, 0], rooms: ['room'], openings: [{ start: .7, end: 2.7, kind: 'window' }] },
    { a: [4, 0], b: [4, 4], rooms: ['room'] },
    { a: [4, 4], b: [0, 4], rooms: ['room'] },
    { a: [0, 4], b: [0, 0], rooms: ['room'] }
  ];
  project.variants[0].electrical = { points: [], connections: [] };
  return project;
}

function rayHits(group: THREE.Object3D, origin: THREE.Vector3, direction: THREE.Vector3, far: number, layer: number) {
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(origin, direction, 0, far);
  ray.layers.set(layer);
  return ray.intersectObject(group, true);
}

test('window frames preserve an open glass aperture at physical heights and model scales', () => {
  for (const scale of [.5, 1, 2]) {
    const project = roomProject(scale), wall = project.walls[0];
    const window = windowAssembly(wall, wall.openings![0], scale, project.ceilingHeight);
    const root = new THREE.Group(); root.scale.setScalar(scale); root.add(window);
    const glass = window.children.filter(child => child.name === 'glass') as THREE.Mesh[];
    assert.equal(glass.length, 2);
    assert.ok(glass.every(mesh => !mesh.castShadow && (mesh.material as THREE.MeshStandardMaterial).transparent));
    const hits = rayHits(root, new THREE.Vector3(1.2 * scale, 1.4, -1), new THREE.Vector3(0, 0, 1), 1.2, 0);
    assert.ok(hits.some(hit => hit.object.name === 'glass'));
    assert.ok(hits.every(hit => hit.object.name === 'glass'), 'no opaque plane fills the glazed opening');
    const bounds = new THREE.Box3().setFromObject(root);
    assert.ok(Math.abs(bounds.max.y - 2.15) < 1e-6);
    assert.ok(Math.abs(bounds.min.x - .7 * scale) < 1e-6);
    assert.ok(Math.abs(bounds.max.x - 2.7 * scale) < 1e-6);
    assert.ok(window.children.some(child => child.name === 'handle'));
    assert.ok(window.children.some(child => child.name === 'sill'));
    disposeObjects(root);
  }
});

test('low ceilings truncate frames and invalid or absent apertures create no geometry', () => {
  const project = roomProject(), wall = project.walls[0];
  for (const height of [.75, 1, 1.6]) {
    const window = windowAssembly(wall, wall.openings![0], 1, height);
    const bounds = new THREE.Box3().setFromObject(window);
    assert.ok(bounds.max.y <= height + 1e-6);
    disposeObjects(window);
  }
  assert.equal(windowAssembly(wall, wall.openings![0], 1, .6).children.length, 0);
  assert.equal(windowAssembly(wall, { start: 4, end: 5, kind: 'window' }, 1, 2.8).children.length, 0);
});

test('full shadow enclosure blocks roof and walls but transmits known window rays in cutaway', () => {
  for (const scale of [.5, 1, 2]) {
    const project = roomProject(scale), root = new THREE.Group();
    root.scale.setScalar(scale); root.add(shadowEnclosure(project));
    const forward = new THREE.Vector3(0, 0, 1);
    assert.equal(rayHits(root, new THREE.Vector3(1.2 * scale, 1.4, -1), forward, 1.2, 1).length, 0, 'aperture transmits light');
    assert.ok(rayHits(root, new THREE.Vector3(.2 * scale, 1.4, -1), forward, 1.2, 1).length > 0, 'full wall blocks light');
    assert.ok(rayHits(root, new THREE.Vector3(1.2 * scale, 2.5, -1), forward, 1.2, 1).length > 0, 'lintel blocks light');
    assert.ok(rayHits(root, new THREE.Vector3(1.2 * scale, .4, -1), forward, 1.2, 1).length > 0, 'wall below sill blocks light');
    const roof = rayHits(root, new THREE.Vector3(2 * scale, 4, 2 * scale), new THREE.Vector3(0, -1, 0), 2, 1);
    assert.equal(roof[0]?.object.name, 'opaque-roof');
    assert.ok(Math.abs(roof[0].point.y - project.ceilingHeight) < 1e-8);
    assert.equal(rayHits(root, new THREE.Vector3(.2 * scale, 1.4, -1), forward, 1.2, 0).length, 0, 'main camera/picking layer excludes enclosure');
    disposeObjects(root);
  }
});

test('r180 shadow traversal temporarily includes enclosure and always restores viewing layers', () => {
  const camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene();
  let calls = 0, fail = false;
  const original = function(_lights: THREE.Light[], _scene: THREE.Scene, view: THREE.Camera) {
    calls++;
    assert.ok(view.layers.isEnabled(0)); assert.ok(view.layers.isEnabled(1));
    if (fail) throw Error('shadow failure');
  };
  const shadowMap = { render: original };
  const restore = includeEnclosureInShadows(shadowMap);
  shadowMap.render([], scene, camera);
  assert.equal(camera.layers.mask, 1);
  fail = true;
  assert.throws(() => shadowMap.render([], scene, camera), /shadow failure/);
  assert.equal(camera.layers.mask, 1);
  restore(); assert.equal(shadowMap.render, original); assert.equal(calls, 2);
});

test('fixtures follow only light points, use physical heights, and replace temporary room examples without saving them', () => {
  const project = roomProject(2), variant = project.variants[0];
  variant.electrical.points = [
    { id: 'lamp', type: 'light', roomId: 'room', x: 1, z: 1.5, height: 1.7 },
    { id: 'socket', type: 'socket', roomId: 'room', x: 2, z: 2, height: .3 }
  ];
  const original = JSON.stringify(project);
  const fixtures = fixtureLocations(project, variant);
  assert.deepEqual(fixtures, [{ id: 'lamp', roomId: 'room', x: 2, z: 3, height: 1.7, example: false }]);
  const group = sceneLighting(project, variant, 'balanced');
  const lamp = group.children.find(child => child.name === 'electrical-light-fixture')!;
  assert.equal(lamp.position.x, 2); assert.equal(lamp.position.z, 3);
  assert.ok(Math.abs(lamp.position.y - (1.7 - .023)) < 1e-8);
  assert.equal(JSON.stringify(project), original);
  disposeObjects(group);
  variant.electrical.points = [];
  assert.equal(fixtureLocations(project, variant)[0].height, project.ceilingHeight);
  assert.ok(fixtureLocations(project, variant)[0].example);
});

test('evening source and shadow budgets stay bounded; sun is off and lamp warmth/intensity respond', () => {
  const project = roomProject(), variant = project.variants[0];
  variant.lighting = { mode: 'evening', intensity: .8, warmth: 2500, azimuth: 90 };
  variant.electrical.points = Array.from({ length: 9 }, (_, i) => ({ id: `light${i}`, roomId: 'room', type: 'light', x: .5 + i * .3, z: 2, height: 2.4 }));
  assert.deepEqual(lampBudget(project, variant), { explicit: 9, examples: 0, total: 9, active: 6, limited: 3 });
  const group = sceneLighting(project, variant, 'high');
  const sun = group.children.find(child => child instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
  assert.equal(sun.intensity, 0); assert.equal(sun.castShadow, false);
  const lights = group.children.filter(child => child.name === 'fixture-light') as THREE.Light[];
  assert.equal(lights.length, MAX_ACTIVE_LAMPS);
  assert.equal(lights.filter(light => light.castShadow).length, MAX_LOCAL_SHADOWS);
  assert.ok(lights.every(light => !(light instanceof THREE.PointLight) || !light.castShadow));
  const spot = lights.find(light => light instanceof THREE.SpotLight) as THREE.SpotLight;
  assert.equal(spot.shadow.mapSize.x, 1024); assert.equal(spot.shadow.autoUpdate, false);
  assert.ok(spot.shadow.camera.layers.isEnabled(1));
  variant.lighting.warmth = 6500; variant.lighting.intensity = .4;
  const cool = sceneLighting(project, variant, 'balanced');
  const coolSpot = cool.children.find(child => child instanceof THREE.SpotLight) as THREE.SpotLight;
  assert.ok(coolSpot.color.b > spot.color.b);
  assert.equal(coolSpot.intensity, spot.intensity / 2);
  assert.equal(coolSpot.shadow.mapSize.x, 512);
  disposeObjects(group); disposeObjects(cool);
});

test('daylight uses saved azimuth and bounded aperture fills, never artificial room-centre lamps', () => {
  const project = createProject(), variant = project.variants[0];
  variant.lighting.mode = 'day'; variant.lighting.azimuth = 0;
  const group = sceneLighting(project, variant, 'balanced');
  const sun = group.children.find(child => child instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
  assert.equal(sun.position.x, sun.target.position.x);
  assert.ok(sun.position.z > sun.target.position.z);
  assert.equal(sun.shadow.mapSize.x, 1024); assert.equal(sun.shadow.autoUpdate, false);
  assert.ok(sun.castShadow && sun.shadow.camera.layers.isEnabled(1));
  const edge = new THREE.Vector3(sun.shadow.camera.right, 0, -10).applyMatrix4(sun.shadow.camera.projectionMatrix);
  assert.ok(Math.abs(edge.x - 1) < 1e-8, 'shadow projection uses the apartment bounds');
  assert.equal(group.children.filter(child => child.name === 'fixture-light').length, 0);
  const fill = group.children.filter(child => child.name === 'approximate-window-daylight') as THREE.PointLight[];
  assert.ok(fill.length > 0 && fill.length <= MAX_WINDOW_FILL_LIGHTS);
  assert.ok(fill.every(light => !light.castShadow && light.position.y >= .72 && light.position.y <= 2.15));
  disposeObjects(group);
});

test('all fixture/enclosure resources and cached shadows dispose once through scene ownership', () => {
  const project = roomProject(), variant = project.variants[0]; variant.lighting.mode = 'evening';
  const root = new THREE.Group();
  root.add(shadowEnclosure(project), sceneLighting(project, variant, 'balanced'));
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.WebGLRenderTarget>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
    }
    if ((object instanceof THREE.DirectionalLight || object instanceof THREE.SpotLight) && object.castShadow) {
      object.shadow.map = new THREE.WebGLRenderTarget(2, 2);
      resources.add(object.shadow.map);
    }
  });
  const counters = [...resources].map(resource => {
    const counter = { count: 0 }; resource.addEventListener('dispose', () => counter.count++); return counter;
  });
  disposeObjects(root);
  assert.ok(counters.length > 10);
  assert.ok(counters.every(counter => counter.count === 1));
});


test('selected living and office rooms receive the nearest active fixture and local shadow first', () => {
  const project = createProject(), variant = project.variants[0];
  variant.lighting.mode = 'evening';
  for (const roomId of ['living', 'bed3']) {
    const group = sceneLighting(project, variant, 'balanced', roomId);
    const spot = group.children.find(child => child instanceof THREE.SpotLight) as THREE.SpotLight;
    assert.equal(spot.userData.roomId, roomId);
    const lamps = group.children.filter(child => child.name === 'fixture-light');
    assert.equal(lamps.length, MAX_ACTIVE_LAMPS);
    assert.ok(lamps.some(lamp => lamp.userData.roomId === roomId));
    disposeObjects(group);
  }
});

test('fixture ranking prioritizes the current room, then physical distance within each priority', () => {
  const fixtures = [
    { id: 'far-current', roomId: 'current', x: 4, z: 4, height: 2.8, example: false },
    { id: 'near-other', roomId: 'other', x: 0, z: .1, height: 2.8, example: false },
    { id: 'far-other', roomId: 'other', x: 6, z: 6, height: 2.8, example: false },
    { id: 'near-current', roomId: 'current', x: 1, z: 1, height: 2.8, example: true }
  ];
  const ids = prioritizedFixtures(fixtures, 'current', { x: 0, z: 0 }).map(fixture => fixture.id);
  assert.deepEqual(ids, ['near-current', 'far-current', 'near-other', 'far-other']);
  assert.equal(fixtures[0].id, 'far-current', 'ranking does not mutate source order');
});

test('room entry reuses fixture geometry, bounded lights and shadow map; unchanged focus leaves cached shadow intact', () => {
  const project = createProject(), variant = project.variants[0]; variant.lighting.mode = 'evening';
  const group = sceneLighting(project, variant, 'balanced', 'living');
  const children = [...group.children];
  const spot = group.children.find(child => child instanceof THREE.SpotLight) as THREE.SpotLight;
  const map = new THREE.WebGLRenderTarget(2, 2); spot.shadow.map = map;
  let disposed = 0; map.addEventListener('dispose', () => disposed++);
  spot.shadow.needsUpdate = false;
  assert.equal(group.updateFocus('living'), false);
  assert.equal(spot.shadow.needsUpdate, false);
  assert.equal(group.updateFocus('bed1'), true);
  assert.equal(spot.userData.roomId, 'bed1');
  assert.equal(spot.shadow.map, map);
  assert.equal(disposed, 0);
  assert.deepEqual(group.children, children);
  spot.shadow.needsUpdate = false;
  assert.equal(group.updateFocus('bed1'), false);
  assert.equal(spot.shadow.needsUpdate, false);
  disposeObjects(group); assert.equal(disposed, 1);
});

test('installed Three r180 shadow source uses viewing-camera layer filtering that the wrapper compensates', () => {
  assert.equal(THREE.REVISION, '180');
  const source = readFileSync(new URL('../node_modules/three/src/renderers/webgl/WebGLShadowMap.js', import.meta.url), 'utf8');
  assert.match(source, /renderObject\( scene, camera, shadow\.camera, light, this\.type \)/);
  assert.match(source, /function renderObject\( object, camera, shadowCamera, light, type \)/);
  assert.match(source, /object\.layers\.test\( camera\.layers \)/);
});


test('north/top and south/bottom window handles and sill project toward their room interiors', () => {
  const project = roomProject();
  const north = project.walls[0];
  const south = { a: [0, 4] as [number, number], b: [4, 4] as [number, number], rooms: ['room'], openings: [{ start: .7, end: 2.7, kind: 'window' as const }] };
  for (const [wall, expectedSide] of [[north, 1], [south, -1]] as const) {
    const opening = wall.openings![0];
    assert.equal(windowInteriorSide(project, wall, opening), expectedSide);
    const assembly = windowAssembly(wall, opening, project.scale, project.ceilingHeight, windowInteriorSide(project, wall, opening));
    assembly.updateMatrixWorld(true);
    for (const name of ['handle', 'handle-base', 'sill', 'sash-rail']) {
      for (const member of assembly.children.filter(child => child.name === name)) {
        assert.ok(member.position.z * expectedSide > 0, name);
        const point = member.getWorldPosition(new THREE.Vector3());
        assert.ok(point.z > 0 && point.z < 4, `${name} lies on the room side`);
      }
    }
    assert.ok(assembly.children.filter(child => child.name === 'glass').every(child => !child.castShadow));
    disposeObjects(assembly);
  }
  // Reversing a wall's endpoints changes local axes but retains the physical inward face.
  const reversed = { ...north, a: north.b, b: north.a, openings: [{ start: 1.3, end: 3.3, kind: 'window' as const }] };
  assert.equal(windowInteriorSide(project, reversed, reversed.openings[0]), -1);
});


test('uniform inspection mode gives even warmth/brightness fill with no spatial lights or shadow maps', () => {
  const project = createProject(), variant = project.variants[0];
  variant.lighting = { mode: 'uniform', intensity: .8, warmth: 2500, azimuth: 0 };
  const original = JSON.stringify(project);
  const group = sceneLighting(project, variant, 'high', 'living');
  const lights = group.children.filter(child => child instanceof THREE.Light) as THREE.Light[];
  assert.equal(lights.length, 1);
  const fill = lights[0] as THREE.HemisphereLight;
  assert.ok(fill instanceof THREE.HemisphereLight);
  assert.ok(fill.color.equals(fill.groundColor), 'every normal receives the same diffuse fill');
  assert.ok(lights.every(light => !light.castShadow));
  assert.equal(group.children.filter(child => child.name === 'fixture-light' || child.name === 'approximate-window-daylight').length, 0);
  assert.ok(group.children.some(child => child.name === 'example-ceiling-fixture'));
  assert.equal(lampBudget(project, variant).active, 0);
  assert.equal(group.updateFocus('bed1'), false);
  assert.equal(JSON.stringify(project), original);
  variant.lighting.azimuth = 270;
  const rotated = sceneLighting(project, variant, 'balanced');
  const unchanged = rotated.children.find(child => child instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
  assert.ok(unchanged.color.equals(fill.color)); assert.equal(unchanged.intensity, fill.intensity);
  variant.lighting.intensity = .4; variant.lighting.warmth = 6500;
  const cool = sceneLighting(project, variant, 'balanced');
  const coolFill = cool.children.find(child => child instanceof THREE.HemisphereLight) as THREE.HemisphereLight;
  assert.equal(coolFill.intensity, fill.intensity / 2);
  assert.ok(coolFill.color.b > fill.color.b);
  disposeObjects(group); disposeObjects(rotated); disposeObjects(cool);
});

test('third lighting mode round trips version1, preserves older modes, and rejects unknown modes', () => {
  const project = createProject();
  assert.equal(project.variants[0].lighting.mode, 'day');
  for (const mode of ['day', 'evening', 'uniform'] as const) {
    project.variants[0].lighting.mode = mode;
    const restored = parseProject(JSON.stringify(project));
    assert.equal(restored.version, 1); assert.equal(restored.variants[0].lighting.mode, mode);
    assert.deepEqual(restored, project);
  }
  const invalid = JSON.parse(JSON.stringify(project)); invalid.variants[0].lighting.mode = 'unknown';
  assert.throws(() => parseProject(JSON.stringify(invalid)));
});

test('uniform mode is one undoable edit and copied variants retain independent lighting values', () => {
  const project = createProject();
  project.variants.push(duplicateVariant(project.variants[0]));
  const original = structuredClone(project), history: ProjectHistory = { past: [], future: [] };
  const next = commitProjectEdit(project, history, draft => { draft.variants[0].lighting.mode = 'uniform'; });
  assert.equal(next.variants[0].lighting.mode, 'uniform');
  assert.equal(next.variants[1].lighting.mode, 'day');
  assert.equal(history.past.length, 1);
  assert.deepEqual(undoProject(next, history), original);
  assert.deepEqual(redoProject(original, history), next);
  const copy = duplicateVariant(next.variants[0]); copy.lighting.mode = 'evening'; copy.lighting.intensity = .2;
  assert.equal(next.variants[0].lighting.mode, 'uniform');
  assert.equal(next.variants[0].lighting.intensity, .8);
  assert.deepEqual(parseProject(JSON.stringify(next)), next);
});
