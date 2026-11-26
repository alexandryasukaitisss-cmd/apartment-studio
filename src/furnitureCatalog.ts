import { furnitureDimensions, type Kind } from './model';

export const kindNames: Record<Kind, string> = {
  bed: 'Кровать',
  sofa: 'Диван',
  table: 'Стол',
  chair: 'Стул',
  wardrobe: 'Шкаф',
  kitchen: 'Кухонный модуль',
  bath: 'Ванна',
  toilet: 'Унитаз',
  plant: 'Растение',
  corner: 'Угловой диван',
  fridge: 'Холодильник',
  shower: 'Душ',
  vanity: 'Тумба с раковиной',
  washer: 'Стиральная машина',
  television: 'Телевизор',
  oven: 'Духовой шкаф',
  microwave: 'Микроволновая печь',
  dishwasher: 'Посудомоечная машина',
  hood: 'Вытяжка',
  workstation: 'Стол с компьютером и монитором',
  bookcase: 'Книжный шкаф с книгами',
  rack: 'Силовая рама со штангой',
  bench: 'Лавка для жима',
  platform: 'Помост',
  kettlebell: 'Гиря',
  rug: 'Ковёр',
  mirror: 'Зеркало с подсветкой',
  curtains: 'Шторы и тюль',
  nightstand: 'Прикроватная тумба',
  tvstand: 'Тумба под ТВ',
  upper_cabinet: 'Верхние шкафы кухни',
  pantry: 'Кухонный пенал',
  island: 'Кухонный остров',
  person: 'Человек (186 см)',
  custom_glb: 'Своя 3D-модель',
  round_table: 'Круглый обеденный стол',
  slat_partition: 'Реечная перегородка',
  tv_stand_mobile: 'ТВ на мобильной стойке',
  laundry_tower: 'Постирочная колонна (стир. + суш.)',
  vanity_desk: 'Туалетный столик с пуфом',
};

export type CatalogGroup =
  | 'Кухня и столовая'
  | 'Гостиная и ТВ'
  | 'Спальня и хранение'
  | 'Ванная и постирочная'
  | 'Кабинет и спорт'
  | 'Зонирование, свет и декор'
  | 'Масштаб';

export interface Preset {
  name: string;
  kind: Kind;
  dims: [number, number, number];
  elevation?: number;
  group?: CatalogGroup;
}

