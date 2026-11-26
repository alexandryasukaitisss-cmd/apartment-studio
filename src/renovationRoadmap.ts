import { type Project, type RenovationStage, type RoadmapStatus, type Variant } from './model';
import { estimateVariant, furnitureBudget, projectQuantities, skirtingEstimate, worksBudget } from './materialEstimate';

export interface RoadmapStep {
  id: string;
  order: number;
  title: string;
  sceneStage: RenovationStage;
  status: RoadmapStatus;
  summary: string;
  budgetText: string;
}

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const fmtMap = (map: Record<string, number>) => Object.entries(map).map(([c, v]) => `${v.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${c}`).join(' + ') || '—';

export function buildRenovationRoadmap(project: Project, variant: Variant, reserve = 10): RoadmapStep[] {
  const q = projectQuantities(project);
  const coverings = estimateVariant(project, variant, reserve);
  const works = worksBudget(project, variant);
  const furn = furnitureBudget(variant);
  const statusOf = (id: string): RoadmapStatus => variant.roadmap?.[id] ?? 'todo';

  const proposedWalls = project.walls.filter(w => w.proposed).length;
  const elecCount = variant.electrical.points.length;
  const engCount = variant.engineering?.items.length ?? 0;
  const heatedZones = variant.engineering?.heatedFloors ?? [];
  const heatedM2 = heatedZones.reduce((s, z) => s + z.areaM2, 0);
  const heatedKw = heatedZones.reduce((s, z) => s + z.areaM2 * z.wattsPerM2, 0) / 1000;
  const wetRoomsM2 = q.rooms.filter(r => r.id.startsWith('bath')).reduce((s, r) => s + r.floorM2 + r.wallM2, 0);
  const skirt = skirtingEstimate(q.totals.skirtingM, reserve, {
    pieceLengthM: variant.workRates?.skirtingPieceM ?? 2.4,
    pricePerPiece: variant.workRates?.skirtingPricePerPiece,
    currency: variant.workRates?.currency ?? 'BYN',
  });
  const elecWork = works.lines.find(l => l.key === 'electricalPoint');
  const floorWork = works.lines.find(l => l.key === 'floorM2');
  const wallWork = works.lines.find(l => l.key === 'wallM2');
  const skirtWork = works.lines.find(l => l.key === 'skirtingM');

  const floorCoverings: Record<string, number> = {};
  const wallCoverings: Record<string, number> = {};
  for (const row of coverings.rows) {
    if (row.cost === undefined || !row.currency) continue;
    const bucket = row.surface === 'floor' ? floorCoverings : wallCoverings;
    bucket[row.currency] = (bucket[row.currency] ?? 0) + row.cost;
  }

  return [
    {
      id: 'partitions',
      order: 1,
      title: 'Перегородки и проёмы',
      sceneStage: 'shell',
      status: statusOf('partitions'),
      summary: `${proposedWalls} возводимых перегородок · ${q.totals.doors} дверных и ${q.totals.windows} оконных проёмов`,
      budgetText: 'По обмеру',
    },
    {
      id: 'electrical_engineering',
      order: 2,
      title: 'Электрика, сантехника и трассы',
      sceneStage: 'rough',
      status: statusOf('electrical_engineering'),
      summary: `${elecCount} точек электрики · ${engCount} инженерных узлов (стояки, трассы, радиаторы)`,
      budgetText: elecWork?.cost ? `${fmt(elecWork.cost)} ${works.currency}` : '—',
    },
    {
      id: 'screed_heated',
      order: 3,
      title: 'Стяжка и тёплый пол',
      sceneStage: 'rough',
      status: statusOf('screed_heated'),
      summary: `${fmt(q.totals.floorM2)} м² пола${heatedZones.length ? ` · тёплый пол ${fmt(heatedM2)} м² (${fmt(heatedKw)} кВт)` : ''}`,
      budgetText: '—',
    },
    {
      id: 'plaster_tile',
      order: 4,
      title: 'Штукатурка, шпаклёвка и плитка',
      sceneStage: 'finishes',
      status: statusOf('plaster_tile'),
      summary: `${fmt(q.totals.wallM2)} м² стен · мокрые зоны ${fmt(wetRoomsM2)} м²`,
      budgetText: wallWork?.cost ? `${fmt(wallWork.cost)} ${works.currency}` : fmtMap(wallCoverings),
    },
    {
      id: 'paint_floor',
      order: 5,
      title: 'Чистовые полы, краска и обои',
      sceneStage: 'finishes',
      status: statusOf('paint_floor'),
      summary: `${fmt(q.totals.floorM2)} м² покрытий пола · потолки ${fmt(q.totals.ceilingM2)} м²`,
      budgetText: floorWork?.cost ? `${fmt(floorWork.cost)} ${works.currency}` : fmtMap(floorCoverings),
    },
    {
      id: 'doors_skirting',
      order: 6,
      title: 'Двери и плинтусы',
      sceneStage: 'finishes',
      status: statusOf('doors_skirting'),
      summary: `${q.totals.doors} дверей (${variant.doorStyle === 'hidden' ? 'скрытые' : 'с наличниками'}) · плинтус ${fmt(q.totals.skirtingM)} м (${skirt.pieces} пл.)`,
      budgetText: skirtWork?.cost ? `${fmt(skirtWork.cost)} ${works.currency}` : skirt.cost ? `${fmt(skirt.cost)} ${skirt.currency}` : '—',
    },
    {
      id: 'kitchen_furniture',
      order: 7,
      title: 'Кухня, свет, сантехника и мебель',
      sceneStage: 'furnished',
      status: statusOf('kitchen_furniture'),
      summary: `${furn.totalItems} предметов мебели и техники (оценено ${furn.priced})`,
      budgetText: fmtMap(furn.subtotals),
    },
  ];
}
