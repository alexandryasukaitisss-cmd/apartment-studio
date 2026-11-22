import type { Project } from './model';
import type { SceneContextTarget } from './Scene';

export function validContextTarget(project: Project, target: SceneContextTarget): boolean {
  if (![target.x, target.z, target.clientX, target.clientY].every(Number.isFinite) || !project.rooms.some(r => r.id === target.roomId)) return false;
  if (target.furnitureId) return !target.surface && !!project.variants.find(v => v.id === project.activeVariantId)?.furniture.some(f => f.id === target.furnitureId && f.roomId === target.roomId);
  return !!target.surface && ['floor', 'walls', 'ceiling'].includes(target.surface);
}

export function contextMenuPosition(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const margin = 8;
  return { left: Math.max(margin, Math.min(x, viewportWidth - width - margin)), top: Math.max(margin, Math.min(y, viewportHeight - height - margin)) };
}
