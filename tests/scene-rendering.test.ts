import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { demandRenderer, disposeObjects, renderDiagnostics, scenePixelRatio, surfaceRenderer } from '../src/sceneRendering';
import { surfaceMaterial } from '../src/textures';
import type { Material } from '../src/model';

function frames() {
  let serial = 0;
  const pending = new Map<number, FrameRequestCallback>();
  return {
    request(callback: FrameRequestCallback) { pending.set(++serial, callback); return serial; },
    cancel(id: number) { pending.delete(id); },
    get count() { return pending.size; },
    run(time = 0) {
      const next = pending.entries().next().value;
      assert.ok(next, 'a frame must have been requested');
      pending.delete(next[0]);
      next[1](time);
    }
  };
}

test('idle schedules nothing; changes coalesce into one frame and can wake it again', () => {
  const scheduler = frames();
  let renders = 0;
  const loop = demandRenderer(() => { renders++; return false; }, scheduler);
  assert.equal(scheduler.count, 0);
  loop.invalidate(); loop.invalidate(); loop.invalidate();
  assert.equal(scheduler.count, 1);
  scheduler.run();
  assert.equal(renders, 1);
  assert.equal(scheduler.count, 0);
  loop.invalidate(); scheduler.run(90000);
  assert.equal(renders, 2);
  assert.equal(scheduler.count, 0);
  loop.dispose(); loop.invalidate(); loop.setVisible(true);
  assert.equal(scheduler.count, 0);
});

test('held movement continues, release stops, and hidden/resumed input never uses the elapsed idle time', () => {
  const scheduler = frames(), deltas: number[] = [];
  let moving = true;
  const loop = demandRenderer(dt => { deltas.push(dt); return moving; }, scheduler);
  loop.invalidate(); scheduler.run(0); scheduler.run(34); scheduler.run(68);
  assert.equal(scheduler.count, 1);
  loop.setVisible(false);
  assert.equal(scheduler.count, 0);
  loop.invalidate();
  assert.equal(scheduler.count, 0);
  moving = false;
  loop.setVisible(true);
  assert.equal(scheduler.count, 1);
  scheduler.run(120000);
  assert.equal(deltas.length, 4);
  assert.equal(deltas[3], 1 / 30);
  assert.equal(scheduler.count, 0);
  moving = true;
  loop.invalidate(); scheduler.run(130000); scheduler.run(135000);
  assert.equal(deltas.at(-1), .04, 'slow frames are capped');
  moving = false;
  scheduler.run(135034);
  assert.equal(scheduler.count, 0);
  loop.dispose();
});

test('a hidden initial document has no frames; unmount cancels active movement', () => {
  const scheduler = frames();
  const loop = demandRenderer(() => true, scheduler, false);
  loop.invalidate();
  assert.equal(scheduler.count, 0);
  loop.setVisible(true); scheduler.run();
  assert.equal(scheduler.count, 1);
  loop.dispose(); loop.setVisible(true); loop.invalidate();
  assert.equal(scheduler.count, 0);
});

test('invalidation during a render is retained without duplicating the pending frame', () => {
  const scheduler = frames();
  const loop = demandRenderer(() => { loop.invalidate(); loop.invalidate(); return true; }, scheduler);
  loop.invalidate(); scheduler.run();
  assert.equal(scheduler.count, 1);
  loop.dispose();
});

test('real orbit damping continues until settled, then leaves no animation frame', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 5, 10);
  const document = new EventTarget();
  const element = Object.assign(new EventTarget(), { style: { touchAction: '' }, getRootNode: () => document });
  const controls = new OrbitControls(camera, element as unknown as HTMLElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  const scheduler = frames();
  let renders = 0;
  const loop = demandRenderer(dt => { renders++; return controls.update(dt); }, scheduler);
  controls.addEventListener('change', loop.invalidate);
  loop.invalidate();
  scheduler.run(0); scheduler.run(34);
  controls.autoRotate = false;
  let time = 34;
  while (scheduler.count && renders < 500) scheduler.run(time += 34);
  assert.ok(renders > 3 && renders < 500, `damping settled after ${renders} frames`);
  assert.equal(scheduler.count, 0);
  controls.removeEventListener('change', loop.invalidate);
  loop.dispose(); controls.dispose();
});

const photo: Material = { id: 'photo', name: 'Photo', image: 'data:image/png;base64,fixture', pattern: 'image',
  color: '#ffffff', width: 1, height: 1, rotation: 0, roughness: .5 };

