import * as THREE from 'three';
import { type Project, type Wall, solidSpans } from './model';
import { openingHeights } from './openingHeights';
import { wallFaceSpans } from './wallSides';

/** At a shared aperture, the first declared adjacent room is its interior face. */
export function windowInteriorSide(project: Project, wall: Wall, opening: NonNullable<Wall['openings']>[number]): 1 | -1 {
  const midpoint = (opening.start + opening.end) / 2;
  const face = wallFaceSpans(wall, project, opening.start, opening.end).find(span => span.start <= midpoint && span.end >= midpoint);
  if (!face) return -1;
  const room = wall.rooms.find(id => id === face.positive || id === face.negative);
  if (room) return room === face.positive ? 1 : -1;
  return face.positive ? 1 : -1;
}

/** Coordinates remain in the wall's model units; physical details scale independently. */
export function windowAssembly(wall: Wall, opening: NonNullable<Wall['openings']>[number], scale: number, ceilingHeight: number, interiorSide: 1 | -1 = -1) {
  const group = new THREE.Group();
  group.name = 'window-assembly';
  const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  const width = Math.max(0, Math.min(length, opening.end) - Math.max(0, opening.start));
  const bottom = Math.min(opening.sillHeight ?? openingHeights.windowSill, ceilingHeight) / scale;
  const top = Math.min(opening.headHeight ?? openingHeights.windowHead, ceilingHeight) / scale;
  const height = top - bottom;
  if (!length || width <= 0 || height <= 0) return group;
  const middle = (Math.max(0, opening.start) + Math.min(length, opening.end)) / 2;
  group.position.set(wall.a[0] + (wall.b[0] - wall.a[0]) / length * middle, bottom, wall.a[1] + (wall.b[1] - wall.a[1]) / length * middle);
  group.rotation.y = -Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]);
  const frame = new THREE.MeshStandardMaterial({ color: '#edece5', roughness: .48 });
  const reveal = new THREE.MeshStandardMaterial({ color: '#e2ded3', roughness: .9 });
  const metal = new THREE.MeshStandardMaterial({ color: '#85898b', roughness: .32, metalness: .65 });
  const glass = new THREE.MeshStandardMaterial({ color: '#c6e0e7', transparent: true, opacity: .16, roughness: .12, metalness: .05, depthWrite: false });
  const bar = Math.min(.055 / scale, width / 8, height / 8);
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, casts = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = casts;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  // Every opaque member lies at the aperture edge or a narrow sash divider.
  for (const x of [-width / 2 + bar / 2, width / 2 - bar / 2]) {
    box('reveal-jamb', bar, height, .19 / scale, x, height / 2, 0, reveal);
    box('frame-jamb', bar, height, .075 / scale, x, height / 2, interiorSide * .015 / scale, frame);
  }
  for (const y of [bar / 2, height - bar / 2]) {
    box('reveal-edge', width, bar, .19 / scale, 0, y, 0, reveal);
    box('frame-edge', width, bar, .075 / scale, 0, y, interiorSide * .015 / scale, frame);
  }
  box('sash-divider', bar, height - 2 * bar, .065 / scale, 0, height / 2, interiorSide * .018 / scale, frame);
  const paneWidth = (width - 3 * bar) / 2;
  for (const side of [-1, 1]) {
    const x = side * (width - bar) / 4;
    box('glass', paneWidth, height - 2 * bar, .008 / scale, x, height / 2, 0, glass, false);
    // Thin inset sash rails make each operable pane readable in a close walk view.
    for (const y of [bar * 1.3, height - bar * 1.3])
      box('sash-rail', paneWidth, bar * .35, .04 / scale, x, y, interiorSide * .045 / scale, frame);
    box('handle-base', bar * .45, Math.min(.09 / scale, height * .35), .018 / scale, side * bar * 1.2, height * .48, interiorSide * .065 / scale, metal);
    box('handle', .025 / scale, Math.min(.105 / scale, height * .4), .025 / scale, side * bar * 1.2, height * .48, interiorSide * .087 / scale, metal);
  }
  box('sill', width, .028 / scale, .28 / scale, 0, -.014 / scale, interiorSide * .055 / scale, reveal);
  return group;
}

/** Shadow-only full enclosure: camera, contact shading and picking retain layer zero. */
export function shadowEnclosure(project: Project) {
  const group = new THREE.Group();
  group.name = 'physical-shadow-enclosure';
  group.layers.set(1);
  const material = new THREE.MeshStandardMaterial({ color: '#ddd8ce', side: THREE.DoubleSide });
  // Solid walls cast from their opposite face, avoiding self-shadow stripes.
  material.shadowSide = THREE.BackSide;
  const roofMaterial = new THREE.MeshStandardMaterial({ color: '#ddd8ce', side: THREE.DoubleSide });
  const height = project.ceilingHeight / project.scale;
  for (const wall of project.walls) {
    const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
    if (!length) continue;
    const segment = (start: number, end: number, bottom: number, top: number) => {
      start = Math.max(0, start); end = Math.min(length, end);
      bottom = Math.max(0, Math.min(height, bottom)); top = Math.max(0, Math.min(height, top));
      if (end <= start || top <= bottom) return;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(end - start, top - bottom, .13), material);
      const middle = (start + end) / 2;
      mesh.position.set(wall.a[0] + (wall.b[0] - wall.a[0]) / length * middle, (top + bottom) / 2, wall.a[1] + (wall.b[1] - wall.a[1]) / length * middle);
      mesh.rotation.y = -Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]);
      mesh.layers.set(1); mesh.castShadow = true;
      group.add(mesh);
    };
    for (const [start, end] of solidSpans(wall)) segment(start, end, 0, height);
    for (const opening of wall.openings ?? []) {
      const sill = opening.sillHeight ?? openingHeights.windowSill;
      const head = opening.headHeight ?? (opening.kind === 'window' ? openingHeights.windowHead : openingHeights.door);
      if (opening.kind === 'window') segment(opening.start, opening.end, 0, sill / project.scale);
      segment(opening.start, opening.end, head / project.scale, height);
    }
  }
  for (const room of project.rooms) {
    const shape = new THREE.Shape(room.polygon.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const roof = new THREE.Mesh(geometry, roofMaterial);
    roof.name = 'opaque-roof'; roof.position.y = height;
    roof.layers.set(1); roof.castShadow = true;
    group.add(roof);
  }
  return group;
}

/** Three r180 filters shadow casters with the viewing camera's layers. */
export function includeEnclosureInShadows(shadowMap: Pick<THREE.WebGLRenderer['shadowMap'], 'render'>) {
  const original = shadowMap.render;
  shadowMap.render = function(lights, scene, camera) {
    const mask = camera.layers.mask;
    camera.layers.enable(1);
    try { original.call(shadowMap, lights, scene, camera); }
    finally { camera.layers.mask = mask; }
  };
  return () => { shadowMap.render = original; };
}
