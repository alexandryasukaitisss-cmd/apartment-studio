import { type Project, type Variant, area } from '../model';
import { kindNames } from '../furnitureCatalog';
import { runLayoutAudit } from '../layoutAudit';
import { estimateVariant, projectQuantities } from '../materialEstimate';
import { stylePresets } from '../stylePresets';
import {
  A2UI_VERSION,
  APARTMENT_CATALOG_ID,
  type A2UIComponent,
  type A2UIMessage,
} from './protocol';

/** Compact structured snapshot of the apartment sent to external CLI agents (codex/claude/opencode/gemini/ollama). */
export function buildAgentContext(project: Project, variant: Variant, activeRoomId: string) {
  const quantities = projectQuantities(project);
  const audit = runLayoutAudit(project, variant);
  const estimate = estimateVariant(project, variant, 10);
  return {
    projectName: project.name,
    activeVariant: variant.name,
    activeRoomId,
    ceilingHeightM: project.ceilingHeight,
    doorStyle: variant.doorStyle ?? 'framed',
    skirtingHeightCm: Math.round((variant.skirtingHeight ?? .08) * 100),
    finishAllowance: audit.allowance,
    totals: quantities.totals,
    rooms: project.rooms.map(r => {
      const fin = audit.rooms.find(rm => rm.roomId === r.id);
      return {
        id: r.id,
        name: r.name,
        areaM2: Math.round(area(r.polygon) * project.scale ** 2 * 100) / 100,
        netWidthCm: fin?.netWidthCm,
        netDepthCm: fin?.netDepthCm,
        finishes: variant.finishes[r.id],
      };
    }),
    furniture: variant.furniture.map(f => ({
      id: f.id,
      kind: f.kind,
      name: f.label || kindNames[f.kind],
      roomId: f.roomId,
      dimsCm: [Math.round(f.width * 100), Math.round(f.depth * 100), Math.round(f.height * 100)],
      elevationCm: Math.round((f.elevation ?? 0) * 100),
      rotation: f.rotation,
    })),
    auditSummary: {
      counts: audit.counts,
      storage: audit.storage,
      issues: audit.issues.slice(0, 12).map(i => ({
        severity: i.severity,
        category: i.category,
        roomId: i.roomId,
        title: i.title,
        detail: i.detail,
        action: i.action,
      })),
    },
    knownBudget: estimate.subtotals,
    availableMaterials: project.materials.slice(0, 20).map(m => ({ id: m.id, name: m.name, pattern: m.pattern })),
    availableStylePresets: stylePresets.map(s => ({ id: s.id, name: s.name, subtitle: s.subtitle })),
  };
}

/**
 * Built-in offline A2UI 1.0 generator so the Generative UI assistant works
 * even with zero backend / on GitHub Pages static demo!
 */
