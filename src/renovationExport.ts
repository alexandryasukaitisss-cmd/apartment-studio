import { electricalNames, electricalSymbols, engineeringNames, engineeringSymbols, solidSpans, type Project, type Surface, type Variant } from './model';
import { kindNames } from './furnitureCatalog';
import { estimateVariant, furnitureBudget, projectQuantities, variantBudgetSummary, worksBudget } from './materialEstimate';
import { doorSwingInfo, measurementChecklistItems, pointRoomOffsets } from './roomMeasures';

const surfaceNames: Record<Surface, string> = { floor: 'Пол', walls: 'Стены', ceiling: 'Потолок' };
const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const escHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csvCell = (value: string | number | undefined) => {
  const s = value === undefined ? '' : String(value);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildEstimateCsv(project: Project, variant: Variant, reserve = 10): string {
  const rows: (string | number | undefined)[][] = [];
  const push = (...cols: (string | number | undefined)[]) => rows.push(cols);
  const quantities = projectQuantities(project);
  const coverings = estimateVariant(project, variant, reserve);
  const works = worksBudget(project, variant);

  push('Раздел', 'Помещение / Группа', 'Наименование', 'Количество', 'Ед.', 'Цена', 'Стоимость', 'Валюта', 'Примечание / Ссылка');

  for (const r of quantities.rooms) {
    push('Ведомость помещений', r.name, 'Пол', r.floorM2.toFixed(2), 'м²', '', '', '', `Потолок ${r.ceilingM2.toFixed(2)} м²; стены ${r.wallM2.toFixed(2)} м²; плинтус ${r.skirtingM.toFixed(2)} м; двери ${r.doors}, окна ${r.windows}`);
  }
  push('Итого по помещениям', 'Вся квартира', 'Площадь / Плинтус / Проёмы', quantities.totals.floorM2.toFixed(2), 'м²', '', '', '', `Стены ${quantities.totals.wallM2.toFixed(2)} м²; плинтус ${quantities.totals.skirtingM.toFixed(2)} м; ${quantities.totals.doors} дв., ${quantities.totals.windows} ок.`);

  for (const row of coverings.rows) {
    const mat = project.materials.find(m => m.id === row.materialId);
    push(
      'Отделка',
      row.rooms.join(', '),
      `${surfaceNames[row.surface]} · ${row.name}`,
      row.purchasedM2.toFixed(2),
      row.packs !== undefined ? `м² (${row.packs} уп.)` : 'м²',
      mat?.quote?.price ?? '',
      row.cost !== undefined ? row.cost.toFixed(2) : '',
      row.currency ?? '',
      mat?.quote?.sourceUrl ?? `Чистая площадь ${row.netM2.toFixed(2)} м², запас ${reserve}%`,
    );
  }

  for (const f of variant.furniture) {
    const room = project.rooms.find(r => r.id === f.roomId)?.name ?? f.roomId;
    const title = f.label ? `${kindNames[f.kind]} (${f.label})` : kindNames[f.kind];
    const dims = `${Math.round(f.width * 100)}×${Math.round(f.depth * 100)}×${Math.round(f.height * 100)} см`;
    push('Мебель и техника', room, title, 1, 'шт.', f.price ?? '', f.price ?? '', f.price ? (f.currency ?? 'BYN') : '', f.sourceUrl ? `${dims} · ${f.sourceUrl}` : dims);
  }

  for (const w of works.lines) {
    push('Работы', 'Вся квартира', w.label, w.quantity.toFixed(2), w.unit, w.rate ?? '', w.cost !== undefined ? w.cost.toFixed(2) : '', w.cost !== undefined ? works.currency : '', '');
  }

  for (const pt of variant.electrical.points) {
    const room = project.rooms.find(r => r.id === pt.roomId)?.name ?? pt.roomId;
    const off = pointRoomOffsets(project, pt.roomId, pt.x, pt.z);
    const pos = off ? `от левой ${off.leftCm} см, от правой ${off.rightCm} см, от верхней ${off.topCm} см, от нижней ${off.bottomCm} см` : '';
    push('Электрика', room, `${electricalNames[pt.type]}${pt.label ? ` · ${pt.label}` : ''}`, Math.round(pt.height * 100), 'см от пола', '', '', '', pos);
  }

  for (const it of variant.engineering?.items ?? []) {
    const room = project.rooms.find(r => r.id === it.roomId)?.name ?? it.roomId;
    const off = pointRoomOffsets(project, it.roomId, it.x, it.z);
    const pos = off ? `от левой ${off.leftCm} см, от верхней ${off.topCm} см` : '';
    push('Инженерия', room, `${engineeringNames[it.type]}${it.label ? ` · ${it.label}` : ''}`, 1, 'шт.', '', '', '', pos);
  }

  for (const z of variant.engineering?.heatedFloors ?? []) {
    const room = project.rooms.find(r => r.id === z.roomId)?.name ?? z.roomId;
    push('Тёплый пол', room, z.label || 'Тёплый пол', z.areaM2.toFixed(2), 'м²', '', '', '', `${z.wattsPerM2} Вт/м² · ${(z.areaM2 * z.wattsPerM2 / 1000).toFixed(2)} кВт`);
  }

  return '\uFEFF' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
}

function buildPlanSvgMarkup(project: Project, variant: Variant): string {
  const maxX = Math.max(...project.rooms.flatMap(r => r.polygon.map(p => p[0])));
  const maxZ = Math.max(...project.rooms.flatMap(r => r.polygon.map(p => p[1])));
  const roomsSvg = project.rooms.map(r => {
    const pts = r.polygon.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ');
    const xs = r.polygon.map(p => p[0]), zs = r.polygon.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    return `<polygon points="${pts}" fill="#faf8f2" stroke="#c8c3b6" stroke-width="0.025" />`
      + `<text x="${cx.toFixed(2)}" y="${cz.toFixed(2)}" text-anchor="middle" font-size="0.22" fill="#3a4339" font-family="sans-serif">${escHtml(r.name)}</text>`;
  }).join('');
  const wallsSvg = project.walls.flatMap(w => {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (!len) return [];
    const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
    const solids = solidSpans(w).map(([s, e]) =>
      `<line x1="${(w.a[0] + ux * s).toFixed(3)}" y1="${(w.a[1] + uz * s).toFixed(3)}" x2="${(w.a[0] + ux * e).toFixed(3)}" y2="${(w.a[1] + uz * e).toFixed(3)}" stroke="#424a42" stroke-width="0.14" />`
    );
    const openings = (w.openings ?? []).map(o => {
      if (o.kind === 'window') {
        return `<line x1="${(w.a[0] + ux * o.start).toFixed(3)}" y1="${(w.a[1] + uz * o.start).toFixed(3)}" x2="${(w.a[0] + ux * o.end).toFixed(3)}" y2="${(w.a[1] + uz * o.end).toFixed(3)}" stroke="#6c9eac" stroke-width="0.09" />`;
      }
      const swing = doorSwingInfo(project, w, o);
      if (!swing) return '';
      return `<path d="M${swing.hx.toFixed(3)} ${swing.hy.toFixed(3)}L${swing.ox.toFixed(3)} ${swing.oy.toFixed(3)}A${swing.radius.toFixed(3)} ${swing.radius.toFixed(3)} 0 0 ${swing.sweep} ${swing.cx.toFixed(3)} ${swing.cy.toFixed(3)}" fill="none" stroke="#8b7f6b" stroke-width="0.022" stroke-dasharray="0.06 0.04" />`;
    });
    return [...solids, ...openings];
  }).join('');
  const furnitureSvg = variant.furniture.map(f =>
    `<g transform="translate(${f.x.toFixed(3)} ${f.z.toFixed(3)}) rotate(${f.rotation}) scale(${(1 / project.scale).toFixed(4)})"><rect x="${(-f.width / 2).toFixed(3)}" y="${(-f.depth / 2).toFixed(3)}" width="${f.width.toFixed(3)}" height="${f.depth.toFixed(3)}" rx="0.04" fill="#e6dfd1" stroke="#8c806d" stroke-width="0.02" /></g>`
  ).join('');
  const elecLines = variant.electrical.connections.map(c => {
    const a = variant.electrical.points.find(pt => pt.id === c.from), b = variant.electrical.points.find(pt => pt.id === c.to);
    return a && b ? `<line x1="${a.x.toFixed(3)}" y1="${a.z.toFixed(3)}" x2="${b.x.toFixed(3)}" y2="${b.z.toFixed(3)}" stroke="#9a5f1b" stroke-width="0.03" stroke-dasharray="0.12 0.07" />` : '';
  }).join('');
  const elecPts = variant.electrical.points.map(pt =>
    `<g transform="translate(${pt.x.toFixed(3)} ${pt.z.toFixed(3)})"><circle r="0.16" fill="#fff6e0" stroke="#9a5f1b" stroke-width="0.035" /><text text-anchor="middle" dominant-baseline="central" font-size="0.17" font-weight="700" fill="#653b0c" font-family="sans-serif">${escHtml(electricalSymbols[pt.type])}</text></g>`
  ).join('');
  const engPts = (variant.engineering?.items ?? []).map(it =>
    `<g transform="translate(${it.x.toFixed(3)} ${it.z.toFixed(3)})"><rect x="-0.18" y="-0.14" width="0.36" height="0.28" rx="0.05" fill="#e4eff7" stroke="#2c638a" stroke-width="0.035" /><text text-anchor="middle" dominant-baseline="central" font-size="0.14" font-weight="700" fill="#1e4969" font-family="sans-serif">${escHtml(engineeringSymbols[it.type])}</text></g>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.8 -0.8 ${(maxX + 1.6).toFixed(2)} ${(maxZ + 1.6).toFixed(2)}" style="width:100%;max-height:520px;background:#fff;border:1px solid #d7d5cc;border-radius:8px">${roomsSvg}${wallsSvg}${furnitureSvg}${elecLines}${elecPts}${engPts}</svg>`;
}

export function buildRenovationBriefHtml(project: Project, variant: Variant, reserve = 10): string {
  const quantities = projectQuantities(project);
  const coverings = estimateVariant(project, variant, reserve);
  const furn = furnitureBudget(variant);
  const works = worksBudget(project, variant);
  const summary = variantBudgetSummary(project, variant, reserve);
  const date = new Date().toLocaleDateString('ru-RU');

  const elecCounts = Object.entries(electricalNames).map(([type, label]) => ({
    label,
    symbol: electricalSymbols[type as keyof typeof electricalSymbols],
    count: variant.electrical.points.filter(pt => pt.type === type).length,
  }));

  const roomRows = quantities.rooms.map(r => `<tr>
    <td><strong>${escHtml(r.name)}</strong></td>
    <td>${fmt(r.floorM2)}</td><td>${fmt(r.wallM2)}</td><td>${fmt(r.ceilingM2)}</td>
    <td>${fmt(r.perimeterM)}</td><td>${fmt(r.skirtingM)}</td><td>${r.doors} / ${r.windows}</td>
  </tr>`).join('');

  const coveringRows = coverings.rows.map(row => `<tr>
    <td>${escHtml(surfaceNames[row.surface])}</td>
    <td>${escHtml(row.name)}</td>
    <td>${escHtml(row.rooms.join(', '))}</td>
    <td>${fmt(row.netM2)} м²</td>
    <td>${fmt(row.purchasedM2)} м²${row.packs !== undefined ? ` (${row.packs} уп.)` : ''}</td>
    <td>${row.cost !== undefined ? `${fmt(row.cost)} ${escHtml(row.currency ?? '')}` : '—'}</td>
  </tr>`).join('');

  const furnitureRows = variant.furniture.map(f => {
    const room = project.rooms.find(r => r.id === f.roomId)?.name ?? f.roomId;
    return `<tr>
      <td>${escHtml(room)}</td>
      <td>${escHtml(kindNames[f.kind])}${f.label ? ` · ${escHtml(f.label)}` : ''}</td>
      <td>${Math.round(f.width * 100)} × ${Math.round(f.depth * 100)} × ${Math.round(f.height * 100)} см</td>
      <td>${f.price ? `${fmt(f.price)} ${escHtml(f.currency ?? 'BYN')}` : '—'}</td>
    </tr>`;
  }).join('');

  const electricalRows = variant.electrical.points.map((pt, i) => {
    const room = project.rooms.find(r => r.id === pt.roomId)?.name ?? pt.roomId;
    const off = pointRoomOffsets(project, pt.roomId, pt.x, pt.z);
    return `<tr>
      <td>${i + 1}</td>
      <td>${escHtml(room)}</td>
      <td>${escHtml(electricalSymbols[pt.type])} · ${escHtml(electricalNames[pt.type])}</td>
      <td>${escHtml(pt.label || '—')}</td>
      <td>${Math.round(pt.height * 100)} см</td>
      <td>${off ? `Л: ${off.leftCm} / П: ${off.rightCm} / В: ${off.topCm} / Н: ${off.bottomCm} см` : '—'}</td>
    </tr>`;
  }).join('');

  const engineeringRows = (variant.engineering?.items ?? []).map((it, i) => {
    const room = project.rooms.find(r => r.id === it.roomId)?.name ?? it.roomId;
    const off = pointRoomOffsets(project, it.roomId, it.x, it.z);
    return `<tr>
      <td>${i + 1}</td>
      <td>${escHtml(room)}</td>
      <td>${escHtml(engineeringSymbols[it.type])} · ${escHtml(engineeringNames[it.type])}</td>
      <td>${escHtml(it.label || '—')}</td>
      <td>${off ? `Л: ${off.leftCm} / В: ${off.topCm} см` : '—'}</td>
    </tr>`;
  }).join('');

  const heatedRows = (variant.engineering?.heatedFloors ?? []).map(z => {
    const room = project.rooms.find(r => r.id === z.roomId)?.name ?? z.roomId;
    return `<tr><td>${escHtml(room)}</td><td>${escHtml(z.label || 'Тёплый пол')}</td><td>${fmt(z.areaM2)} м²</td><td>${z.wattsPerM2} Вт/м²</td><td>${fmt(z.areaM2 * z.wattsPerM2 / 1000)} кВт</td></tr>`;
  }).join('');

  const notesRows = project.rooms.map(r => {
    const note = project.roomNotes?.[r.id];
    const done = measurementChecklistItems.filter(it => note?.checks?.[it.key]).length;
    if (!note?.notes && done === 0) return '';
    return `<tr><td><strong>${escHtml(r.name)}</strong></td><td>${done} / ${measurementChecklistItems.length}</td><td>${escHtml(note?.notes || '—')}</td></tr>`;
  }).filter(Boolean).join('');

  const totalsStr = Object.entries(summary.totals).map(([cur, val]) => `${fmt(val)} ${escHtml(cur)}`).join(' + ') || 'цены не заполнены';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>ТЗ и смета ремонта · ${escHtml(project.name)} (${escHtml(variant.name)})</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #222629; margin: 28px; line-height: 1.45; font-size: 13px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { margin: 24px 0 10px; font-size: 16px; border-bottom: 1px solid #d5d7cf; padding-bottom: 4px; page-break-after: avoid; }
  .meta { color: #5b635a; font-size: 12px; margin-bottom: 16px; }
  .banner { background: #f5efe4; border: 1px solid #e1d4be; border-radius: 8px; padding: 10px 14px; margin-bottom: 18px; font-size: 12px; color: #5f4d32; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 12px; }
  th, td { border: 1px solid #d9dad2; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f3ee; font-weight: 600; }
  .kpi { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }
  .kpi div { border: 1px solid #d9dad2; border-radius: 8px; padding: 10px; background: #faf9f6; }
  .kpi small { display: block; color: #646c63; font-size: 11px; }
  .kpi strong { font-size: 15px; }
  .print-btn { padding: 8px 14px; border: 0; border-radius: 7px; background: #305b4b; color: #fff; font: inherit; cursor: pointer; margin-bottom: 14px; }
  @media print { .print-btn { display: none; } body { margin: 10mm; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Печать / Сохранить как PDF</button>
  <h1>${escHtml(project.name)} — ${escHtml(variant.name)}</h1>
  <div class="meta">Дата выгрузки: ${date} · Потолок: ${fmt(project.ceilingHeight)} м · Запас покрытий: ${reserve}%</div>
  <div class="banner">Внимание: геометрические размеры основаны на текущей модели проекта. До финального заказа материалов и штробления сверьте линейные обмеры на объекте.</div>
  <div class="kpi">
    <div><small>Площадь пола (с балконом)</small><strong>${fmt(quantities.totals.floorM2)} м²</strong></div>
    <div><small>Стены без проёмов / Плинтус</small><strong>${fmt(quantities.totals.wallM2)} м² / ${fmt(quantities.totals.skirtingM)} м</strong></div>
    <div><small>Точки электрики / Проёмы</small><strong>${variant.electrical.points.length} точ. · ${quantities.totals.doors} дв. / ${quantities.totals.windows} ок.</strong></div>
    <div><small>Известный бюджет варианта</small><strong>${totalsStr}</strong></div>
  </div>

  <h2>1. План квартиры (мебель, электрика, инженерия)</h2>
  ${buildPlanSvgMarkup(project, variant)}

  <h2>2. Ведомость помещений для отделочников</h2>
  <table>
    <thead><tr><th>Помещение</th><th>Пол, м²</th><th>Стены, м²</th><th>Потолок, м²</th><th>Периметр, м</th><th>Плинтус, м</th><th>Двери / окна</th></tr></thead>
    <tbody>${roomRows}
      <tr><td><strong>Итого</strong></td><td><strong>${fmt(quantities.totals.floorM2)}</strong></td><td><strong>${fmt(quantities.totals.wallM2)}</strong></td><td><strong>${fmt(quantities.totals.ceilingM2)}</strong></td><td>—</td><td><strong>${fmt(quantities.totals.skirtingM)}</strong></td><td><strong>${quantities.totals.doors} / ${quantities.totals.windows}</strong></td></tr>
    </tbody>
  </table>

  <h2>3. Техническое задание электрику</h2>
  <p>Итого точек: <strong>${variant.electrical.points.length}</strong> (${elecCounts.map(c => `${c.label}: ${c.count}`).join(', ')}).</p>
  ${variant.electrical.points.length ? `<table><thead><tr><th>№</th><th>Помещение</th><th>Тип</th><th>Подпись</th><th>Высота</th><th>Отступы от стен комнаты</th></tr></thead><tbody>${electricalRows}</tbody></table>` : '<p>Точки электрики пока не добавлены.</p>'}

  <h2>4. Инженерия и тёплый пол</h2>
  ${engineeringRows ? `<table><thead><tr><th>№</th><th>Помещение</th><th>Отметка</th><th>Подпись</th><th>Привязка</th></tr></thead><tbody>${engineeringRows}</tbody></table>` : '<p>Инженерные отметки (стояки, радиаторы, кондиционер) пока не добавлены.</p>'}
  ${heatedRows ? `<table><thead><tr><th>Помещение</th><th>Зона</th><th>Площадь</th><th>Удельная мощность</th><th>Мощность</th></tr></thead><tbody>${heatedRows}</tbody></table>` : ''}

  <h2>5. Ведомость отделки (запас ${reserve}%)</h2>
  <table><thead><tr><th>Поверхность</th><th>Материал</th><th>Помещения</th><th>Чистая площадь</th><th>К покупке</th><th>Стоимость</th></tr></thead><tbody>${coveringRows}</tbody></table>

  <h2>6. Спецификация мебели и техники (${furn.totalItems} поз., с ценой: ${furn.priced})</h2>
  <table><thead><tr><th>Помещение</th><th>Предмет / модель</th><th>Габариты (Ш×Г×В)</th><th>Цена</th></tr></thead><tbody>${furnitureRows}</tbody></table>

  ${works.pricedLines > 0 ? `<h2>7. Предварительный расчёт работ (${escHtml(works.currency)})</h2>
  <table><thead><tr><th>Работа</th><th>Объём</th><th>Ставка</th><th>Сумма</th></tr></thead><tbody>${works.lines.filter(l => l.cost !== undefined).map(l => `<tr><td>${escHtml(l.label)}</td><td>${fmt(l.quantity)} ${l.unit}</td><td>${fmt(l.rate!)}</td><td>${fmt(l.cost!)} ${escHtml(works.currency)}</td></tr>`).join('')}<tr><td colspan="3"><strong>Итого по работам</strong></td><td><strong>${fmt(works.total)} ${escHtml(works.currency)}</strong></td></tr></tbody></table>` : ''}

  ${notesRows ? `<h2>8. Заметки и обмеры по комнатам</h2><table><thead><tr><th>Помещение</th><th>Чеклист</th><th>Заметки</th></tr></thead><tbody>${notesRows}</tbody></table>` : ''}
</body>
</html>`;
}
