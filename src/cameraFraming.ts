import * as THREE from 'three';
import { type Project, furnitureFootprint } from './model';
export function apartmentFramePoints(project: Project): THREE.Vector3[] {

  const points = project.rooms.flatMap(room => room.polygon.flatMap(([x, z]) => [new THREE.Vector3(x * project.scale, 0, z * project.scale), new THREE.Vector3(x * project.scale, 1.18, z * project.scale)]));

  for (const furniture of project.variants.find(v => v.id === project.activeVariantId)!.furniture) {
    for (const [x, z] of furnitureFootprint(furniture, project.scale))
      points.push(new THREE.Vector3(x * project.scale, furniture.height, z * project.scale))
  }

  return points;
}
/** Fit actual apartment points to the current perspective viewport, leaving toolbar/footer space. */
export function frameApartment(camera: THREE.PerspectiveCamera, project: Project): THREE.Vector3 {

  const points = apartmentFramePoints(project);

  const bounds = new THREE.Box3().setFromPoints(points);

  const target = bounds.getCenter(new THREE.Vector3());

  const direction = new THREE.Vector3(.6, 1.18, 1.05).normalize();

  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();

  const up = new THREE.Vector3().crossVectors(direction, right).normalize();

  const h = points.map(p => p.clone().sub(target).dot(right)), v = points.map(p => p.clone().sub(target).dot(up));

  target.addScaledVector(right, (Math.min(...h) + Math.max(...h)) / 2);

  target.addScaledVector(up, (Math.min(...v) + Math.max(...v)) / 2);

  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

  let distance = 3;

  for (const point of points) {
    const relative = point.clone().sub(target), depth = relative.dot(direction);
    distance = Math.max(distance, Math.abs(relative.dot(right)) / (tan * camera.aspect * .86) + depth, Math.abs(relative.dot(up)) / (tan * .78) + depth)
  }

  camera.position.copy(target).addScaledVector(direction, distance);

  camera.rotation.order = 'XYZ';

  camera.lookAt(target);

  camera.updateMatrixWorld(true);

  return target;
}
