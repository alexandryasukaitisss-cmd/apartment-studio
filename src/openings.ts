import { type Project, type Wall, solidSpans } from './model';
import { wallFaceSpans } from './wallSides';

export type OpeningKind = 'door' | 'window';
export interface OpeningInfo { index: number; wall: Wall; length: number; faceStart: number; faceEnd: number; faceLength: number; otherRooms: string[] }
export interface RoomOpening { wallIndex: number; openingIndex: number; opening: NonNullable<Wall['openings']>[number]; wall: Wall; length: number; faceStart: number; faceEnd: number; faceLength: number; localStart: number; otherRoom?: string }
export interface OpeningLimits { minStart: number; maxStart: number; maxWidth: number }

export const openingNames: Record<OpeningKind, string> = { door: 'Дверь', window: 'Окно' };
export const openingWidthRange: Record<OpeningKind, [number, number]> = { door: [.5, 1.5], window: [.3, 6] };
export const defaultOpeningWidth: Record<OpeningKind, number> = { door: .9, window: 1.4 };
const fmt = (n: number) => n.toFixed(2).replace('.', ',');

export function wallLength(wall: Wall): number {
  return Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
}

/** Bounds along the wall [start, end] that actually belong to the specified room. */
export function roomWallBounds(project: Project, wall: Wall, roomId?: string): [number, number] {
  const length = wallLength(wall);
  if (!roomId || !length) return [0, length];
  const faces = wallFaceSpans(wall, project, 0, length).filter(s => s.positive === roomId || s.negative === roomId);
  if (!faces.length) return [0, length];
  return [Math.min(...faces.map(s => s.start)), Math.max(...faces.map(s => s.end))];
}

/** Walls that bound a room, in project order, with the rooms on the other side. */
export function roomWalls(project: Project, roomId: string): OpeningInfo[] {
  return project.walls.flatMap((wall, index) => {
    const length = wallLength(wall);
    if (!wall.rooms.includes(roomId) || length < 1e-6) return [];
    const [faceStart, faceEnd] = roomWallBounds(project, wall, roomId);
    return [{ index, wall, length, faceStart, faceEnd, faceLength: faceEnd - faceStart, otherRooms: wall.rooms.filter(id => id !== roomId) }];
  });
}

export function wallTitle(project: Project, info: Pick<OpeningInfo, 'otherRooms' | 'length'> & { faceLength?: number }): string {
  const neighbours = info.otherRooms.map(id => project.rooms.find(r => r.id === id)?.name).filter(Boolean);
  return `${neighbours.length ? neighbours.join(', ') : 'наружная стена'} · ${fmt(info.faceLength ?? info.length)} м`;
}

/** Openings that actually face this room, not every opening on every bounding wall. */
export function roomOpenings(project: Project, roomId: string): RoomOpening[] {
  const result: RoomOpening[] = [];
  project.walls.forEach((wall, wallIndex) => {
    const length = wallLength(wall);
    if (!length || !wall.rooms.includes(roomId)) return;
    const spans = wallFaceSpans(wall, project, 0, length);
    const [faceStart, faceEnd] = roomWallBounds(project, wall, roomId);
    const faceLength = faceEnd - faceStart;
    (wall.openings ?? []).forEach((opening, openingIndex) => {
      const middle = (opening.start + opening.end) / 2;
      const span = spans.find(s => middle >= s.start - 1e-9 && middle <= s.end + 1e-9 && (s.positive === roomId || s.negative === roomId));
      if (!span) return;
      const other = span.positive === roomId ? span.negative : span.positive;
      result.push({ wallIndex, openingIndex, opening, wall, length, faceStart, faceEnd, faceLength, localStart: Math.max(0, opening.start - faceStart), ...(other ? { otherRoom: other } : {}) });
    });
  });
  return result;
}
export function roomOpeningTitle(project: Project, info: Pick<RoomOpening, 'otherRoom' | 'length'> & { faceLength?: number }): string {
  const other = info.otherRoom ? project.rooms.find(r => r.id === info.otherRoom)?.name : undefined;
  return `${other ?? 'наружная стена'} · ${fmt(info.faceLength ?? info.length)} м`;
}

function limitsFor(wall: Wall, start: number, end: number, bounds: [number, number] = [0, wallLength(wall)]): OpeningLimits {
  const others = wall.openings ?? [];
  const left = others.filter(o => o.end <= start + 1e-9).reduce((n, o) => Math.max(n, o.end), bounds[0]);
  const right = others.filter(o => o.start >= end - 1e-9).reduce((n, o) => Math.min(n, o.start), bounds[1]);
  return { minStart: left, maxStart: right - (end - start), maxWidth: right - start };
}

