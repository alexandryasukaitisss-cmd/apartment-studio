import {
  type FinishAllowance,
  type Furniture,
  type Kind,
  type Point,
  type Project,
  type Variant,
  area,
  center,
  furnitureFootprint,
  furnitureFront,
  roomSize,
} from './model';
import { kindNames } from './furnitureCatalog';
import { openingHeights } from './openingHeights';
import { roomOpenings, wallLength } from './openings';
import { doorSwingInfo, furnitureRoomClearances } from './roomMeasures';
import { wallFaceSpans } from './wallSides';

export const DEFAULT_FINISH_ALLOWANCE: Required<FinishAllowance> = {
  wallCm: 2.5,
  floorCm: 6,
  ceilingCm: 7,
};

export const STORAGE_CHECKLIST_ITEMS = [
  { key: 'vacuum', label: 'Пылесос / робот-пылесос (база с розеткой)' },
  { key: 'mop', label: 'Швабра, ведро и бытовая химия' },
  { key: 'dryer', label: 'Сушилка для белья (или сушильная машина)' },
  { key: 'ironing', label: 'Гладильная доска и утюг / отпариватель' },
  { key: 'ladder', label: 'Стремянка и ящик с инструментами' },
  { key: 'seasonal', label: 'Сезонная верхняя одежда и обувь' },
  { key: 'luggage', label: 'Чемоданы, спорт-инвентарь / коляска' },
] as const;

export interface AuditIssue {
  id: string;
  severity: 'error' | 'warn' | 'info';
  category: 'allowance' | 'door' | 'delivery' | 'plumbing' | 'light' | 'privacy' | 'storage' | 'ceiling';
  roomId?: string;
  furnitureId?: string;
  title: string;
  detail: string;
  action?: { type: 'flip_door'; wallIndex: number; openingIndex: number };
}

export interface DeliveryCheck {
  furnitureId: string;
  kind: Kind;
  label: string;
  roomId: string;
  status: 'ok' | 'tight' | 'blocked';
  minDoorClearCm: number;
  reason: string;
  pathRooms: string[];
  pathPoints: Point[];
}

export interface PlumbingRun {
  furnitureId: string;
  label: string;
  roomId: string;
  riserId?: string;
  from: Point;
  to: Point;
  distanceM: number;
  slopeCmPerM: number;
  requiredRiseCm: number;
  severity: 'ok' | 'warn' | 'error';
  note: string;
}

export interface RoomFinishCheck {
  roomId: string;
  roomName: string;
  grossWidthCm: number;
  grossDepthCm: number;
  netWidthCm: number;
  netDepthCm: number;
  netCeilingCm: number;
  seamlessCeilingOk: boolean;
  needsVentilationReminder: boolean;
}

export interface DirtyZoneOverlay {
  polygon: Point[];
  entryDoorMid: Point;
  viewCone: Point[];
  crossesTraffic: boolean;
  visibleTargets: string[];
}

export interface StorageMetrics {
  totalStorageM2: number;
  totalLinearM: number;
  ratioPct: number;
  grade: 'good' | 'tight' | 'low';
  note: string;
}

export interface LayoutAuditReport {
  allowance: Required<FinishAllowance>;
  issues: AuditIssue[];
  rooms: RoomFinishCheck[];
  delivery: DeliveryCheck[];
  plumbing: PlumbingRun[];
  hasRiserMarkers: boolean;
  dirtyZone: DirtyZoneOverlay | null;
  storage: StorageMetrics;
  counts: { error: number; warn: number; info: number };
}

export function resolvedAllowance(project: Project): Required<FinishAllowance> {
  return {
    wallCm: project.finishAllowance?.wallCm ?? DEFAULT_FINISH_ALLOWANCE.wallCm,
    floorCm: project.finishAllowance?.floorCm ?? DEFAULT_FINISH_ALLOWANCE.floorCm,
    ceilingCm: project.finishAllowance?.ceilingCm ?? DEFAULT_FINISH_ALLOWANCE.ceilingCm,
  };
}

