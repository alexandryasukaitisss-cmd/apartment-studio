import {
  type ElectricalPoint,
  type EngineeringItem,
  type Furniture,
  type Opening,
  type Point,
  type Project,
  type Variant,
  HUMAN_EYE_HEIGHT_M,
  canWalk,
  center,
  furnitureFootprint,
  furnitureFront,
  inside,
  roomInteriorTarget,
} from './model';
import { openingHeights } from './openingHeights';
import { roomWalls, wallTitle } from './openings';
import { roomWalkView } from './walkCamera';

export interface CameraPose {
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
  mode: '3d' | 'walk';
  roomId?: string;
}

export interface PresetViewpoint {
  id: string;
  name: string;
  roomId: string;
  point: Point;
  yaw: number;
  pitch: number;
  eyeHeight: number;
}

function yawFromTo(from: Point, to: Point): number {
  return Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
}

function nearestWalkable(project: Project, variant: Variant, roomId: string, desired: Point): Point {
  const room = project.rooms.find(r => r.id === roomId)!;
  const xs = room.polygon.map(p => p[0]);
  const zs = room.polygon.map(p => p[1]);
  const solid = variant.furniture.filter(f => f.roomId === roomId && f.kind !== 'platform' && f.kind !== 'rug' && f.kind !== 'person' && (f.elevation ?? 0) < 1.65);
  let best = desired;
  let bestDist = Infinity;
  for (let x = Math.min(...xs) + .22; x < Math.max(...xs) - .18; x += .18) {
    for (let z = Math.min(...zs) + .22; z < Math.max(...zs) - .18; z += .18) {
      const pt: Point = [x, z];
      if (!inside(pt, room.polygon) || !canWalk(pt, project)) continue;
      if (solid.some(f => inside(pt, furnitureFootprint({ ...f, width: f.width + .16, depth: f.depth + .16 }, project.scale)))) continue;
      const d = Math.hypot(pt[0] - desired[0], pt[1] - desired[1]);
      if (d < bestDist) {
        best = pt;
        bestDist = d;
      }
    }
  }
  return bestDist < Infinity ? best : roomWalkView(project, variant, roomId).point;
}

