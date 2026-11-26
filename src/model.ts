export type Point = [number, number];
export type Surface = 'floor' | 'walls' | 'ceiling';
export type Kind = 'bed' | 'sofa' | 'table' | 'chair' | 'wardrobe' | 'kitchen' | 'bath' | 'toilet' | 'plant' | 'corner' | 'fridge' | 'shower' | 'vanity' | 'washer' | 'television' | 'oven' | 'microwave' | 'dishwasher' | 'hood' | 'workstation' | 'bookcase' | 'rack' | 'bench' | 'platform' | 'kettlebell' | 'rug' | 'mirror' | 'curtains' | 'nightstand' | 'tvstand' | 'upper_cabinet' | 'pantry' | 'island' | 'person' | 'custom_glb' | 'round_table' | 'slat_partition' | 'tv_stand_mobile' | 'laundry_tower' | 'vanity_desk';
export interface FinishAllowance {
  wallCm?: number;
  floorCm?: number;
  ceilingCm?: number;
}
export const HUMAN_HEIGHT_M = 1.86;
export const HUMAN_EYE_HEIGHT_M = 1.74;
export type RenovationStage = 'shell' | 'rough' | 'finishes' | 'furnished';
export type RoadmapStatus = 'todo' | 'in_progress' | 'done';
export interface SavedView {
  id: string;
  name: string;
  roomId: string;
  mode: '3d' | 'walk';
  pos: [number, number, number];
  target?: [number, number, number];
  yaw?: number;
  pitch?: number;
}
export interface Room { id: string; name: string; sourceArea: string; polygon: Point[]; proposed?: boolean }
export interface Opening { start: number; end: number; kind: 'door' | 'window'; hinge?: 'start' | 'end'; swing?: 1 | -1; sillHeight?: number; headHeight?: number }
export interface Wall { a: Point; b: Point; rooms: string[]; openings?: Opening[]; proposed?: boolean }
export interface MaterialQuote { sourceUrl?: string; retailer?: string; price?: number; currency?: string; priceUnit?: 'm2' | 'pack' | 'item' | 'unknown'; packCoverageM2?: number; packPieces?: number; observedAt?: string }
export interface Material { id: string; name: string; color: string; pattern: 'wood' | 'stone' | 'tile' | 'plain' | 'image'; width: number; height: number; rotation: number; roughness: number; image?: string; quote?: MaterialQuote }
export interface Furniture { id: string; kind: Kind; roomId: string; x: number; z: number; width: number; depth: number; height: number; elevation?: number; rotation: number; color: string; label?: string; price?: number; currency?: string; sourceUrl?: string; modelAssetId?: string }
export type ElectricalType = 'socket' | 'switch' | 'light' | 'network' | 'appliance';
export interface ElectricalPoint { id: string; roomId: string; type: ElectricalType; x: number; z: number; height: number; label?: string }
export interface ElectricalConnection { id: string; from: string; to: string }
export interface ElectricalLayer { points: ElectricalPoint[]; connections: ElectricalConnection[] }
export const electricalNames: Record<ElectricalType, string> = { socket: 'Розетка', switch: 'Выключатель', light: 'Светильник', network: 'Интернет', appliance: 'Вывод для техники' };
export const electricalSymbols: Record<ElectricalType, string> = { socket: 'Р', switch: 'В', light: 'С', network: 'И', appliance: 'Т' };
export const MAX_ELECTRICAL_POINTS = 300, MAX_ELECTRICAL_CONNECTIONS = 600;
export type EngineeringType = 'riser' | 'radiator' | 'ac' | 'drain' | 'manifold';
export interface EngineeringItem { id: string; roomId: string; type: EngineeringType; x: number; z: number; label?: string }
export interface HeatedFloorZone { id: string; roomId: string; areaM2: number; wattsPerM2: number; label?: string }
export interface EngineeringLayer { items: EngineeringItem[]; heatedFloors: HeatedFloorZone[] }
export const engineeringNames: Record<EngineeringType, string> = { riser: 'Стояк воды/канализации', radiator: 'Радиатор отопления', ac: 'Кондиционер / трасса', drain: 'Слив / трап', manifold: 'Коллекторный узел' };
export const engineeringSymbols: Record<EngineeringType, string> = { riser: 'Ст', radiator: 'Б', ac: 'К', drain: 'Сл', manifold: 'Уз' };
export const MAX_ENGINEERING_ITEMS = 120;
export interface WorkRates {
  currency?: string;
  floorM2?: number;
  wallM2?: number;
  ceilingM2?: number;
  skirtingM?: number;
  electricalPoint?: number;
  paintCoats?: number;
  paintCoverageM2PerL?: number;
  paintCanLitres?: number;
  paintPricePerCan?: number;
  rollWidthM?: number;
  rollLengthM?: number;
  rapportCm?: number;
  rollPricePerRoll?: number;
  skirtingPieceM?: number;
  skirtingPricePerPiece?: number;
  adhesiveKgPerM2?: number;
  adhesiveBagKg?: number;
  adhesivePricePerBag?: number;
}
export interface RoomMeasurementNote { notes: string; checks: Record<string, boolean> }
export interface Variant { id: string; name: string; finishes: Record<string, Record<Surface, string>>; wallOverrides?: Record<string, string>; furniture: Furniture[]; electrical: ElectricalLayer; engineering?: EngineeringLayer; workRates?: WorkRates; doorColor?: string; doorStyle?: 'framed' | 'hidden'; skirtingColor?: string; skirtingHeight?: number; savedViews?: SavedView[]; roadmap?: Record<string, RoadmapStatus>; lighting: { mode: 'day' | 'evening' | 'uniform'; intensity: number; warmth: number; azimuth: number } }
export interface Project { version: 1; name: string; scale: number; ceilingHeight: number; rooms: Room[]; walls: Wall[]; materials: Material[]; variants: Variant[]; activeVariantId: string; roomNotes?: Record<string, RoomMeasurementNote>; finishAllowance?: FinishAllowance; storageChecklist?: Record<string, string> }
const rect = (x: number, z: number, w: number, d: number): Point[] => [[x, z], [x + w, z], [x + w, z + d], [x, z + d]];
export const A = 3, B = 1.75, N = .8, L = (11.9 + (A - B) * N) / A, Q = L + 3.6 / B + 3.36 / B, R = L - N + 6.39 / (A - B), H = Q + (12.05 + (A - B) * (R - Q)) / A, Z = H - 5.6, X = A + 20.05 / 5.6, C = (11.84 + 5) / 5.6, F = X + C, J = Z + 5 / C;
export const rooms: Room[] = [
  { id: 'bed1', name: 'Спальня', sourceArea: '11,90', polygon: [[0, 0], [A, 0], [A, L - N], [B, L - N], [B, L], [0, L]] },
  { id: 'bath1', name: 'Ванная', sourceArea: '3,60', polygon: rect(0, L, B, 3.6 / B) },
  { id: 'bath2', name: 'Санузел', sourceArea: '3,36', polygon: rect(0, L + 3.6 / B, B, 3.36 / B) },
  { id: 'corridor', name: 'Коридор', sourceArea: '6,39', polygon: rect(B, L - N, A - B, R - (L - N)) },
  { id: 'closet', name: 'Гардеробная', sourceArea: '1,77', polygon: rect(A, Z - 1.77 / 1.4, 1.4, 1.77 / 1.4) },
  { id: 'bed2', name: 'Детская', sourceArea: '12,05 ≈', polygon: [[0, Q], [B, Q], [B, R], [A, R], [A, H], [0, H]] },
  { id: 'living', name: 'Кухня-гостиная', sourceArea: '20,05', polygon: rect(A, Z, X - A, H - Z) },
  { id: 'entry', name: 'Прихожая', sourceArea: '5,00', polygon: rect(X, Z, F - X, J - Z), proposed: true },
  { id: 'bed3', name: 'Кабинет', sourceArea: '11,84', polygon: rect(X, J, F - X, H - J), proposed: true },
  { id: 'balcony', name: 'Балкон', sourceArea: '3,60 / зачёт 1,08', polygon: rect(3.29, H, 3, 1.2) }];
