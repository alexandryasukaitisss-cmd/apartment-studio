export const A2UI_VERSION = '1.0' as const;
export const APARTMENT_CATALOG_ID = 'https://a2ui.org/specification/v1_0/catalogs/apartment-studio/catalog.json';

export type A2UIComponentType =
  | 'Column'
  | 'Row'
  | 'Card'
  | 'Text'
  | 'Badge'
  | 'Divider'
  | 'Metric'
  | 'Button'
  | 'StylePresetCard'
  | 'AuditFixCard'
  | 'FurnitureCard'
  | 'StagePreviewBar';

export const ALLOWED_A2UI_COMPONENTS = new Set<A2UIComponentType>([
  'Column', 'Row', 'Card', 'Text', 'Badge', 'Divider', 'Metric', 'Button',
  'StylePresetCard', 'AuditFixCard', 'FurnitureCard', 'StagePreviewBar',
]);

export type AllowedAgentFunctionName =
  | 'applyStylePreset'
  | 'addFurniture'
  | 'flipDoor'
  | 'setFinishAllowance'
  | 'setStage'
  | 'setLighting'
  | 'setRoomMaterial'
  | 'setDoorSkirting'
  | 'setStorageNote'
  | 'focusRoom'
  | 'toggleOverlay'
  | 'openWallElevation'
  | 'openCompare';

export const ALLOWED_AGENT_FUNCTIONS = new Set<AllowedAgentFunctionName>([
  'applyStylePreset',
  'addFurniture',
  'flipDoor',
  'setFinishAllowance',
  'setStage',
  'setLighting',
  'setRoomMaterial',
  'setDoorSkirting',
  'setStorageNote',
  'focusRoom',
  'toggleOverlay',
  'openWallElevation',
  'openCompare',
]);

export interface A2UIPathRef {
  '@path': string;
}

export type A2UIBindable<T> = T | A2UIPathRef;

export interface A2UIAction {
  callAgentFunction: {
    name: AllowedAgentFunctionName;
    args?: Record<string, unknown>;
  };
}

export interface A2UIComponent {
  id: string;
  component: A2UIComponentType;
  children?: string[];
  // Common display props
  text?: A2UIBindable<string>;
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'primary' | 'outline';
  tone?: 'neutral' | 'success' | 'warn' | 'error';
  label?: A2UIBindable<string>;
  value?: A2UIBindable<string | number>;
  hint?: A2UIBindable<string>;
  // Domain props
  presetId?: string;
  title?: A2UIBindable<string>;
  subtitle?: A2UIBindable<string>;
  swatches?: string[];
  severity?: 'error' | 'warn' | 'info';
  detail?: A2UIBindable<string>;
  actionLabel?: A2UIBindable<string>;
  kind?: string;
  roomId?: string;
  dimsText?: A2UIBindable<string>;
  note?: A2UIBindable<string>;
  stage?: 'shell' | 'rough' | 'finishes' | 'furnished';
  action?: A2UIAction;
  '@accessibility'?: { label?: string };
  '@metadata'?: Record<string, unknown>;
}

export interface CreateSurfacePayload {
  surfaceId: string;
  catalogId?: string;
  sendDataModel?: boolean;
  components?: A2UIComponent[];
  dataModel?: Record<string, unknown>;
}

export interface UpdateComponentsPayload {
  surfaceId: string;
  components: A2UIComponent[];
}

export interface UpdateDataModelPayload {
  surfaceId: string;
  path?: string;
  value: unknown;
}

export interface DeleteSurfacePayload {
  surfaceId: string;
}

export type A2UIMessage =
  | { version: '1.0'; createSurface: CreateSurfacePayload }
  | { version: '1.0'; updateComponents: UpdateComponentsPayload }
  | { version: '1.0'; updateDataModel: UpdateDataModelPayload }
  | { version: '1.0'; deleteSurface: DeleteSurfacePayload };