test('asynchronous photo arrival wakes an idle scene; disposed photos never wake a replacement', async t => {
  const loaded: (() => void)[] = [];
  t.mock.method(THREE.TextureLoader.prototype, 'load', (_url: string, onLoad?: (texture: THREE.Texture) => void) => {
    const texture = new THREE.Texture();
    loaded.push(() => { texture.needsUpdate = true; onLoad?.(texture); });
    return texture;
  });
  const scheduler = frames();
  let renders = 0;
  const loop = demandRenderer(() => { renders++; return false; }, scheduler);
  const root = new THREE.Group();
  const material = surfaceMaterial(photo, 3, 2, 4, loop.invalidate);
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
  loop.invalidate(); scheduler.run();
  assert.equal(scheduler.count, 0);
  await Promise.resolve(); loaded[0]();
  assert.equal(scheduler.count, 1);
  scheduler.run(34);
  assert.equal(renders, 2);
  const old = surfaceMaterial(photo, 3, 2, 4, loop.invalidate);
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(), old));
  disposeObjects(root);
  await Promise.resolve(); loaded[1]();
  assert.equal(scheduler.count, 0);
  loop.dispose();
});

test('scene disposal deduplicates shared geometry/material/maps and releases shadow targets', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const texture = new THREE.Texture(), normal = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture, normalMap: normal, roughnessMap: texture });
  root.add(new THREE.Mesh(geometry, [material, material]), new THREE.Mesh(geometry, material));
  const light = new THREE.DirectionalLight();
  light.shadow.map = new THREE.WebGLRenderTarget(2, 2);
  light.shadow.mapPass = new THREE.WebGLRenderTarget(2, 2);
  root.add(light);
  const resources = [geometry, texture, normal, material, light.shadow.map, light.shadow.mapPass];
  const counts = resources.map(resource => {
    const counter = { count: 0 };
    resource.addEventListener('dispose', () => counter.count++);
    return counter;
  });
  disposeObjects(root);
  assert.deepEqual(counts.map(counter => counter.count), resources.map(() => 1));
});

function composerRenderer(pixelRatio: number) {
  return {
    capabilities: { maxSamples: 4 },
    getSize: (v: THREE.Vector2) => v.set(800, 600),
    getPixelRatio: () => pixelRatio
  } as unknown as THREE.WebGLRenderer;
}

test('quality bounds AO buffers; projection updates and disposal cover every pass and target', t => {
  let composer: EffectComposer | undefined;
  const setSize = EffectComposer.prototype.setSize;
  t.mock.method(EffectComposer.prototype, 'setSize', function(this: EffectComposer, w: number, h: number) {
    composer = this; setSize.call(this, w, h);
  });
  for (const [quality, pixelRatio, aoWidth, aoHeight] of [
    ['balanced', 1.5, 600, 450], ['high', 2, 800, 600]
  ] as const) {
    const camera = new THREE.PerspectiveCamera(40, 4 / 3, .04, 150);
    const post = surfaceRenderer(composerRenderer(pixelRatio), new THREE.Scene(), camera, quality);
    assert.ok(composer);
    assert.equal(composer.renderTarget1.width, 800 * pixelRatio);
    assert.equal(composer.renderTarget2.height, 600 * pixelRatio);
    assert.deepEqual(post.aoSize, { width: aoWidth, height: aoHeight });
    assert.equal(composer.renderTarget1.samples, 2);
    const ao = composer.passes.find(pass => pass instanceof SSAOPass) as SSAOPass;
    assert.equal(ao.kernel.length, quality === 'high' ? 24 : 16);
    camera.fov = 70; camera.updateProjectionMatrix(); post.syncProjection();
    assert.ok(ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.equals(camera.projectionMatrix));
    assert.ok(ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.equals(camera.projectionMatrixInverse));
    const output = composer.passes.find(pass => pass instanceof OutputPass) as OutputPass;
    const resources = [composer.renderTarget1, composer.renderTarget2, composer.copyPass.material,
      ao.normalRenderTarget, ao.ssaoRenderTarget, ao.blurRenderTarget, ao.normalMaterial,
      ao.ssaoMaterial, ao.blurMaterial, ao.copyMaterial, ao.depthRenderMaterial, ao.noiseTexture, output.material];
    const counts = resources.map(resource => {
      const counter = { count: 0 };
      resource.addEventListener('dispose', () => counter.count++);
      return counter;
    });
    post.resize(400, 300);
    assert.deepEqual(post.aoSize, { width: aoWidth / 2, height: aoHeight / 2 });
    // Resizing also disposes render targets; measure teardown from this point.
    counts.forEach(counter => { counter.count = 0; });
    post.dispose(); post.dispose();
    assert.deepEqual(counts.map(counter => counter.count), resources.map(() => 1));
  }
});

