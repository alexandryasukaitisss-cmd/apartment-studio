import {
  type Kind,
  type Project,
  type RenovationStage,
  type Surface,
  boundFurniture,
  furnitureDimensions,
  makeFurniture,
  roomInteriorTarget,
} from '../model';
import { kindNames } from '../furnitureCatalog';
import { doorSwingInfo } from '../roomMeasures';
import { applyStylePreset } from '../stylePresets';
import type { AllowedAgentFunctionName } from './protocol';

export interface AgentActionHandlers {
  mutate: (fn: (p: Project) => void) => boolean;
  notify: (msg: string, error?: boolean) => void;
  onSelectRoom?: (roomId: string) => void;
  onSelectFurniture?: (furnitureId: string | null) => void;
  onPreviewStage?: (stage: RenovationStage) => void;
  onSwitchMode?: (mode: '2d' | '3d' | 'walk' | 'split') => void;
  onToggleOverlay?: (overlay: 'audit' | 'lifeZones' | 'electrical' | 'engineering', visible: boolean) => void;
  onOpenElevation?: (roomId?: string) => void;
  onOpenCompare?: () => void;
}

const VALID_KINDS = new Set<string>(Object.keys(furnitureDimensions));
const VALID_SURFACES = new Set<string>(['floor', 'walls', 'ceiling']);
const VALID_STAGES = new Set<string>(['shell', 'rough', 'finishes', 'furnished']);
const VALID_MODES = new Set<string>(['2d', '3d', 'walk', 'split']);
const VALID_LIGHT_MODES = new Set<string>(['day', 'evening', 'uniform']);