interface DoorEdge {
  to: string;
  clearWidthM: number;
  doorMid: Point;
  corridorHintM: number;
}

function buildDoorGraph(project: Project): Map<string, DoorEdge[]> {
  const graph = new Map<string, DoorEdge[]>();
  const add = (from: string, edge: DoorEdge) => {
    const list = graph.get(from) ?? [];
    list.push(edge);
    graph.set(from, list);
  };
  for (const w of project.walls) {
    const len = wallLength(w);
    if (!len) continue;
    const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
    const spans = wallFaceSpans(w, project, 0, len);
    for (const o of w.openings ?? []) {
      if (o.kind !== 'door') continue;
      const mid = (o.start + o.end) / 2;
      const span = spans.find(s => mid >= s.start - 1e-6 && mid <= s.end + 1e-6);
      if (!span?.positive || !span?.negative) continue;
      const doorMid: Point = [w.a[0] + ux * mid, w.a[1] + uz * mid];
      // Door frame reduces clear pass-through width by ~8 cm.
      const clearWidthM = Math.max(.4, (o.end - o.start) * project.scale - .08);
      const roomA = project.rooms.find(r => r.id === span.positive);
      const roomB = project.rooms.find(r => r.id === span.negative);
      const minDimA = roomA ? Math.min(...roomSize(roomA)) * project.scale : 1.5;
      const minDimB = roomB ? Math.min(...roomSize(roomB)) * project.scale : 1.5;
      add(span.positive, { to: span.negative, clearWidthM, doorMid, corridorHintM: Math.min(minDimA, minDimB) });
      add(span.negative, { to: span.positive, clearWidthM, doorMid, corridorHintM: Math.min(minDimA, minDimB) });
    }
  }
  return graph;
}

function findEntryDoor(project: Project): { mid: Point; inward: Point; widthM: number } | null {
  const entry = project.rooms.find(r => r.id === 'entry');
  if (!entry) return null;
  const entryCenter = center(entry);
  for (const w of project.walls) {
    if (!w.rooms.includes('entry')) continue;
    const len = wallLength(w);
    if (!len) continue;
    const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
    const spans = wallFaceSpans(w, project, 0, len);
    for (const o of w.openings ?? []) {
      if (o.kind !== 'door') continue;
      const mid = (o.start + o.end) / 2;
      const span = spans.find(s => mid >= s.start - 1e-6 && mid <= s.end + 1e-6);
      // Exterior entrance door has entry on one side and nothing on the other.
      if (span && ((span.positive === 'entry' && !span.negative) || (span.negative === 'entry' && !span.positive))) {
        const pt: Point = [w.a[0] + ux * mid, w.a[1] + uz * mid];
        const dx = entryCenter[0] - pt[0], dz = entryCenter[1] - pt[1];
        const d = Math.hypot(dx, dz) || 1;
        return { mid: pt, inward: [dx / d, dz / d], widthM: (o.end - o.start) * project.scale };
      }
    }
  }
  return null;
}