export const catalog: Preset[] = [
  // Спальня и хранение (базовые позиции + шкаф 150)
  { name: 'Кровать 140 × 200', kind: 'bed', dims: [1.4, 2, .65], group: 'Спальня и хранение' },
  { name: 'Кровать 160 × 200', kind: 'bed', dims: [1.6, 2, .65], group: 'Спальня и хранение' },
  { name: 'Кровать 180 × 200', kind: 'bed', dims: [1.8, 2, .65], group: 'Спальня и хранение' },
  { name: 'Тумба прикроватная 50', kind: 'nightstand', dims: [.5, .42, .52], group: 'Спальня и хранение' },
  { name: 'Туалетный столик с зеркалом и пуфом', kind: 'vanity_desk', dims: [.95, .45, 1.35], group: 'Спальня и хранение' },
  { name: 'Шкаф 150', kind: 'wardrobe', dims: [1.5, .6, 2.2], group: 'Спальня и хранение' },

  // Кабинет и спорт (канонический книжный шкаф раньше узких стеллажей для catalog.find)
  { name: 'Стол с компьютером и монитором · общий габарит', kind: 'workstation', dims: furnitureDimensions.workstation, group: 'Кабинет и спорт' },
  { name: 'Письменный стол', kind: 'table', dims: [1.2, .6, .75], group: 'Кабинет и спорт' },
  { name: 'Книжный шкаф с книгами', kind: 'bookcase', dims: furnitureDimensions.bookcase, group: 'Кабинет и спорт' },
  { name: 'Силовая рама со штангой · компактная', kind: 'rack', dims: furnitureDimensions.rack, group: 'Кабинет и спорт' },
  { name: 'Лавка для жима · плоская', kind: 'bench', dims: furnitureDimensions.bench, group: 'Кабинет и спорт' },
  { name: 'Помост 200 × 200 · высота 4 см', kind: 'platform', dims: furnitureDimensions.platform, group: 'Кабинет и спорт' },
  { name: 'Гиря · приблизительно', kind: 'kettlebell', dims: furnitureDimensions.kettlebell, group: 'Кабинет и спорт' },

  // Дополнительное хранение
  { name: 'Узкий стеллаж 90 × 25 (в нишу/коридор)', kind: 'bookcase', dims: [.9, .25, 2.2], group: 'Спальня и хранение' },
  { name: 'Узкий стеллаж 115 × 30', kind: 'bookcase', dims: [1.15, .3, 2.4], group: 'Спальня и хранение' },

  // Масштаб
  { name: 'Человек · рост 186 см (для масштаба)', kind: 'person', dims: furnitureDimensions.person, group: 'Масштаб' },

  // Кухня и столовая
  { name: 'Кухня: ряд 240', kind: 'kitchen', dims: [2.4, .6, .9], group: 'Кухня и столовая' },
  { name: 'Кухня: база 60', kind: 'kitchen', dims: [.6, .6, .9], group: 'Кухня и столовая' },
  { name: 'Кухня: верхние шкафы 180', kind: 'upper_cabinet', dims: [1.8, .35, .72], elevation: 1.5, group: 'Кухня и столовая' },
  { name: 'Кухня: верхний шкаф 60', kind: 'upper_cabinet', dims: [.6, .35, .72], elevation: 1.5, group: 'Кухня и столовая' },
  { name: 'Кухня: пенал под технику 60', kind: 'pantry', dims: [.6, .6, 2.2], group: 'Кухня и столовая' },
  { name: 'Кухня: колонна 60', kind: 'wardrobe', dims: [.6, .6, 2.2], group: 'Кухня и столовая' },
  { name: 'Кухонный остров / барная 140', kind: 'island', dims: [1.4, .75, .9], group: 'Кухня и столовая' },
  { name: 'Холодильник 60', kind: 'fridge', dims: [.6, .65, 1.85], group: 'Кухня и столовая' },
  { name: 'Духовой шкаф 60', kind: 'oven', dims: [.6, .58, .6], group: 'Кухня и столовая' },
  { name: 'Микроволновая печь 50', kind: 'microwave', dims: [.5, .4, .3], elevation: .9, group: 'Кухня и столовая' },
  { name: 'Посудомоечная машина 60', kind: 'dishwasher', dims: [.6, .6, .85], group: 'Кухня и столовая' },
  { name: 'Вытяжка 60', kind: 'hood', dims: [.6, .5, .7], elevation: 1.55, group: 'Кухня и столовая' },
  { name: 'Обеденный стол', kind: 'table', dims: [1.4, .85, .75], group: 'Кухня и столовая' },
  { name: 'Круглый стол Ø 90 см', kind: 'round_table', dims: [.9, .9, .75], group: 'Кухня и столовая' },
  { name: 'Круглый стол Ø 100 см', kind: 'round_table', dims: [1, 1, .75], group: 'Кухня и столовая' },
  { name: 'Круглый стол Ø 110 см', kind: 'round_table', dims: [1.1, 1.1, .75], group: 'Кухня и столовая' },
  { name: 'Стул', kind: 'chair', dims: [.48, .48, .85], group: 'Кухня и столовая' },

  // Гостиная и ТВ
  { name: 'Диван прямой 220', kind: 'sofa', dims: [2.2, .9, .85], group: 'Гостиная и ТВ' },
  { name: 'Угловой диван 260', kind: 'corner', dims: [2.6, 1.6, .85], group: 'Гостиная и ТВ' },
  { name: 'Тумба под ТВ 180', kind: 'tvstand', dims: [1.8, .42, .45], group: 'Гостиная и ТВ' },
  { name: 'Телевизор 43″ · приблизительно', kind: 'television', dims: [.97, .07, .57], elevation: 1, group: 'Гостиная и ТВ' },
  { name: 'Телевизор 55″ · приблизительно', kind: 'television', dims: [1.23, .08, .72], elevation: 1, group: 'Гостиная и ТВ' },
  { name: 'Телевизор 65″ · приблизительно', kind: 'television', dims: [1.45, .08, .84], elevation: 1, group: 'Гостиная и ТВ' },
  { name: 'ТВ на мобильной стойке (на колёсах)', kind: 'tv_stand_mobile', dims: [1.15, .58, 1.48], group: 'Гостиная и ТВ' },

  // Ванная и постирочная
  { name: 'Ванна 170 × 70', kind: 'bath', dims: [.7, 1.7, .55], group: 'Ванная и постирочная' },
  { name: 'Душ 90 × 90', kind: 'shower', dims: [.9, .9, 2.1], group: 'Ванная и постирочная' },
  { name: 'Душ 120 × 90', kind: 'shower', dims: [1.2, .9, 2.1], group: 'Ванная и постирочная' },
  { name: 'Раковина 60', kind: 'vanity', dims: [.6, .48, .85], group: 'Ванная и постирочная' },
  { name: 'Раковина 80', kind: 'vanity', dims: [.8, .48, .85], group: 'Ванная и постирочная' },
  { name: 'Раковина 100', kind: 'vanity', dims: [1, .48, .85], group: 'Ванная и постирочная' },
  { name: 'Унитаз', kind: 'toilet', dims: [.4, .65, .5], group: 'Ванная и постирочная' },
  { name: 'Стиральная машина 60', kind: 'washer', dims: [.6, .6, .85], group: 'Ванная и постирочная' },
  { name: 'Постирочная колонна 60 (стиралка + сушилка)', kind: 'laundry_tower', dims: [.6, .62, 1.72], group: 'Ванная и постирочная' },

  // Зонирование, свет и декор
  { name: 'Реечная перегородка 120', kind: 'slat_partition', dims: [1.2, .08, 2.6], group: 'Зонирование, свет и декор' },
  { name: 'Реечная перегородка 180', kind: 'slat_partition', dims: [1.8, .08, 2.6], group: 'Зонирование, свет и декор' },
  { name: 'Ковёр 160 × 230', kind: 'rug', dims: [1.6, 2.3, .02], group: 'Зонирование, свет и декор' },
  { name: 'Ковёр 200 × 300', kind: 'rug', dims: [2, 3, .02], group: 'Зонирование, свет и декор' },
  { name: 'Зеркало 60 × 90 с подсветкой', kind: 'mirror', dims: [.6, .04, .9], elevation: 1.15, group: 'Зонирование, свет и декор' },
  { name: 'Зеркало в полный рост 60 × 175', kind: 'mirror', dims: [.6, .04, 1.75], elevation: .15, group: 'Зонирование, свет и декор' },
  { name: 'Шторы и тюль 220', kind: 'curtains', dims: [2.2, .16, 2.65], group: 'Зонирование, свет и декор' },
  { name: 'Растение', kind: 'plant', dims: [.45, .45, 1.2], group: 'Зонирование, свет и декор' },
];

export const catalogGroups: CatalogGroup[] = [
  'Кухня и столовая',
  'Гостиная и ТВ',
  'Спальня и хранение',
  'Ванная и постирочная',
  'Кабинет и спорт',
  'Зонирование, свет и декор',
  'Масштаб',
];