export function executeA2UIAgentFunction(
  name: AllowedAgentFunctionName,
  args: Record<string, unknown> = {},
  project: Project,
  handlers: AgentActionHandlers,
): boolean {
  const { mutate, notify } = handlers;

  switch (name) {
    case 'applyStylePreset': {
      const presetId = typeof args.presetId === 'string' ? args.presetId : '';
      let appliedName = presetId;
      const ok = mutate(p => {
        appliedName = applyStylePreset(p, presetId).name;
      });
      if (ok) notify(`AI применил стиль «${appliedName}» (⌘Z — отменить).`);
      return ok;
    }

    case 'addFurniture': {
      const kind = typeof args.kind === 'string' && VALID_KINDS.has(args.kind) ? (args.kind as Kind) : null;
      const roomId = typeof args.roomId === 'string' && project.rooms.some(r => r.id === args.roomId) ? args.roomId : 'living';
      if (!kind) {
        notify('Агент передал неизвестный тип мебели.', true);
        return false;
      }
      let createdId = '';
      const ok = mutate(p => {
        const room = p.rooms.find(r => r.id === roomId)!;
        const [x, z] = roomInteriorTarget(room);
        const base = makeFurniture(kind, roomId, x, z);
        const width = typeof args.width === 'number' && args.width >= .2 && args.width <= 3.5 ? args.width : base.width;
        const depth = typeof args.depth === 'number' && args.depth >= .04 && args.depth <= 3.5 ? args.depth : base.depth;
        const height = typeof args.height === 'number' && args.height >= .02 && args.height <= 3 ? args.height : base.height;
        const elevation = typeof args.elevation === 'number' && args.elevation >= 0 && args.elevation <= 3 ? args.elevation : base.elevation;
        const rotation = typeof args.rotation === 'number' && Number.isFinite(args.rotation) ? ((args.rotation % 360) + 360) % 360 : 0;
        const color = typeof args.color === 'string' && /^#[\da-f]{6}$/i.test(args.color) ? args.color : base.color;
        const label = typeof args.label === 'string' ? args.label.slice(0, 120) : undefined;
        const item = boundFurniture({ ...base, width, depth, height, elevation, rotation, color, ...(label ? { label } : {}) }, p);
        p.variants.find(v => v.id === p.activeVariantId)!.furniture.push(item);
        createdId = item.id;
      });
      if (ok) {
        handlers.onSelectRoom?.(roomId);
        if (createdId) handlers.onSelectFurniture?.(createdId);
        notify(`AI добавил: ${kindNames[kind]} (⌘Z — отменить).`);
      }
      return ok;
    }

    case 'flipDoor': {
      const wallIndex = Number(args.wallIndex);
      const openingIndex = Number(args.openingIndex);
      if (!Number.isInteger(wallIndex) || !Number.isInteger(openingIndex)) {
        notify('Некорректные координаты двери.', true);
        return false;
      }
      const ok = mutate(p => {
        const w = p.walls[wallIndex];
        const o = w?.openings?.[openingIndex];
        if (!w || !o || o.kind !== 'door') throw Error('Дверной проём не найден.');
        const currentSign = doorSwingInfo(p, w, o)?.sign ?? 1;
        o.swing = currentSign === 1 ? -1 : 1;
      });
      if (ok) notify('AI перевернул направление открывания двери (⌘Z — отменить).');
      return ok;
    }

    case 'setFinishAllowance': {
      const ok = mutate(p => {
        const cur = p.finishAllowance ?? {};
        p.finishAllowance = {
          wallCm: typeof args.wallCm === 'number' && args.wallCm >= 0 && args.wallCm <= 15 ? args.wallCm : cur.wallCm,
          floorCm: typeof args.floorCm === 'number' && args.floorCm >= 0 && args.floorCm <= 25 ? args.floorCm : cur.floorCm,
          ceilingCm: typeof args.ceilingCm === 'number' && args.ceilingCm >= 0 && args.ceilingCm <= 30 ? args.ceilingCm : cur.ceilingCm,
        };
      });
      if (ok) notify('AI обновил чистовой запас отделки.');
      return ok;
    }

    case 'setStage': {
      const stage = typeof args.stage === 'string' && VALID_STAGES.has(args.stage) ? (args.stage as RenovationStage) : null;
      if (!stage) return false;
      handlers.onPreviewStage?.(stage);
      return true;
    }

    case 'setLighting': {
      const mode = typeof args.mode === 'string' && VALID_LIGHT_MODES.has(args.mode) ? (args.mode as 'day' | 'evening' | 'uniform') : undefined;
      const ok = mutate(p => {
        const v = p.variants.find(vr => vr.id === p.activeVariantId)!;
        if (mode) v.lighting.mode = mode;
        if (typeof args.warmth === 'number' && args.warmth >= 2500 && args.warmth <= 6500) v.lighting.warmth = args.warmth;
        if (typeof args.intensity === 'number' && args.intensity >= .1 && args.intensity <= 1.5) v.lighting.intensity = args.intensity;
      });
      if (ok) notify('AI обновил сценарий освещения.');
      return ok;
    }

    case 'setRoomMaterial': {
      const roomId = typeof args.roomId === 'string' && project.rooms.some(r => r.id === args.roomId) ? args.roomId : null;
      const surface = typeof args.surface === 'string' && VALID_SURFACES.has(args.surface) ? (args.surface as Surface) : null;
      const materialId = typeof args.materialId === 'string' && project.materials.some(m => m.id === args.materialId) ? args.materialId : null;
      if (!roomId || !surface || !materialId) {
        notify('Некорректные параметры отделки комнаты.', true);
        return false;
      }
      const ok = mutate(p => {
        p.variants.find(v => v.id === p.activeVariantId)!.finishes[roomId][surface] = materialId;
      });
      if (ok) {
        handlers.onSelectRoom?.(roomId);
        notify('AI обновил отделку комнаты (⌘Z — отменить).');
      }
      return ok;
    }

    case 'setDoorSkirting': {
      const ok = mutate(p => {
        const v = p.variants.find(vr => vr.id === p.activeVariantId)!;
        if (args.doorStyle === 'framed' || args.doorStyle === 'hidden') v.doorStyle = args.doorStyle;
        if (typeof args.doorColor === 'string' && /^#[\da-f]{6}$/i.test(args.doorColor)) v.doorColor = args.doorColor;
        if (typeof args.skirtingColor === 'string' && /^#[\da-f]{6}$/i.test(args.skirtingColor)) v.skirtingColor = args.skirtingColor;
        if (typeof args.skirtingHeight === 'number' && args.skirtingHeight >= .03 && args.skirtingHeight <= .22) v.skirtingHeight = args.skirtingHeight;
      });
      if (ok) notify('AI обновил параметры дверей и плинтуса.');
      return ok;
    }

    case 'setStorageNote': {
      const key = typeof args.key === 'string' ? args.key.slice(0, 40) : '';
      const value = typeof args.value === 'string' ? args.value.slice(0, 120) : '';
      if (!key) return false;
      const ok = mutate(p => {
        p.storageChecklist ??= {};
        if (value.trim()) p.storageChecklist[key] = value.trim();
        else delete p.storageChecklist[key];
      });
      if (ok) notify('AI обновил хоз-чеклист хранения.');
      return ok;
    }

    case 'focusRoom': {
      const roomId = typeof args.roomId === 'string' && project.rooms.some(r => r.id === args.roomId) ? args.roomId : null;
      if (roomId) handlers.onSelectRoom?.(roomId);
      if (typeof args.mode === 'string' && VALID_MODES.has(args.mode)) {
        handlers.onSwitchMode?.(args.mode as '2d' | '3d' | 'walk' | 'split');
      }
      return true;
    }

    case 'toggleOverlay': {
      const overlay = typeof args.overlay === 'string' && ['audit', 'lifeZones', 'electrical', 'engineering'].includes(args.overlay)
        ? (args.overlay as 'audit' | 'lifeZones' | 'electrical' | 'engineering')
        : null;
      if (!overlay) return false;
      handlers.onToggleOverlay?.(overlay, args.visible !== false);
      return true;
    }

    case 'openWallElevation': {
      const roomId = typeof args.roomId === 'string' && project.rooms.some(r => r.id === args.roomId) ? args.roomId : undefined;
      handlers.onOpenElevation?.(roomId);
      return true;
    }

    case 'openCompare': {
      handlers.onOpenCompare?.();
      return true;
    }

    default:
      return false;
  }
}
