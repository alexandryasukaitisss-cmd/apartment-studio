import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Project, type Variant, canWalk, solidSpans, inside, furnitureOverlaps, doorwayObstructions, wallMaterialId } from './model';
import { surfaceMaterial } from './textures';
import { demandRenderer, disposeObjects, renderDiagnostics, scenePixelRatio, surfaceRenderer } from './sceneRendering';
import { sceneVisibility } from './sceneVisibility';
import { furnitureMesh } from './furniture';
import { wallFaceSpans } from './wallSides';
import { openingHeights } from './openingHeights';
import { windowAssembly, windowInteriorSide, shadowEnclosure, includeEnclosureInShadows } from './windowAssembly';
import { sceneLighting, lampBudget } from './sceneLighting';
import { frameApartment } from './cameraFraming';
import { roomWalkView, OVERVIEW_FOV, WALK_FOV } from './walkCamera';
import { hasPointerDragged, surfaceClickAction, visibleSurfacePick, sceneContextTarget, type Surface, type SceneContextTarget } from './surfacePicking';
import { doorSwingConflicts } from './roomMeasures';
export type { SceneContextTarget } from './surfacePicking';
export default function Scene({ project, variant, mode, selectedRoom, selectedFurniture, onSelect, onFurniture, onSurface, onContext, quality = 'balanced', onDragStart, onDrag, onDragEnd, onDragCancel }: { project: Project; variant: Variant; mode: '3d' | 'walk'; selectedRoom: string; selectedFurniture: string | null; onSelect: (id: string) => void; onFurniture: (id: string) => void; onSurface?: (roomId: string, surface: Surface, wallIndex?: number) => void; onContext?: (target: SceneContextTarget) => void; quality?: 'balanced' | 'high'; onDragStart?: () => void; onDrag?: (id: string, x: number, z: number, electrical?: boolean, snap?: boolean) => void; onDragEnd?: (id: string, x: number, z: number, electrical?: boolean, snap?: boolean) => void; onDragCancel?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls; scene: THREE.Scene; renderer: THREE.WebGLRenderer; root: THREE.Group; furnitureGroup: THREE.Group; helperGroup: THREE.Group; walk: boolean; keys: Set<string>; yaw: number; pitch: number; lastRoom: string; lastWalkLayout: string; lighting: ReturnType<typeof sceneLighting> | null; lightingRoom: string; fit: () => void; setQuality: (value: 'balanced' | 'high') => void; syncProjection: () => void; invalidate: () => void; isVisible: () => boolean } | null>(null);
  const callbacks = useRef({ onSelect, onFurniture, onSurface, onContext, onDragStart, onDrag, onDragEnd, onDragCancel });
  callbacks.current = { onSelect, onFurniture, onSurface, onContext, onDragStart, onDrag, onDragEnd, onDragCancel };
  const projectRef = useRef(project);
  projectRef.current = project;
  const variantRef = useRef(variant);
  variantRef.current = variant;
  const selectedFurnitureRef = useRef(selectedFurniture);
  selectedFurnitureRef.current = selectedFurniture;
  const [failure, setFailure] = useState(false);
  const geometrySignature = JSON.stringify(project.rooms);
  useEffect(() => {
    if (!host.current)
      return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    } catch {
      setFailure(true);
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Geometry changes invalidate shadows; camera-only movement does not.
    renderer.shadowMap.autoUpdate = false;
    const restoreShadowTraversal = includeEnclosureInShadows(renderer.shadowMap);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#efede7');
    const camera = new THREE.PerspectiveCamera(OVERVIEW_FOV, 1, .04, 150);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(4.4, 0, 7.3);
    controls.enableDamping = true;
    controls.minDistance = 3;
    controls.maxDistance = 42;
    controls.maxPolarAngle = Math.PI * .49;
    const root = new THREE.Group();
    const furnitureGroup = new THREE.Group();
    const helperGroup = new THREE.Group();
    scene.add(root);
    scene.add(helperGroup);
    let post: ReturnType<typeof surfaceRenderer> | null = null;
    let activeQuality = quality, renderCount = 0;
    let loop: ReturnType<typeof demandRenderer> | null = null;
    let visibility: ReturnType<typeof sceneVisibility> | null = null;
    const isVisible = () => visibility?.visible ?? !document.hidden;
    const invalidate = () => loop?.invalidate();
    controls.addEventListener('change', invalidate);
    controls.addEventListener('end', invalidate);
    renderDiagnostics(renderer, activeQuality, renderCount);
    const setQuality = (value: 'balanced' | 'high') => {
      activeQuality = value;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, value === 'high' ? 2 : 1.5));
      post?.dispose();
      post = null;
      try { post = surfaceRenderer(renderer, scene, camera, value); }
      catch { renderer.setRenderTarget(null); }
      scene.traverse(o => {
        if ((o instanceof THREE.DirectionalLight || o instanceof THREE.SpotLight) && o.castShadow) {
          o.shadow.dispose();
          o.shadow.map = null;
          o.shadow.mapPass = null;
          const size = o instanceof THREE.DirectionalLight ? (value === 'high' ? 2048 : 1024) : (value === 'high' ? 1024 : 512);
          o.shadow.mapSize.setScalar(size);
          o.shadow.needsUpdate = true;
        }
      });
      renderer.shadowMap.needsUpdate = true;
      invalidate();
    };
    const rt = {
      camera, controls, scene, renderer, root, furnitureGroup, helperGroup, walk: false,
      keys: new Set<string>(), yaw: 0, pitch: 0, lastRoom: '', lastWalkLayout: '', lighting: null as ReturnType<typeof sceneLighting> | null, lightingRoom: '',
      setQuality, invalidate, isVisible, syncProjection: () => post?.syncProjection(),
      fit: () => {
        const target = frameApartment(camera, projectRef.current);
        controls.target.copy(target);
        controls.maxDistance = Math.max(42, camera.position.distanceTo(target) * 2);
        controls.update();
        invalidate();
      }
    };
    runtime.current = rt;
    const resize = new ResizeObserver(() => {
      const el = host.current;
      if (!el || !el.clientWidth || !el.clientHeight)
        return;
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      post?.resize(el.clientWidth, el.clientHeight);
      post?.syncProjection();
      invalidate();
      if (!rt.walk)
        rt.fit()
    });
    resize.observe(host.current);
    const down = (e: KeyboardEvent) => {
      if (!isVisible()) return;
      if ((e.target as HTMLElement)?.matches('input,select,textarea'))
        return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key) && rt.walk) {
        e.preventDefault();
        if (pointer?.button === 2) return;
        rt.keys.add(e.key.toLowerCase());
        invalidate()
      }
    };
    const up = (e: KeyboardEvent) => { if (rt.keys.delete(e.key.toLowerCase())) invalidate(); };
    const blur = () => { rt.keys.clear(); cancelPointer(); invalidate(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    const ray = new THREE.Raycaster();
    const setRay = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      camera.updateMatrixWorld();
      root.updateMatrixWorld(true);
      ray.near = camera.near;
      ray.far = camera.far;
      ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    };
    const pick = (e: PointerEvent) => {
      setRay(e);
      return visibleSurfacePick(ray.intersectObjects(root.children, true));
    };
    const floorPoint = (e: PointerEvent, planeY: number): [number, number] | null => {
      setRay(e);
      const hitPt = new THREE.Vector3();
      if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), hitPt)) return null;
      const local = root.worldToLocal(hitPt);
      return [local.x, local.z];
    };
    const idleCursor = () => rt.walk ? 'grab' : 'default';
    type FurnitureDragState = { id: string; roomId: string; planeY: number; offsetX: number; offsetZ: number; lastX: number; lastZ: number; started: boolean };
    let pointer: { id: number; button: number; x: number; y: number; startX: number; startY: number; dragged: boolean; furnitureDrag?: FurnitureDragState } | null = null;
    const pdown = (e: PointerEvent) => {
      if (!isVisible() || (e.button !== 0 && e.button !== 2) || pointer) return;
      let furnitureDrag: FurnitureDragState | undefined;
      if (e.button === 0 && !rt.walk && callbacks.current.onDrag && callbacks.current.onDragEnd) {
        const hit = pick(e);
        if (hit?.furnitureId && (hit.furnitureId === selectedFurnitureRef.current || e.shiftKey)) {
          const item = variantRef.current.furniture.find(f => f.id === hit.furnitureId);
          const pt = item ? floorPoint(e, hit.point.y) : null;
          if (item && pt) {
            furnitureDrag = { id: item.id, roomId: item.roomId, planeY: hit.point.y, offsetX: item.x - pt[0], offsetZ: item.z - pt[1], lastX: item.x, lastZ: item.z, started: false };
            rt.controls.enabled = false;
          }
        }
      }
      pointer = { id: e.pointerId, button: e.button, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, dragged: false, furnitureDrag };
      if (e.button === 2 && rt.walk) { rt.keys.clear(); invalidate(); }
      renderer.domElement.setPointerCapture(e.pointerId)
    };
    const pmove = (e: PointerEvent) => {
      if (!isVisible()) return;
      if (!pointer) {
        const hit = pick(e);
        renderer.domElement.style.cursor = hit?.furnitureId && !rt.walk && hit.furnitureId === selectedFurnitureRef.current ? 'grab' : hit ? 'pointer' : idleCursor();
        return;
      }
      if (e.pointerId !== pointer.id) return;
      pointer.dragged = hasPointerDragged({ x: pointer.startX, y: pointer.startY }, { x: e.clientX, y: e.clientY }, pointer.dragged);
      if (!pointer.dragged) return;
      renderer.domElement.style.cursor = 'grabbing';
      if (pointer.furnitureDrag) {
        if (!pointer.furnitureDrag.started) {
          pointer.furnitureDrag.started = true;
          callbacks.current.onSelect(pointer.furnitureDrag.roomId);
          callbacks.current.onFurniture(pointer.furnitureDrag.id);
          callbacks.current.onDragStart?.();
        }
        const pt = floorPoint(e, pointer.furnitureDrag.planeY);
        if (pt) {
          pointer.furnitureDrag.lastX = pt[0] + pointer.furnitureDrag.offsetX;
          pointer.furnitureDrag.lastZ = pt[1] + pointer.furnitureDrag.offsetZ;
          callbacks.current.onDrag?.(pointer.furnitureDrag.id, pointer.furnitureDrag.lastX, pointer.furnitureDrag.lastZ, false, !e.altKey);
          invalidate();
        }
      } else if (rt.walk && pointer.button === 0) {
        rt.yaw -= (e.clientX - pointer.x) * .005;
        rt.pitch = Math.max(-1.05, Math.min(1.05, rt.pitch - (e.clientY - pointer.y) * .004));
        invalidate();
      }
      pointer.x = e.clientX;
      pointer.y = e.clientY
    };
    const pup = (e: PointerEvent) => {
      if (!isVisible() || !pointer || e.pointerId !== pointer.id) return;
      const fDrag = pointer.furnitureDrag;
      rt.controls.enabled = !rt.walk && isVisible();
      if (fDrag?.started) {
        callbacks.current.onDragEnd?.(fDrag.id, fDrag.lastX, fDrag.lastZ, false, !e.altKey);
      } else {
        const action = surfaceClickAction(pointer.button, { x: pointer.startX, y: pointer.startY }, { x: e.clientX, y: e.clientY }, pointer.dragged);
        if (action) {
          const hit = pick(e);
          if (hit) {
            if (action === 'context') {
              const target = sceneContextTarget(hit, root, e);
              rt.keys.clear();
              cancelPointer();
              invalidate();
              callbacks.current.onContext?.(target);
            } else {
              callbacks.current.onSelect(hit.roomId);
              if (hit.furnitureId) callbacks.current.onFurniture(hit.furnitureId);
              else if (hit.surface) callbacks.current.onSurface?.(hit.roomId, hit.surface, hit.wallIndex);
            }
          }
        }
      }
      if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
      pointer = null;
      renderer.domElement.style.cursor = pick(e) ? 'pointer' : idleCursor();
    };
    const cancelPointer = () => {
      const id = pointer?.id;
      const startedDrag = pointer?.furnitureDrag?.started;
      pointer = null;
      rt.controls.enabled = !rt.walk && isVisible();
      if (startedDrag) callbacks.current.onDragCancel?.();
      if (id !== undefined && renderer.domElement.hasPointerCapture(id)) renderer.domElement.releasePointerCapture(id);
      renderer.domElement.style.cursor = idleCursor();
    };
    renderer.domElement.addEventListener('pointerdown', pdown);
    renderer.domElement.addEventListener('pointermove', pmove);
    renderer.domElement.addEventListener('pointerup', pup);
    renderer.domElement.addEventListener('pointercancel', cancelPointer);
    renderer.domElement.addEventListener('lostpointercapture', cancelPointer);
    const leavePointer = () => { if (!pointer) renderer.domElement.style.cursor = idleCursor(); };
    renderer.domElement.addEventListener('pointerleave', leavePointer);
    // Browsers dispatch this before or after pointerup. Open only after the gesture ends.
    const contextMenu = (e: MouseEvent) => e.preventDefault();
    renderer.domElement.addEventListener('contextmenu', contextMenu);
    const nav = (e: Event) => {
      const direction = (e as CustomEvent).detail as string;
      if (!rt.walk || !isVisible()) return;
      if (direction === 'stop')
        rt.keys.clear();
      else
        rt.keys.add(direction);
      invalidate();
    };
    window.addEventListener('apartment-walk', nav);
    const fit = () => {
      if (!rt.walk)
        rt.fit()
    };
    window.addEventListener('apartment-fit', fit);
    const look = (e: Event) => {
      const direction = (e as CustomEvent).detail;
      if (!rt.walk || !isVisible() || (direction !== 'ceiling' && direction !== 'forward')) return;
      rt.keys.clear();
      rt.pitch = direction === 'ceiling' ? .95 : 0;
      invalidate();
    };
    window.addEventListener('apartment-look', look);
    const previousPosition = new THREE.Vector3();
    const previousRotation = new THREE.Quaternion();
    const renderSize = new THREE.Vector2();
    loop = demandRenderer(dt => {
      previousPosition.copy(camera.position);
      previousRotation.copy(camera.quaternion);
      let moving = false;
      if (rt.walk) {
        camera.rotation.order = 'YXZ';
        camera.rotation.set(rt.pitch, rt.yaw, 0);
        let dx = 0, dz = 0;
        if (rt.keys.has('w') || rt.keys.has('arrowup'))
          dz -= 1;
        if (rt.keys.has('s') || rt.keys.has('arrowdown'))
          dz += 1;
        if (rt.keys.has('a') || rt.keys.has('arrowleft'))
          dx -= 1;
        if (rt.keys.has('d') || rt.keys.has('arrowright'))
          dx += 1;
        const len = Math.hypot(dx, dz) || 1;
        const step = dt * 1.7;
        const px = (dx * Math.cos(rt.yaw) + dz * Math.sin(rt.yaw)) / len * step;
        const pz = (-dx * Math.sin(rt.yaw) + dz * Math.cos(rt.yaw)) / len * step;
        const p = projectRef.current;
        const scale = p.scale;
        const activeFurniture = variantRef.current.furniture;
        if (canWalk([(camera.position.x + px) / scale, camera.position.z / scale], p, activeFurniture))
          camera.position.x += px;
        if (canWalk([camera.position.x / scale, (camera.position.z + pz) / scale], p, activeFurniture))
          camera.position.z += pz;
      }
      else
        moving = controls.update();
      moving = moving || !previousPosition.equals(camera.position) || !previousRotation.equals(camera.quaternion);
      if (rt.walk && moving) {
        const p = projectRef.current;
        const room = p.rooms.find(candidate => inside([camera.position.x / p.scale, camera.position.z / p.scale], candidate.polygon));
        if (room && room.id !== rt.lightingRoom) {
          rt.lightingRoom = room.id;
          renderer.domElement.dataset.lightRoom = room.id;
          if (rt.lighting?.updateFocus(room.id, camera.position)) renderer.shadowMap.needsUpdate = true;
        }
      }
      const pixelRatio = scenePixelRatio(window.devicePixelRatio, activeQuality, moving);
      if (renderer.getPixelRatio() !== pixelRatio) {
        renderer.setPixelRatio(pixelRatio);
        renderer.getSize(renderSize);
        post?.resize(renderSize.x, renderSize.y);
      }
      if (post) {
        try { post.render(dt); }
        catch {
          // Retain the usable direct renderer if optional postprocessing fails.
          post.dispose();
          post = null;
          renderer.setRenderTarget(null);
          renderer.render(scene, camera);
        }
      }
      else renderer.render(scene, camera);
      renderDiagnostics(renderer, activeQuality, ++renderCount, post?.aoSize);
      return moving;
    }, { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) }, !document.hidden);
    visibility = sceneVisibility(document, window, visible => {
      renderer.domElement.dataset.renderVisible = String(visible);
      controls.enabled = visible && !rt.walk;
      if (!visible) { rt.keys.clear(); cancelPointer(); }
      loop?.setVisible(visible);
    });
    invalidate();
    return () => {
      loop?.dispose();
      visibility?.dispose();
      controls.removeEventListener('change', invalidate);
      controls.removeEventListener('end', invalidate);
      renderer.domElement.removeEventListener('pointerdown', pdown);
      renderer.domElement.removeEventListener('pointermove', pmove);
      renderer.domElement.removeEventListener('pointerup', pup);
      renderer.domElement.removeEventListener('pointercancel', cancelPointer);
      renderer.domElement.removeEventListener('lostpointercapture', cancelPointer);
      renderer.domElement.removeEventListener('pointerleave', leavePointer);
      renderer.domElement.removeEventListener('contextmenu', contextMenu);
      resize.disconnect();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('apartment-walk', nav);
      window.removeEventListener('apartment-fit', fit);
      window.removeEventListener('apartment-look', look);
      controls.dispose();
      post?.dispose();
      disposeObjects(scene);
      restoreShadowTraversal();
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null
    }
  }, []);
  useEffect(() => { runtime.current?.setQuality(quality); }, [quality]);
  useEffect(() => {
    const rt = runtime.current;
    if (!rt)
      return;
    const wasWalk = rt.walk;
    rt.walk = mode === 'walk';
    rt.keys.clear();
    rt.controls.enabled = !rt.walk && rt.isVisible();
    rt.camera.fov = rt.walk ? WALK_FOV : OVERVIEW_FOV;
    rt.camera.updateProjectionMatrix();
    rt.syncProjection();
    rt.renderer.domElement.style.cursor = rt.walk ? 'grab' : 'default';
    const walkLayout = `${project.scale}:${geometrySignature}`;
    const room = project.rooms.find(r => r.id === selectedRoom);
    const alreadyInRoom = room && inside([rt.camera.position.x / project.scale, rt.camera.position.z / project.scale], room.polygon);
    if (rt.walk && (!wasWalk || rt.lastWalkLayout !== walkLayout || (rt.lastRoom !== selectedRoom && !alreadyInRoom))) {
      const view = roomWalkView(project, variant, selectedRoom);
      rt.camera.position.set(view.point[0] * project.scale, view.eyeHeight, view.point[1] * project.scale);
      rt.yaw = view.yaw;
      rt.pitch = view.pitch;
    }
    if (rt.walk) {
      rt.lastRoom = selectedRoom;
      rt.lastWalkLayout = walkLayout;
    }
    if (wasWalk && !rt.walk) {
      rt.fit()
    }
    rt.invalidate();
  }, [mode, selectedRoom, project.scale, geometrySignature]);
  const architectureSignature = JSON.stringify({
    rooms: project.rooms, walls: project.walls, scale: project.scale, ceiling: project.ceilingHeight,
    materials: project.materials, finishes: variant.finishes, wallOverrides: variant.wallOverrides,
    lighting: variant.lighting, lights: variant.electrical.points.filter(pt => pt.type === 'light'),
  });
  useEffect(() => {
    const rt = runtime.current;
    if (!rt)
      return;
    const { root, scene, furnitureGroup, helperGroup } = rt;
    disposeObjects(scene);
    root.clear();
    furnitureGroup.clear();
    helperGroup.clear();
    for (const o of [...scene.children])
      if (o !== root && o !== helperGroup)
        scene.remove(o);
    root.scale.setScalar(project.scale);
    root.add(shadowEnclosure(project));
    const lookup = (room: string, s: 'floor' | 'walls' | 'ceiling') => project.materials.find(m => m.id === variant.finishes[room]?.[s]) ?? project.materials[0];
    const lookupWall = (wallIndex: number, room: string) => project.materials.find(m => m.id === wallMaterialId(variant, wallIndex, room)) ?? lookup(room, 'walls');
    const materialFor = (m: ReturnType<typeof lookup>, w: number, h: number) => surfaceMaterial(m, w, h, rt.renderer.capabilities.getMaxAnisotropy(), rt.invalidate);
    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, angle = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      return mesh
    };
    for (const r of project.rooms) {
      const shape = new THREE.Shape(r.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geom = new THREE.ShapeGeometry(shape);
      geom.rotateX(-Math.PI / 2);
      const bounds = new THREE.Box3().setFromBufferAttribute(geom.attributes.position as THREE.BufferAttribute);
      const w = bounds.max.x - bounds.min.x, d = bounds.max.z - bounds.min.z;
      const uv = geom.attributes.uv;
      const pos = geom.attributes.position;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, (pos.getX(i) - bounds.min.x) / w, (pos.getZ(i) - bounds.min.z) / d);
      const floor = new THREE.Mesh(geom, materialFor(lookup(r.id, 'floor'), w * project.scale, d * project.scale));
      floor.receiveShadow = true;
      floor.userData.roomId = r.id;
      floor.userData.surface = 'floor';
      root.add(floor);
      if (mode === 'walk') {
        const ceil = new THREE.Mesh(geom.clone(), materialFor(lookup(r.id, 'ceiling'), w * project.scale, d * project.scale));
        ceil.position.y = project.ceilingHeight / project.scale;
        ceil.receiveShadow = true;
        ceil.castShadow = true;
        ceil.userData.roomId = r.id;
        ceil.userData.surface = 'ceiling';
        root.add(ceil)
      }
      if (r.id === selectedRoom && mode === '3d') {
        const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(r.polygon.map(([x, z]) => new THREE.Vector3(x, .017, z))), new THREE.LineBasicMaterial({ color: '#366b59', transparent: true, opacity: .7 }));
        root.add(ring)
      }
    }
    project.walls.forEach((w, wallIndex) => {
      const length = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const ux = (w.b[0] - w.a[0]) / length, uz = (w.b[1] - w.a[1]) / length;
      const angle = -Math.atan2(uz, ux);
      const wallH = (mode === 'walk' ? project.ceilingHeight : 1.18) / project.scale;
      const neutral = new THREE.MeshStandardMaterial({ color: '#e0dacc', roughness: .9 });
      const segment = (s: number, e: number, bottom: number, top: number) => {
        if (e <= s || top <= bottom)
          return;
        for (const face of wallFaceSpans(w, project, s, e)) {
          const x = w.a[0] + ux * (face.start + face.end) / 2, z = w.a[1] + uz * (face.start + face.end) / 2;
          const width = face.end - face.start;
          const positive = face.positive ? materialFor(lookupWall(wallIndex, face.positive), width * project.scale, (top - bottom) * project.scale) : neutral;
          const negative = face.negative ? materialFor(lookupWall(wallIndex, face.negative), width * project.scale, (top - bottom) * project.scale) : neutral;
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, top - bottom, .13), [neutral, neutral, neutral, neutral, positive, negative]);
          mesh.position.set(x, (top + bottom) / 2, z);
          mesh.rotation.y = angle;
          // The full enclosure owns wall shadows, including cutaway views.
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          mesh.userData.wallRooms = { positive: face.positive, negative: face.negative };
          mesh.userData.wallIndex = wallIndex;
          root.add(mesh);
          addBox(width, .035 / project.scale, .15, x, top, z, neutral, angle)
        }
      };
      for (const [s, e] of solidSpans(w))
        segment(s, e, 0, wallH);
      for (const o of w.openings ?? []) {
        if (o.kind === 'window') {
          const sill = o.sillHeight ?? openingHeights.windowSill;
          const head = o.headHeight ?? openingHeights.windowHead;
          segment(o.start, o.end, 0, Math.min(sill / project.scale, wallH));
          segment(o.start, o.end, head / project.scale, wallH);
          root.add(windowAssembly(w, o, project.scale, project.ceilingHeight, windowInteriorSide(project, w, o)));
        }
        else {
          const head = o.headHeight ?? openingHeights.door;
          segment(o.start, o.end, head / project.scale, wallH);
          for (const t of [o.start, o.end])
            addBox(.045, Math.min(head / project.scale, wallH), .18, w.a[0] + ux * t, Math.min(head / project.scale, wallH) / 2, w.a[1] + uz * t, new THREE.MeshStandardMaterial({ color: '#c7b99f' }), angle)
        }
      }
    });
    root.add(furnitureGroup);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#efede7', roughness: 1 }));
    base.rotation.x = -Math.PI / 2;
    base.position.y = -.12;
    base.receiveShadow = true;
    scene.add(base);
    rt.lighting = sceneLighting(project, variant, quality, selectedRoom);
    rt.lightingRoom = selectedRoom;
    if (rt.walk) {
      const room = project.rooms.find(candidate => inside([rt.camera.position.x / project.scale, rt.camera.position.z / project.scale], candidate.polygon));
      if (room) { rt.lightingRoom = room.id; rt.lighting.updateFocus(room.id, rt.camera.position); }
    }
    scene.add(rt.lighting);
    rt.renderer.domElement.dataset.lightRoom = rt.lightingRoom;
    rt.renderer.domElement.dataset.activeLampCount = String(lampBudget(project, variant).active);
    rt.renderer.shadowMap.needsUpdate = true;
    rt.invalidate();
  }, [architectureSignature, mode, selectedRoom, quality]);
  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    const { root, furnitureGroup, helperGroup } = rt;
    disposeObjects(furnitureGroup);
    furnitureGroup.clear();
    disposeObjects(helperGroup);
    helperGroup.clear();
    const conflictingIds = new Set([
      ...furnitureOverlaps(project, variant.furniture).flatMap(o => [o.a.id, o.b.id]),
      ...doorwayObstructions(project, variant.furniture).map(d => d.furnitureId),
      ...doorSwingConflicts(project, variant.furniture).flatMap(c => c.furnitureId ? [c.furnitureId] : []),
    ]);
    for (const f of variant.furniture) {
      const g = furnitureMesh(f);
      g.scale.setScalar(1 / project.scale);
      furnitureGroup.add(g);
      if (f.id === selectedFurniture || conflictingIds.has(f.id)) {
        root.updateMatrixWorld(true);
        const helper = new THREE.BoxHelper(g, conflictingIds.has(f.id) ? '#a33b2e' : '#3c7764');
        helperGroup.add(helper);
      }
    }
    rt.renderer.shadowMap.needsUpdate = true;
    rt.invalidate();
  }, [architectureSignature, variant.furniture, selectedFurniture, mode]);
  useEffect(() => {
    if (runtime.current && !runtime.current.walk)
      runtime.current.fit()
  }, [geometrySignature, project.scale]);
  return <div className="scene-host" ref={host} aria-label={mode === 'walk' ? 'Интерьер квартиры: WASD для прогулки' : 'Трёхмерная квартира: перетаскивайте для вращения'}>
    {failure && <div className="webgl-error">3D недоступен в этом браузере. План 2D и все настройки работают.</div>}
  </div>
}
