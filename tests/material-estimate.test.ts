import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, validateProject, doorwayObstructions, type MaterialQuote } from '../src/model';
import { adhesiveEstimate, coveringEstimate, estimateVariant, paintEstimate, projectQuantities, roomQuantities, skirtingEstimate, surfaceArea, wallpaperEstimate } from '../src/materialEstimate';
import { addOpening } from '../src/openings';
test('floor area is physical area, including full balcony instead of credited area', () => {
  const p = createProject();
  assert.ok(Math.abs(surfaceArea(p, 'living', 'floor') - 20.05) < 1e-9);
  assert.ok(Math.abs(surfaceArea(p, 'balcony', 'floor') - 3.6) < 1e-9);
  p.scale = 1.2;
  assert.ok(Math.abs(surfaceArea(p, 'living', 'ceiling') - 20.05 * 1.44) < 1e-9);
});
test('wall ownership and aperture union match an independent rectangular known answer', () => {
  const p = createProject();
  p.rooms = [{ id: 'r', name: 'r', sourceArea: '', polygon: [[0,0], [4,0], [4,3], [0,3]] }];
  p.walls = [
    { a:[0,0], b:[4,0], rooms:['r'], openings:[{start:1,end:2,kind:'door'}, {start:1,end:3,kind:'window'}] },
    { a:[4,0], b:[4,3], rooms:['r'] }, { a:[4,3], b:[0,3], rooms:['r'] }, { a:[0,3], b:[0,0], rooms:['r'] }
  ];
  // 14*2.8 - overlap union (2.15 door+window, plus 1.43 window).
  assert.ok(Math.abs(surfaceArea(p, 'r', 'walls') - (39.2 - 3.58)) < 1e-9);
  p.scale = 2;
  assert.ok(Math.abs(surfaceArea(p, 'r', 'walls') - (78.4 - 7.16)) < 1e-9);
});
test('long wall does not bill every listed room for its full length', () => {
  const p = createProject(); p.walls = [p.walls[1]];
  const sum = p.rooms.reduce((n,r) => n + surfaceArea(p,r.id,'walls'), 0);
  const w = p.walls[0];
  assert.ok(Math.abs(sum - Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]) * 2.8) < 1e-8);
});
test('reserve then whole packs, correct unit costs, no floating extra pack', () => {
  const quote = { price:20, currency:'BYN', priceUnit:'m2', packCoverageM2:2.2 } as const;
  const e = coveringEstimate(20,10,quote);
  assert.equal(e.packs,10); assert.equal(e.purchasedM2,22); assert.equal(e.cost,440);
  assert.equal(coveringEstimate(20.05,10,{...quote,price:50,priceUnit:'pack'}).cost,550);
  assert.equal(coveringEstimate(4,0,{...quote,price:3,priceUnit:'item',packCoverageM2:2,packPieces:8}).cost,48);
});
test('unknown prices, units, currency and missing pack data cannot masquerade as zero', () => {
  for (const quote of [{}, {price:20,currency:'BYN'}, {price:20,priceUnit:'m2'}, {price:20,currency:'BYN',priceUnit:'pack'}, {price:20,currency:'BYN',priceUnit:'item',packCoverageM2:2}] as MaterialQuote[])
    assert.equal(coveringEstimate(20,10,quote).cost,undefined);
  assert.throws(() => coveringEstimate(20,NaN));
});
test('same covering is pooled across rooms before pack rounding; separate currencies retained', () => {
  const p = createProject();
  p.materials.find(m=>m.id==='oak')!.quote = {price:50,currency:'BYN',priceUnit:'pack',packCoverageM2:2};
  p.materials.find(m=>m.id==='white')!.quote = {price:10,currency:'EUR',priceUnit:'m2'};
  const result = estimateVariant(p,p.variants[0],10);
  const oak = result.rows.find(r=>r.materialId==='oak'&&r.surface==='floor')!;
  assert.ok(oak.rooms.length>1); assert.equal(oak.packs,Math.ceil(oak.netM2*1.1/2));
  assert.ok(result.subtotals.BYN>0&&result.subtotals.EUR>0); assert.ok(result.unknown>0);
});
test('optional quote round trips, old projects remain valid and malformed prices fail atomically', () => {
  const p = createProject(); assert.ok(validateProject(p));
  p.materials[0].quote = {price:20,currency:'BYN',priceUnit:'m2',packCoverageM2:2.2,sourceUrl:'https://oma.by/product/',observedAt:'2026-10-03T00:00:00Z'};
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).materials[0].quote,p.materials[0].quote);
  for (const patch of [{price:NaN},{packPieces:1.5},{packCoverageM2:0},{currency:'rubles'},{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://user:secret@example.com'}]) {
    const q = structuredClone(p); Object.assign(q.materials[0].quote!,patch); assert.throws(()=>validateProject(q));
  }
});
test('fresh layout clears door strips; a user-moved rotated object produces a warning', () => {
  const p = createProject(), furniture = p.variants[0].furniture;
  assert.deepEqual(doorwayObstructions(p, furniture), []);
  const desk = furniture.find(f=>f.kind==='workstation')!;
  const door = p.walls[18], aperture = door.openings![0];
  desk.x = door.a[0] + (aperture.start + aperture.end)/2;
  desk.z = door.a[1] + .1; desk.rotation = 0;
  assert.ok(doorwayObstructions(p, furniture).some(b=>b.furnitureId===desk.id&&b.wall===18));
  assert.ok(doorwayObstructions(p, furniture, .16).length);
});

