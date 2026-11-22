import { area, wallMaterialId, type MaterialQuote, type Project, type Surface, type Variant, type Wall } from './model';
import { wallFaceSpans } from './wallSides';
import { openingHeights } from './openingHeights';

export function wallFaceArea(project: Project, w: Wall, roomId: string): number {
  const length = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  if (!length) return 0;
  let total = 0;
  for (const span of wallFaceSpans(w, project, 0, length)) {
    if (span.positive !== roomId && span.negative !== roomId) continue;
    // Split horizontally, then subtract the union of vertical apertures.
    const openings = (w.openings ?? []).filter(o => o.end > span.start && o.start < span.end);
    const cuts = [...new Set([span.start, span.end, ...openings.flatMap(o => [Math.max(span.start, o.start), Math.min(span.end, o.end)])])].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const x = (cuts[i] + cuts[i + 1]) / 2;
      const intervals = openings.filter(o => o.start <= x && o.end >= x).map(o => o.kind === 'door'
        ? [0, Math.min(project.ceilingHeight, o.headHeight ?? openingHeights.door)]
        : [Math.min(project.ceilingHeight, o.sillHeight ?? openingHeights.windowSill), Math.min(project.ceilingHeight, o.headHeight ?? openingHeights.windowHead)]).sort((a, b) => a[0] - b[0]);
      let removed = 0, end = 0;
      for (const [a, b] of intervals) { removed += Math.max(0, b - Math.max(a, end)); end = Math.max(end, b); }
      total += (cuts[i + 1] - cuts[i]) * project.scale * (project.ceilingHeight - removed);
    }
  }
  return Math.max(0, total);
}

export function surfaceArea(project: Project, roomId: string, surface: Surface): number {
  const room = project.rooms.find(r => r.id === roomId);
  if (!room) throw Error('Комната не найдена.');
  if (surface !== 'walls') return area(room.polygon) * project.scale ** 2;
  let total = 0;
  for (const w of project.walls) total += wallFaceArea(project, w, roomId);
  return Math.max(0, total);
}

/** One room's measured quantities in metres and square metres. */
export function roomQuantities(project: Project, roomId: string) {
  const room = project.rooms.find(r => r.id === roomId);
  if (!room) throw Error('Комната не найдена.');
  let perimeter = 0, skirting = 0, doors = 0, windows = 0;
  for (const w of project.walls) {
    const length = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (!length) continue;
    for (const span of wallFaceSpans(w, project, 0, length)) {
      if (span.positive !== roomId && span.negative !== roomId) continue;
      const spanLength = span.end - span.start;
      perimeter += spanLength;
      let doorLength = 0;
      for (const o of w.openings ?? []) {
        const overlap = Math.min(span.end, o.end) - Math.max(span.start, o.start);
        if (overlap <= 0) continue;
        if (o.kind === 'door') doorLength += overlap;
        if (o.start + (o.end - o.start) / 2 >= span.start && o.start + (o.end - o.start) / 2 <= span.end)
          o.kind === 'door' ? doors++ : windows++;
      }
      skirting += Math.max(0, spanLength - doorLength);
    }
  }
  return {
    floorM2: area(room.polygon) * project.scale ** 2,
    ceilingM2: area(room.polygon) * project.scale ** 2,
    wallM2: surfaceArea(project, roomId, 'walls'),
    perimeterM: perimeter * project.scale,
    skirtingM: skirting * project.scale,
    doors, windows,
  };
}
export function projectQuantities(project: Project) {
  const rooms = project.rooms.map(room => ({ id: room.id, name: room.name, ...roomQuantities(project, room.id) }));
  const allOpenings = project.walls.flatMap(w => w.openings ?? []);
  const totals = rooms.reduce((sum, room) => ({
    floorM2: sum.floorM2 + room.floorM2,
    wallM2: sum.wallM2 + room.wallM2,
    ceilingM2: sum.ceilingM2 + room.ceilingM2,
    skirtingM: sum.skirtingM + room.skirtingM,
    doors: sum.doors,
    windows: sum.windows,
  }), {
    floorM2: 0, wallM2: 0, ceilingM2: 0, skirtingM: 0,
    doors: allOpenings.filter(o => o.kind === 'door').length,
    windows: allOpenings.filter(o => o.kind === 'window').length,
  });
  return { rooms, totals };
}

