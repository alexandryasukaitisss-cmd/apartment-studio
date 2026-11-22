import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addElectricalPoint, addEngineeringItem, createProject, duplicateVariant, makeFurniture, moveEngineeringItem, parseProject, removeEngineeringItem, resizeRoom, roomSize, upsertHeatedFloorZone, validateProject, wallMaterialId, wallOverrideKey } from '../src/model';
import { compareVariants, estimateVariant, furnitureBudget, surfaceArea, worksBudget } from '../src/materialEstimate';
import { updateOpening } from '../src/openings';
import { defaultPresetForRoom, doorSwingConflicts, doorSwingInfo, furnitureCoordsFromRoomOffset, furnitureRoomClearances, materialSurfaces, pointRoomOffsets, roomAccusative, smartMaterialSurface } from '../src/roomMeasures';
import { buildEstimateCsv, buildRenovationBriefHtml } from '../src/renovationExport';

test('smart material routing prevents applying wallpaper/paint to floor or laminate to ceiling', () => {
  const p = createProject();
  const wallpaper = p.materials.find(m => m.id === 'wallpaper')!;
  const paint = p.materials.find(m => m.id === 'paint')!;
  const laminate = p.materials.find(m => m.id === 'laminate')!;
  assert.equal(smartMaterialSurface(wallpaper, 'floor'), 'walls');
  assert.equal(smartMaterialSurface(paint, 'floor'), 'walls');
  assert.equal(smartMaterialSurface(laminate, 'ceiling'), 'floor');
  assert.equal(smartMaterialSurface(laminate, 'floor'), 'floor');
  assert.equal(materialSurfaces(wallpaper).includes('floor'), false);
  assert.equal(materialSurfaces(wallpaper).includes('walls'), true);
  assert.equal(roomAccusative('living', 'Кухня-гостиная'), 'в кухню-гостиную');
  assert.equal(roomAccusative('balcony', 'Балкон'), 'на балкон');
  assert.equal(defaultPresetForRoom('bath1'), 'Раковина 80');
});

test('accent wall override splits wall estimate accurately and round-trips through JSON validation', () => {
  const p = createProject();
  const v = p.variants[0];
  const baseEstimate = estimateVariant(p, v, 0);
  const basePlasterM2 = baseEstimate.rows.find(r => r.surface === 'walls' && r.materialId === 'plaster')!.netM2;
  // Wall 14 faces living on segment [0..3.58]. Override it with green tile.
  const wallIndex = 14;
  v.wallOverrides = { [wallOverrideKey(wallIndex, 'living')]: 'green' };
  assert.equal(wallMaterialId(v, wallIndex, 'living'), 'green');
  assert.equal(wallMaterialId(v, 15, 'living'), 'plaster');
  const after = estimateVariant(p, v, 0);
  const afterPlasterM2 = after.rows.find(r => r.surface === 'walls' && r.materialId === 'plaster')!.netM2;
  const greenRow = after.rows.find(r => r.surface === 'walls' && r.materialId === 'green')!;
  assert.ok(afterPlasterM2 < basePlasterM2 - 8);
  assert.ok(greenRow.rooms.some(r => r.includes('Кухня-гостиная (акцент)')));
  assert.deepEqual(parseProject(JSON.stringify(p)), p);
});

test('door swing direction, window sill heights and doorSwingConflicts work together', () => {
  const p = createProject();
  const beforeWallM2 = surfaceArea(p, 'bed1', 'walls');
  // Window on wall 0 (bed1): raise sill from 0.72 to 1.00 m -> wall area increases by width * 0.28 m².
  const win = p.walls[0].openings![0];
  const winWidth = win.end - win.start;
  updateOpening(p, 0, 0, { sillHeight: 1.0 });
  const afterWallM2 = surfaceArea(p, 'bed1', 'walls');
  assert.ok(Math.abs((afterWallM2 - beforeWallM2) - winWidth * .28) < 1e-6);

  // Flip door swing and hinge on entrance door (wall 14, opening 0) and place furniture directly inside its swing sector.
  updateOpening(p, 14, 0, { swing: 1, hinge: 'end' });
  const swing = doorSwingInfo(p, p.walls[14], p.walls[14].openings![0])!;
  assert.equal(swing.hinge, 'end');
  assert.equal(swing.sign, 1);
  const obstacle = makeFurniture('wardrobe', 'entry', (swing.hx + swing.ox + swing.cx) / 3, (swing.hy + swing.oy + swing.cy) / 3);
  const conflicts = doorSwingConflicts(p, [obstacle]);
  assert.ok(conflicts.some(c => c.wallIndex === 14 && c.furnitureId === obstacle.id));
});