export function roomPresetViewpoints(project: Project, variant: Variant, roomId: string, eyeHeight = HUMAN_EYE_HEIGHT_M): PresetViewpoint[] {
  const room = project.rooms.find(r => r.id === roomId);
  if (!room) return [];
  const target = roomInteriorTarget(room);
  const views: PresetViewpoint[] = [];
  const base = roomWalkView(project, variant, roomId);
  const wallsOfRoom = roomWalls(project, roomId);

  // 1. Entry door view
  const doorOpening = wallsOfRoom.flatMap(rw => (rw.wall.openings ?? [])
    .filter(o => o.kind === 'door')
    .map(o => ({ rw, o })))[0];
  if (doorOpening) {
    const { wall } = doorOpening.rw;
    const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) || 1;
    const mid = (doorOpening.o.start + doorOpening.o.end) / 2;
    const dx = wall.a[0] + (wall.b[0] - wall.a[0]) * mid / len;
    const dz = wall.a[1] + (wall.b[1] - wall.a[1]) * mid / len;
    const toCenter = [target[0] - dx, target[1] - dz];
    const dist = Math.hypot(toCenter[0], toCenter[1]) || 1;
    const desired: Point = [dx + toCenter[0] / dist * .45, dz + toCenter[1] / dist * .45];
    const pt = nearestWalkable(project, variant, roomId, desired);
    views.push({
      id: `${roomId}:entry`,
      name: 'От входа в комнату',
      roomId,
      point: pt,
      yaw: yawFromTo(pt, target),
      pitch: -.12,
      eyeHeight,
    });
  } else {
    views.push({
      id: `${roomId}:overview`,
      name: 'От входа',
      roomId,
      point: base.point,
      yaw: base.yaw,
      pitch: base.pitch,
      eyeHeight,
    });
  }

  // 2. Window looking inward
  const winOpening = wallsOfRoom.flatMap(rw => (rw.wall.openings ?? [])
    .filter(o => o.kind === 'window')
    .map(o => ({ rw, o })))[0];
  if (winOpening) {
    const { wall } = winOpening.rw;
    const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) || 1;
    const mid = (winOpening.o.start + winOpening.o.end) / 2;
    const wx = wall.a[0] + (wall.b[0] - wall.a[0]) * mid / len;
    const wz = wall.a[1] + (wall.b[1] - wall.a[1]) * mid / len;
    const toCenter = [target[0] - wx, target[1] - wz];
    const dist = Math.hypot(toCenter[0], toCenter[1]) || 1;
    const desired: Point = [wx + toCenter[0] / dist * .5, wz + toCenter[1] / dist * .5];
    const pt = nearestWalkable(project, variant, roomId, desired);
    views.push({
      id: `${roomId}:window`,
      name: 'От окна внутрь',
      roomId,
      point: pt,
      yaw: yawFromTo(pt, target),
      pitch: -.10,
      eyeHeight,
    });
  }

  // 3. Sofa seated view (towards TV or room center)
  const sofa = variant.furniture.find(f => f.roomId === roomId && (f.kind === 'sofa' || f.kind === 'corner'));
  if (sofa) {
    const tv = variant.furniture.find(f => f.roomId === roomId && f.kind === 'television');
    const [fx, fz] = furnitureFront(sofa.rotation);
    const lookTarget: Point = tv ? [tv.x, tv.z] : [sofa.x + fx * 2.5, sofa.z + fz * 2.5];
    views.push({
      id: `${roomId}:sofa`,
      name: tv ? 'С дивана на ТВ' : 'С дивана (сидя)',
      roomId,
      point: [sofa.x, sofa.z],
      yaw: yawFromTo([sofa.x, sofa.z], lookTarget),
      pitch: -.03,
      eyeHeight: 1.15,
    });
  }

  // 4. Kitchen / workstation view
  const kitchen = variant.furniture.find(f => f.roomId === roomId && f.kind === 'kitchen');
  if (kitchen) {
    const [fx, fz] = furnitureFront(kitchen.rotation);
    const desired: Point = [kitchen.x + fx * 1.5 / project.scale, kitchen.z + fz * 1.5 / project.scale];
    const pt = nearestWalkable(project, variant, roomId, desired);
    views.push({
      id: `${roomId}:kitchen`,
      name: 'На кухню',
      roomId,
      point: pt,
      yaw: yawFromTo(pt, [kitchen.x, kitchen.z]),
      pitch: -.12,
      eyeHeight,
    });
  }

  const desk = variant.furniture.find(f => f.roomId === roomId && (f.kind === 'workstation' || f.kind === 'table'));
  if (desk) {
    const [fx, fz] = furnitureFront(desk.rotation);
    const desired: Point = [desk.x + fx * .7 / project.scale, desk.z + fz * .7 / project.scale];
    const pt = nearestWalkable(project, variant, roomId, desired);
    views.push({
      id: `${roomId}:desk`,
      name: desk.kind === 'workstation' ? 'Рабочее место (сидя)' : 'Из-за стола',
      roomId,
      point: pt,
      yaw: yawFromTo(pt, [desk.x, desk.z]),
      pitch: -.08,
      eyeHeight: 1.22,
    });
  }

  // 5. Opposite corner overview
  const c = center(room);
  views.push({
    id: `${roomId}:corner`,
    name: 'Общий угол комнаты',
    roomId,
    point: base.point,
    yaw: yawFromTo(base.point, c),
    pitch: -.14,
    eyeHeight,
  });

  return views;
}

export interface LifeZone {
  id: string;
  roomId: string;
  kind: 'clearance' | 'tv_cone' | 'seating';
  label: string;
  polygon: Point[];
}

