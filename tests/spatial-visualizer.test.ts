import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  HUMAN_EYE_HEIGHT_M,
  HUMAN_HEIGHT_M,
  addElectricalPoint,
  addEngineeringItem,
  boundFurniture,
  blocksWalking,
  createProject,
  doorwayObstructions,
  furnitureOverlaps,
  makeFurniture,
  parseProject,
  passageWarnings,
  upsertHeatedFloorZone,
  type Kind,
} from '../src/model';
import { furnitureMesh } from '../src/furniture';
import { applyStylePreset, stylePresets } from '../src/stylePresets';
import { commitProjectEdit, undoProject } from '../src/projectEdits';
import { buildWallElevation, lifeZonePolygons, roomPresetViewpoints } from '../src/viewpoints';
import { buildRenovationRoadmap } from '../src/renovationRoadmap';
import {
  buildDoorAssemblies,
  buildElectricalAndEngineering3D,
  buildLifeZones3D,
  buildSkirtingBoards,
  buildWindowCurtains,
} from '../src/sceneArchitecture';
import { disposeObjects } from '../src/sceneRendering';
import { buildRenovationBriefHtml } from '../src/renovationExport';
import { roomWalls } from '../src/openings';
import WallElevation from '../src/WallElevation';
import RoadmapPanel from '../src/RoadmapPanel';

const newKinds: Kind[] = ['rug', 'mirror', 'curtains', 'nightstand', 'tvstand', 'upper_cabinet', 'pantry', 'island', 'person', 'custom_glb'];

test('186 cm human scale figure has exact height 1.86 m, eye height 1.74 m, and causes no false collision warnings', () => {
  assert.equal(HUMAN_HEIGHT_M, 1.86);
  assert.equal(HUMAN_EYE_HEIGHT_M, 1.74);
  const project = createProject();
  const variant = project.variants[0];
  const sofa = variant.furniture.find(f => f.roomId === 'living' && f.kind === 'sofa')!;
  const person = boundFurniture(makeFurniture('person', 'living', sofa.x, sofa.z), project);
  assert.equal(person.height, 1.86);
  assert.equal(blocksWalking(person), false);
  variant.furniture.push(person);
  assert.equal(furnitureOverlaps(project, variant.furniture).some(o => o.a.id === person.id || o.b.id === person.id), false);
  assert.equal(doorwayObstructions(project, variant.furniture).some(d => d.furnitureId === person.id), false);
  assert.equal(passageWarnings(project, variant.furniture).some(w => w.a.id === person.id || w.b.id === person.id), false);
  const reparsed = parseProject(JSON.stringify(project));
  assert.equal(reparsed.variants[0].furniture.find(f => f.id === person.id)?.height, 1.86);
});

test('all 10 new furniture kinds match declared 3D envelopes and serialize cleanly in v1 format', () => {
  const project = createProject();
  const variant = project.variants[0];
  variant.furniture = [];
  for (const kind of newKinds) {
    const f = boundFurniture(makeFurniture(kind, 'living', 4.5, 9.0), project);
    const mesh = furnitureMesh(f);
    try {
      const bounds = new THREE.Box3().setFromObject(mesh, true);
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok(Math.abs(size.x - f.width) < 1e-4, `${kind} width`);
      assert.ok(Math.abs(size.y - f.height) < 1e-4, `${kind} height`);
      assert.ok(Math.abs(size.z - f.depth) < 1e-4, `${kind} depth`);
      assert.ok(Math.abs(bounds.min.y - (f.elevation ?? 0)) < 1e-4, `${kind} elevation`);
    } finally {
      disposeObjects(mesh);
    }
    variant.furniture.push(f);
  }
  const reparsed = parseProject(JSON.stringify(project));
  assert.equal(reparsed.variants[0].furniture.length, newKinds.length);
});

test('1-click style presets apply across all rooms atomically and undo cleanly in one step', () => {
  const initial = createProject();
  const history = { past: [], future: [] };
  let current = initial;
  for (const sp of stylePresets) {
    const next = commitProjectEdit(current, history, p => { applyStylePreset(p, sp.id); });
    const v = next.variants[0];
    assert.equal(v.doorColor, sp.doorColor);
    assert.equal(v.doorStyle, sp.doorStyle);
    assert.equal(v.skirtingColor, sp.skirtingColor);
    assert.equal(v.skirtingHeight, sp.skirtingHeight);
    assert.ok(parseProject(JSON.stringify(next)));
    current = undoProject(next, history);
    assert.deepEqual(current.variants[0].finishes, initial.variants[0].finishes);
  }
});