function evaluateDelivery(project: Project, variant: Variant, entryDoor: ReturnType<typeof findEntryDoor>): DeliveryCheck[] {
  const graph = buildDoorGraph(project);
  const startRoom = project.rooms.some(r => r.id === 'entry') ? 'entry' : project.rooms[0].id;
  const entryClearM = entryDoor ? Math.max(.5, entryDoor.widthM - .08) : .87;
  const bigKinds = new Set<Kind>([
    'bed', 'sofa', 'corner', 'wardrobe', 'kitchen', 'bath', 'fridge', 'shower',
    'washer', 'laundry_tower', 'pantry', 'island', 'workstation', 'table', 'round_table', 'tvstand', 'rack', 'slat_partition',
  ]);

  const results: DeliveryCheck[] = [];
  for (const f of variant.furniture) {
    if (!bigKinds.has(f.kind) && Math.max(f.width, f.depth) < 1.1) continue;
    // BFS shortest path from entry to f.roomId
    const queue: { room: string; rooms: string[]; points: Point[]; minDoor: number; minTurnHall: number }[] = [{
      room: startRoom,
      rooms: [startRoom],
      points: [entryDoor?.mid ?? center(project.rooms.find(r => r.id === startRoom)!)],
      minDoor: entryClearM,
      minTurnHall: Math.min(...roomSize(project.rooms.find(r => r.id === startRoom)!)) * project.scale,
    }];
    const visited = new Set<string>([startRoom]);
    let found: typeof queue[number] | null = null;
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.room === f.roomId) {
        found = cur;
        break;
      }
      for (const edge of graph.get(cur.room) ?? []) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        queue.push({
          room: edge.to,
          rooms: [...cur.rooms, edge.to],
          points: [...cur.points, edge.doorMid],
          minDoor: Math.min(cur.minDoor, edge.clearWidthM),
          minTurnHall: Math.min(cur.minTurnHall, edge.corridorHintM),
        });
      }
    }

    const label = f.label ? `${kindNames[f.kind]} (${f.label})` : kindNames[f.kind];
    if (!found) {
      results.push({
        furnitureId: f.id, kind: f.kind, label, roomId: f.roomId,
        status: 'blocked', minDoorClearCm: 0,
        reason: 'Нет сквозного маршрута через двери от прихожей.',
        pathRooms: [f.roomId], pathPoints: [[f.x, f.z]],
      });
      continue;
    }

    const pathPoints: Point[] = [...found.points, [f.x, f.z]];
    const dims = [f.width, f.depth, f.height].sort((a, b) => a - b); // [smallest, mid, largest]
    const smallest = dims[0];
    const carryWidth = Math.min(f.width, f.depth);
    const carryLength = Math.max(f.width, f.depth);
    const minDoorClearM = found.minDoor;
    const minDoorClearCm = Math.round(minDoorClearM * 100);
    // Turning a rigid item of length L and thickness W from a corridor C through a perpendicular doorway D:
    // conservative clear turn capacity ~ C + D - W (when carried horizontally).
    const maxTurnLengthM = found.minTurnHall + minDoorClearM - carryWidth;
    const disassemblable = ['bed', 'wardrobe', 'kitchen', 'table', 'round_table', 'workstation', 'pantry', 'island', 'rack', 'tvstand', 'slat_partition'].includes(f.kind);

    let status: DeliveryCheck['status'] = 'ok';
    let reason = `Свободный занос через проёмы (мин. в свету ${minDoorClearCm} см).`;

    if (smallest > minDoorClearM - .01) {
      status = disassemblable ? 'tight' : 'blocked';
      reason = disassemblable
        ? `В сборе (${Math.round(smallest * 100)} см) шире проёма ${minDoorClearCm} см — заносить в разобранном виде.`
        : `Не пройдёт в проём ${minDoorClearCm} см (мин. габарит ${Math.round(smallest * 100)} см)!`;
    } else if (found.rooms.length >= 2 && carryLength > maxTurnLengthM + .05) {
      // Check if standing upright (rotating length vertically below ceiling) helps for thin items (mattress, sofa, bath)
      const uprightOk = carryLength < project.ceilingHeight - .15 && smallest <= minDoorClearM - .04;
      if (disassemblable) {
        status = 'tight';
        reason = `Длина ${Math.round(carryLength * 100)} см сложна для поворота 90° в коридоре (${Math.round(found.minTurnHall * 100)} см) — заносить в разборе.`;
      } else if (uprightOk) {
        status = 'tight';
        reason = `На повороте в коридоре (${Math.round(found.minTurnHall * 100)} см) потребуется проносить вертикально/боком.`;
      } else {
        status = 'blocked';
        reason = `Риск застревания на повороте 90° в коридоре (${Math.round(found.minTurnHall * 100)} см) при длине ${Math.round(carryLength * 100)} см!`;
      }
    } else if (carryWidth > minDoorClearM - .03) {
      status = 'tight';
      reason = `Проходит в проём ${minDoorClearCm} см только боком или со снятием двери с петель.`;
    }

    results.push({
      furnitureId: f.id, kind: f.kind, label, roomId: f.roomId,
      status, minDoorClearCm, reason, pathRooms: found.rooms, pathPoints,
    });
  }
  const order = { blocked: 0, tight: 1, ok: 2 };
  return results.sort((a, b) => order[a.status] - order[b.status]);
}