test('room quantities measure perimeter, skirting without doors, and aperture counts', () => {
  const p = createProject();
  const living = roomQuantities(p, 'living');
  assert.ok(Math.abs(living.floorM2 - 20.05) < 1e-9);
  assert.equal(living.ceilingM2, living.floorM2);
  assert.ok(Math.abs(living.perimeterM - 18.360714285714288) < 1e-9);
  assert.equal(living.doors, 4);
  assert.equal(living.windows, 1);
  assert.ok(Math.abs(living.skirtingM - (living.perimeterM - .95 - .9 - .9 - .9)) < 1e-9);
  const all = projectQuantities(p);
  assert.equal(all.rooms.length, p.rooms.length);
  assert.ok(Math.abs(all.totals.floorM2 - 79.56) < 1e-9, 'physical sum includes the whole balcony');
  assert.equal(all.totals.doors, 11, 'counts each physical door opening once instead of double-counting shared interior doors');
  assert.equal(all.totals.windows, 5, 'counts each physical window opening once');
});

test('a new door lowers the skirting length and raises the door count', () => {
  const p = createProject();
  const before = roomQuantities(p, 'living');
  const beforeAll = projectQuantities(p);
  const wall = p.walls.findIndex(w => w.rooms.includes('living') && w.openings?.some(o => o.kind === 'door') && w.openings.every(o => o.kind === 'door'));
  assert.ok(wall >= 0);
  addOpening(p, wall, 'door', .9);
  const after = roomQuantities(p, 'living');
  const afterAll = projectQuantities(p);
  assert.equal(after.doors, before.doors + 1);
  assert.equal(afterAll.totals.doors, beforeAll.totals.doors + 1);
  assert.ok(Math.abs(after.skirtingM - (before.skirtingM - .9)) < 1e-9);
});

test('extended calculators compute paint cans, wallpaper rolls, skirting pieces and adhesive bags', () => {
  const paint = paintEstimate(45, 10, { coats: 2, coverageM2PerLitre: 10, canLitres: 9, pricePerCan: 120, currency: 'BYN' });
  assert.ok(Math.abs(paint.litres - 9.9) < 1e-9);
  assert.equal(paint.cans, 2);
  assert.equal(paint.purchasedLitres, 18);
  assert.equal(paint.cost, 240);

  const wallpaper = wallpaperEstimate(42, 2.8, 10, { rollWidthM: 1.06, rollLengthM: 10.05, rapportCm: 0, pricePerRoll: 65, currency: 'BYN' });
  assert.equal(wallpaper.stripsPerRoll, 3);
  assert.equal(wallpaper.strips, 16);
  assert.equal(wallpaper.rolls, 6);
  assert.equal(wallpaper.cost, 390);

  const skirting = skirtingEstimate(14.71, 10, { pieceLengthM: 2.4, pricePerPiece: 25, currency: 'BYN' });
  assert.equal(skirting.pieces, 7);
  assert.ok(Math.abs(skirting.purchasedM - 16.8) < 1e-9);
  assert.equal(skirting.cost, 175);

  const adhesive = adhesiveEstimate(20, 10, { kgPerM2: 4.5, bagKg: 25, pricePerBag: 22, currency: 'BYN' });
  assert.ok(Math.abs(adhesive.adhesiveKg - 99) < 1e-9);
  assert.equal(adhesive.bags, 4);
  assert.equal(adhesive.adhesiveCost, 88);
  assert.equal(adhesive.primerCans, 1);
});
