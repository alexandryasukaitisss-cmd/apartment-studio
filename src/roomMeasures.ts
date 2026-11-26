import { type Furniture, type Material, type Opening, type Point, type Project, type Surface, type Wall, footprintOverlap, furnitureFootprint } from './model';
import { wallFaceSpans } from './wallSides';

const accusativeMap: Record<string, string> = {
  bed1: 'в спальню',
  bath1: 'в ванную',
  bath2: 'в санузел',
  corridor: 'в коридор',
  closet: 'в гардеробную',
  bed2: 'в детскую',
  living: 'в кухню-гостиную',
  entry: 'в прихожую',
  bed3: 'в кабинет',
  balcony: 'на балкон',
};

export function roomAccusative(roomId: string, fallbackName: string): string {
  return accusativeMap[roomId] ?? `в ${fallbackName.toLowerCase()}`;
}

export function defaultPresetForRoom(roomId: string): string {
  switch (roomId) {
    case 'bath1': return 'Раковина 80';
    case 'bath2': return 'Стиральная машина 60';
    case 'living': return 'Диван прямой 220';
    case 'entry':
    case 'corridor':
    case 'closet': return 'Шкаф 150';
    case 'bed3': return 'Письменный стол';
    case 'balcony': return 'Стул';
    default: return 'Кровать 160 × 200';
  }
}

const FLOOR_ONLY_IDS = new Set(['laminate', 'vinyl', 'parquet', 'oak', 'smoked']);
const WALL_ONLY_IDS = new Set(['wallpaper', 'paint', 'plaster']);
const CEILING_PREF_IDS = new Set(['white']);

export function materialSurfaces(material: Pick<Material, 'id' | 'pattern' | 'name' | 'image'>): Surface[] {
  if (material.image) return ['floor', 'walls', 'ceiling'];
  if (material.id === 'wallpaper' || /обои/i.test(material.name)) return ['walls'];
  if (material.id === 'paint' || material.id === 'plaster' || /краск|штукатурк/i.test(material.name)) return ['walls', 'ceiling'];
  if (material.id === 'white') return ['ceiling', 'walls'];
  if (FLOOR_ONLY_IDS.has(material.id) || /ламинат|винил|паркет|инженерная доска/i.test(material.name)) return ['floor', 'walls'];
  if (material.id === 'green') return ['walls', 'floor'];
  if (material.pattern === 'tile' || material.pattern === 'stone') return ['floor', 'walls'];
  return ['floor', 'walls', 'ceiling'];
}

/**
 * Returns the intended surface if a material clearly belongs to another surface
 * (e.g. clicking "Обои льняные" while on the "Пол" tab should switch to "Стены комнаты").
 */
export function smartMaterialSurface(material: Pick<Material, 'id' | 'pattern' | 'name' | 'image'>, current: Surface): Surface {
  if (material.image) return current;
  if (current === 'floor' && (WALL_ONLY_IDS.has(material.id) || /обои|краск|штукатурк/i.test(material.name))) {
    return 'walls';
  }
  if (current === 'ceiling' && (FLOOR_ONLY_IDS.has(material.id) || material.pattern === 'tile' || material.pattern === 'wood' || /ламинат|винил|паркет|плитк|керамогранит/i.test(material.name))) {
    return 'floor';
  }
  if (current === 'floor' && CEILING_PREF_IDS.has(material.id)) {
    return 'ceiling';
  }
  return current;
}

export interface RoomOffsets {
  leftCm: number;
  rightCm: number;
  topCm: number;
  bottomCm: number;
  roomWidthCm: number;
  roomDepthCm: number;
}

