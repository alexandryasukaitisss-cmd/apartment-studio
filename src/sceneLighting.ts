import * as THREE from 'three';
import { type Project, type Variant, roomInteriorTarget, inside } from './model';
import { openingHeights } from './openingHeights';

export const MAX_ACTIVE_LAMPS = 6;
export const MAX_WINDOW_FILL_LIGHTS = 4;
export const MAX_LOCAL_SHADOWS = 1;

export function fixtureLocations(project: Project, variant: Variant) {
  const explicit = variant.electrical.points.filter(point => point.type === 'light' && project.rooms.some(room => room.id === point.roomId));
  return [
    ...explicit.map(point => ({ id: point.id, roomId: point.roomId, x: point.x * project.scale, z: point.z * project.scale, height: Math.min(project.ceilingHeight, Math.max(.1, point.height)), example: false })),
    ...project.rooms.filter(room => !explicit.some(point => point.roomId === room.id)).map(room => {
      const [x, z] = roomInteriorTarget(room);
      return { id: `example:${room.id}`, roomId: room.id, x: x * project.scale, z: z * project.scale, height: project.ceilingHeight, example: true };
    })
  ];
}

export function prioritizedFixtures(fixtures: ReturnType<typeof fixtureLocations>, roomId?: string, position?: Pick<THREE.Vector3, 'x' | 'z'>) {
  return [...fixtures].sort((a, b) => {
    const roomPriority = Number(b.roomId === roomId) - Number(a.roomId === roomId);
    if (roomPriority) return roomPriority;
    if (!position) return 0;
    return (a.x - position.x) ** 2 + (a.z - position.z) ** 2 - (b.x - position.x) ** 2 - (b.z - position.z) ** 2;
  });
}

export function lampBudget(project: Project, variant: Variant) {
  const fixtures = fixtureLocations(project, variant);
  const explicit = fixtures.filter(fixture => !fixture.example).length;
  return { explicit, examples: fixtures.length - explicit, total: fixtures.length, active: variant.lighting.mode === 'evening' ? Math.min(MAX_ACTIVE_LAMPS, fixtures.length) : 0, limited: Math.max(0, fixtures.length - MAX_ACTIVE_LAMPS) };
}

function lampColor(warmth: number) {
  return new THREE.Color('#ffd0a0').lerp(new THREE.Color('#e4efff'), Math.max(0, Math.min(1, (warmth - 2500) / 4000)));
}