const wall = (a: Point, b: Point, rs: string[], openings: Wall['openings'] = [], proposed = false): Wall => ({ a, b, rooms: rs, openings, proposed });
export const walls: Wall[] = [
  wall([0, 0], [A, 0], ['bed1'], [{ start: .65, end: 2.35, kind: 'window' }]), wall([0, 0], [0, H], ['bed1', 'bath1', 'bath2', 'bed2']),
  wall([A, 0], [A, Z - 1.77 / 1.4], ['bed1', 'corridor']),
  wall([B, L - N], [A, L - N], ['bed1', 'corridor'], [{ start: .15, end: 1.1, kind: 'door' }]),
  wall([B, L - N], [B, L], ['bed1', 'corridor']), wall([0, L], [B, L], ['bed1', 'bath1']),
  wall([0, L + 3.6 / B], [B, L + 3.6 / B], ['bath1', 'bath2']), wall([0, Q], [B, Q], ['bath2', 'bed2']),
  wall([B, L], [B, Q], ['bath1', 'bath2', 'corridor'], [{ start: .7, end: 1.55, kind: 'door' }, { start: 2.7, end: 3.55, kind: 'door' }]),
  wall([B, Q], [B, R], ['bed2', 'corridor']), wall([B, R], [A, R], ['bed2', 'corridor'], [{ start: .15, end: 1.1, kind: 'door' }]),
  wall([A, Z - 1.77 / 1.4], [A, Z], ['corridor', 'closet'], [{ start: .2, end: 1.1, kind: 'door' }]),
  wall([A, Z - 1.77 / 1.4], [A + 1.4, Z - 1.77 / 1.4], ['closet']), wall([A + 1.4, Z - 1.77 / 1.4], [A + 1.4, Z], ['closet']),
  wall([A, Z], [F, Z], ['closet', 'living', 'entry'], [{ start: X - A + .8, end: X - A + 1.75, kind: 'door' }]),
  wall([A, Z], [A, H], ['corridor', 'bed2', 'living'], [{ start: .6, end: 1.55, kind: 'door' }]),
  wall([F, Z], [F, H], ['entry', 'bed3']),
  wall([X, Z], [X, H], ['living', 'entry', 'bed3'], [{ start: .3, end: 1.2, kind: 'door' }, { start: J - Z + .6, end: J - Z + 1.5, kind: 'door' }], true),
  wall([X, J], [F, J], ['entry', 'bed3'], [{ start: .5, end: 1.4, kind: 'door' }], true),
  wall([0, H], [F, H], ['bed2', 'living', 'bed3', 'balcony'], [{ start: .55, end: 2.35, kind: 'window' }, { start: 3.4, end: 4.3, kind: 'door' }, { start: 4.35, end: 6.2, kind: 'window' }, { start: X + .55, end: F - .45, kind: 'window' }]),
  wall([3.29, H], [3.29, H + 1.2], ['balcony']), wall([6.29, H], [6.29, H + 1.2], ['balcony']), wall([3.29, H + 1.2], [6.29, H + 1.2], ['balcony'], [{ start: .1, end: 2.9, kind: 'window' }])];
export const palette: Material[] = [
  { id: 'oak', name: 'Дуб натуральный', color: '#c9ab82', pattern: 'wood', width: .22, height: 1.8, rotation: 0, roughness: .7 },
  { id: 'ivory', name: 'Терраццо айвори', color: '#e8dfcd', pattern: 'stone', width: 1, height: 1, rotation: 0, roughness: .8 },
  { id: 'sand', name: 'Камень песочный', color: '#cfc3ad', pattern: 'stone', width: .6, height: .6, rotation: 0, roughness: .8 },
  { id: 'green', name: 'Зелёная плитка', color: '#617a67', pattern: 'tile', width: .3, height: .3, rotation: 0, roughness: .4 },
  { id: 'concrete', name: 'Бетон светлый', color: '#c4c4bb', pattern: 'stone', width: 1, height: 1, rotation: 0, roughness: .9 },
  { id: 'smoked', name: 'Дуб дымчатый', color: '#8b7760', pattern: 'wood', width: .22, height: 1.8, rotation: 0, roughness: .7 },
  { id: 'plaster', name: 'Тёплая штукатурка', color: '#ece6db', pattern: 'plain', width: 1, height: 1, rotation: 0, roughness: .95 },
  { id: 'white', name: 'Матовый белый', color: '#f4f2ec', pattern: 'plain', width: 1, height: 1, rotation: 0, roughness: .95 },
  { id: 'laminate', name: 'Ламинат дуб', color: '#bfa07d', pattern: 'wood', width: .19, height: 1.38, rotation: 0, roughness: .65 },
  { id: 'vinyl', name: 'Винил натуральный', color: '#b5a58c', pattern: 'wood', width: .18, height: 1.22, rotation: 0, roughness: .55 },
  { id: 'parquet', name: 'Инженерная доска', color: '#c5ae8b', pattern: 'wood', width: .18, height: 1.8, rotation: 0, roughness: .75 },
  { id: 'porcelain', name: 'Керамогранит 60×120', color: '#c4baab', pattern: 'tile', width: .6, height: 1.2, rotation: 0, roughness: .6 },
  { id: 'paint', name: 'Краска шалфей', color: '#bac2b0', pattern: 'plain', width: 1, height: 1, rotation: 0, roughness: .95 },
  { id: 'wallpaper', name: 'Обои льняные', color: '#d9d0ba', pattern: 'stone', width: .53, height: 1, rotation: 0, roughness: .95 }];
