import { furnitureDimensions, type Kind } from './model';
export const kindNames: Record<Kind, string> = { bed: 'Кровать', sofa: 'Диван', table: 'Стол', chair: 'Стул', wardrobe: 'Шкаф', kitchen: 'Кухонный модуль', bath: 'Ванна', toilet: 'Унитаз', plant: 'Растение', corner: 'Угловой диван', fridge: 'Холодильник', shower: 'Душ', vanity: 'Тумба с раковиной', washer: 'Стиральная машина', television: 'Телевизор', oven: 'Духовой шкаф', microwave: 'Микроволновая печь', dishwasher: 'Посудомоечная машина', hood: 'Вытяжка', workstation: 'Стол с компьютером и монитором', bookcase: 'Книжный шкаф с книгами', rack: 'Силовая рама со штангой', bench: 'Лавка для жима', platform: 'Помост', kettlebell: 'Гиря' };
export interface Preset { name: string; kind: Kind; dims: [number, number, number]; elevation?: number }
export const catalog: Preset[] = [
  { name: 'Стол с компьютером и монитором · общий габарит', kind: 'workstation', dims: furnitureDimensions.workstation },
  { name: 'Книжный шкаф с книгами', kind: 'bookcase', dims: furnitureDimensions.bookcase },
  { name: 'Силовая рама со штангой · компактная', kind: 'rack', dims: furnitureDimensions.rack },
  { name: 'Лавка для жима · плоская', kind: 'bench', dims: furnitureDimensions.bench },
  { name: 'Помост 200 × 200 · высота 4 см', kind: 'platform', dims: furnitureDimensions.platform },
  { name: 'Гиря · приблизительно', kind: 'kettlebell', dims: furnitureDimensions.kettlebell },
  { name: 'Телевизор 43″ · приблизительно', kind: 'television', dims: [.97, .07, .57], elevation: 1 },
  { name: 'Телевизор 55″ · приблизительно', kind: 'television', dims: [1.23, .08, .72], elevation: 1 },
  { name: 'Телевизор 65″ · приблизительно', kind: 'television', dims: [1.45, .08, .84], elevation: 1 },
  { name: 'Духовой шкаф 60', kind: 'oven', dims: [.6, .58, .6] },
  { name: 'Микроволновая печь 50', kind: 'microwave', dims: [.5, .4, .3], elevation: .9 },
  { name: 'Посудомоечная машина 60', kind: 'dishwasher', dims: [.6, .6, .85] },
  { name: 'Вытяжка 60', kind: 'hood', dims: [.6, .5, .7], elevation: 1.55 },
{ name: 'Кровать 140 × 200', kind: 'bed', dims: [1.4, 2, .65] }, { name: 'Кровать 160 × 200', kind: 'bed', dims: [1.6, 2, .65] }, { name: 'Кровать 180 × 200', kind: 'bed', dims: [1.8, 2, .65] }, { name: 'Угловой диван 260', kind: 'corner', dims: [2.6, 1.6, .85] }, { name: 'Холодильник 60', kind: 'fridge', dims: [.6, .65, 1.85] }, { name: 'Душ 90 × 90', kind: 'shower', dims: [.9, .9, 2.1] }, { name: 'Душ 120 × 90', kind: 'shower', dims: [1.2, .9, 2.1] }, { name: 'Раковина 60', kind: 'vanity', dims: [.6, .48, .85] }, { name: 'Раковина 80', kind: 'vanity', dims: [.8, .48, .85] }, { name: 'Раковина 100', kind: 'vanity', dims: [1, .48, .85] }, { name: 'Стиральная машина 60', kind: 'washer', dims: [.6, .6, .85] }, { name: 'Диван прямой 220', kind: 'sofa', dims: [2.2, .9, .85] }, { name: 'Обеденный стол', kind: 'table', dims: [1.4, .85, .75] }, { name: 'Письменный стол', kind: 'table', dims: [1.2, .6, .75] }, { name: 'Стул', kind: 'chair', dims: [.48, .48, .85] }, { name: 'Шкаф 150', kind: 'wardrobe', dims: [1.5, .6, 2.2] }, { name: 'Кухня: база 60', kind: 'kitchen', dims: [.6, .6, .9] }, { name: 'Кухня: ряд 240', kind: 'kitchen', dims: [2.4, .6, .9] }, { name: 'Кухня: колонна 60', kind: 'wardrobe', dims: [.6, .6, 2.2] }, { name: 'Ванна 170 × 70', kind: 'bath', dims: [.7, 1.7, .55] }, { name: 'Унитаз', kind: 'toilet', dims: [.4, .65, .5] }, { name: 'Растение', kind: 'plant', dims: [.45, .45, 1.2] }];
