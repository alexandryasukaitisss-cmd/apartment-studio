import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createProject, resizeRoom } from '../src/model';
import { frameApartment, apartmentFramePoints } from '../src/cameraFraming';
test('camera fits every apartment point across desktop and narrow canvas aspect ratios', () => {
  for (const aspect of [746 / 643, 944 / 944, 390 / 670, .6, 2]) {
    const project = createProject();
    const camera = new THREE.PerspectiveCamera(42, aspect, .04, 150);
    frameApartment(camera, project);
    camera.updateProjectionMatrix();
    for (const point of apartmentFramePoints(project)) {
      const p = point.clone().project(camera);
      assert.ok(Math.abs(p.x) <= .86001, `aspect ${aspect} x ${p.x}`);
      assert.ok(Math.abs(p.y) <= .78001, `aspect ${aspect} y ${p.y}`);
      assert.ok(p.z > -1 && p.z < 1)
    }
  }
});
test('camera reset also accommodates user-modified apartment dimensions', () => {
  const p = createProject();
  resizeRoom(p, 'living', 0, 4.7);
  p.scale = 1.2;
  const camera = new THREE.PerspectiveCamera(42, 1, .04, 150);
  frameApartment(camera, p);
  camera.updateProjectionMatrix();
  for (const pt of apartmentFramePoints(p)) {
    const screen = pt.clone().project(camera);
    assert.ok(Math.abs(screen.x) <= .86001 && Math.abs(screen.y) <= .78001)
  }
});