export function generateOfflineA2UISurface(
  prompt: string,
  project: Project,
  variant: Variant,
  activeRoomId: string,
): A2UIMessage[] {
  const q = prompt.toLowerCase();
  const audit = runLayoutAudit(project, variant);
  const quantities = projectQuantities(project);
  const activeRoom = project.rooms.find(r => r.id === activeRoomId) ?? project.rooms[0];
  const surfaceId = `offline-a2ui-${Date.now()}`;
  const components: A2UIComponent[] = [];
  const rootChildren: string[] = [];

  const push = (c: A2UIComponent, addToRoot = true) => {
    components.push(c);
    if (addToRoot) rootChildren.push(c.id);
  };

  const wantsStyle = /стил|отделк|цвет|палитр|минимал|сканди|джапанди|классик|графит|двер|плинтус/i.test(q);
  const wantsFurniture = /мебел|стол|диван|шкаф|кроват|тв|рейк|постир|комнат|расстав/i.test(q);
  const wantsBudget = /смет|бюджет|цен|хран|этап|стади|бетон|чернов/i.test(q);
  const wantsAudit = /аудит|ошиб|проблем|занос|канализац|стояк|блик|исправ|провер/i.test(q) || (!wantsStyle && !wantsFurniture && !wantsBudget);

  push({
    id: 'hdr',
    component: 'Text',
    variant: 'h2',
    text: { '@path': '/header/title' },
  });
  push({
    id: 'sub',
    component: 'Text',
    variant: 'caption',
    text: { '@path': '/header/subtitle' },
  });

  // Key metrics row bound via JSON Pointer @path
  components.push(
    { id: 'm-area', component: 'Metric', label: 'Площадь пола', value: { '@path': '/metrics/floorM2' }, hint: 'с балконом' },
    { id: 'm-issues', component: 'Metric', label: 'Замечания аудита', value: { '@path': '/metrics/issues' }, hint: { '@path': '/metrics/storagePct' } },
  );
  push({ id: 'metrics-row', component: 'Row', children: ['m-area', 'm-issues'] });

  if (wantsAudit) {
    const actionable = audit.issues.slice(0, 4);
    if (actionable.length === 0) {
      push({
        id: 'audit-clean',
        component: 'Badge',
        tone: 'success',
        text: 'Критических замечаний по планировке не найдено',
      });
    } else {
      actionable.forEach((issue, idx) => {
        push({
          id: `fix-${idx}`,
          component: 'AuditFixCard',
          severity: issue.severity,
          title: issue.title,
          detail: issue.detail,
          ...(issue.action?.type === 'flip_door'
            ? {
                actionLabel: 'Перевернуть дверь наружу',
                action: {
                  callAgentFunction: {
                    name: 'flipDoor',
                    args: { wallIndex: issue.action.wallIndex, openingIndex: issue.action.openingIndex },
                  },
                },
              }
            : issue.roomId
              ? {
                  actionLabel: 'Показать на плане 2D',
                  action: {
                    callAgentFunction: {
                      name: 'focusRoom',
                      args: { roomId: issue.roomId, mode: '2d' },
                    },
                  },
                }
              : {}),
        });
      });
    }
    components.push(
      {
        id: 'btn-audit-layer',
        component: 'Button',
        label: 'Включить слой аудита на 2D',
        variant: 'outline',
        action: { callAgentFunction: { name: 'toggleOverlay', args: { overlay: 'audit', visible: true } } },
      },
      {
        id: 'btn-elev',
        component: 'Button',
        label: `Развёртка стен · ${activeRoom.name}`,
        variant: 'outline',
        action: { callAgentFunction: { name: 'openWallElevation', args: { roomId: activeRoom.id } } },
      },
    );
    push({ id: 'audit-actions', component: 'Row', children: ['btn-audit-layer', 'btn-elev'] });
  }

  if (wantsStyle) {
    push({ id: 'st-hdr', component: 'Text', variant: 'h3', text: 'Готовые стили всей квартиры (1 клик)' });
    stylePresets.slice(0, 3).forEach(sp => {
      push({
        id: `preset-${sp.id}`,
        component: 'StylePresetCard',
        presetId: sp.id,
        title: sp.name,
        subtitle: sp.subtitle,
        swatches: sp.swatches,
        action: { callAgentFunction: { name: 'applyStylePreset', args: { presetId: sp.id } } },
      });
    });
    push({
      id: 'btn-compare',
      component: 'Button',
      label: 'Сравнить варианты шторкой До / После',
      variant: 'outline',
      action: { callAgentFunction: { name: 'openCompare' } },
    });
  }

  if (wantsFurniture) {
    push({ id: 'furn-hdr', component: 'Text', variant: 'h3', text: `Идеи для комнаты «${activeRoom.name}»` });
    const suggestions: { id: string; kind: string; title: string; dimsText: string; note: string }[] = activeRoom.id === 'living'
      ? [
          { id: 'sug-rt', kind: 'round_table', title: 'Круглый стол Ø 100 см', dimsText: '100 × 100 × 75 см', note: 'Освобождает проходы в кухне-гостиной.' },
          { id: 'sug-slat', kind: 'slat_partition', title: 'Реечная перегородка 120', dimsText: '120 × 8 × 260 см', note: 'Мягко зонирует кухню и зону отдыха без потери света.' },
          { id: 'sug-rug', kind: 'rug', title: 'Ковёр 200 × 300', dimsText: '200 × 300 × 2 см', note: 'Объединяет диванную группу визуально.' },
        ]
      : activeRoom.id.startsWith('bath')
        ? [
            { id: 'sug-lt', kind: 'laundry_tower', title: 'Постирочная колонна 60', dimsText: '60 × 62 × 172 см', note: 'Стиральная + сушильная машина в одном пятне 60×62.' },
            { id: 'sug-mir', kind: 'mirror', title: 'Зеркало 60 × 90 с подсветкой', dimsText: '60 × 4 × 90 см', note: 'Визуально расширяет санузел.' },
          ]
        : [
            { id: 'sug-vd', kind: 'vanity_desk', title: 'Туалетный столик с пуфом', dimsText: '95 × 45 × 135 см', note: 'Компактная зона макияжа или ноутбука.' },
            { id: 'sug-ns', kind: 'nightstand', title: 'Прикроватная тумба 50', dimsText: '50 × 42 × 52 см', note: 'Удобная база рядом со спальным местом.' },
          ];
    for (const s of suggestions) {
      push({
        id: s.id,
        component: 'FurnitureCard',
        kind: s.kind,
        roomId: activeRoom.id,
        title: s.title,
        dimsText: s.dimsText,
        note: s.note,
        action: { callAgentFunction: { name: 'addFurniture', args: { kind: s.kind, roomId: activeRoom.id } } },
      });
    }
  }

  if (wantsBudget) {
    push({ id: 'stg-hdr', component: 'Text', variant: 'h3', text: 'Предпросмотр стадий ремонта в 3D' });
    const stages: ['shell' | 'rough' | 'finishes' | 'furnished', string][] = [
      ['shell', '0. Бетон'],
      ['rough', '1. Черновая'],
      ['finishes', '2. Чистовая'],
      ['furnished', '3. С мебелью'],
    ];
    for (const [st, lbl] of stages) {
      push({
        id: `stage-${st}`,
        component: 'StagePreviewBar',
        stage: st,
        label: lbl,
        action: { callAgentFunction: { name: 'setStage', args: { stage: st } } },
      });
    }
  }

  components.unshift({ id: 'root', component: 'Column', children: rootChildren });

  return [
    {
      version: A2UI_VERSION,
      createSurface: {
        surfaceId,
        catalogId: APARTMENT_CATALOG_ID,
        sendDataModel: true,
        components,
        dataModel: {
          header: {
            title: `A2UI-подборка · ${activeRoom.name}`,
            subtitle: `Вариант «${variant.name}» · мгновенный локальный анализ (для глубоких сценариев выберите Codex / Claude / OpenCode / Gemini)`,
          },
          metrics: {
            floorM2: `${quantities.totals.floorM2.toFixed(1).replace('.', ',')} м²`,
            issues: `${audit.counts.error} крит. / ${audit.counts.warn} рисков`,
            storagePct: `хранение ${audit.storage.ratioPct}%`,
          },
        },
      },
    },
  ];
}