/** Editable bounds for one opening; neighbour openings and room wall ends are hard limits. */
export function openingLimits(project: Project, wallIndex: number, openingIndex: number, roomId?: string): OpeningLimits {
  const wall = project.walls[wallIndex];
  const opening = wall?.openings?.[openingIndex];
  if (!wall || !opening) throw Error('Проём не найден.');
  return limitsFor(wall, opening.start, opening.end, roomWallBounds(project, wall, roomId));
}

export function addOpening(project: Project, wallIndex: number, kind: OpeningKind, requestedWidth = defaultOpeningWidth[kind], roomId?: string): number {
  const wall = project.walls[wallIndex];
  if (!wall) throw Error('Стена не найдена.');
  const length = wallLength(wall);
  if (length < .2) throw Error('Слишком короткая стена для проёма.');
  const [min, max] = openingWidthRange[kind];
  const width = Math.min(Math.max(requestedWidth, min), max);
  // When a room is given, only its own faces are candidates; a shared wall may belong to several rooms.
  const faces = roomId ? wallFaceSpans(wall, project, 0, length).filter(s => s.positive === roomId || s.negative === roomId) : [{ start: 0, end: length }];
  const gaps = solidSpans(wall).flatMap(([start, end]) => faces
    .map(face => [Math.max(start, face.start), Math.min(end, face.end)] as [number, number])
    .filter(([a, b]) => b - a > 1e-6)).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const gap = gaps[0];
  if (!gap || gap[1] - gap[0] < width + .06)
    throw Error('На этой стене нет свободного места для проёма такой ширины.');
  const opening = { start: gap[0] + (gap[1] - gap[0] - width) / 2, end: 0, kind } as { start: number; end: number; kind: OpeningKind };
  opening.end = opening.start + width;
  wall.openings = [...(wall.openings ?? []), opening].sort((a, b) => a.start - b.start);
  return wall.openings.indexOf(opening);
}

export function updateOpening(project: Project, wallIndex: number, openingIndex: number, patch: Partial<{ start: number; end: number; kind: OpeningKind; hinge: 'start' | 'end'; swing: 1 | -1; sillHeight: number; headHeight: number }>, roomId?: string): void {
  const wall = project.walls[wallIndex];
  const opening = wall?.openings?.[openingIndex];
  if (!wall || !opening) throw Error('Проём не найден.');
  const next = { ...opening, ...patch };
  const [boundStart, boundEnd] = roomWallBounds(project, wall, roomId);
  if (!['door', 'window'].includes(next.kind))
    throw Error('Неизвестный тип проёма.');
  const [min, max] = openingWidthRange[next.kind];
  const width = next.end - next.start;
  if (!Number.isFinite(next.start) || !Number.isFinite(next.end) || next.start < boundStart - 1e-9 || next.end > boundEnd + 1e-9)
    throw Error('Проём выходит за пределы стены.');
  if (width < min - 1e-9 || width > max + 1e-9)
    throw Error(next.kind === 'door' ? 'Ширина двери — от 50 до 150 см.' : 'Ширина окна — от 30 до 600 см.');
  if (next.sillHeight !== undefined && (!Number.isFinite(next.sillHeight) || next.sillHeight < 0 || next.sillHeight > project.ceilingHeight - .3))
    throw Error('Высота подоконника должна быть от 0 см и ниже потолка.');
  if (next.headHeight !== undefined && (!Number.isFinite(next.headHeight) || next.headHeight < 1.2 || next.headHeight > project.ceilingHeight))
    throw Error('Верх проёма должен быть от 120 см до высоты потолка.');
  if (next.kind === 'window' && (next.sillHeight ?? .72) >= (next.headHeight ?? 2.15) - .2)
    throw Error('Подоконник должен быть ниже верха окна минимум на 20 см.');
  if ((wall.openings ?? []).some((other, i) => i !== openingIndex && other.end > next.start + 1e-9 && other.start < next.end - 1e-9))
    throw Error('Проёмы на одной стене не должны пересекаться.');
  wall.openings![openingIndex] = next;
  wall.openings!.sort((a, b) => a.start - b.start);
}

export function removeOpening(project: Project, wallIndex: number, openingIndex: number): void {
  const wall = project.walls[wallIndex];
  if (!wall?.openings?.[openingIndex]) throw Error('Проём не найден.');
  wall.openings.splice(openingIndex, 1);
  if (!wall.openings.length) delete wall.openings;
}