function orientedRect(cx: number, cz: number, width: number, depth: number, rotationDeg: number, scale: number): Point[] {
  const a = rotationDeg * Math.PI / 180;
  const hw = width / 2 / scale, hd = depth / 2 / scale;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const x = sx * hw, z = sz * hd;
    return [cx + x * Math.cos(a) - z * Math.sin(a), cz + x * Math.sin(a) + z * Math.cos(a)] as Point;
  });
}

export function lifeZonePolygons(project: Project, variant: Variant): LifeZone[] {
  const zones: LifeZone[] = [];
  const scale = project.scale;
  for (const f of variant.furniture) {
    const [fx, fz] = furnitureFront(f.rotation);
    if (['fridge', 'oven', 'dishwasher', 'washer', 'wardrobe', 'pantry'].includes(f.kind)) {
      const clearanceM = f.kind === 'wardrobe' ? .65 : .72;
      const offset = (f.depth / 2 + clearanceM / 2) / scale;
      zones.push({
        id: `lz-front-${f.id}`,
        roomId: f.roomId,
        kind: 'clearance',
        label: `Открывание: ${Math.round(clearanceM * 100)} см`,
        polygon: orientedRect(f.x + fx * offset, f.z + fz * offset, f.width, clearanceM, f.rotation, scale),
      });
    } else if (f.kind === 'table' && f.height > .55) {
      zones.push({
        id: `lz-seat-${f.id}`,
        roomId: f.roomId,
        kind: 'seating',
        label: 'Выдвижение стульев (+65 см)',
        polygon: orientedRect(f.x, f.z, f.width + 1.1, f.depth + 1.1, f.rotation, scale),
      });
    } else if (f.kind === 'television') {
      const diagM = Math.hypot(f.width, f.height);
      const minD = Math.max(1.2, diagM * 1.4) / scale;
      const maxD = Math.min(3.8, diagM * 2.7) / scale;
      const rx = fz, rz = -fx;
      const wNear = f.width * .65 / scale;
      const wFar = (f.width * .65 + (maxD - minD) * .55 * scale) / scale;
      zones.push({
        id: `lz-tv-${f.id}`,
        roomId: f.roomId,
        kind: 'tv_cone',
        label: `Оптимальный просмотр ТВ (${(minD * scale).toFixed(1)}–${(maxD * scale).toFixed(1)} м)`,
        polygon: [
          [f.x + fx * minD - rx * wNear, f.z + fz * minD - rz * wNear],
          [f.x + fx * minD + rx * wNear, f.z + fz * minD + rz * wNear],
          [f.x + fx * maxD + rx * wFar, f.z + fz * maxD + rz * wFar],
          [f.x + fx * maxD - rx * wFar, f.z + fz * maxD - rz * wFar],
        ],
      });
    }
  }
  return zones;
}

export interface ElevationOpening {
  kind: Opening['kind'];
  u0: number;
  u1: number;
  bottomM: number;
  topM: number;
}

export interface ElevationFurniture {
  id: string;
  kind: Furniture['kind'];
  label?: string;
  color: string;
  u0: number;
  u1: number;
  bottomM: number;
  topM: number;
  distM: number;
}

export interface ElevationElectrical {
  id: string;
  type: ElectricalPoint['type'];
  label?: string;
  u: number;
  heightM: number;
}

export interface ElevationEngineering {
  id: string;
  type: EngineeringItem['type'];
  label?: string;
  u: number;
  heightM: number;
}

export interface WallElevationData {
  wallIndex: number;
  roomId: string;
  title: string;
  lengthM: number;
  ceilingM: number;
  skirtingM: number;
  openings: ElevationOpening[];
  furniture: ElevationFurniture[];
  electrical: ElevationElectrical[];
  engineering: ElevationEngineering[];
}