export function paintEstimate(netM2: number, reservePercent: number, options: { coats?: number; coverageM2PerLitre?: number; canLitres?: number; pricePerCan?: number; currency?: string } = {}) {
  if (!Number.isFinite(netM2) || netM2 < 0 || !Number.isFinite(reservePercent) || reservePercent < 0 || reservePercent > 100)
    throw Error('Некорректная площадь или запас.');
  const coats = options.coats && options.coats > 0 ? options.coats : 2;
  const coverage = options.coverageM2PerLitre && options.coverageM2PerLitre > 0 ? options.coverageM2PerLitre : 10;
  const canLitres = options.canLitres && options.canLitres > 0 ? options.canLitres : 9;
  const requiredM2 = netM2 * (1 + reservePercent / 100);
  const litres = requiredM2 * coats / coverage;
  const cans = litres > 0 ? Math.ceil(litres / canLitres - 1e-10 * Math.max(1, litres / canLitres)) : 0;
  const purchasedLitres = cans * canLitres;
  const validCurrency = /^[A-Z]{3}$/.test(options.currency ?? '');
  const cost = options.pricePerCan && options.pricePerCan > 0 && validCurrency ? cans * options.pricePerCan : undefined;
  return { netM2, requiredM2, coats, litres, cans, canLitres, purchasedLitres, cost, currency: cost !== undefined ? options.currency : undefined };
}

export function wallpaperEstimate(wallM2: number, ceilingHeightM: number, reservePercent: number, options: { rollWidthM?: number; rollLengthM?: number; rapportCm?: number; pricePerRoll?: number; currency?: string } = {}) {
  if (!Number.isFinite(wallM2) || wallM2 < 0 || !Number.isFinite(ceilingHeightM) || ceilingHeightM <= 0 || !Number.isFinite(reservePercent) || reservePercent < 0 || reservePercent > 100)
    throw Error('Некорректные параметры обоев.');
  const rollWidthM = options.rollWidthM && options.rollWidthM > 0 ? options.rollWidthM : 1.06;
  const rollLengthM = options.rollLengthM && options.rollLengthM > 0 ? options.rollLengthM : 10.05;
  const rapportM = Math.max(0, (options.rapportCm ?? 0) / 100);
  const stripHeightM = ceilingHeightM + rapportM + .1;
  const stripsPerRoll = Math.max(1, Math.floor(rollLengthM / stripHeightM));
  const effectiveSpanM = (wallM2 / ceilingHeightM) * (1 + reservePercent / 100);
  const strips = effectiveSpanM > 0 ? Math.ceil(effectiveSpanM / rollWidthM - 1e-10) : 0;
  const rolls = strips > 0 ? Math.ceil(strips / stripsPerRoll - 1e-10) : 0;
  const validCurrency = /^[A-Z]{3}$/.test(options.currency ?? '');
  const cost = options.pricePerRoll && options.pricePerRoll > 0 && validCurrency ? rolls * options.pricePerRoll : undefined;
  return { wallM2, stripHeightM, stripsPerRoll, strips, rolls, rollWidthM, rollLengthM, cost, currency: cost !== undefined ? options.currency : undefined };
}

export function skirtingEstimate(skirtingM: number, reservePercent: number, options: { pieceLengthM?: number; pricePerPiece?: number; pricePerMetre?: number; currency?: string } = {}) {
  if (!Number.isFinite(skirtingM) || skirtingM < 0 || !Number.isFinite(reservePercent) || reservePercent < 0 || reservePercent > 100)
    throw Error('Некорректный метраж плинтуса или запас.');
  const pieceLengthM = options.pieceLengthM && options.pieceLengthM > 0 ? options.pieceLengthM : 2.4;
  const requiredM = skirtingM * (1 + reservePercent / 100);
  const pieces = requiredM > 0 ? Math.ceil(requiredM / pieceLengthM - 1e-10 * Math.max(1, requiredM / pieceLengthM)) : 0;
  const purchasedM = pieces * pieceLengthM;
  const validCurrency = /^[A-Z]{3}$/.test(options.currency ?? '');
  let cost: number | undefined;
  if (validCurrency) {
    if (options.pricePerPiece && options.pricePerPiece > 0) cost = pieces * options.pricePerPiece;
    else if (options.pricePerMetre && options.pricePerMetre > 0) cost = purchasedM * options.pricePerMetre;
  }
  return { skirtingM, requiredM, pieceLengthM, pieces, purchasedM, cost, currency: cost !== undefined ? options.currency : undefined };
}