test('roomPresetViewpoints generates life viewpoints including sofa-to-TV and 174 cm standing height', () => {
  const project = createProject();
  const variant = project.variants[0];
  variant.furniture.push(boundFurniture(makeFurniture('television', 'living', 6.4, 10.5), project));
  const views = roomPresetViewpoints(project, variant, 'living', HUMAN_EYE_HEIGHT_M);
  assert.ok(views.some(v => v.name.includes('входа')), 'has entry view');
  assert.ok(views.some(v => v.name.includes('окна')), 'has window view');
  assert.ok(views.some(v => v.name === 'С дивана на ТВ' && v.eyeHeight === 1.15), 'has seated sofa-to-TV view');
  assert.ok(views.some(v => v.name === 'На кухню' && v.eyeHeight === HUMAN_EYE_HEIGHT_M), 'has kitchen view at 174 cm eye height');
});

test('lifeZonePolygons creates clearance, seating, and TV viewing cone polygons', () => {
  const project = createProject();
  const variant = project.variants[0];
  variant.furniture.push(boundFurniture(makeFurniture('television', 'living', 6.3, 10.2), project));
  const zones = lifeZonePolygons(project, variant);
  assert.ok(zones.some(z => z.kind === 'clearance'), 'has appliance/wardrobe opening clearance');
  assert.ok(zones.some(z => z.kind === 'seating'), 'has dining chair pull-out zone');
  assert.ok(zones.some(z => z.kind === 'tv_cone'), 'has TV viewing cone');
});

test('buildWallElevation projects openings, electrical points, and furniture with exact cm heights', () => {
  const project = createProject();
  const variant = project.variants[0];
  const livingWalls = roomWalls(project, 'living');
  const northWall = livingWalls[0];
  const pt = addElectricalPoint(project, 'living', 'socket');
  pt.x = (northWall.wall.a[0] + northWall.wall.b[0]) / 2;
  pt.z = northWall.wall.a[1] + .08;
  pt.height = .32;
  pt.label = 'Фартук';
  const elev = buildWallElevation(project, variant, 'living', northWall.index);
  assert.ok(elev);
  assert.ok(elev.lengthM > 1);
  assert.equal(elev.ceilingM, project.ceilingHeight);
  assert.ok(elev.electrical.some(e => e.id === pt.id && Math.abs(e.heightM - .32) < 1e-6));
  const svgMarkup = renderToStaticMarkup(createElement(WallElevation, {
    project, variant, roomId: 'living', initialWallIndex: northWall.index, onClose: () => {},
  }));
  assert.match(svgMarkup, /Развёртка стены/);
  assert.match(svgMarkup, /186 см/);
  assert.match(svgMarkup, /32 см/);
});

test('renovation stages build and dispose 3D doors, skirting, curtains, electrical, and life zones cleanly', () => {
  const project = createProject();
  const variant = project.variants[0];
  addElectricalPoint(project, 'living', 'socket');
  addEngineeringItem(project, 'living', 'radiator');
  upsertHeatedFloorZone(project, 'bath1', 2.8, 150);

  const shellDoors = buildDoorAssemblies(project, variant, 'shell', 'walk');
  const finishedDoors = buildDoorAssemblies(project, variant, 'furnished', 'walk');
  assert.ok(finishedDoors.children.length > shellDoors.children.length, 'finished stage adds 3D door leaves & casings');
  disposeObjects(shellDoors);
  disposeObjects(finishedDoors);

  const shellSkirt = buildSkirtingBoards(project, variant, 'shell');
  const finSkirt = buildSkirtingBoards(project, variant, 'finishes');
  assert.equal(shellSkirt.children.length, 0);
  assert.ok(finSkirt.children.length > 0);
  disposeObjects(shellSkirt);
  disposeObjects(finSkirt);

  const curtains = buildWindowCurtains(project, 'furnished', 'walk');
  assert.ok(curtains.children.length > 0);
  disposeObjects(curtains);

  const roughElec = buildElectricalAndEngineering3D(project, variant, 'rough', false);
  assert.ok(roughElec.children.length >= 3, 'renders electrical socket, radiator, and heated floor overlay');
  disposeObjects(roughElec);

  const zones3d = buildLifeZones3D(project, variant);
  assert.ok(zones3d.children.length > 0);
  disposeObjects(zones3d);
});

test('renovation roadmap builds 7 ordered stages linked to project data and renders in UI and HTML export', () => {
  const project = createProject();
  const variant = project.variants[0];
  variant.roadmap = { partitions: 'done', electrical_engineering: 'in_progress' };
  const steps = buildRenovationRoadmap(project, variant, 10);
  assert.equal(steps.length, 7);
  assert.equal(steps[0].status, 'done');
  assert.equal(steps[1].status, 'in_progress');
  assert.equal(steps[2].status, 'todo');

  const uiMarkup = renderToStaticMarkup(createElement(RoadmapPanel, { project, variant, reserve: 10 }));
  assert.match(uiMarkup, /Этапы ремонта \(1 из 7 готово\)/);
  assert.match(uiMarkup, /Двери и плинтусы/);

  const html = buildRenovationBriefHtml(project, variant, 10);
  assert.match(html, /Этапы ремонта \(дорожная карта\)/);
  assert.match(html, /Перегородки и проёмы/);
});
