import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** One pending frame at most; a true draw result continues camera settling/movement. */
export function demandRenderer(draw: (dt: number) => boolean, scheduler: {
  request: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
}, visible = true) {
  const interval = 1000 / 30;
  let frame: number | null = null, lastDraw: number | null = null;
  let lastMotion: number | null = null, clock: number | null = null, disposed = false;
  const invalidate = () => {
    if (!disposed && visible && frame === null) frame = scheduler.request(tick);
  };
  const tick = (timestamp: number) => {
    frame = null;
    if (disposed || !visible) return;
    // A regressing clock cannot bypass the rate limit or produce negative movement.
    const time = clock = Math.max(clock ?? timestamp, timestamp);
    if (lastDraw !== null && time - lastDraw < interval - 1e-6) {
      invalidate();
      return;
    }
    const dt = lastMotion === null ? 1 / 30 : Math.min(.04, (time - lastMotion) / 1000);
    lastDraw = lastMotion = time;
    if (draw(dt)) invalidate();
    if (frame === null) lastMotion = null;
  };
  const cancel = () => {
    if (frame !== null) scheduler.cancel(frame);
    frame = null;
    lastDraw = lastMotion = clock = null;
  };
  return {
    invalidate,
    setVisible(value: boolean) {
      visible = value;
      if (visible) invalidate(); else cancel();
    },
    dispose() { disposed = true; cancel(); }
  };
}

export function scenePixelRatio(deviceRatio: number, quality: 'balanced' | 'high', moving: boolean) {
  return Math.min(deviceRatio, moving ? (quality === 'high' ? 1.25 : 1) : (quality === 'high' ? 2 : 1.5));
}

export function renderDiagnostics(renderer: THREE.WebGLRenderer, quality: 'balanced' | 'high', renderCount: number, aoSize?: { width: number; height: number }) {
  Object.assign(renderer.domElement.dataset, {
    renderCount: String(renderCount),
    geometries: String(renderer.info.memory.geometries),
    textures: String(renderer.info.memory.textures),
    quality,
    width: String(renderer.domElement.width),
    height: String(renderer.domElement.height),
    pixelRatio: String(renderer.getPixelRatio()),
    aoWidth: String(aoSize?.width ?? 0),
    aoHeight: String(aoSize?.height ?? 0)
  });
}

/** Keep ambient occlusion cheaper than the colour image in the default profile. */
class SurfaceOcclusionPass extends SSAOPass {
  resolutionScale = .5;
  setSize(width: number, height: number) {
    super.setSize(Math.max(1, Math.round(width * this.resolutionScale)), Math.max(1, Math.round(height * this.resolutionScale)));
  }
}

export function surfaceRenderer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: 'balanced' | 'high') {
  const high = quality === 'high';
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio(), { type: THREE.HalfFloatType });
  target.samples = Math.min(2, renderer.capabilities.maxSamples);
  const cleanup: (() => void)[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const release of cleanup.reverse()) release();
  };
  try {
    const composer = new EffectComposer(renderer, target);
    cleanup.push(() => composer.dispose());
    const render = new RenderPass(scene, camera);
    cleanup.push(() => render.dispose());
    const ao = new SurfaceOcclusionPass(scene, camera, 1, 1, high ? 24 : 16);
    cleanup.push(() => {
      ao.dispose();
      // Three 0.180's SSAOPass leaves these resources to its owner.
      ao.ssaoMaterial.dispose();
      ao.noiseTexture.dispose();
    });
    ao.resolutionScale = .5;
    ao.kernelRadius = .22;
    ao.minDistance = .003 / (camera.far - camera.near);
    ao.maxDistance = .3 / (camera.far - camera.near);
    ao.normalMaterial.side = THREE.DoubleSide;
    // Blend 45% AO with the existing colour, preserving brightness away from contacts.
    ao.copyMaterial.uniforms.opacity.value = .45;
    ao.copyMaterial.blendDst = THREE.OneMinusSrcAlphaFactor;
    ao.copyMaterial.blendSrcAlpha = THREE.ZeroFactor;
    ao.copyMaterial.blendDstAlpha = THREE.OneFactor;
    const output = new OutputPass();
    cleanup.push(() => output.dispose());
    composer.addPass(render);
    composer.addPass(ao);
    // Intermediate targets remain linear; tone mapping and sRGB transfer occur once.
    composer.addPass(output);
    composer.setSize(size.x, size.y);
    const syncProjection = () => {
      ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
      ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
    };
    let width = size.x, height = size.y, pixelRatio = renderer.getPixelRatio();
    return {
      resize: (nextWidth: number, nextHeight: number) => {
        const nextRatio = renderer.getPixelRatio();
        if (nextWidth === width && nextHeight === height && nextRatio === pixelRatio) return;
        const sizeChanged = nextWidth !== width || nextHeight !== height;
        width = nextWidth; height = nextHeight;
        if (nextRatio !== pixelRatio) {
          pixelRatio = nextRatio;
          composer.setPixelRatio(pixelRatio);
        }
        if (sizeChanged) composer.setSize(width, height);
      },
      syncProjection,
      render: (dt: number) => { syncProjection(); composer.render(dt); },
      get aoSize() { return { width: ao.width, height: ao.height }; },
      dispose
    };
  } catch (error) {
    if (cleanup.length === 0) target.dispose(); else dispose();
    throw error;
  }
}

/** Resources in a discarded scene subtree are scene-owned; shared references deduplicate. */
export function disposeObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(o => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const value of Object.values(m)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    }
    if (o instanceof THREE.Light) o.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const t of textures) t.dispose();
  for (const m of materials) m.dispose();
}