export function sceneLighting(project: Project, variant: Variant, quality: 'balanced' | 'high', selectedRoom?: string) {
  const group = new THREE.Group();
  group.name = 'apartment-lighting';
  const day = variant.lighting.mode === 'day';
  const evening = variant.lighting.mode === 'evening';
  const uniform = variant.lighting.mode === 'uniform';
  const color = lampColor(variant.lighting.warmth);
  // Uniform inspection fill has equal sky/ground colours; spatial modes keep a small visibility floor.
  group.add(uniform
    ? new THREE.HemisphereLight(color, color, 2.7 * variant.lighting.intensity)
    : new THREE.HemisphereLight('#e7efff', '#887c6c', day ? .28 : .2));
  const bounds = new THREE.Box3();
  for (const room of project.rooms) for (const [x, z] of room.polygon)
    bounds.expandByPoint(new THREE.Vector3(x * project.scale, 0, z * project.scale));
  const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3());
  const radius = bounds.isEmpty() ? 14 : Math.max(6, bounds.getSize(new THREE.Vector3()).length() / 2 + 1);
  if (!uniform) {
    const sun = new THREE.DirectionalLight(color, day ? variant.lighting.intensity * 3 : 0);
    const azimuth = variant.lighting.azimuth * Math.PI / 180;
    sun.position.set(center.x + Math.sin(azimuth) * 15, 20, center.z + Math.cos(azimuth) * 15);
    sun.target.position.copy(center);
    sun.castShadow = day;
    sun.shadow.camera.layers.enable(1);
    sun.shadow.mapSize.setScalar(quality === 'high' ? 2048 : 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -radius;
    sun.shadow.camera.right = sun.shadow.camera.top = radius;
    sun.shadow.camera.far = Math.max(50, radius * 4);
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = .018;
    sun.shadow.bias = -.0001;
    sun.shadow.radius = 2;
    sun.shadow.autoUpdate = false;
    sun.shadow.needsUpdate = true;
    group.add(sun, sun.target);
  }

  const fixtures = fixtureLocations(project, variant);
  const body = new THREE.MeshStandardMaterial({ color: '#e8e5df', roughness: .5, metalness: .2 });
  const diffusers = new Map<string, THREE.MeshStandardMaterial>();
  fixtures.forEach(fixture => {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .045, 16), body);
    housing.name = fixture.example ? 'example-ceiling-fixture' : 'electrical-light-fixture';
    housing.position.set(fixture.x, fixture.height - .023, fixture.z);
    housing.userData.electricalPointId = fixture.example ? undefined : fixture.id;
    housing.userData.example = fixture.example;
    housing.userData.roomId = fixture.roomId;
    housing.castShadow = true; housing.receiveShadow = true;
    group.add(housing);
    const material = new THREE.MeshStandardMaterial({ color: '#ece8d8', emissive: color, emissiveIntensity: 0, roughness: .4 });
    diffusers.set(fixture.id, material);
    const diffuser = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .012, 16), material);
    diffuser.position.set(fixture.x, fixture.height - .052, fixture.z);
    diffuser.name = 'fixture-diffuser';
    group.add(diffuser);
  });
  // Reuse the same bounded lights and shadow maps when the walked room changes.
  const lamps: (THREE.SpotLight | THREE.PointLight)[] = [];
  if (evening) for (let index = 0; index < Math.min(MAX_ACTIVE_LAMPS, fixtures.length); index++) {
    const light = index < MAX_LOCAL_SHADOWS
      ? new THREE.SpotLight(color, 24 * variant.lighting.intensity, 10, Math.PI * .44, .55, 2)
      : new THREE.PointLight(color, 12 * variant.lighting.intensity, 7, 2);
    light.name = 'fixture-light';
    if (light instanceof THREE.SpotLight) {
      group.add(light.target);
      light.castShadow = true;
      light.shadow.camera.layers.enable(1);
      light.shadow.mapSize.setScalar(quality === 'high' ? 1024 : 512);
      light.shadow.normalBias = .015;
      light.shadow.bias = -.0001;
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
    }
    lamps.push(light); group.add(light);
  }
  const updateFocus = (roomId?: string, position?: Pick<THREE.Vector3, 'x' | 'z'>) => {
    if (!evening) return false;
    const room = project.rooms.find(candidate => candidate.id === roomId);
    const point = room && !position ? roomInteriorTarget(room) : undefined;
    const anchor = position ?? (point ? { x: point[0] * project.scale, z: point[1] * project.scale } : center);
    const selected = prioritizedFixtures(fixtures, roomId, anchor).slice(0, lamps.length);
    const activeIds = new Set(selected.map(fixture => fixture.id));
    for (const [id, material] of diffusers)
      material.emissiveIntensity = activeIds.has(id) ? variant.lighting.intensity * 1.2 : 0;
    let changedShadow = false;
    lamps.forEach((light, index) => {
      const fixture = selected[index];
      const moved = light.position.x !== fixture.x || light.position.z !== fixture.z || light.position.y !== fixture.height - .09;
      light.position.set(fixture.x, fixture.height - .09, fixture.z);
      light.userData.fixtureId = fixture.id;
      light.userData.roomId = fixture.roomId;
      if (light instanceof THREE.SpotLight) {
        light.target.position.set(fixture.x, 0, fixture.z);
        if (moved) { light.shadow.needsUpdate = true; changedShadow = true; }
      }
    });
    return changedShadow;
  };
  updateFocus(selectedRoom);
  // Approximate diffuse daylight at apertures, rather than hidden lamps at room centres.
  if (day) {
    let fills = 0;
    for (const wall of project.walls) for (const opening of wall.openings ?? []) {
      if (opening.kind !== 'window' || fills >= MAX_WINDOW_FILL_LIGHTS || project.ceilingHeight <= openingHeights.windowSill) continue;
      const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
      if (!length) continue;
      const ux = (wall.b[0] - wall.a[0]) / length, uz = (wall.b[1] - wall.a[1]) / length;
      const middle = (opening.start + opening.end) / 2;
      const x = wall.a[0] + ux * middle, z = wall.a[1] + uz * middle;
      const offset = .24 / project.scale;
      const candidates = [[x - uz * offset, z + ux * offset], [x + uz * offset, z - ux * offset]] as [number, number][];
      const point = candidates.find(candidate => project.rooms.some(room => wall.rooms.includes(room.id) && inside(candidate, room.polygon)));
      if (!point) continue;
      const fill = new THREE.PointLight('#e1edff', 2.8 * variant.lighting.intensity, 4, 2);
      fill.name = 'approximate-window-daylight';
      fill.position.set(point[0] * project.scale, (openingHeights.windowSill + Math.min(project.ceilingHeight, openingHeights.windowHead)) / 2, point[1] * project.scale);
      group.add(fill); fills++;
    }
  }
  return Object.assign(group, { updateFocus });
}
