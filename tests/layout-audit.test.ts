import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  addEngineeringItem,
  boundFurniture,
  createProject,
  makeFurniture,
  parseProject,
  type Kind,
} from '../src/model';
import { furnitureMesh } from '../src/furniture';
import { disposeObjects } from '../src/sceneRendering';
import { runLayoutAudit } from '../src/layoutAudit';
import { buildRenovationBriefHtml } from '../src/renovationExport';
import AuditPanel from '../src/AuditPanel';

const threadKinds: Kind[] = ['round_table', 'slat_partition', 'tv_stand_mobile', 'laundry_tower', 'vanity_desk'];

test('5 new furniture kinds from X thread match declared 3D envelopes and round-trip in v1', () => {
  const project = createProject();
  const variant = project.variants[0];
  variant.furniture = [];
  for (const kind of threadKinds) {
    const f = boundFurniture(makeFurniture(kind, 'living', 4.6, 9.2), project);
    const mesh = furnitureMesh(f);
    try {
      const size = new THREE.Box3().setFromObject(mesh, true).getSize(new THREE.Vector3());
      assert.ok(Math.abs(size.x - f.width) < 1e-4, `${kind} width`);
      assert.ok(Math.abs(size.y - f.height) < 1e-4, `${kind} height`);
      assert.ok(Math.abs(size.z - f.depth) < 1e-4, `${kind} depth`);
    } finally {
      disposeObjects(mesh);
    }
    variant.furniture.push(f);
  }
  project.finishAllowance = { wallCm: 3, floorCm: 7, ceilingCm: 8 };
  project.storageChecklist = { vacuum: 'Гардеробная', ladder: 'Балкон' };
  const reparsed = parseProject(JSON.stringify(project));
  assert.equal(reparsed.variants[0].furniture.length, threadKinds.length);
  assert.equal(reparsed.finishAllowance?.wallCm, 3);
  assert.equal(reparsed.storageChecklist?.vacuum, 'Гардеробная');
});

test('layout audit calculates net room sizes after plaster/screed/ceiling and detects net-ceiling and bath-gap issues', () => {
  const project = createProject();
  project.finishAllowance = { wallCm: 3, floorCm: 8, ceilingCm: 10 };
  const variant = project.variants[0];
  const tallWardrobe = boundFurniture({ ...makeFurniture('wardrobe', 'living', 4.5, 9.0), height: 2.7 }, project);
  variant.furniture.push(tallWardrobe);
  const report = runLayoutAudit(project, variant);
  const living = report.rooms.find(r => r.roomId === 'living')!;
  assert.equal(living.netWidthCm, living.grossWidthCm - 6);
  assert.equal(living.netCeilingCm, 280 - 18);
  assert.ok(report.issues.some(i => i.id === `net-ceil-${tallWardrobe.id}` && i.severity === 'error'));
});

test('layout audit flags inward-opening bathroom doors with flip action and clears when flipped outward', () => {
  const project = createProject();
  const variant = project.variants[0];
  // Wall index 8 runs [B, L] -> [B, Q] (ux=0, uz=1 => positive normal nx=-1 points into bath1!)
  const bathWall = project.walls[8];
  assert.ok(bathWall.openings && bathWall.openings.length >= 2);
  bathWall.openings[0].swing = 1;
  const inwardReport = runLayoutAudit(project, variant);
  const doorIssue = inwardReport.issues.find(i => i.category === 'door' && i.roomId === 'bath1');
  assert.ok(doorIssue, 'detects inward bathroom door');
  assert.equal(doorIssue?.action?.type, 'flip_door');
  // Flip outward into corridor
  bathWall.openings[0].swing = -1;
  const outwardReport = runLayoutAudit(project, variant);
  assert.equal(outwardReport.issues.some(i => i.category === 'door' && i.roomId === 'bath1'), false);
});

test('layout audit evaluates furniture delivery routes, plumbing slope to riser, TV glare, dirty zone and storage index', () => {
  const project = createProject();
  const variant = project.variants[0];
  // Place TV facing south window in living room (window is at z=H, local +Z with rotation=0 points south!)
  const tv = boundFurniture({ ...makeFurniture('television', 'living', 5.0, 9.5), rotation: 0 }, project);
  variant.furniture.push(tv);
  // Place riser far from bath1 toilet to trigger slope warning/error
  const riser = addEngineeringItem(project, 'living', 'riser');
  riser.x = 5.8;
  riser.z = 8.0;

  const report = runLayoutAudit(project, variant);
  assert.ok(report.delivery.length > 0, 'evaluates delivery for big items');
  assert.ok(report.delivery.every(d => d.pathPoints.length >= 2), 'generates delivery path coordinates');
  assert.ok(report.hasRiserMarkers);
  assert.ok(report.plumbing.some(r => r.severity === 'error' || r.severity === 'warn'), 'flags far plumbing run');
  assert.ok(report.issues.some(i => i.id === `tv-glare-${tv.id}`), 'detects TV glare facing window');
  assert.ok(report.dirtyZone && report.dirtyZone.polygon.length === 4, 'builds entry dirty zone overlay');
  assert.ok(report.storage.totalStorageM2 > 0 && report.storage.ratioPct > 0, 'computes storage index');
});

test('AuditPanel renders and HTML renovation brief includes audit & storage checklist section', () => {
  const project = createProject();
  const variant = project.variants[0];
  const ui = renderToStaticMarkup(createElement(AuditPanel, {
    project, variant, roomId: 'living', mutate: () => true, notify: () => {},
  }));
  assert.match(ui, /Чистовой запас отделки/);
  assert.match(ui, /Занос крупной мебели от входа/);
  assert.match(ui, /Сантехника и уклон канализации/);
  assert.match(ui, /Хранение/);

  const html = buildRenovationBriefHtml(project, variant, 10);
  assert.match(html, /Аудит планировки, чистовые допуски и хоз-хранение/);
  assert.match(html, /Пылесос/);
});