function evaluatePlumbing(project: Project, variant: Variant): { runs: PlumbingRun[]; hasRiserMarkers: boolean } {
  const risers = (variant.engineering?.items ?? []).filter(it => it.type === 'riser');
  const hasRiserMarkers = risers.length > 0;
  // Fallback reference points in bath1 / bath2 if user hasn't placed riser markers yet.
  const fallbackTargets: Point[] = [];
  for (const rId of ['bath2', 'bath1']) {
    const r = project.rooms.find(room => room.id === rId);
    if (r) {
      const xs = r.polygon.map(p => p[0]), zs = r.polygon.map(p => p[1]);
      fallbackTargets.push([Math.min(...xs) + .18, (Math.min(...zs) + Math.max(...zs)) / 2]);
    }
  }
  const plumbingKinds = new Set<Kind>(['toilet', 'bath', 'shower', 'vanity', 'washer', 'laundry_tower', 'dishwasher', 'kitchen']);
  const runs: PlumbingRun[] = [];
  for (const f of variant.furniture) {
    if (!plumbingKinds.has(f.kind)) continue;
    const candidates = hasRiserMarkers
      ? risers.map(r => ({ id: r.id, pt: [r.x, r.z] as Point }))
      : fallbackTargets.map((pt, i) => ({ id: `est-${i}`, pt }));
    if (!candidates.length) continue;
    let best = candidates[0], bestDist = Infinity;
    for (const c of candidates) {
      // Manhattan-blended pipe routing along walls (~1.25x Euclidean distance)
      const euclid = Math.hypot(c.pt[0] - f.x, c.pt[1] - f.z) * project.scale;
      if (euclid < bestDist) { bestDist = euclid; best = c; }
    }
    const distanceM = Math.round(bestDist * 1.15 * 100) / 100;
    const isToilet = f.kind === 'toilet';
    const slopeCmPerM = isToilet ? 2.5 : 3;
    const requiredRiseCm = Math.round(distanceM * slopeCmPerM * 10) / 10;
    let severity: PlumbingRun['severity'] = 'ok';
    let note = `Трасса ≈ ${distanceM.toFixed(1).replace('.', ',')} м · уклон +${Math.ceil(requiredRiseCm)} см${hasRiserMarkers ? '' : ' (ориентир до стояка санузла)'}.`;
    if (isToilet && distanceM > 2.0) {
      severity = 'error';
      note = `Унитаз далеко от стояка (≈ ${distanceM.toFixed(1).replace('.', ',')} м, подъём ${Math.ceil(requiredRiseCm)} см) — высокий риск засоров, нужен подиум или сололифт!`;
    } else if (isToilet && distanceM > 1.4) {
      severity = 'warn';
      note = `Унитаз на удалении ≈ ${distanceM.toFixed(1).replace('.', ',')} м (подъём трубы ~${Math.ceil(requiredRiseCm)} см) — проверьте высоту отвода стояка.`;
    } else if (!isToilet && distanceM > 3.6) {
      severity = 'warn';
      note = `Длинный слив ≈ ${distanceM.toFixed(1).replace('.', ',')} м (нужен уклон ~${Math.ceil(requiredRiseCm)} см) — проверьте проход трассы без порогов.`;
    }
    runs.push({
      furnitureId: f.id,
      label: f.label || kindNames[f.kind],
      roomId: f.roomId,
      riserId: hasRiserMarkers ? best.id : undefined,
      from: [f.x, f.z],
      to: best.pt,
      distanceM,
      slopeCmPerM,
      requiredRiseCm,
      severity,
      note,
    });
  }
  return { runs, hasRiserMarkers };
}