export function adhesiveEstimate(netM2: number, reservePercent: number, options: { kgPerM2?: number; bagKg?: number; pricePerBag?: number; primerLitresPerM2?: number; primerCanLitres?: number; pricePerPrimerCan?: number; currency?: string } = {}) {
  if (!Number.isFinite(netM2) || netM2 < 0 || !Number.isFinite(reservePercent) || reservePercent < 0 || reservePercent > 100)
    throw Error('Некорректная площадь или запас.');
  const requiredM2 = netM2 * (1 + reservePercent / 100);
  const kgPerM2 = options.kgPerM2 && options.kgPerM2 > 0 ? options.kgPerM2 : 4.5;
  const bagKg = options.bagKg && options.bagKg > 0 ? options.bagKg : 25;
  const adhesiveKg = requiredM2 * kgPerM2;
  const bags = adhesiveKg > 0 ? Math.ceil(adhesiveKg / bagKg - 1e-10) : 0;
  const primerLitresPerM2 = options.primerLitresPerM2 && options.primerLitresPerM2 > 0 ? options.primerLitresPerM2 : .15;
  const primerCanLitres = options.primerCanLitres && options.primerCanLitres > 0 ? options.primerCanLitres : 5;
  const primerLitres = requiredM2 * primerLitresPerM2;
  const primerCans = primerLitres > 0 ? Math.ceil(primerLitres / primerCanLitres - 1e-10) : 0;
  const validCurrency = /^[A-Z]{3}$/.test(options.currency ?? '');
  const adhesiveCost = options.pricePerBag && options.pricePerBag > 0 && validCurrency ? bags * options.pricePerBag : undefined;
  const primerCost = options.pricePerPrimerCan && options.pricePerPrimerCan > 0 && validCurrency ? primerCans * options.pricePerPrimerCan : undefined;
  const totalCost = adhesiveCost !== undefined || primerCost !== undefined ? (adhesiveCost ?? 0) + (primerCost ?? 0) : undefined;
  return { netM2, requiredM2, adhesiveKg, bags, bagKg, primerLitres, primerCans, primerCanLitres, adhesiveCost, primerCost, totalCost, currency: totalCost !== undefined ? options.currency : undefined };
}

export function coveringEstimate(netM2: number, reservePercent: number, quote: MaterialQuote = {}) {
  if (!Number.isFinite(netM2) || netM2 < 0 || !Number.isFinite(reservePercent) || reservePercent < 0 || reservePercent > 100) throw Error('Некорректная площадь или запас.');
  const requiredM2 = netM2 * (1 + reservePercent / 100);
  const coverage = quote.packCoverageM2;
  const packs = coverage && coverage > 0 && Number.isFinite(coverage) ? Math.ceil(requiredM2 / coverage - 1e-10 * Math.max(1, requiredM2 / coverage)) : undefined;
  const purchasedM2 = packs !== undefined ? packs * coverage! : requiredM2;
  let cost: number | undefined;
  if (quote.price && Number.isFinite(quote.price) && quote.price > 0 && /^[A-Z]{3}$/.test(quote.currency ?? '')) {
    if (quote.priceUnit === 'm2') cost = purchasedM2 * quote.price;
    if (quote.priceUnit === 'pack' && packs !== undefined) cost = packs * quote.price;
    if (quote.priceUnit === 'item' && packs !== undefined && quote.packPieces) cost = packs * quote.packPieces * quote.price;
  }
  return { netM2, requiredM2, packs, purchasedM2, cost, currency: cost !== undefined ? quote.currency : undefined };
}