export function pointRoomOffsets(project: Project, roomId: string, x: number, z: number): RoomOffsets | null {
  const room = project.rooms.find(r => r.id === roomId);
  if (!room) return null;
  const xs = room.polygon.map(pt => pt[0]), zs = room.polygon.map(pt => pt[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const toCm = (m: number) => Math.max(0, Math.round(m * project.scale * 100));
  return {
    leftCm: toCm(x - minX),
    rightCm: toCm(maxX - x),
    topCm: toCm(z - minZ),
    bottomCm: toCm(maxZ - z),
    roomWidthCm: toCm(maxX - minX),
    roomDepthCm: toCm(maxZ - minZ),
  };
}

export function furnitureRoomClearances(project: Project, f: Furniture): RoomOffsets | null {
  const room = project.rooms.find(r => r.id === f.roomId);
  if (!room) return null;
  const xs = room.polygon.map(pt => pt[0]), zs = room.polygon.map(pt => pt[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const corners = furnitureFootprint(f, project.scale);
  const fx0 = Math.min(...corners.map(pt => pt[0])), fx1 = Math.max(...corners.map(pt => pt[0]));
  const fz0 = Math.min(...corners.map(pt => pt[1])), fz1 = Math.max(...corners.map(pt => pt[1]));
  const toCm = (m: number) => Math.max(0, Math.round(m * project.scale * 100));
  return {
    leftCm: toCm(fx0 - minX),
    rightCm: toCm(maxX - fx1),
    topCm: toCm(fz0 - minZ),
    bottomCm: toCm(maxZ - fz1),
    roomWidthCm: toCm(maxX - minX),
    roomDepthCm: toCm(maxZ - minZ),
  };
}

export function furnitureCoordsFromRoomOffset(project: Project, f: Furniture, offset: { leftCm?: number; topCm?: number }): { x?: number; z?: number } {
  const room = project.rooms.find(r => r.id === f.roomId);
  if (!room) return {};
  const xs = room.polygon.map(pt => pt[0]), zs = room.polygon.map(pt => pt[1]);
  const minX = Math.min(...xs), minZ = Math.min(...zs);
  const angle = f.rotation * Math.PI / 180;
  const rx = (Math.abs(Math.cos(angle)) * f.width + Math.abs(Math.sin(angle)) * f.depth) / 2 / project.scale;
  const rz = (Math.abs(Math.sin(angle)) * f.width + Math.abs(Math.cos(angle)) * f.depth) / 2 / project.scale;
  return {
    ...(offset.leftCm !== undefined ? { x: minX + offset.leftCm / 100 / project.scale + rx } : {}),
    ...(offset.topCm !== undefined ? { z: minZ + offset.topCm / 100 / project.scale + rz } : {}),
  };
}

export interface DoorSwingGeometry {
  hx: number; hy: number;
  cx: number; cy: number;
  ox: number; oy: number;
  radius: number;
  sweep: 0 | 1;
  sign: 1 | -1;
  hinge: 'start' | 'end';
  swingRoomId: string | null;
  sectorPoly: Point[];
}

export function defaultDoorSwingSign(project: Project, wall: Wall, opening: Opening): 1 | -1 {
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  if (!len) return 1;
  const mid = (opening.start + opening.end) / 2;
  const span = wallFaceSpans(wall, project, 0, len).find(s => mid >= s.start - 1e-6 && mid <= s.end + 1e-6);
  const enclosed = ['bath1', 'bath2', 'closet', 'bed1', 'bed2', 'bed3', 'balcony'];
  if (!span?.positive && span?.negative) return -1;
  if (span?.positive && !span?.negative) return 1;
  if (span?.negative && enclosed.includes(span.negative) && !['bath1', 'bath2', 'closet'].includes(span?.positive ?? '')) return -1;
  return 1;
}

export function doorSwingInfo(project: Project, wall: Wall, opening: Opening): DoorSwingGeometry | null {
  if (opening.kind !== 'door') return null;
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  if (!len) return null;
  const ux = (wall.b[0] - wall.a[0]) / len, uz = (wall.b[1] - wall.a[1]) / len;
  const nx = -uz, nz = ux;
  const sign = opening.swing ?? defaultDoorSwingSign(project, wall, opening);
  const hinge = opening.hinge ?? 'start';
  const r = opening.end - opening.start;
  const sx = wall.a[0] + ux * opening.start, sy = wall.a[1] + uz * opening.start;
  const ex = wall.a[0] + ux * opening.end, ey = wall.a[1] + uz * opening.end;
  const hx = hinge === 'start' ? sx : ex, hy = hinge === 'start' ? sy : ey;
  const cx = hinge === 'start' ? ex : sx, cy = hinge === 'start' ? ey : sy;
  const ox = hx + nx * sign * r, oy = hy + nz * sign * r;
  // Cross product of (open - hinge) x (closed - hinge) determines SVG arc sweep flag.
  const v1x = ox - hx, v1y = oy - hy, v2x = cx - hx, v2y = cy - hy;
  const cross = v1x * v2y - v1y * v2x;
  const sweep: 0 | 1 = cross >= 0 ? 1 : 0;

  const mid = (opening.start + opening.end) / 2;
  const span = wallFaceSpans(wall, project, 0, len).find(s => mid >= s.start - 1e-6 && mid <= s.end + 1e-6);
  const swingRoomId = sign > 0 ? (span?.positive ?? null) : (span?.negative ?? null);

  // Convex 6-point polygon approximating the 90-degree door swing sector (slightly inset by 3 cm so door frames/flush walls don't false-trigger).
  const inset = Math.max(.05, r - .03);
  const dirX = hinge === 'start' ? ux : -ux, dirZ = hinge === 'start' ? uz : -uz;
  const sectorPoly: Point[] = [[hx + nx * sign * .03, hy + nz * sign * .03]];
  for (let step = 0; step <= 4; step++) {
    const theta = (step / 4) * (Math.PI / 2);
    const cos = Math.cos(theta), sin = Math.sin(theta);
    sectorPoly.push([
      hx + (dirX * cos + nx * sign * sin) * inset,
      hy + (dirZ * cos + nz * sign * sin) * inset,
    ]);
  }
  return { hx, hy, cx, cy, ox, oy, radius: r, sweep, sign, hinge, swingRoomId, sectorPoly };
}

export interface DoorSwingConflict {
  wallIndex: number;
  openingIndex: number;
  furnitureId?: string;
  otherDoor?: { wallIndex: number; openingIndex: number };
  roomId: string | null;
}

export function doorSwingConflicts(project: Project, furniture: Furniture[]): DoorSwingConflict[] {
  const conflicts: DoorSwingConflict[] = [];
  const doors: { wallIndex: number; openingIndex: number; geom: DoorSwingGeometry }[] = [];
  project.walls.forEach((w, wallIndex) => {
    (w.openings ?? []).forEach((o, openingIndex) => {
      const geom = doorSwingInfo(project, w, o);
      if (geom) doors.push({ wallIndex, openingIndex, geom });
    });
  });

  for (const d of doors) {
    for (const f of furniture) {
      if (f.kind === 'platform' || f.kind === 'rug' || f.kind === 'person' || f.kind === 'curtains' || (f.elevation ?? 0) >= 2.05) continue;
      if (d.geom.swingRoomId && f.roomId !== d.geom.swingRoomId) continue;
      if (footprintOverlap(d.geom.sectorPoly, furnitureFootprint(f, project.scale, .02))) {
        conflicts.push({ wallIndex: d.wallIndex, openingIndex: d.openingIndex, furnitureId: f.id, roomId: f.roomId });
      }
    }
  }
  for (let i = 0; i < doors.length; i++) {
    for (let j = i + 1; j < doors.length; j++) {
      const a = doors[i], b = doors[j];
      if (a.geom.swingRoomId && b.geom.swingRoomId && a.geom.swingRoomId !== b.geom.swingRoomId) continue;
      if (footprintOverlap(a.geom.sectorPoly, b.geom.sectorPoly)) {
        conflicts.push({
          wallIndex: a.wallIndex, openingIndex: a.openingIndex,
          otherDoor: { wallIndex: b.wallIndex, openingIndex: b.openingIndex },
          roomId: a.geom.swingRoomId ?? b.geom.swingRoomId,
        });
      }
    }
  }
  return conflicts;
}

export const measurementChecklistItems = [
  { key: 'walls', label: 'Длины всех стен и простенков (лазерная рулетка)' },
  { key: 'diagonals', label: 'Диагонали и прямые углы (90° для мебели и кухни)' },
  { key: 'ceiling', label: 'Высота потолка в 3 точках (перепад плиты)' },
  { key: 'openings', label: 'Ширина, высота и отступы дверных проёмов' },
  { key: 'sills', label: 'Высота подоконников, откосов и радиаторов' },
  { key: 'risers', label: 'Выступы стояков, вентшахт и ввод электрики' },
] as const;