export function buildWallElevation(project: Project, variant: Variant, roomId: string, wallIndex: number): WallElevationData | null {
  const rw = roomWalls(project, roomId).find(w => w.index === wallIndex);
  if (!rw) return null;
  const { wall, faceStart: spanStart, faceEnd: spanEnd } = rw;
  const wallLen = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  if (!wallLen) return null;
  const ux = (wall.b[0] - wall.a[0]) / wallLen;
  const uz = (wall.b[1] - wall.a[1]) / wallLen;
  const nx = -uz;
  const nz = ux;
  const scale = project.scale;
  const lengthM = (spanEnd - spanStart) * scale;
  const projectPt = (pt: Point) => {
    const dx = pt[0] - wall.a[0];
    const dz = pt[1] - wall.a[1];
    const t = dx * ux + dz * uz;
    const dist = Math.abs(dx * nx + dz * nz) * scale;
    return { uM: (t - spanStart) * scale, distM: dist };
  };

  const openings: ElevationOpening[] = [];
  for (const o of wall.openings ?? []) {
    if (o.end <= spanStart + 1e-4 || o.start >= spanEnd - 1e-4) continue;
    const u0 = Math.max(0, (o.start - spanStart) * scale);
    const u1 = Math.min(lengthM, (o.end - spanStart) * scale);
    if (o.kind === 'window') {
      openings.push({
        kind: 'window',
        u0,
        u1,
        bottomM: o.sillHeight ?? openingHeights.windowSill,
        topM: Math.min(project.ceilingHeight, o.headHeight ?? openingHeights.windowHead),
      });
    } else {
      openings.push({
        kind: 'door',
        u0,
        u1,
        bottomM: 0,
        topM: Math.min(project.ceilingHeight, o.headHeight ?? openingHeights.door),
      });
    }
  }

  const furniture: ElevationFurniture[] = [];
  for (const f of variant.furniture) {
    if (f.roomId !== roomId || f.kind === 'rug' || f.kind === 'platform') continue;
    const corners = furnitureFootprint(f, scale).map(projectPt);
    const minDist = Math.min(...corners.map(c => c.distM));
    if (minDist > .95) continue;
    const u0 = Math.max(0, Math.min(...corners.map(c => c.uM)));
    const u1 = Math.min(lengthM, Math.max(...corners.map(c => c.uM)));
    if (u1 - u0 < .04) continue;
    const bottomM = f.elevation ?? 0;
    furniture.push({
      id: f.id,
      kind: f.kind,
      label: f.label,
      color: f.color,
      u0,
      u1,
      bottomM,
      topM: Math.min(project.ceilingHeight, bottomM + f.height),
      distM: minDist,
    });
  }
  furniture.sort((a, b) => b.distM - a.distM);

  const electrical: ElevationElectrical[] = [];
  for (const pt of variant.electrical.points) {
    if (pt.roomId !== roomId) continue;
    const p = projectPt([pt.x, pt.z]);
    if (p.distM <= .42 && p.uM >= -.05 && p.uM <= lengthM + .05) {
      electrical.push({
        id: pt.id,
        type: pt.type,
        label: pt.label,
        u: Math.max(0, Math.min(lengthM, p.uM)),
        heightM: pt.height,
      });
    }
  }

  const engineering: ElevationEngineering[] = [];
  for (const it of variant.engineering?.items ?? []) {
    if (it.roomId !== roomId) continue;
    const p = projectPt([it.x, it.z]);
    if (p.distM <= .55 && p.uM >= -.05 && p.uM <= lengthM + .05) {
      const heightM = it.type === 'ac' ? Math.min(project.ceilingHeight - .25, 2.45) : it.type === 'radiator' ? .45 : it.type === 'manifold' ? 1.1 : .5;
      engineering.push({
        id: it.id,
        type: it.type,
        label: it.label,
        u: Math.max(0, Math.min(lengthM, p.uM)),
        heightM,
      });
    }
  }

  return {
    wallIndex,
    roomId,
    title: wallTitle(project, rw),
    lengthM,
    ceilingM: project.ceilingHeight,
    skirtingM: variant.skirtingHeight ?? .08,
    openings,
    furniture,
    electrical,
    engineering,
  };
}