export function estimateVariant(project: Project, variant: Variant, reserve: number) {
  // Pool the same material across rooms on the same surface (including per-wall accent overrides) before rounding packs.
  const groups = new Map<string, { materialId: string; surface: Surface; rooms: string[]; netM2: number }>();
  const addGroup = (surface: Surface, materialId: string, roomName: string, m2: number) => {
    if (m2 <= 1e-9) return;
    const key = `${surface}:${materialId}`;
    const row = groups.get(key) ?? { materialId, surface, rooms: [], netM2: 0 };
    if (!row.rooms.includes(roomName)) row.rooms.push(roomName);
    row.netM2 += m2;
    groups.set(key, row);
  };
  for (const room of project.rooms) {
    addGroup('floor', variant.finishes[room.id].floor, room.name, surfaceArea(project, room.id, 'floor'));
    addGroup('ceiling', variant.finishes[room.id].ceiling, room.name, surfaceArea(project, room.id, 'ceiling'));
    let wallAccum = 0;
    project.walls.forEach((w, wallIndex) => {
      const m2 = wallFaceArea(project, w, room.id);
      if (m2 <= 1e-9) return;
      wallAccum += m2;
      const matId = wallMaterialId(variant, wallIndex, room.id);
      const isOverride = Boolean(variant.wallOverrides?.[`${wallIndex}:${room.id}`]);
      addGroup('walls', matId, isOverride ? `${room.name} (акцент)` : room.name, m2);
    });
    if (wallAccum <= 1e-9) {
      addGroup('walls', variant.finishes[room.id].walls, room.name, 0);
    }
  }
  const rows = [...groups.values()].map(row => {
    const material = project.materials.find(m => m.id === row.materialId)!;
    return { ...row, name: material.name, ...coveringEstimate(row.netM2, reserve, material.quote) };
  });
  const subtotals: Record<string, number> = {};
  for (const row of rows) if (row.cost !== undefined && row.currency) subtotals[row.currency] = (subtotals[row.currency] ?? 0) + row.cost;
  return { rows, subtotals, unknown: rows.filter(r => r.cost === undefined).length };
}

export function furnitureBudget(variant: Variant) {
  const subtotals: Record<string, number> = {};
  let priced = 0, unpriced = 0;
  for (const f of variant.furniture) {
    if (f.price !== undefined && f.price > 0) {
      const cur = f.currency && /^[A-Z]{3}$/.test(f.currency) ? f.currency : 'BYN';
      subtotals[cur] = (subtotals[cur] ?? 0) + f.price;
      priced++;
    } else {
      unpriced++;
    }
  }
  return { subtotals, priced, unpriced, totalItems: variant.furniture.length };
}

export function worksBudget(project: Project, variant: Variant) {
  const rates = variant.workRates;
  const currency = rates?.currency && /^[A-Z]{3}$/.test(rates.currency) ? rates.currency : 'BYN';
  const q = projectQuantities(project).totals;
  const electricalPoints = variant.electrical.points.length;
  const lines: { key: string; label: string; quantity: number; unit: string; rate?: number; cost?: number }[] = [
    { key: 'floor', label: 'Укладка пола', quantity: q.floorM2, unit: 'м²', rate: rates?.floorM2 },
    { key: 'walls', label: 'Отделка стен', quantity: q.wallM2, unit: 'м²', rate: rates?.wallM2 },
    { key: 'ceiling', label: 'Потолок', quantity: q.ceilingM2, unit: 'м²', rate: rates?.ceilingM2 },
    { key: 'skirting', label: 'Монтаж плинтуса', quantity: q.skirtingM, unit: 'м', rate: rates?.skirtingM },
    { key: 'electrical', label: 'Монтаж электрики', quantity: electricalPoints, unit: 'точ.', rate: rates?.electricalPoint },
  ].map(item => ({
    ...item,
    cost: item.rate && item.rate > 0 ? item.quantity * item.rate : undefined,
  }));
  const total = lines.reduce((sum, l) => sum + (l.cost ?? 0), 0);
  const pricedLines = lines.filter(l => l.cost !== undefined).length;
  return { currency, lines, total, pricedLines };
}

export function variantBudgetSummary(project: Project, variant: Variant, reserve = 10) {
  const coverings = estimateVariant(project, variant, reserve);
  const furniture = furnitureBudget(variant);
  const works = worksBudget(project, variant);
  const totals: Record<string, number> = {};
  const add = (map: Record<string, number>) => {
    for (const [cur, val] of Object.entries(map)) totals[cur] = (totals[cur] ?? 0) + val;
  };
  add(coverings.subtotals);
  add(furniture.subtotals);
  if (works.total > 0) totals[works.currency] = (totals[works.currency] ?? 0) + works.total;
  const heatedFloorWatts = (variant.engineering?.heatedFloors ?? []).reduce((s, z) => s + z.areaM2 * z.wattsPerM2, 0);
  return {
    id: variant.id,
    name: variant.name,
    coverings: coverings.subtotals,
    furniture: furniture.subtotals,
    works: works.total > 0 ? { [works.currency]: works.total } : {},
    totals,
    unknownCoverings: coverings.unknown,
    unpricedFurniture: furniture.unpriced,
    electricalPoints: variant.electrical.points.length,
    heatedFloorWatts,
  };
}

export function compareVariants(project: Project, reserve = 10) {
  return project.variants.map(v => variantBudgetSummary(project, v, reserve));
}
