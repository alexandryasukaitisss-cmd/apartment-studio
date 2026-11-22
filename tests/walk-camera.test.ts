import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, canWalk, inside, center, furnitureFootprint, makeFurniture, boundFurniture } from '../src/model';
import { roomWalkView, WALK_FOV, OVERVIEW_FOV } from '../src/walkCamera';

test('walk reset places camera in every room, clear of objects and facing its interior', () => {
  const project = createProject();
  const variant = project.variants[0];
  for (const room of project.rooms) {
    const view = roomWalkView(project, variant, room.id);
    assert.ok(inside(view.point, room.polygon), room.id);
    assert.ok(canWalk(view.point, project), room.id);
    assert.ok(!variant.furniture.filter(f => f.roomId === room.id).some(f => inside(view.point, furnitureFootprint(f))), room.id);
    const target = center(room);
    const desired = [target[0] - view.point[0], target[1] - view.point[1]];
    const forward = [-Math.sin(view.yaw), -Math.cos(view.yaw)];
    assert.ok(desired[0] * forward[0] + desired[1] * forward[1] > 0, room.id);
    assert.ok(view.pitch < 0 && view.pitch > -.3);
  }
  assert.equal(WALK_FOV, 74);
  assert.equal(OVERVIEW_FOV, 42);
});

test('walk spawn avoids appliances at eye height and permits walking below high objects at each project scale', () => {
  for (const scale of [.5, 1, 2]) {
    const project = createProject();
    project.scale = scale;
    const variant = project.variants[0];
    variant.furniture = [];
    const empty = roomWalkView(project, variant, 'living');
    // Put the screen precisely where the unobstructed helper would spawn.
    const television = boundFurniture({ ...makeFurniture('television', 'living', ...empty.point),
      width: .4, depth: .08, height: .6, elevation: 1.3 }, project);
    variant.furniture = [television];
    assert.ok(inside(empty.point, furnitureFootprint(television, scale)));
    const obstructed = roomWalkView(project, variant, 'living');
    assert.equal(obstructed.eyeHeight, 1.6);
    assert.ok(!inside(obstructed.point, furnitureFootprint(television, scale)));
    assert.ok(canWalk(obstructed.point, project));
    television.elevation = 1.8;
    assert.deepEqual(roomWalkView(project, variant, 'living'), empty, 'overhead screen allows the original spawn');
  }
});