let seq = 0;
export const id = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${++seq}`;
export function defaultElevation(kind: Kind): number {
  return kind === 'television' ? 1 : kind === 'hood' ? 1.55 : kind === 'microwave' ? .9 : kind === 'mirror' ? 1.15 : kind === 'upper_cabinet' ? 1.5 : 0;
}
export const furnitureDimensions: Record<Kind, [number, number, number]> = {
  bed: [1.6, 2.1, .65], sofa: [2.2, .9, .85], table: [1.35, .85, .75], chair: [.48, .48, .85],
  wardrobe: [1.5, .6, 2.2], kitchen: [2.6, .65, .9], bath: [.75, 1.55, .55], toilet: [.4, .65, .5],
  plant: [.45, .45, 1.2], corner: [2.6, 1.6, .85], fridge: [.6, .65, 1.85], shower: [.9, .9, 2.1],
  vanity: [.8, .48, .85], washer: [.6, .6, .85], television: [1.23, .08, .72], oven: [.6, .58, .6],
  microwave: [.5, .4, .3], dishwasher: [.6, .6, .85], hood: [.6, .5, .7], workstation: [1.5, .75, 1.3],
  bookcase: [.8, .3, 2], rack: [2, 1.15, 2.14], bench: [.55, 1.25, .45], platform: [2, 2, .04],
  kettlebell: [.2, .2, .3], rug: [1.6, 2.3, .02], mirror: [.6, .04, .9], curtains: [2.2, .16, 2.65],
  nightstand: [.5, .42, .52], tvstand: [1.8, .42, .45], upper_cabinet: [1.2, .35, .72], pantry: [.6, .6, 2.2],
  island: [1.4, .75, .9], person: [.5, .32, HUMAN_HEIGHT_M], custom_glb: [.8, .8, .8],
  round_table: [1, 1, .75], slat_partition: [1.2, .08, 2.6], tv_stand_mobile: [1.15, .58, 1.48],
  laundry_tower: [.6, .62, 1.72], vanity_desk: [.95, .45, 1.35],
};
export function minimumFurnitureHeight(kind: Kind): number {
  return kind === 'platform' || kind === 'rug' ? .01 : .2;
}
export function makeFurniture(kind: Kind, roomId: string, x: number, z: number): Furniture {
  const [width, depth, height] = furnitureDimensions[kind];
  const color = ['sofa', 'bed', 'chair'].includes(kind) ? '#89937c'
    : kind === 'rug' ? '#d8cfc0'
    : kind === 'curtains' ? '#e7e2d7'
    : kind === 'person' ? '#4f655d'
    : kind === 'mirror' ? '#d8dde0'
    : kind === 'slat_partition' ? '#b89469'
    : kind === 'tv_stand_mobile' ? '#363c3e'
    : kind === 'laundry_tower' ? '#eceae4'
    : kind === 'vanity_desk' ? '#e5dfd3'
    : kind === 'upper_cabinet' || kind === 'pantry' ? '#ded8cd'
    : '#cfb48e';
  return { id: id(), kind, roomId, x, z, width, depth, height, elevation: defaultElevation(kind), rotation: 0, color };
}
// Local +Z is the front. The plan uses X/Y=Z and the scene rotates about Y by -rotation.
export function furnitureFront(rotation: number): Point {
  const angle = rotation * Math.PI / 180;
  return [-Math.sin(angle), Math.cos(angle)];
}

// Choose a point well inside the actual polygon, including rooms with a recess.
export function roomInteriorTarget(room: Room): Point {
  const middle = center(room), [width, depth] = roomSize(room);
  const left = middle[0] - width / 2, north = middle[1] - depth / 2;
  let best: Point | undefined, clearance = -Infinity;
  const consider = (pt: Point) => {
    if (!inside(pt, room.polygon)) return;
    const distance = Math.min(...room.polygon.map((a, i) => distSegment(pt, a, room.polygon[(i + 1) % room.polygon.length])));
    if (distance > clearance + 1e-9 || (Math.abs(distance - clearance) < 1e-9 && best && Math.hypot(pt[0] - middle[0], pt[1] - middle[1]) < Math.hypot(best[0] - middle[0], best[1] - middle[1]))) {
      best = pt; clearance = distance;
    }
  };
  consider(middle);
  for (let x = 1; x < 32; x++)
    for (let z = 1; z < 32; z++) consider([left + width * x / 32, north + depth * z / 32]);
  if (!best || clearance <= 1e-6) throw Error('В комнате не найдено место для передней стороны.');
  return best;
}

export function faceFurnitureInRoom(p: Project, furnitureId: string): Furniture {
  const variant = p.variants.find(v => v.id === p.activeVariantId)!;
  const index = variant.furniture.findIndex(f => f.id === furnitureId);
  if (index < 0) throw Error('Предмет больше не выбран.');
  const old = variant.furniture[index], room = p.rooms.find(r => r.id === old.roomId)!;
  const target = roomInteriorTarget(room);
  const facingAt = (x: number, z: number): Furniture | undefined => {
    if (Math.hypot(target[0] - x, target[1] - z) < 1e-6) return;
    const rotation = (Math.atan2(x - target[0], target[1] - z) * 180 / Math.PI + 360) % 360;
    const next = { ...old, x, z, rotation };
    if (!fitsFurniture(next, p)) return;
    // Use the same margin and full rotated footprint as other object edits.
    const bounded = boundFurniture(next, p);
    if (Math.abs(bounded.x - x) < .001 && Math.abs(bounded.z - z) < .001) return next;
  };
  let next = facingAt(old.x, old.z);
  if (!next) {
    const [width, depth] = roomSize(room), middle = center(room);
    let distance = Infinity;
    for (let x = 1; x < 32; x++) for (let z = 1; z < 32; z++) {
      const px = middle[0] - width / 2 + width * x / 32, pz = middle[1] - depth / 2 + depth * z / 32;
      const d = Math.hypot(px - old.x, pz - old.z);
      if (d >= distance || !inside([px, pz], room.polygon)) continue;
      const candidate = facingAt(px, pz);
      if (candidate) { next = candidate; distance = d }
    }
  }
  if (!next) throw Error('Не удалось повернуть предмет лицом в комнату с текущими габаритами.');
  validateFurnitureElevation(next, p.ceilingHeight);
  variant.furniture[index] = next;
  return next;
}

export function addFurnitureAt(p: Project, roomId: string, x: number, z: number, preset: { kind: Kind; dims: [number, number, number]; elevation?: number }): Furniture {
  const variant = p.variants.find(v => v.id === p.activeVariantId);
  if (!variant || !p.rooms.some(r => r.id === roomId) || ![x, z].every(Number.isFinite))
    throw Error('Место добавления больше недоступно.');
  const next = boundFurniture({ ...makeFurniture(preset.kind, roomId, x, z), width: preset.dims[0], depth: preset.dims[1], height: preset.dims[2], elevation: preset.elevation ?? defaultElevation(preset.kind) }, p);
  validateFurnitureElevation(next, p.ceilingHeight);
  if (!fitsFurniture(next, p)) throw Error('Эта модель не помещается в комнате. Выберите меньшую.');
  // Validate before mutating, so direct callers also retain an atomic failure.
  validateProject({ ...p, variants: p.variants.map(v => v === variant ? { ...v, furniture: [...v.furniture, next] } : v) });
  variant.furniture.push(next);
  return next;
}
export function createProject(): Project {
  const finishes = Object.fromEntries(rooms.map(r => [r.id, { floor: r.id.startsWith('bath') ? 'ivory' : r.id === 'balcony' ? 'sand' : 'oak', walls: r.id.startsWith('bath') ? 'green' : 'plaster', ceiling: 'white' }]));
  const f = (k: Kind, r: string, x: number, z: number, rotation = 0, dims?: number[]) => ({ ...makeFurniture(k, r, x, z), rotation, ...(dims ? { width: dims[0], depth: dims[1], height: dims[2] } : {}) });
  const p: Project = { version: 1, name: 'Демо-квартира', scale: 1, ceilingHeight: 2.8, rooms: structuredClone(rooms), walls: structuredClone(walls), materials: structuredClone(palette), activeVariantId: 'base', variants: [{ id: 'base', name: 'Вариант 1', finishes, electrical: { points: [], connections: [] }, furniture: [f('bed', 'bed1', 1.2, 1.8), f('wardrobe', 'bed1', .88, L - .3, 180, [1.5, .52, 2.2]), f('plant', 'bed1', 2.6, .6), f('bed', 'bed2', .72, 10.35, 0, [.9, 2, .62]), f('table', 'bed2', 2.2, H - .5, 0, [1.15, .6, .75]), f('chair', 'bed2', 2.2, H - 1.15, 0), f('wardrobe', 'bed2', .5, Q + .55, 270, [.9, .6, 2.2]), f('kitchen', 'living', 4.52, Z + .34, 0, [2.6, .6, .9]), f('fridge', 'living', 6.12, Z + .4), f('sofa', 'living', A + .55, H - 1.5, 270), f('table', 'living', 5.1, Z + 2, 0, [1.3, .8, .75]), f('chair', 'living', 5.1, Z + 1.25), f('chair', 'living', 5.1, Z + 2.75, 180), f('plant', 'living', X - .4, H - .45), f('table', 'living', 4.8, H - 1.3, 0, [.7, .7, .4]), f('bath', 'bath1', .45, L + 1), f('toilet', 'bath1', 1.25, L + .45), f('vanity', 'bath1', 1.2, L + 1.85, 180, [.75, .4, .85]), f('shower', 'bath2', .48, L + 3.6 / B + .5), f('toilet', 'bath2', 1.25, Q - .45, 180), f('washer', 'bath2', .4, Q - .35, 180), f('wardrobe', 'closet', A + 1.09, Z - .63, 90, [1.1, .5, 2.2]), f('wardrobe', 'entry', F - .32, Z + .85, 90, [1.4, .55, 2.2]), f('chair', 'balcony', 5.7, H + .6, 90), f('plant', 'balcony', 3.65, H + .6)], lighting: { mode: 'day', intensity: .8, warmth: 4500, azimuth: 125 } }] };
  p.variants[0].furniture = p.variants[0].furniture.map(f => boundFurniture(f, p));
  setupOffice(p);
  return p;
}
export function area(p: Point[]): number {
  return Math.abs(p.reduce((s, a, i) => {
    const b = p[(i + 1) % p.length];
    return s + a[0] * b[1] - b[0] * a[1]
  }, 0)) / 2;
}
export function center(r: Room): Point {
  const xs = r.polygon.map(p => p[0]), zs = r.polygon.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
}
export function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0])
      hit = !hit;
  }
  return hit;
}
export function solidSpans(w: Wall): [number, number][] {
  const length = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const result: [number, number][] = [];
  let cursor = 0;
  for (const o of [...(w.openings ?? [])].sort((a, b) => a.start - b.start)) {
    if (o.start > cursor)
      result.push([cursor, o.start]);
    cursor = o.end;
  }
  if (cursor < length)
    result.push([cursor, length]);
  return result;
}
function distSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
export function blocksWalking(f: Furniture): boolean {
  const elevation = f.elevation ?? 0;
  return f.kind !== 'platform' && f.kind !== 'rug' && f.kind !== 'person' && f.kind !== 'curtains' && elevation < 1.2 && elevation + f.height > .25;
}
export function canWalk(p: Point, project: Project, furniture: Furniture[] = []): boolean {
  if (!project.rooms.some(r => inside(p, r.polygon)))
    return false;
  const wallsClear = project.walls.every(w => {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    const spans = solidSpans({ ...w, openings: w.openings?.filter(o => o.kind === 'door') });
    return spans.every(([s, e]) => distSegment(p, [w.a[0] + (w.b[0] - w.a[0]) * s / len, w.a[1] + (w.b[1] - w.a[1]) * s / len], [w.a[0] + (w.b[0] - w.a[0]) * e / len, w.a[1] + (w.b[1] - w.a[1]) * e / len]) > .16)
  });
  if (!wallsClear) return false;
  const radius = .18;
  return !furniture.some(f => {
    if (!blocksWalking(f)) return false;
    const a = f.rotation * Math.PI / 180, dx = p[0] - f.x, dz = p[1] - f.z;
    const localX = dx * Math.cos(a) + dz * Math.sin(a), localZ = -dx * Math.sin(a) + dz * Math.cos(a);
    return Math.abs(localX) <= f.width / 2 / project.scale + radius && Math.abs(localZ) <= f.depth / 2 / project.scale + radius;
  });
}
export function furnitureFootprint(f: Furniture, scale = 1, shrinkM = 0): Point[] {
  const a = f.rotation * Math.PI / 180;
  const halfWidth = Math.max(.001, f.width / 2 - shrinkM) / scale, halfDepth = Math.max(.001, f.depth / 2 - shrinkM) / scale;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const x = sx * halfWidth, z = sz * halfDepth;
    return [f.x + x * Math.cos(a) - z * Math.sin(a), f.z + x * Math.sin(a) + z * Math.cos(a)] as Point
  })
}
/** Separating-axis test for two convex footprints. */
export function footprintOverlap(a: Point[], b: Point[]): boolean {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
    const nx = -(p2[1] - p1[1]), nz = p2[0] - p1[0];
    if (!nx && !nz) continue;
    const pa = a.map(q => q[0] * nx + q[1] * nz), pb = b.map(q => q[0] * nx + q[1] * nz);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9)
      return false;
  }
  return true;
}
/** Two centimetres of visual tolerance lets items stand flush without a false warning. */
export function furnitureOverlaps(p: Project, furniture: Furniture[]): { a: Furniture; b: Furniture }[] {
  const result: { a: Furniture; b: Furniture }[] = [];
  for (let i = 0; i < furniture.length; i++) for (let j = i + 1; j < furniture.length; j++) {
    const a = furniture[i], b = furniture[j];
    if (a.kind === 'platform' || b.kind === 'platform' || a.kind === 'rug' || b.kind === 'rug' || a.kind === 'person' || b.kind === 'person' || a.kind === 'curtains' || b.kind === 'curtains') continue;
    // The bench sits inside the power rack by design; composite sports items are not solids.
    if ((a.kind === 'rack' && b.kind === 'bench') || (a.kind === 'bench' && b.kind === 'rack')) continue;
    const a0 = a.elevation ?? 0, b0 = b.elevation ?? 0;
    if (Math.min(a0 + a.height, b0 + b.height) - Math.max(a0, b0) <= .02) continue;
    if (footprintOverlap(furnitureFootprint(a, p.scale, .01), furnitureFootprint(b, p.scale, .01)))
      result.push({ a, b });
  }
  return result;
}
function polygonDistance(a: Point[], b: Point[]): number {
  if (footprintOverlap(a, b)) return 0;
  let min = Infinity;
  for (const pt of a) for (let i = 0; i < b.length; i++)
    min = Math.min(min, distSegment(pt, b[i], b[(i + 1) % b.length]));
  for (const pt of b) for (let i = 0; i < a.length; i++)
    min = Math.min(min, distSegment(pt, a[i], a[(i + 1) % a.length]));
  return min;
}
/** Advisory warning when two distinct major floor obstacles leave a narrow gap (< 50 cm by default) that is not a flush join. */
export function passageWarnings(p: Project, furniture: Furniture[], minClearanceM = .5): { a: Furniture; b: Furniture; roomId: string; clearanceM: number }[] {
  const minor = new Set<Kind>(['plant', 'chair', 'kettlebell', 'platform', 'rack', 'bench', 'rug', 'person', 'curtains', 'nightstand', 'mirror']);
  const result: { a: Furniture; b: Furniture; roomId: string; clearanceM: number }[] = [];
  for (let i = 0; i < furniture.length; i++) for (let j = i + 1; j < furniture.length; j++) {
    const a = furniture[i], b = furniture[j];
    if (a.roomId !== b.roomId || !blocksWalking(a) || !blocksWalking(b)) continue;
    if (minor.has(a.kind) || minor.has(b.kind)) continue;
    // A low coffee table (height <= 50 cm) in front of a sofa is normal seating layout.
    if ((a.kind === 'table' && a.height <= .5) || (b.kind === 'table' && b.height <= .5)) continue;
    if (a.roomId.startsWith('bath')) continue;
    const polyA = furnitureFootprint(a, p.scale), polyB = furnitureFootprint(b, p.scale);
    const clearanceM = polygonDistance(polyA, polyB) * p.scale;
    // Items placed flush (<= 8 cm) are intentional adjacent units, not walk passages.
    if (clearanceM > .08 && clearanceM < minClearanceM - 1e-6)
      result.push({ a, b, roomId: a.roomId, clearanceM });
  }
  return result;
}
export function roomAt(p: Project, point: Point): Room | undefined {
  return p.rooms.find(r => inside(point, r.polygon));
}
/** Static clear strip beside each door; does not model the door leaf or human use. */
export function doorwayObstructions(p: Project, furniture: Furniture[], marginM = .16): { wall: number; furnitureId: string; roomId: string; kind: Kind }[] {
  const overlaps = (a: Point[], b: Point[]) => ![a, b].some(poly => poly.some((pt, i) => {
    const next = poly[(i + 1) % poly.length], nx = -(next[1] - pt[1]), nz = next[0] - pt[0];
    const A = a.map(v => v[0] * nx + v[1] * nz), B = b.map(v => v[0] * nx + v[1] * nz);
    return Math.max(...A) <= Math.min(...B) + 1e-9 || Math.max(...B) <= Math.min(...A) + 1e-9;
  }));
  const result: { wall: number; furnitureId: string; roomId: string; kind: Kind }[] = [];
  p.walls.forEach((w, wall) => {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (!len) return;
    const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
    for (const o of w.openings ?? []) if (o.kind === 'door') {
      const strip = [[o.start, -marginM / p.scale], [o.end, -marginM / p.scale], [o.end, marginM / p.scale], [o.start, marginM / p.scale]].map(([t, n]) => [w.a[0] + ux * t - uz * n, w.a[1] + uz * t + ux * n] as Point);
      for (const f of furniture) if (f.kind !== 'rug' && f.kind !== 'person' && f.kind !== 'curtains' && (f.elevation ?? 0) < 2.1 && overlaps(strip, furnitureFootprint(f, p.scale)))
        result.push({ wall, furnitureId: f.id, roomId: f.roomId, kind: f.kind });
    }
  });
  return result;
}
export function fitsFurniture(f: Furniture, p: Project): boolean {
  const room = p.rooms.find(r => r.id === f.roomId);
  if (!room)
    return false;
  const corners = furnitureFootprint(f, p.scale);
  return corners.every(pt => inside(pt, room.polygon)) && corners.every((a, i) => {
    const b = corners[(i + 1) % 4];
    return [.25, .5, .75].every(t => inside([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], room.polygon))
  })
}
export function boundFurniture(f: Furniture, p: Project): Furniture {
  const room = p.rooms.find(r => r.id === f.roomId)!;
  const xs = room.polygon.map(a => a[0]), zs = room.polygon.map(a => a[1]);
  const angle = f.rotation * Math.PI / 180;
  const rx = (Math.abs(Math.cos(angle)) * f.width + Math.abs(Math.sin(angle)) * f.depth) / 2 / p.scale;
  const rz = (Math.abs(Math.sin(angle)) * f.width + Math.abs(Math.cos(angle)) * f.depth) / 2 / p.scale;
  const bounded = { ...f, x: Math.max(Math.min(...xs) + rx + .025, Math.min(Math.max(...xs) - rx - .025, f.x)), z: Math.max(Math.min(...zs) + rz + .025, Math.min(Math.max(...zs) - rz - .025, f.z)) };
  if (fitsFurniture(bounded, p))
    return bounded;
  let best: Furniture | undefined, dist = Infinity;
  for (let x = Math.min(...xs) + rx + .025; x <= Math.max(...xs) - rx - .025; x += .08)
    for (let z = Math.min(...zs) + rz + .025; z <= Math.max(...zs) - rz - .025; z += .08) {
      const test = { ...bounded, x, z };
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < dist && fitsFurniture(test, p)) {
        best = test;
        dist = d
      }
    }
  if (best)
    return best;
  return f;
}
/** Snap a furniture item flush against nearby room walls within thresholdM physical metres. */
export function snapFurnitureToWalls(f: Furniture, p: Project, thresholdM = .12): Furniture {
  const room = p.rooms.find(r => r.id === f.roomId);
  if (!room) return f;
  const angle = f.rotation * Math.PI / 180;
  const rx = (Math.abs(Math.cos(angle)) * f.width + Math.abs(Math.sin(angle)) * f.depth) / 2 / p.scale;
  const rz = (Math.abs(Math.sin(angle)) * f.width + Math.abs(Math.cos(angle)) * f.depth) / 2 / p.scale;
  const margin = .025, threshold = thresholdM / p.scale;
  let bestX = f.x, bestDx = threshold + 1e-9;
  let bestZ = f.z, bestDz = threshold + 1e-9;
  for (let i = 0; i < room.polygon.length; i++) {
    const a = room.polygon[i], b = room.polygon[(i + 1) % room.polygon.length];
    if (Math.abs(a[0] - b[0]) < 1e-6) {
      const wx = a[0], z0 = Math.min(a[1], b[1]), z1 = Math.max(a[1], b[1]);
      if (f.z + rz >= z0 - threshold && f.z - rz <= z1 + threshold) {
        for (const cx of [wx + rx + margin, wx - rx - margin]) {
          const dx = Math.abs(f.x - cx);
          if (dx < bestDx && fitsFurniture({ ...f, x: cx }, p)) { bestX = cx; bestDx = dx; }
        }
      }
    } else if (Math.abs(a[1] - b[1]) < 1e-6) {
      const wz = a[1], x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
      if (f.x + rx >= x0 - threshold && f.x - rx <= x1 + threshold) {
        for (const cz of [wz + rz + margin, wz - rz - margin]) {
          const dz = Math.abs(f.z - cz);
          if (dz < bestDz && fitsFurniture({ ...f, z: cz }, p)) { bestZ = cz; bestDz = dz; }
        }
      }
    }
  }
  const both = { ...f, x: bestX, z: bestZ };
  if (fitsFurniture(both, p)) return both;
  const onlyX = { ...f, x: bestX };
  if (fitsFurniture(onlyX, p)) return onlyX;
  const onlyZ = { ...f, z: bestZ };
  if (fitsFurniture(onlyZ, p)) return onlyZ;
  return f;
}
// These edits preserve the selected object's identity and the active variant.
export function moveFurniture(p: Project, furnitureId: string, x: number, z: number, options?: { snap?: boolean }): Furniture {
  const variant = p.variants.find(v => v.id === p.activeVariantId)!;
  const index = variant.furniture.findIndex(f => f.id === furnitureId);
  if (index < 0)
    throw Error('Предмет больше не выбран.');
  const old = variant.furniture[index];
  // The dragged centre chooses the room, so one gesture can cross a doorway.
  const room = roomAt(p, [x, z]);
  const candidate = { ...old, roomId: room?.id ?? old.roomId, x, z };
  const snapped = options?.snap ? snapFurnitureToWalls(candidate, p) : candidate;
  const next = boundFurniture(snapped, p);
  if (!fitsFurniture(next, p))
    throw Error('Предмет не помещается в комнате.');
  variant.furniture[index] = next;
  return next;
}
export function moveFurnitureToRoom(p: Project, furnitureId: string, targetRoomId: string): Furniture {
  const variant = p.variants.find(v => v.id === p.activeVariantId)!;
  const index = variant.furniture.findIndex(f => f.id === furnitureId);
  if (index < 0) throw Error('Предмет больше не выбран.');
  const targetRoom = p.rooms.find(r => r.id === targetRoomId);
  if (!targetRoom) throw Error('Комната не найдена.');
  const old = variant.furniture[index];
  if (old.roomId === targetRoomId) return old;
  const target = roomInteriorTarget(targetRoom);
  const next = boundFurniture({ ...old, roomId: targetRoomId, x: target[0], z: target[1] }, p);
  if (!fitsFurniture(next, p))
    throw Error('Предмет не помещается в выбранной комнате.');
  variant.furniture[index] = next;
  return next;
}
export function replaceFurniture(p: Project, furnitureId: string, preset: { kind: Kind; dims: [number, number, number]; elevation?: number }): Furniture {
  const variant = p.variants.find(v => v.id === p.activeVariantId)!;
  const index = variant.furniture.findIndex(f => f.id === furnitureId);
  if (index < 0)
    throw Error('Предмет больше не выбран.');
  const old = variant.furniture[index];
  const next = boundFurniture({ ...makeFurniture(preset.kind, old.roomId, old.x, old.z), id: old.id, rotation: old.rotation, width: preset.dims[0], depth: preset.dims[1], height: preset.dims[2], elevation: preset.elevation ?? defaultElevation(preset.kind) }, p);
  validateFurnitureElevation(next, p.ceilingHeight);
  if (!fitsFurniture(next, p))
    throw Error('Эта модель не помещается в комнате. Выберите меньшую.');
  variant.furniture[index] = next;
  return next;
}
export function duplicateFurniture(p: Project, furnitureId: string): Furniture {
  const variant = p.variants.find(v => v.id === p.activeVariantId)!;
  const old = variant.furniture.find(f => f.id === furnitureId);
  if (!old)
    throw Error('Предмет больше не выбран.');
  const corners = furnitureFootprint(old, p.scale);
  const width = Math.max(...corners.map(pt => pt[0])) - Math.min(...corners.map(pt => pt[0]));
  const depth = Math.max(...corners.map(pt => pt[1])) - Math.min(...corners.map(pt => pt[1]));
  const offsets = [[width + .1 / p.scale, 0], [0, depth + .1 / p.scale], [-width - .1 / p.scale, 0], [0, -depth - .1 / p.scale]];
  for (const [dx, dz] of offsets) {
    const next = boundFurniture({ ...old, x: old.x + dx, z: old.z + dz }, p);
    // Keep the copy visibly separate from the original, including after clamping.
    if (fitsFurniture(next, p) && (Math.abs(next.x - old.x) >= width + .02 / p.scale || Math.abs(next.z - old.z) >= depth + .02 / p.scale)) {
      next.id = id();
      variant.furniture.push(next);
      return next;
    }
  }
  throw Error('Рядом нет места для копии. Переместите предмет или выберите меньший.');
}
export function roomSize(room: Room): Point {
  const xs = room.polygon.map(p => p[0]), zs = room.polygon.map(p => p[1]);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)]
}
// A static arrangement derived from the current room, in physical metres.
// Build and validate the entire replacement before touching the active variant.
export function setupOffice(p: Project): Furniture[] {
  const room = p.rooms.find(r => r.id === 'bed3');
  const variant = p.variants.find(v => v.id === p.activeVariantId);
  if (!room || !variant)
    throw Error('Кабинет или активный вариант не найден.');
  const xs = room.polygon.map(pt => pt[0]), zs = room.polygon.map(pt => pt[1]);
  const left = Math.min(...xs), right = Math.max(...xs), north = Math.min(...zs), south = Math.max(...zs);
  const metres = (n: number) => n / p.scale;
  const [pw, pd, ph] = furnitureDimensions.platform;
  const [dw, dd] = furnitureDimensions.workstation;
  const [rw, rd] = furnitureDimensions.rack;
  const [, bd] = furnitureDimensions.bench;
  const [, shelfDepth] = furnitureDimensions.bookcase;
  const [kw, kd] = furnitureDimensions.kettlebell;
  const [, cd] = furnitureDimensions.chair;
  const platformX = right - metres(pw / 2 + .06), platformZ = south - metres(pd / 2 + .06);
  const platformNorth = platformZ - metres(pd / 2), platformSouth = platformZ + metres(pd / 2);
  const deskX = right - metres(dd / 2 + .06), deskZ = north + metres(dw / 2 + .06);
  const deskWest = deskX - metres(dd / 2);
  const place = (kind: Kind, x: number, z: number, rotation = 0, elevation = 0, color = '#cfb48e') =>
    boundFurniture({ ...makeFurniture(kind, room.id, x, z), rotation, elevation, color }, p);
  const items = [
    place('platform', platformX, platformZ, 0, 0, '#79664f'),
    place('rack', platformX, platformSouth - metres(.08 + rd / 2), 180, ph, '#3e4947'),
    place('bench', platformX, platformNorth + metres(bd / 2 + .08), 180, ph, '#3e4947'),
    place('kettlebell', right - metres(.06 + kw / 2 + .1), platformNorth + metres(kd / 2 + .1), 0, ph, '#3e4947'),
    // Along the west wall, beyond its upper doorway; beside the gym footprint.
    place('bookcase', left + metres(shelfDepth / 2 + .06), platformZ, 270),
    // Along the east wall, clear of both upper doors; front faces west.
    place('workstation', deskX, deskZ, 90),
    place('chair', deskWest - metres(cd / 2 + .08), deskZ, 270, 0, '#89937c'),
  ];
  const bounds = (f: Furniture) => {
    const corners = furnitureFootprint(f, p.scale);
    return { x0: Math.min(...corners.map(pt => pt[0])), x1: Math.max(...corners.map(pt => pt[0])),
      z0: Math.min(...corners.map(pt => pt[1])), z1: Math.max(...corners.map(pt => pt[1])) };
  };
  const [platform, rack, bench, kettlebell, bookcase, desk, chair] = items;
  const P = bounds(platform);
  const separate = (a: Furniture, b: Furniture) => {
    const A = bounds(a), B = bounds(b);
    return A.x1 + metres(.05) <= B.x0 || B.x1 + metres(.05) <= A.x0 ||
      A.z1 + metres(.05) <= B.z0 || B.z1 + metres(.05) <= A.z0;
  };
  if (rw > pw || dw > (right - left) * p.scale || !items.every(f => fitsFurniture(f, p)) ||
      [rack, bench, kettlebell].some(f => {
        const b = bounds(f);
        return b.x0 < P.x0 - 1e-9 || b.x1 > P.x1 + 1e-9 || b.z0 < P.z0 - 1e-9 || b.z1 > P.z1 + 1e-9;
      }) || [desk, bookcase, chair].some(a => [platform, rack, bench, kettlebell].some(b => !separate(a, b))) ||
      !separate(desk, bookcase) || !separate(chair, bookcase) || doorwayObstructions(p, items).length > 0)
    throw Error('Расстановка кабинета не помещается в текущую комнату. Увеличьте её размеры или расставьте предметы вручную.');
  for (const f of items)
    validateFurnitureElevation(f, p.ceilingHeight);
  const replacement = [...variant.furniture.filter(f => f.roomId !== room.id), ...items];
  // Also check item count and the existing project contract before mutation.
  const candidate = { ...p, variants: p.variants.map(v => v === variant ? { ...v, furniture: replacement } : v) };
  validateProject(candidate);
  variant.furniture = replacement;
  return items;
}
export function resizeRoom(p: Project, roomId: string, axis: 0 | 1, newSize: number) {
  const r = p.rooms.find(r => r.id === roomId)!;
  const lo = Math.min(...r.polygon.map(a => a[axis])), hi = Math.max(...r.polygon.map(a => a[axis]));
  const ratio = newSize / (hi - lo), delta = newSize - (hi - lo);
  const remap = (n: number) => n <= lo ? n : n >= hi ? n + delta : lo + (n - lo) * ratio;
  for (const room of p.rooms)
    room.polygon = room.polygon.map(pt => {
      const n = [...pt] as Point;
      n[axis] = remap(n[axis]);
      return n
    });
  for (const w of p.walls) {
    const oldA = w.a[axis], oldB = w.b[axis];
    const oldLength = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    w.a[axis] = remap(w.a[axis]);
    w.b[axis] = remap(w.b[axis]);
    const newLength = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (!w.openings?.length || Math.abs(newLength - oldLength) < 1e-9 || oldLength < 1e-9) continue;
    const oldSpan = oldB - oldA, newSpan = w.b[axis] - w.a[axis];
    const toNew = (t: number) => Math.abs(newSpan) > 1e-9
      ? (remap(oldA + oldSpan * (t / oldLength)) - w.a[axis]) / newSpan * newLength
      : t * newLength / oldLength;
    let cursor = .02;
    w.openings.forEach((o, idx) => {
      const oldWidth = o.end - o.start;
      const mappedStart = toNew(o.start), mappedEnd = toNew(o.end);
      const centerNew = (mappedStart + mappedEnd) / 2;
      const minNext = (w.openings!.length - 1 - idx) * .52 + .02;
      const maxAllowed = Math.max(.3, newLength - cursor - minNext);
      const width = Math.min(oldWidth, maxAllowed);
      const start = Math.max(cursor, Math.min(newLength - minNext - width, centerNew - width / 2));
      o.start = start;
      o.end = start + width;
      cursor = o.end + .03;
    });
  }
  for (const v of p.variants) {
    v.furniture = v.furniture.map(f => boundFurniture({ ...f, ...(axis === 0 ? { x: remap(f.x) } : { z: remap(f.z) }) }, p));
    v.electrical.points = v.electrical.points.map(pt => ({ ...pt, ...(axis === 0 ? { x: remap(pt.x) } : { z: remap(pt.z) }) }));
    if (v.engineering?.items)
      v.engineering.items = v.engineering.items.map(it => ({ ...it, ...(axis === 0 ? { x: remap(it.x) } : { z: remap(it.z) }) }));
  }
}
export function wallOverrideKey(wallIndex: number, roomId: string): string {
  return `${wallIndex}:${roomId}`;
}
export function wallMaterialId(variant: Variant, wallIndex: number, roomId: string): string {
  return variant.wallOverrides?.[wallOverrideKey(wallIndex, roomId)] ?? variant.finishes[roomId]?.walls;
}
export function addEngineeringItem(p: Project, roomId: string, type: EngineeringType): EngineeringItem {
  const room = p.rooms.find(r => r.id === roomId);
  if (!room) throw Error('Комната не найдена.');
  const variant = p.variants.find(v => v.id === p.activeVariantId)!;
  variant.engineering ??= { items: [], heatedFloors: [] };
  if (variant.engineering.items.length >= MAX_ENGINEERING_ITEMS) throw Error('Слишком много инженерных отметок.');
  const [x, z] = center(room);
  const bounded = boundElectricalPoint({ id: id(), roomId, type: 'socket', x, z, height: 0 }, p);
  const item: EngineeringItem = { id: bounded.id, roomId, type, x: bounded.x, z: bounded.z };
  variant.engineering.items.push(item);
  return item;
}
export function moveEngineeringItem(p: Project, itemId: string, x: number, z: number): EngineeringItem {
  const variant = p.variants.find(v => v.id === p.activeVariantId)!;
  const items = variant.engineering?.items ?? [];
  const index = items.findIndex(it => it.id === itemId);
  if (index < 0) throw Error('Отметка больше не выбрана.');
  const cur = items[index];
  const bounded = boundElectricalPoint({ id: cur.id, roomId: cur.roomId, type: 'socket', x, z, height: 0 }, p);
  const next: EngineeringItem = { ...cur, x: bounded.x, z: bounded.z };
  items[index] = next;
  return next;
}
export function removeEngineeringItem(p: Project, itemId: string): void {
  const variant = p.variants.find(v => v.id === p.activeVariantId)!;
  if (!variant.engineering) return;
  variant.engineering.items = variant.engineering.items.filter(it => it.id !== itemId);
}
export function upsertHeatedFloorZone(p: Project, roomId: string, areaM2: number, wattsPerM2 = 150, label?: string): HeatedFloorZone {
  const room = p.rooms.find(r => r.id === roomId);
  if (!room) throw Error('Комната не найдена.');
  if (!Number.isFinite(areaM2) || areaM2 <= 0 || areaM2 > 100 || !Number.isFinite(wattsPerM2) || wattsPerM2 < 40 || wattsPerM2 > 300)
    throw Error('Некорректные параметры тёплого пола.');
  const variant = p.variants.find(v => v.id === p.activeVariantId)!;
  variant.engineering ??= { items: [], heatedFloors: [] };
  const existing = variant.engineering.heatedFloors.find(z => z.roomId === roomId);
  if (existing) {
    existing.areaM2 = areaM2;
    existing.wattsPerM2 = wattsPerM2;
    if (label !== undefined) existing.label = label;
    return existing;
  }
  const zone: HeatedFloorZone = { id: id(), roomId, areaM2, wattsPerM2, ...(label ? { label } : {}) };
  variant.engineering.heatedFloors.push(zone);
  return zone;
}
export function removeHeatedFloorZone(p: Project, roomId: string): void {
  const variant = p.variants.find(v => v.id === p.activeVariantId)!;
  if (!variant.engineering) return;
  variant.engineering.heatedFloors = variant.engineering.heatedFloors.filter(z => z.roomId !== roomId);
}
export function duplicateVariant(v: Variant): Variant {
  return { ...structuredClone(v), id: id(), name: `${v.name} — копия` };
}
// Points may sit on a wall boundary as well as inside the room.
export function electricalPointInRoom(pt: Point, room: Room): boolean {
  return inside(pt, room.polygon) || room.polygon.some((a, i) => distSegment(pt, a, room.polygon[(i + 1) % room.polygon.length]) < 1e-8);
}
export function boundElectricalPoint(pt: ElectricalPoint, p: Project): ElectricalPoint {
  const room = p.rooms.find(r => r.id === pt.roomId);
  if (!room || ![pt.x, pt.z].every(Number.isFinite))
    throw Error('Некорректная комната или положение точки.');
  if (electricalPointInRoom([pt.x, pt.z], room))
    return pt;
  let nearest: Point = room.polygon[0], distance = Infinity;
  for (let i = 0; i < room.polygon.length; i++) {
    const a = room.polygon[i], b = room.polygon[(i + 1) % room.polygon.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((pt.x - a[0]) * dx + (pt.z - a[1]) * dz) / lengthSquared)) : 0;
    const candidate: Point = [a[0] + t * dx, a[1] + t * dz];
    const d = Math.hypot(candidate[0] - pt.x, candidate[1] - pt.z);
    if (d < distance) { nearest = candidate; distance = d }
  }
  return { ...pt, x: nearest[0], z: nearest[1] };
}
const activeElectrical = (p: Project) => p.variants.find(v => v.id === p.activeVariantId)!.electrical;
export function addElectricalPoint(p: Project, roomId: string, type: ElectricalType): ElectricalPoint {
  const room = p.rooms.find(r => r.id === roomId);
  if (!room)
    throw Error('Комната не найдена.');
  const [x, z] = center(room);
  const heights: Record<ElectricalType, number> = { socket: .3, switch: 1.1, light: p.ceilingHeight, network: .3, appliance: .3 };
  const pt = boundElectricalPoint({ id: id(), roomId, type, x, z, height: heights[type] }, p);
  activeElectrical(p).points.push(pt);
  return pt;
}
export function moveElectricalPoint(p: Project, pointId: string, x: number, z: number): ElectricalPoint {
  const layer = activeElectrical(p), index = layer.points.findIndex(pt => pt.id === pointId);
  if (index < 0)
    throw Error('Точка больше не выбрана.');
  const next = boundElectricalPoint({ ...layer.points[index], x, z }, p);
  layer.points[index] = next;
  return next;
}
export function duplicateElectricalPoint(p: Project, pointId: string): ElectricalPoint {
  const old = activeElectrical(p).points.find(pt => pt.id === pointId);
  if (!old)
    throw Error('Точка больше не выбрана.');
  const offsets = [[.25, 0], [0, .25], [-.25, 0], [0, -.25]];
  const candidates = offsets.map(([dx, dz]) => boundElectricalPoint({ ...old, id: id(), x: old.x + dx / p.scale, z: old.z + dz / p.scale }, p));
  const copy = candidates.sort((a, b) => Math.hypot(b.x - old.x, b.z - old.z) - Math.hypot(a.x - old.x, a.z - old.z))[0];
  activeElectrical(p).points.push(copy);
  return copy;
}
export function removeElectricalPoint(p: Project, pointId: string): void {
  const layer = activeElectrical(p);
  layer.points = layer.points.filter(pt => pt.id !== pointId);
  layer.connections = layer.connections.filter(c => c.from !== pointId && c.to !== pointId);
}
export function connectElectricalPoints(p: Project, from: string, to: string): void {
  activeElectrical(p).connections.push({ id: id(), from, to });
}
export function setCeilingHeight(p: Project, height: number): void {
  if (!Number.isFinite(height) || height < 2 || height > 4)
    throw Error('Высота потолка должна быть от 200 до 400 см.');
  // Check every variant before mutating either furniture or electrical heights.
  for (const v of p.variants)
    if (v.furniture.some(f => (f.elevation ?? 0) > 0 && f.height > height))
      throw Error('Предмет выше нового потолка. Сначала уменьшите его высоту.');
  p.ceilingHeight = height;
  for (const v of p.variants) {
    v.furniture = v.furniture.map(f => (f.elevation ?? 0) > 0 ? { ...f, elevation: Math.min(f.elevation!, height - f.height) } : f);
    v.electrical.points = v.electrical.points.map(pt => ({ ...pt, height: Math.min(pt.height, height) }));
  }
}
export function validateFurnitureElevation(f: Furniture, ceilingHeight: number): void {
  const elevation = f.elevation === undefined ? 0 : f.elevation;
  if (!Number.isFinite(elevation) || elevation < 0 || elevation > 4)
    throw Error('Высота от пола должна быть конечным числом от 0 до 400 см.');
  // Legacy floor furniture keeps its previous acceptance semantics.
  if (elevation > 0 && elevation + f.height > ceilingHeight + .000001)
    throw Error('Верх предмета выше потолка. Уменьшите высоту от пола или высоту предмета.');
}
function validateElectrical(layer: ElectricalLayer | undefined, p: Project): void {
  if (layer === undefined)
    return; // Version 1 files made before electrical planning remain portable.
  const invalid = () => { throw Error('Некорректные точки электрики или условные связи.'); };
  if (!layer || !Array.isArray(layer.points) || !Array.isArray(layer.connections) || layer.points.length > MAX_ELECTRICAL_POINTS || layer.connections.length > MAX_ELECTRICAL_CONNECTIONS)
    invalid();
  const pointIds = new Set<string>(), connectionIds = new Set<string>(), pairs = new Set<string>();
  const validId = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 100;
  for (const pt of layer.points) {
    const room = p.rooms.find(r => r.id === pt?.roomId);
    if (!pt || !validId(pt.id) || pointIds.has(pt.id) || !Object.hasOwn(electricalNames, pt.type) || !room || ![pt.x, pt.z, pt.height].every(Number.isFinite) || pt.height < 0 || pt.height > p.ceilingHeight || !electricalPointInRoom([pt.x, pt.z], room) || (pt.label !== undefined && (typeof pt.label !== 'string' || pt.label.length > 60)))
      invalid();
    pointIds.add(pt.id);
  }
  for (const c of layer.connections) {
    if (!c || !validId(c.id) || pointIds.has(c.id) || connectionIds.has(c.id) || !pointIds.has(c.from) || !pointIds.has(c.to) || c.from === c.to)
      invalid();
    const pair = JSON.stringify([c.from, c.to].sort());
    if (pairs.has(pair))
      invalid();
    connectionIds.add(c.id);
    pairs.add(pair);
  }
}
export function validateProject(raw: unknown): Project {
  const p = raw as Project;
  if (!p || p.version !== 1 || typeof p.name !== 'string' || p.name.length > 80 || !Number.isFinite(p.scale) || p.scale < .5 || p.scale > 2 || !Number.isFinite(p.ceilingHeight) || p.ceilingHeight < 2 || p.ceilingHeight > 4)
    throw Error('Неподдерживаемый или повреждённый файл проекта.');
  if (!Array.isArray(p.rooms) || !Array.isArray(p.walls) || p.rooms.length !== rooms.length || p.rooms.some((r, i) => r.id !== rooms[i].id || typeof r.name !== 'string' || r.polygon.length !== rooms[i].polygon.length || r.polygon.some(pt => pt.length !== 2 || pt.some(n => !Number.isFinite(n) || n < 0 || n > 40))) || p.walls.length !== walls.length || p.walls.some(w => ![...w.a, ...w.b].every(n => Number.isFinite(n) && n >= 0 && n <= 40) || w.rooms.some(id => !rooms.some(r => r.id === id)) || (w.openings ?? []).some(o => !Number.isFinite(o.start) || !Number.isFinite(o.end) || o.start < 0 || o.end <= o.start || o.end > Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) + .001 || !['door', 'window'].includes(o.kind))))
    throw Error('Геометрия не соответствует этой квартире.');
  if (!Array.isArray(p.materials) || p.materials.length < 8 || p.materials.length > 120 || !Array.isArray(p.variants) || p.variants.length < 1 || p.variants.length > 20)
    throw Error('Некорректные материалы или варианты.');
  const ids = new Set<string>();
  for (const m of p.materials) {
    if (typeof m.id !== 'string' || ids.has(m.id) || typeof m.name !== 'string' || m.name.length > 80 || !/^#[\da-f]{6}$/i.test(m.color) || !['wood', 'stone', 'tile', 'plain', 'image'].includes(m.pattern) || ![m.width, m.height, m.rotation, m.roughness].every(Number.isFinite) || m.width < .05 || m.width > 10 || m.height < .05 || m.height > 10 || m.rotation < 0 || m.rotation > 360 || m.roughness < 0 || m.roughness > 1 || (m.image && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(m.image) || m.image.length > 3000000)))
      throw Error('Некорректное описание материала.');
    ids.add(m.id)
    if (m.quote !== undefined) validateMaterialQuote(m.quote);
  }
  const variantIds = new Set<string>();
  for (const v of p.variants) {
    if (!v || typeof v.id !== 'string' || variantIds.has(v.id) || typeof v.name !== 'string' || v.name.length > 80 || !Array.isArray(v.furniture) || v.furniture.length > 100 || !v.lighting || !['day', 'evening', 'uniform'].includes(v.lighting.mode) || ![v.lighting.intensity, v.lighting.warmth, v.lighting.azimuth].every(Number.isFinite) || v.lighting.intensity < 0 || v.lighting.intensity > 1.5 || v.lighting.warmth < 2500 || v.lighting.warmth > 6500 || v.lighting.azimuth < 0 || v.lighting.azimuth > 360)
      throw Error('Некорректный вариант.');
    variantIds.add(v.id);
    for (const r of rooms)
      for (const s of ['floor', 'walls', 'ceiling'] as Surface[])
        if (!ids.has(v.finishes?.[r.id]?.[s]))
          throw Error('Материал поверхности не найден.');
    if (v.wallOverrides !== undefined) {
      if (!v.wallOverrides || typeof v.wallOverrides !== 'object' || Array.isArray(v.wallOverrides))
        throw Error('Некорректная отделка отдельных стен.');
      for (const [k, matId] of Object.entries(v.wallOverrides)) {
        const [wIdx, rId] = k.split(':');
        const idx = Number(wIdx);
        if (!Number.isInteger(idx) || idx < 0 || idx >= walls.length || !rooms.some(r => r.id === rId) || !ids.has(matId))
          throw Error('Некорректная ссылка на стену или материал.');
      }
    }
    const fids = new Set<string>();
    const validKinds = Object.keys(furnitureDimensions);
    for (const f of v.furniture) {
      if (!f || typeof f.id !== 'string' || fids.has(f.id) || !validKinds.includes(f.kind) || !rooms.some(r => r.id === f.roomId) || ![f.x, f.z, f.width, f.depth, f.height, f.rotation].every(Number.isFinite) || f.width < .2 || f.width > 3.5 || f.depth < .01 || f.depth > 3.5 || f.height < minimumFurnitureHeight(f.kind) || f.height > 3 || f.rotation < 0 || f.rotation > 360 || !/^#[\da-f]{6}$/i.test(f.color) || Math.abs(boundFurniture(f, p).x - f.x) > .001 || Math.abs(boundFurniture(f, p).z - f.z) > .001 || !fitsFurniture(f, p))
        throw Error('Некорректная мебель или положение за границей комнаты.');
      if (f.label !== undefined && (typeof f.label !== 'string' || f.label.length > 120))
        throw Error('Некорректное название предмета мебели.');
      if (f.price !== undefined && (typeof f.price !== 'number' || !Number.isFinite(f.price) || f.price < 0 || f.price > 10_000_000))
        throw Error('Некорректная цена предмета мебели.');
      if (f.currency !== undefined && !/^[A-Z]{3}$/.test(f.currency))
        throw Error('Некорректная валюта цены мебели.');
      if (f.sourceUrl !== undefined) {
        try { const u = new URL(f.sourceUrl); if (f.sourceUrl.length > 2000 || !['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error(); }
        catch { throw Error('Некорректная ссылка предмета мебели.'); }
      }
      if (f.modelAssetId !== undefined && (typeof f.modelAssetId !== 'string' || f.modelAssetId.length > 100))
        throw Error('Некорректная ссылка на 3D-модель.');
      validateFurnitureElevation(f, p.ceilingHeight);
      fids.add(f.id)
    }
    if (v.doorColor !== undefined && !/^#[\da-f]{6}$/i.test(v.doorColor))
      throw Error('Некорректный цвет дверей.');
    if (v.doorStyle !== undefined && !['framed', 'hidden'].includes(v.doorStyle))
      throw Error('Некорректный стиль дверей.');
    if (v.skirtingColor !== undefined && !/^#[\da-f]{6}$/i.test(v.skirtingColor))
      throw Error('Некорректный цвет плинтуса.');
    if (v.skirtingHeight !== undefined && (!Number.isFinite(v.skirtingHeight) || v.skirtingHeight < .03 || v.skirtingHeight > .22))
      throw Error('Некорректная высота плинтуса.');
    if (v.savedViews !== undefined) {
      if (!Array.isArray(v.savedViews) || v.savedViews.length > 30)
        throw Error('Некорректные сохранённые ракурсы.');
      for (const sv of v.savedViews) {
        if (!sv || typeof sv.id !== 'string' || typeof sv.name !== 'string' || sv.name.length > 80 || !rooms.some(r => r.id === sv.roomId) || !['3d', 'walk'].includes(sv.mode) || !Array.isArray(sv.pos) || sv.pos.length !== 3 || !sv.pos.every(Number.isFinite))
          throw Error('Некорректный сохранённый ракурс.');
      }
    }
    if (v.roadmap !== undefined) {
      if (!v.roadmap || typeof v.roadmap !== 'object' || Array.isArray(v.roadmap))
        throw Error('Некорректный план этапов ремонта.');
      for (const st of Object.values(v.roadmap)) {
        if (!['todo', 'in_progress', 'done'].includes(st))
          throw Error('Некорректный статус этапа ремонта.');
      }
    }
    validateElectrical(v.electrical, p);
    if (v.engineering !== undefined) {
      if (!v.engineering || !Array.isArray(v.engineering.items) || !Array.isArray(v.engineering.heatedFloors) || v.engineering.items.length > MAX_ENGINEERING_ITEMS || v.engineering.heatedFloors.length > rooms.length)
        throw Error('Некорректный слой инженерии.');
      for (const it of v.engineering.items) {
        const room = p.rooms.find(r => r.id === it?.roomId);
        if (!it || typeof it.id !== 'string' || !Object.hasOwn(engineeringNames, it.type) || !room || ![it.x, it.z].every(Number.isFinite) || !electricalPointInRoom([it.x, it.z], room) || (it.label !== undefined && (typeof it.label !== 'string' || it.label.length > 60)))
          throw Error('Некорректная инженерная отметка.');
      }
      for (const z of v.engineering.heatedFloors) {
        if (!z || typeof z.id !== 'string' || !rooms.some(r => r.id === z.roomId) || !Number.isFinite(z.areaM2) || z.areaM2 <= 0 || z.areaM2 > 100 || !Number.isFinite(z.wattsPerM2) || z.wattsPerM2 < 40 || z.wattsPerM2 > 300)
          throw Error('Некорректная зона тёплого пола.');
      }
    }
  }
  if (!variantIds.has(p.activeVariantId))
    throw Error('Активный вариант отсутствует.');
  if (p.finishAllowance !== undefined) {
    const fa = p.finishAllowance;
    if (!fa || typeof fa !== 'object' || Array.isArray(fa)) throw Error('Некорректные допуски отделки.');
    if (fa.wallCm !== undefined && (!Number.isFinite(fa.wallCm) || fa.wallCm < 0 || fa.wallCm > 15)) throw Error('Некорректная толщина штукатурки.');
    if (fa.floorCm !== undefined && (!Number.isFinite(fa.floorCm) || fa.floorCm < 0 || fa.floorCm > 25)) throw Error('Некорректная толщина стяжки.');
    if (fa.ceilingCm !== undefined && (!Number.isFinite(fa.ceilingCm) || fa.ceilingCm < 0 || fa.ceilingCm > 30)) throw Error('Некорректный опуск потолка.');
  }
  if (p.storageChecklist !== undefined) {
    if (!p.storageChecklist || typeof p.storageChecklist !== 'object' || Array.isArray(p.storageChecklist))
      throw Error('Некорректный чеклист хранения.');
    for (const val of Object.values(p.storageChecklist)) {
      if (typeof val !== 'string' || val.length > 120) throw Error('Некорректная запись в чеклисте хранения.');
    }
  }
  const normalized = structuredClone(p);
  for (const v of normalized.variants)
    v.electrical ??= { points: [], connections: [] };
  return normalized;
}
export function validateMaterialQuote(q: MaterialQuote): void {
  const bad = () => { throw Error('Некорректная цена или упаковка материала.'); };
  if (!q || typeof q !== 'object' || Array.isArray(q)) bad();
  for (const key of ['price', 'packCoverageM2', 'packPieces'] as const)
    if (q[key] !== undefined && (typeof q[key] !== 'number' || !Number.isFinite(q[key]) || q[key]! <= 0 || q[key]! > 1_000_000)) bad();
  if (q.packPieces !== undefined && !Number.isInteger(q.packPieces)) bad();
  if (q.priceUnit !== undefined && !['m2', 'pack', 'item', 'unknown'].includes(q.priceUnit)) bad();
  if (q.currency !== undefined && !/^[A-Z]{3}$/.test(q.currency)) bad();
  if (q.retailer !== undefined && (typeof q.retailer !== 'string' || q.retailer.length > 80)) bad();
  if (q.observedAt !== undefined && (typeof q.observedAt !== 'string' || q.observedAt.length > 40 || !Number.isFinite(Date.parse(q.observedAt)))) bad();
  if (q.sourceUrl !== undefined) {
    try { const u = new URL(q.sourceUrl); if (q.sourceUrl.length > 2000 || !['http:', 'https:'].includes(u.protocol) || u.username || u.password) bad(); }
    catch { bad(); }
  }
}
export function parseProject(text: string): Project {
  if (text.length > 25_000_000)
    throw Error('Файл слишком большой (до 25 МБ).');
  try {
    return validateProject(JSON.parse(text));
  } catch (e) {
    if (e instanceof SyntaxError)
      throw Error('Не удалось прочитать JSON. Текущий проект сохранён.');
    throw e
  }
}