export interface A2UISurfaceState {
  surfaceId: string;
  catalogId: string;
  components: Map<string, A2UIComponent>;
  dataModel: Record<string, unknown>;
}

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Resolve an RFC 6901 JSON Pointer against a surface data model. */
export function getByJsonPointer(dataModel: Record<string, unknown>, pointer: string): unknown {
  if (!pointer || pointer === '/') return dataModel;
  const parts = pointer.replace(/^\//, '').split('/').map(decodePointerToken);
  let cur: unknown = dataModel;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Upsert or delete (when value === null) a JSON Pointer path in a cloned data model. */
export function applyDataModelPatch(
  current: Record<string, unknown>,
  path: string | undefined,
  value: unknown,
): Record<string, unknown> {
  if (!path || path === '/') {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? structuredClone(value as Record<string, unknown>)
      : {};
  }
  const next = structuredClone(current);
  const parts = path.replace(/^\//, '').split('/').map(decodePointerToken);
  if (parts.some(p => p === '__proto__' || p === 'constructor' || p === 'prototype')) {
    return next;
  }
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const child = cur[key];
    if (!child || typeof child !== 'object' || Array.isArray(child)) {
      cur[key] = {};
    }
    cur = cur[key] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (value === null) {
    delete cur[leaf];
  } else {
    cur[leaf] = structuredClone(value);
  }
  return next;
}

export function isPathRef(value: unknown): value is A2UIPathRef {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && typeof (value as A2UIPathRef)['@path'] === 'string');
}

export function resolveBindableString(value: A2UIBindable<string | number> | undefined, dataModel: Record<string, unknown>): string {
  if (value === undefined || value === null) return '';
  if (isPathRef(value)) {
    const resolved = getByJsonPointer(dataModel, value['@path']);
    return resolved === undefined || resolved === null ? '' : String(resolved);
  }
  return String(value);
}

function sanitizeComponent(raw: unknown): A2UIComponent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id || obj.id.length > 100) return null;
  if (typeof obj.component !== 'string' || !ALLOWED_A2UI_COMPONENTS.has(obj.component as A2UIComponentType)) return null;

  const out: A2UIComponent = { id: obj.id, component: obj.component as A2UIComponentType };
  if (Array.isArray(obj.children)) {
    out.children = obj.children.filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length <= 100).slice(0, 40);
  }
  const copyBindable = (key: keyof A2UIComponent) => {
    const v = obj[key];
    if (typeof v === 'string' || typeof v === 'number' || isPathRef(v)) {
      (out as unknown as Record<string, unknown>)[key] = v;
    }
  };
  for (const k of ['text', 'label', 'value', 'hint', 'title', 'subtitle', 'detail', 'actionLabel', 'dimsText', 'note'] as const) {
    copyBindable(k);
  }
  if (typeof obj.variant === 'string' && ['h1', 'h2', 'h3', 'body', 'caption', 'primary', 'outline'].includes(obj.variant)) {
    out.variant = obj.variant as A2UIComponent['variant'];
  }
  if (typeof obj.tone === 'string' && ['neutral', 'success', 'warn', 'error'].includes(obj.tone)) {
    out.tone = obj.tone as A2UIComponent['tone'];
  }
  if (typeof obj.severity === 'string' && ['error', 'warn', 'info'].includes(obj.severity)) {
    out.severity = obj.severity as A2UIComponent['severity'];
  }
  if (typeof obj.presetId === 'string') out.presetId = obj.presetId;
  if (typeof obj.kind === 'string') out.kind = obj.kind;
  if (typeof obj.roomId === 'string') out.roomId = obj.roomId;
  if (typeof obj.stage === 'string' && ['shell', 'rough', 'finishes', 'furnished'].includes(obj.stage)) {
    out.stage = obj.stage as A2UIComponent['stage'];
  }
  if (Array.isArray(obj.swatches)) {
    out.swatches = obj.swatches.filter((s): s is string => typeof s === 'string' && /^#[\da-f]{6}$/i.test(s)).slice(0, 6);
  }
  if (obj.action && typeof obj.action === 'object' && !Array.isArray(obj.action)) {
    const call = (obj.action as Record<string, unknown>).callAgentFunction;
    if (call && typeof call === 'object' && !Array.isArray(call)) {
      const name = (call as Record<string, unknown>).name;
      const args = (call as Record<string, unknown>).args;
      if (typeof name === 'string' && ALLOWED_AGENT_FUNCTIONS.has(name as AllowedAgentFunctionName)) {
        out.action = {
          callAgentFunction: {
            name: name as AllowedAgentFunctionName,
            ...(args && typeof args === 'object' && !Array.isArray(args) ? { args: args as Record<string, unknown> } : {}),
          },
        };
      }
    }
  }
  return out;
}

/** Reduce a stream of A2UI v1.0 messages into live surface states keyed by surfaceId. */
export function reduceA2UIMessages(messages: A2UIMessage[]): Map<string, A2UISurfaceState> {
  const surfaces = new Map<string, A2UISurfaceState>();
  for (const msg of messages) {
    if (!msg || msg.version !== A2UI_VERSION) continue;
    if ('createSurface' in msg && msg.createSurface?.surfaceId) {
      const { surfaceId, catalogId, components, dataModel } = msg.createSurface;
      const compMap = new Map<string, A2UIComponent>();
      for (const raw of components ?? []) {
        const clean = sanitizeComponent(raw);
        if (clean) compMap.set(clean.id, clean);
      }
      surfaces.set(surfaceId, {
        surfaceId,
        catalogId: catalogId || APARTMENT_CATALOG_ID,
        components: compMap,
        dataModel: dataModel && typeof dataModel === 'object' && !Array.isArray(dataModel)
          ? structuredClone(dataModel)
          : {},
      });
    } else if ('updateComponents' in msg && msg.updateComponents?.surfaceId) {
      const s = surfaces.get(msg.updateComponents.surfaceId);
      if (!s) continue;
      for (const raw of msg.updateComponents.components ?? []) {
        const clean = sanitizeComponent(raw);
        if (clean) s.components.set(clean.id, clean);
      }
    } else if ('updateDataModel' in msg && msg.updateDataModel?.surfaceId) {
      const s = surfaces.get(msg.updateDataModel.surfaceId);
      if (!s) continue;
      s.dataModel = applyDataModelPatch(s.dataModel, msg.updateDataModel.path, msg.updateDataModel.value);
    } else if ('deleteSurface' in msg && msg.deleteSurface?.surfaceId) {
      surfaces.delete(msg.deleteSurface.surfaceId);
    }
  }
  return surfaces;
}