test('postprocessing setup failure releases already constructed resources', t => {
  let targets = 0, noise = 0;
  const disposeTarget = THREE.WebGLRenderTarget.prototype.dispose;
  t.mock.method(THREE.WebGLRenderTarget.prototype, 'dispose', function(this: THREE.WebGLRenderTarget) {
    targets++; disposeTarget.call(this);
  });
  const disposeTexture = THREE.Texture.prototype.dispose;
  t.mock.method(THREE.Texture.prototype, 'dispose', function(this: THREE.Texture) {
    if (this instanceof THREE.DataTexture) noise++;
    disposeTexture.call(this);
  });
  t.mock.method(EffectComposer.prototype, 'setSize', () => { throw new Error('resize failure'); });
  assert.throws(() => surfaceRenderer(composerRenderer(1.5), new THREE.Scene(), new THREE.PerspectiveCamera(), 'balanced'), /resize failure/);
  assert.ok(targets >= 5, 'two composer targets and three AO targets released');
  assert.equal(noise, 1);
});

test('diagnostics copy actual resource counts and drawing dimensions', () => {
  const renderer = {
    domElement: { dataset: {}, width: 1200, height: 900 },
    info: { memory: { geometries: 71, textures: 22 } },
    getPixelRatio: () => 1.5
  } as unknown as THREE.WebGLRenderer;
  renderDiagnostics(renderer, 'balanced', 5, { width: 600, height: 450 });
  assert.deepEqual(renderer.domElement.dataset, {
    renderCount: '5', geometries: '71', textures: '22', quality: 'balanced',
    width: '1200', height: '900', pixelRatio: '1.5', aoWidth: '600', aoHeight: '450'
  });
  renderer.info.memory.textures = 9;
  renderDiagnostics(renderer, 'high', 6);
  assert.equal(renderer.domElement.dataset.textures, '9');
  assert.equal(renderer.domElement.dataset.aoWidth, '0', 'direct-render fallback reports no AO buffer');
});


test('active and rapidly invalidated idle draws stay capped with monotonic elapsed time', () => {
  const scheduler = frames(), times: number[] = [], deltas: number[] = [];
  let time = 0, active = true;
  const loop = demandRenderer(dt => { times.push(time); deltas.push(dt); return active; }, scheduler);
  loop.invalidate();
  for (time = 0; time <= 1000; time += 5) {
    loop.invalidate();
    if (scheduler.count) scheduler.run(time);
  }
  assert.ok(times.length <= 31);
  assert.ok(times.slice(1).every((t, i) => t - times[i] >= 1000 / 30));
  assert.ok(deltas.slice(1).every(dt => Math.abs(dt - .035) < 1e-9));
  active = false;
  time = 1035; scheduler.run(time);
  assert.equal(scheduler.count, 0);
  loop.invalidate(); scheduler.run(1000); // Regressing timestamps cannot bypass the budget.
  assert.equal(scheduler.count, 1);
  time = 1070; scheduler.run(time);
  assert.equal(deltas.at(-1), 1 / 30, 'idle wake excludes elapsed idle time');
  assert.equal(scheduler.count, 0);
  loop.dispose();
});

test('an invalidation inside a final draw survives and disposal inside a draw stops it', () => {
  const scheduler = frames();
  let count = 0;
  const loop = demandRenderer(() => {
    count++;
    loop.invalidate();
    if (count === 2) loop.dispose();
    return false;
  }, scheduler);
  loop.invalidate(); scheduler.run(0);
  assert.equal(scheduler.count, 1);
  scheduler.run(34);
  assert.equal(count, 2);
  assert.equal(scheduler.count, 0);
});

test('motion resolution restores the full still image without exceeding device density', () => {
  assert.equal(scenePixelRatio(3, 'balanced', true), 1);
  assert.equal(scenePixelRatio(3, 'balanced', false), 1.5);
  assert.equal(scenePixelRatio(3, 'high', true), 1.25);
  assert.equal(scenePixelRatio(3, 'high', false), 2);
  assert.equal(scenePixelRatio(1, 'high', true), 1);
  assert.equal(scenePixelRatio(1, 'high', false), 1);
});


test('composer follows renderer density and unchanged size never reallocates targets', t => {
  let density = 2, composer: EffectComposer | undefined;
  const renderer = composerRenderer(density);
  renderer.getPixelRatio = () => density;
  const setSize = EffectComposer.prototype.setSize;
  t.mock.method(EffectComposer.prototype, 'setSize', function(this: EffectComposer, w: number, h: number) {
    composer = this; setSize.call(this, w, h);
  });
  const post = surfaceRenderer(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), 'high');
  assert.ok(composer);
  let reallocations = 0;
  composer.renderTarget1.addEventListener('dispose', () => reallocations++);
  post.resize(800, 600);
  assert.equal(reallocations, 0);
  density = 1.25;
  post.resize(800, 600);
  assert.equal(reallocations, 1);
  assert.equal(composer.renderTarget1.width, 1000);
  assert.deepEqual(post.aoSize, { width: 500, height: 375 });
  post.resize(800, 600);
  assert.equal(reallocations, 1);
  density = 2;
  post.resize(800, 600);
  assert.equal(reallocations, 2, 'one final still density transition');
  assert.deepEqual(post.aoSize, { width: 800, height: 600 });
  post.dispose();
});