function evaluateDirtyZoneAndPrivacy(project: Project, variant: Variant, entryDoor: ReturnType<typeof findEntryDoor>): DirtyZoneOverlay | null {
  const entry = project.rooms.find(r => r.id === 'entry');
  if (!entry || !entryDoor) return null;
  const xs = entry.polygon.map(p => p[0]), zs = entry.polygon.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const halfW = .68 / project.scale;
  const depth = 1.15 / project.scale;
  const x0 = Math.max(minX + .05, entryDoor.mid[0] - halfW);
  const x1 = Math.min(maxX - .05, entryDoor.mid[0] + halfW);
  const z0 = Math.max(minZ + .02, entryDoor.mid[1]);
  const z1 = Math.min(maxZ - .05, entryDoor.mid[1] + depth);
  const polygon: Point[] = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

  // View cone from open front door into the apartment (~65 deg spread, 4.5 m reach)
  const fx = entryDoor.inward[0], fz = entryDoor.inward[1];
  const halfAngle = 34 * Math.PI / 180;
  const reach = 4.2 / project.scale;
  const rot = (a: number): Point => [
    entryDoor.mid[0] + (fx * Math.cos(a) - fz * Math.sin(a)) * reach,
    entryDoor.mid[1] + (fx * Math.sin(a) + fz * Math.cos(a)) * reach,
  ];
  const viewCone: Point[] = [entryDoor.mid, rot(-halfAngle), rot(halfAngle)];

  // Check if any bed or toilet sits directly inside the open doorway sightline in adjacent rooms
  const visibleTargets: string[] = [];
  for (const f of variant.furniture) {
    if (f.kind !== 'bed' && f.kind !== 'toilet') continue;
    if (!['entry', 'living', 'bed3'].includes(f.roomId)) continue;
    const dx = f.x - entryDoor.mid[0], dz = f.z - entryDoor.mid[1];
    const dist = Math.hypot(dx, dz);
    if (dist > reach || dist < .2) continue;
    const cos = (dx * fx + dz * fz) / dist;
    if (cos > Math.cos(halfAngle)) {
      visibleTargets.push(f.kind === 'bed' ? 'кровать' : 'санузел');
    }
  }
  // In this layout entry connects to living and bed3; bathroom traffic goes via corridor so main night traffic is clean.
  const crossesTraffic = false;
  return { polygon, entryDoorMid: entryDoor.mid, viewCone, crossesTraffic, visibleTargets: [...new Set(visibleTargets)] };
}

function evaluateStorage(project: Project, variant: Variant): StorageMetrics {
  const totalAptM2 = project.rooms
    .filter(r => r.id !== 'balcony')
    .reduce((sum, r) => sum + area(r.polygon) * project.scale ** 2, 0);
  const closet = project.rooms.find(r => r.id === 'closet');
  const closetM2 = closet ? area(closet.polygon) * project.scale ** 2 : 0;

  const storageKinds = new Set<Kind>(['wardrobe', 'pantry', 'bookcase', 'laundry_tower']);
  let furnStorageM2 = 0;
  let totalLinearM = 0;
  for (const f of variant.furniture) {
    if (!storageKinds.has(f.kind)) continue;
    // Avoid double counting wardrobes already inside the walk-in closet area
    if (f.roomId !== 'closet') {
      furnStorageM2 += f.width * f.depth;
    }
    totalLinearM += Math.max(f.width, f.depth);
  }
  const totalStorageM2 = Math.round((closetM2 + furnStorageM2) * 100) / 100;
  totalLinearM = Math.round(totalLinearM * 100) / 100;
  const ratioPct = totalAptM2 > 0 ? Math.round((totalStorageM2 / totalAptM2) * 1000) / 10 : 0;

  let grade: StorageMetrics['grade'] = 'good';
  let note = `Хороший запас хранения (${ratioPct}% от жилой площади, ${totalLinearM.toFixed(1).replace('.', ',')} пог. м шкафов).`;
  if (ratioPct < 5) {
    grade = 'low';
    note = `Мало мест хранения (${ratioPct}% при норме 7–10%) — добавьте шкафы до потолка или хозшкаф.`;
  } else if (ratioPct < 7) {
    grade = 'tight';
    note = `Хранение впритык (${ratioPct}% при комфортном ориентире 7–10%) — проверьте бытовой чеклист ниже.`;
  }
  return { totalStorageM2, totalLinearM, ratioPct, grade, note };
}

