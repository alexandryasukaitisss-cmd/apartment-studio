import { type Point, type Project, type Variant, center, canWalk, inside, furnitureFootprint } from './model';

export const OVERVIEW_FOV = 42;
export const WALK_FOV = 74;

/** Start on a free perimeter point and face the room interior instead of the nearest wall. */
export function roomWalkView(project: Project, variant: Variant, roomId: string) {
  const room = project.rooms.find(r => r.id === roomId)!;
  const target = center(room);
  const xs = room.polygon.map(p => p[0]);
  const zs = room.polygon.map(p => p[1]);
  const furniture = variant.furniture.filter(f => f.roomId === roomId && f.kind !== 'platform' && (f.elevation ?? 0) < 1.72 && (f.elevation ?? 0) + f.height > .1);
  const candidates: Point[] = [];
  for (let x = Math.min(...xs) + .26; x < Math.max(...xs) - .2; x += .2) {
    for (let z = Math.min(...zs) + .26; z < Math.max(...zs) - .2; z += .2) {
      const point: Point = [x, z];
      if (!inside(point, room.polygon) || !canWalk(point, project)) continue;
      if (furniture.some(f => inside(point, furnitureFootprint({ ...f, width: f.width + .22, depth: f.depth + .22 }, project.scale)))) continue;
      candidates.push(point);
    }
  }
  // Bias toward the lower side of the photo so the entry view looks across the room.
  candidates.sort((a, b) => {
    const score = (p: Point) => Math.hypot(p[0] - target[0], p[1] - target[1]) + (p[1] - target[1]) * .18;
    return score(b) - score(a);
  });
  const point = candidates[0] ?? target;
  return {
    point,
    yaw: Math.atan2(-(target[0] - point[0]), -(target[1] - point[1])),
    pitch: -.14,
    eyeHeight: 1.6,
    fov: WALK_FOV,
  };
}
