import * as THREE from 'three';

export type Surface = 'floor' | 'walls' | 'ceiling';
export type SurfacePick = { roomId: string; surface?: Surface; wallIndex?: number; furnitureId?: string; point: THREE.Vector3 };
/** Coordinates use the apartment model, while client coordinates position the menu. */
export type SceneContextTarget = {
  roomId: string;
  surface?: Surface;
  wallIndex?: number;
  furnitureId?: string;
  x: number;
  z: number;
  clientX: number;
  clientY: number;
};

/** Resolve the nearest drawn mesh before looking for a selectable tag.
 * Untagged wall caps, frames and exterior faces still block selection.
 */
export function visibleSurfacePick(hits: THREE.Intersection[]): SurfacePick | null {
  for (const hit of hits) {
    if (!(hit.object instanceof THREE.Mesh)) continue;
    let visible = true;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent)
      if (!o.visible) visible = false;
    const material = Array.isArray(hit.object.material)
      ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object.material;
    if (!visible || !material?.visible || (material.transparent && material.opacity === 0)) continue;
    const data = hit.object.userData;
    if (data.wallRooms) {
      const roomId = hit.face?.materialIndex === 4 ? data.wallRooms.positive
        : hit.face?.materialIndex === 5 ? data.wallRooms.negative : null;
      return roomId ? { roomId, surface: 'walls', ...(typeof data.wallIndex === 'number' ? { wallIndex: data.wallIndex } : {}), point: hit.point.clone() } : null;
    }
    if (!data.roomId) return null;
    if (data.furnitureId) return { roomId: data.roomId, furnitureId: data.furnitureId, point: hit.point.clone() };
    return { roomId: data.roomId, ...(data.surface ? { surface: data.surface } : {}), point: hit.point.clone() };
  }
  return null;
}

export function sceneContextTarget(pick: SurfacePick, root: THREE.Object3D, client: { clientX: number; clientY: number }): SceneContextTarget {
  // Use the whole root transform, including ancestors, instead of dividing by scale.
  root.updateWorldMatrix(true, false);
  const point = root.worldToLocal(pick.point.clone());
  return {
    roomId: pick.roomId,
    ...(pick.surface ? { surface: pick.surface } : {}),
    ...(typeof pick.wallIndex === 'number' ? { wallIndex: pick.wallIndex } : {}),
    ...(pick.furnitureId ? { furnitureId: pick.furnitureId } : {}),
    x: point.x, z: point.z, clientX: client.clientX, clientY: client.clientY
  };
}

export function hasPointerDragged(start: { x: number; y: number }, end: { x: number; y: number }, wasDragged: boolean): boolean {
  return wasDragged || Math.hypot(end.x - start.x, end.y - start.y) >= 5;
}

/** Once a gesture becomes a drag, returning to its start is still a drag. */
export function isSelectionClick(start: { x: number; y: number }, end: { x: number; y: number }, dragged: boolean): boolean {
  return !hasPointerDragged(start, end, dragged);
}

export function surfaceClickAction(button: number, start: { x: number; y: number }, end: { x: number; y: number }, dragged: boolean): 'select' | 'context' | null {
  if (!isSelectionClick(start, end, dragged)) return null;
  return button === 0 ? 'select' : button === 2 ? 'context' : null;
}