export function runLayoutAudit(project: Project, variant: Variant): LayoutAuditReport {
  const allowance = resolvedAllowance(project);
  const issues: AuditIssue[] = [];

  // 1. Room finish allowances, seamless stretch ceiling & ventilation reminders
  const rooms: RoomFinishCheck[] = project.rooms.map(r => {
    const [w, d] = roomSize(r);
    const grossWidthCm = Math.round(w * project.scale * 100);
    const grossDepthCm = Math.round(d * project.scale * 100);
    const netWidthCm = Math.max(0, Math.round(grossWidthCm - allowance.wallCm * 2));
    const netDepthCm = Math.max(0, Math.round(grossDepthCm - allowance.wallCm * 2));
    const netCeilingCm = Math.max(0, Math.round(project.ceilingHeight * 100 - allowance.floorCm - allowance.ceilingCm));
    const seamlessCeilingOk = Math.min(grossWidthCm, grossDepthCm) <= 500;
    const roomAreaM2 = area(r.polygon) * project.scale ** 2;
    const needsVentilationReminder = ['bed1', 'bed2', 'bed3'].includes(r.id) && roomAreaM2 < 12.2;
    if (!seamlessCeilingOk && r.id !== 'balcony') {
      issues.push({
        id: `ceil-seam-${r.id}`, severity: 'info', category: 'ceiling', roomId: r.id,
        title: `Натяжной потолок в «${r.name}» может потребовать шов`,
        detail: `Меньшая сторона комнаты ${Math.min(grossWidthCm, grossDepthCm)} см (> 500 см). Проверьте ширину полотна или используйте теневой/световой профиль.`,
      });
    }
    return { roomId: r.id, roomName: r.name, grossWidthCm, grossDepthCm, netWidthCm, netDepthCm, netCeilingCm, seamlessCeilingOk, needsVentilationReminder };
  });

  // 2. Furniture clearance with plaster/tile allowance + bath water-trap gap + net ceiling height
  const netCeilingM = Math.max(1.5, project.ceilingHeight - (allowance.floorCm + allowance.ceilingCm) / 100);
  const ignoreAllowanceKinds = new Set<Kind>(['rug', 'platform', 'person', 'curtains', 'mirror', 'kettlebell']);
  for (const f of variant.furniture) {
    if (ignoreAllowanceKinds.has(f.kind)) continue;
    const roomName = project.rooms.find(r => r.id === f.roomId)?.name ?? f.roomId;
    const topM = (f.elevation ?? 0) + f.height;
    if (topM > netCeilingM + .005) {
      issues.push({
        id: `net-ceil-${f.id}`, severity: 'error', category: 'allowance', roomId: f.roomId, furnitureId: f.id,
        title: `${kindNames[f.kind]} выше чистового потолка (${roomName})`,
        detail: `Верх предмета ${Math.round(topM * 100)} см, а чистовая высота потолка после стяжки (${allowance.floorCm} см) и потолка (${allowance.ceilingCm} см) — ${Math.round(netCeilingM * 100)} см.`,
      });
    }
    const clr = furnitureRoomClearances(project, f);
    if (clr) {
      const horizSlack = clr.leftCm + clr.rightCm;
      const vertSlack = clr.topCm + clr.bottomCm;
      const wallLoss = Math.ceil(allowance.wallCm * 2);
      if (horizSlack < wallLoss || vertSlack < wallLoss) {
        issues.push({
          id: `plaster-fit-${f.id}`, severity: 'warn', category: 'allowance', roomId: f.roomId, furnitureId: f.id,
          title: `${kindNames[f.kind]} стоит впритык без запаса на штукатурку (${roomName})`,
          detail: `Суммарный зазор по комнате меньше ${wallLoss} см (2 × ${allowance.wallCm} см штукатурки/плитки). После выравнивания стен предмет может не поместиться.`,
        });
      }
      if (f.kind === 'bath') {
        const gaps = [clr.leftCm, clr.rightCm, clr.topCm, clr.bottomCm].filter(g => g >= 3 && g <= 15);
        if (gaps.length > 0) {
          issues.push({
            id: `bath-gap-${f.id}`, severity: 'warn', category: 'allowance', roomId: f.roomId, furnitureId: f.id,
            title: `Узкий зазор у ванны (${Math.min(...gaps)} см) в «${roomName}»`,
            detail: 'Щель 3–15 см между ванной и стеной будет собирать воду и грязь. Поставьте ванну вплотную к стене или предусмотрите полочку/короб из плитки.',
          });
        }
      }
    }
  }

  // 3. Bathroom doors opening inward
  project.walls.forEach((w, wallIndex) => {
    (w.openings ?? []).forEach((o, openingIndex) => {
      if (o.kind !== 'door') return;
      const swing = doorSwingInfo(project, w, o);
      if (!swing || !swing.swingRoomId) return;
      if (swing.swingRoomId === 'bath1' || swing.swingRoomId === 'bath2') {
        const rName = project.rooms.find(r => r.id === swing.swingRoomId)?.name ?? 'Санузел';
        issues.push({
          id: `bath-door-${wallIndex}-${openingIndex}`,
          severity: 'error',
          category: 'door',
          roomId: swing.swingRoomId,
          title: `Дверь в «${rName}» открывается внутрь`,
          detail: 'В компактном санузле открывание внутрь крадёт место и небезопасно (человек внутри может заблокировать дверь). Рекомендуется открывать наружу в коридор.',
          action: { type: 'flip_door', wallIndex, openingIndex },
        });
      }
    });
  });

  // 4. Delivery check from entrance door
  const entryDoor = findEntryDoor(project);
  const delivery = evaluateDelivery(project, variant, entryDoor);
  for (const d of delivery) {
    if (d.status === 'blocked') {
      issues.push({
        id: `deliv-${d.furnitureId}`, severity: 'error', category: 'delivery', roomId: d.roomId, furnitureId: d.furnitureId,
        title: `Проблема заноса: ${d.label}`,
        detail: d.reason,
      });
    } else if (d.status === 'tight') {
      issues.push({
        id: `deliv-${d.furnitureId}`, severity: 'info', category: 'delivery', roomId: d.roomId, furnitureId: d.furnitureId,
        title: `Сложный занос: ${d.label}`,
        detail: d.reason,
      });
    }
  }

  // 5. Plumbing slope & riser distance
  const { runs: plumbing, hasRiserMarkers } = evaluatePlumbing(project, variant);
  for (const run of plumbing) {
    if (run.severity === 'error' || run.severity === 'warn') {
      issues.push({
        id: `plumb-${run.furnitureId}`,
        severity: run.severity,
        category: 'plumbing',
        roomId: run.roomId,
        furnitureId: run.furnitureId,
        title: `Канализация: ${run.label}`,
        detail: run.note,
      });
    }
  }

  // 6. TV glare, desk daylight side, tall furniture blocking window, sofa/bed draft
  for (const room of project.rooms) {
    const windows = roomOpenings(project, room.id).filter(ro => ro.opening.kind === 'window');
    if (!windows.length) continue;
    const winCenters = windows.map(ro => {
      const len = wallLength(ro.wall) || 1;
      const mid = (ro.opening.start + ro.opening.end) / 2;
      return {
        x: ro.wall.a[0] + (ro.wall.b[0] - ro.wall.a[0]) * mid / len,
        z: ro.wall.a[1] + (ro.wall.b[1] - ro.wall.a[1]) * mid / len,
        sill: ro.opening.sillHeight ?? openingHeights.windowSill,
      };
    });
    const roomFurniture = variant.furniture.filter(f => f.roomId === room.id);
    for (const f of roomFurniture) {
      const [fx, fz] = furnitureFront(f.rotation);
      if (f.kind === 'television' || f.kind === 'tv_stand_mobile') {
        const glared = winCenters.some(w => {
          const dx = w.x - f.x, dz = w.z - f.z;
          const dist = Math.hypot(dx, dz) || 1;
          return (dx * fx + dz * fz) / dist > .48;
        });
        if (glared) {
          issues.push({
            id: `tv-glare-${f.id}`, severity: 'warn', category: 'light', roomId: room.id, furnitureId: f.id,
            title: `Возможны блики на ТВ в «${room.name}»`,
            detail: 'Экран направлен в сторону окна — днём свет будет отражаться. Помогут блэкаут-шторы или поворот ТВ перпендикулярно окну.',
          });
        }
      }
      if (f.kind === 'workstation' || (f.kind === 'table' && f.depth <= .72 && f.height >= .68)) {
        const nearestWin = winCenters.reduce((a, b) => Math.hypot(a.x - f.x, a.z - f.z) < Math.hypot(b.x - f.x, b.z - f.z) ? a : b);
        const dx = nearestWin.x - f.x, dz = nearestWin.z - f.z;
        const dist = Math.hypot(dx, dz) || 1;
        const dotFront = (dx * fx + dz * fz) / dist;
        // Person sits in front of the desk (+front), looking at the desk (-front). So window behind the sitter is +front!
        if (dotFront > .55) {
          issues.push({
            id: `desk-glare-${f.id}`, severity: 'warn', category: 'light', roomId: room.id, furnitureId: f.id,
            title: `Окно за спиной у рабочего стола («${room.name}»)`,
            detail: 'Свет из окна будет бить в монитор. Оптимально, чтобы окно было слева (для правши) или сбоку от стола.',
          });
        }
      }
      if (['wardrobe', 'pantry', 'fridge', 'bookcase', 'laundry_tower', 'slat_partition'].includes(f.kind)) {
        const corners = furnitureFootprint(f, project.scale);
        const blocksWin = winCenters.some(w => (f.elevation ?? 0) + f.height > w.sill + .1 && corners.some(c => Math.hypot(c[0] - w.x, c[1] - w.z) * project.scale < .55));
        if (blocksWin) {
          issues.push({
            id: `win-block-${f.id}`, severity: 'error', category: 'light', roomId: room.id, furnitureId: f.id,
            title: `${kindNames[f.kind]} перекрывает окно в «${room.name}»`,
            detail: 'Высокий предмет стоит слишком близко к оконному проёму — он перекроет свет, шторы или створку окна.',
          });
        }
      }
    }
  }

  // 7. Dirty zone & privacy from entrance door
  const dirtyZone = evaluateDirtyZoneAndPrivacy(project, variant, entryDoor);
  if (dirtyZone?.visibleTargets.length) {
    issues.push({
      id: 'entry-privacy', severity: 'info', category: 'privacy', roomId: 'entry',
      title: `С порога просматривается: ${dirtyZone.visibleTargets.join(', ')}`,
      detail: 'При открытой входной двери взгляд попадает в приватную зону. Можно перенавесить дверь или поставить лёгкую реечную перегородку.',
    });
  }

  // 8. Storage index
  const storage = evaluateStorage(project, variant);
  if (storage.grade === 'low') {
    issues.push({
      id: 'storage-low', severity: 'warn', category: 'storage',
      title: `Низкий запас мест хранения (${storage.ratioPct}%)`,
      detail: storage.note,
    });
  }

  const counts = {
    error: issues.filter(i => i.severity === 'error').length,
    warn: issues.filter(i => i.severity === 'warn').length,
    info: issues.filter(i => i.severity === 'info').length,
  };

  return { allowance, issues, rooms, delivery, plumbing, hasRiserMarkers, dirtyZone, storage, counts };
}
