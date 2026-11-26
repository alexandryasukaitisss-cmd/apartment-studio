import { type Project, type Surface } from './model';

export interface StylePreset {
  id: string;
  name: string;
  subtitle: string;
  swatches: [string, string, string];
  livingFloor: string;
  wetFloor: string;
  balconyFloor: string;
  livingWalls: string;
  wetWalls: string;
  ceiling: string;
  doorColor: string;
  doorStyle: 'framed' | 'hidden';
  skirtingColor: string;
  skirtingHeight: number;
}

export const stylePresets: StylePreset[] = [
  {
    id: 'warm-minimal',
    name: 'Тёплый минимализм',
    subtitle: 'Натуральный дуб, штукатурка, скрытые двери',
    swatches: ['#c9ab82', '#ece6db', '#e8dfcd'],
    livingFloor: 'oak',
    wetFloor: 'ivory',
    balconyFloor: 'sand',
    livingWalls: 'plaster',
    wetWalls: 'porcelain',
    ceiling: 'white',
    doorColor: '#dfd8cc',
    doorStyle: 'hidden',
    skirtingColor: '#ebe5d9',
    skirtingHeight: .06,
  },
  {
    id: 'scandi-light',
    name: 'Сканди светлый',
    subtitle: 'Светлый дуб, шалфей и белые наличники',
    swatches: ['#bfa07d', '#bac2b0', '#f4f2ec'],
    livingFloor: 'laminate',
    wetFloor: 'porcelain',
    balconyFloor: 'concrete',
    livingWalls: 'white',
    wetWalls: 'green',
    ceiling: 'white',
    doorColor: '#f3f1eb',
    doorStyle: 'framed',
    skirtingColor: '#f3f1eb',
    skirtingHeight: .08,
  },
  {
    id: 'japandi',
    name: 'Джапанди',
    subtitle: 'Инженерная доска, льняные обои, песочный камень',
    swatches: ['#c5ae8b', '#d9d0ba', '#cfc3ad'],
    livingFloor: 'parquet',
    wetFloor: 'sand',
    balconyFloor: 'sand',
    livingWalls: 'wallpaper',
    wetWalls: 'sand',
    ceiling: 'white',
    doorColor: '#b99f7e',
    doorStyle: 'framed',
    skirtingColor: '#c9b497',
    skirtingHeight: .07,
  },
  {
    id: 'modern-classic',
    name: 'Современная классика',
    subtitle: 'Паркет, светлые стены, высокий белый плинтус',
    swatches: ['#c5ae8b', '#ece6db', '#f4f2ec'],
    livingFloor: 'parquet',
    wetFloor: 'ivory',
    balconyFloor: 'porcelain',
    livingWalls: 'plaster',
    wetWalls: 'ivory',
    ceiling: 'white',
    doorColor: '#f5f3ee',
    doorStyle: 'framed',
    skirtingColor: '#f5f3ee',
    skirtingHeight: .11,
  },
  {
    id: 'graphite-oak',
    name: 'Графит и дуб',
    subtitle: 'Дымчатый дуб, светлый бетон, графитовые двери',
    swatches: ['#8b7760', '#c4c4bb', '#3e4240'],
    livingFloor: 'smoked',
    wetFloor: 'concrete',
    balconyFloor: 'concrete',
    livingWalls: 'concrete',
    wetWalls: 'green',
    ceiling: 'white',
    doorColor: '#4a4e4c',
    doorStyle: 'hidden',
    skirtingColor: '#4a4e4c',
    skirtingHeight: .06,
  },
];

export function applyStylePreset(project: Project, presetId: string): StylePreset {
  const preset = stylePresets.find(s => s.id === presetId);
  if (!preset) throw Error('Стиль не найден.');
  const variant = project.variants.find(v => v.id === project.activeVariantId);
  if (!variant) throw Error('Активный вариант не найден.');
  const hasMat = (id: string) => project.materials.some(m => m.id === id);
  const pick = (preferred: string, fallback: string) => hasMat(preferred) ? preferred : hasMat(fallback) ? fallback : project.materials[0].id;

  const livingFloor = pick(preset.livingFloor, 'oak');
  const wetFloor = pick(preset.wetFloor, 'ivory');
  const balconyFloor = pick(preset.balconyFloor, 'sand');
  const livingWalls = pick(preset.livingWalls, 'plaster');
  const wetWalls = pick(preset.wetWalls, 'green');
  const ceiling = pick(preset.ceiling, 'white');

  for (const room of project.rooms) {
    const isWet = room.id.startsWith('bath');
    const isBalcony = room.id === 'balcony';
    const next: Record<Surface, string> = {
      floor: isWet ? wetFloor : isBalcony ? balconyFloor : livingFloor,
      walls: isWet ? wetWalls : livingWalls,
      ceiling,
    };
    variant.finishes[room.id] = next;
  }
  delete variant.wallOverrides;
  variant.doorColor = preset.doorColor;
  variant.doorStyle = preset.doorStyle;
  variant.skirtingColor = preset.skirtingColor;
  variant.skirtingHeight = preset.skirtingHeight;
  return preset;
}