test('room offsets and clearances compute exact physical distances from room walls', () => {
  const p = createProject();
  const living = p.rooms.find(r => r.id === 'living')!;
  const minX = Math.min(...living.polygon.map(pt => pt[0]));
  const minZ = Math.min(...living.polygon.map(pt => pt[1]));
  const ptOffsets = pointRoomOffsets(p, 'living', minX + .45, minZ + 1.2)!;
  assert.equal(ptOffsets.leftCm, 45);
  assert.equal(ptOffsets.topCm, 120);

  const sofa = p.variants[0].furniture.find(f => f.kind === 'sofa' && f.roomId === 'living')!;
  const coords = furnitureCoordsFromRoomOffset(p, sofa, { leftCm: 10, topCm: 25 });
  const moved = { ...sofa, ...coords };
  const clr = furnitureRoomClearances(p, moved)!;
  assert.equal(clr.leftCm, 10);
  assert.equal(clr.topCm, 25);
});

test('engineering layer, heated floor zones, furniture prices, work rates and variant comparison work end-to-end', () => {
  const p = createProject();
  const v1 = p.variants[0];
  addElectricalPoint(p, 'living', 'socket');
  addElectricalPoint(p, 'living', 'light');
  const riser = addEngineeringItem(p, 'bath1', 'riser');
  riser.label = 'ХВС/ГВС';
  moveEngineeringItem(p, riser.id, riser.x + .1, riser.z);
  upsertHeatedFloorZone(p, 'bath1', 2.4, 150, 'Зона у ванны');
  v1.furniture[0].label = 'Кровать Аскона';
  v1.furniture[0].price = 2100;
  v1.furniture[0].currency = 'BYN';
  v1.workRates = { currency: 'BYN', floorM2: 20, electricalPoint: 35 };

  const v2 = duplicateVariant(v1);
  v2.name = 'Вариант 2 (Эконом)';
  v2.furniture[0].price = 1200;
  p.variants.push(v2);

  validateProject(p);
  assert.equal(furnitureBudget(v1).subtotals.BYN, 2100);
  assert.ok(worksBudget(p, v1).total > 1500);
  const comparison = compareVariants(p, 10);
  assert.equal(comparison.length, 2);
  assert.ok(comparison[0].totals.BYN > comparison[1].totals.BYN);
  assert.equal(comparison[0].heatedFloorWatts, 360);

  // Room resize remaps engineering items and keeps project valid.
  const bathWidth = roomSize(p.rooms.find(r => r.id === 'bath1')!)[0];
  resizeRoom(p, 'bath1', 0, bathWidth + .2);
  validateProject(p);

  // Export CSV and print-ready renovation brief HTML.
  p.roomNotes = { living: { notes: 'Проверить вывод под кондиционер', checks: { walls: true, ceiling: true } } };
  const csv = buildEstimateCsv(p, v1, 10);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /Кровать Аскона/);
  assert.match(csv, /ХВС\/ГВС/);
  assert.match(csv, /Тёплый пол/);
  const html = buildRenovationBriefHtml(p, v1, 10);
  assert.match(html, /Техническое задание электрику/);
  assert.match(html, /Ведомость помещений/);
  assert.match(html, /Проверить вывод под кондиционер/);
  assert.match(html, /<svg /);

  removeEngineeringItem(p, riser.id);
  assert.equal(v1.engineering?.items.length, 0);
});
