import { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { type MaterialQuote, type Project, type RenovationStage, type RoadmapStatus, type Surface, type Variant, type WorkRates } from './model';
import { adhesiveEstimate, compareVariants, coveringEstimate, estimateVariant, furnitureBudget, paintEstimate, projectQuantities, roomQuantities, skirtingEstimate, surfaceArea, wallpaperEstimate, worksBudget } from './materialEstimate';
import { buildEstimateCsv, buildRenovationBriefHtml } from './renovationExport';
import RoadmapPanel from './RoadmapPanel';

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function QuoteNumber({ label, value, integer, onChange }: { label: string; value?: number; integer?: boolean; onChange: (n?: number) => void }) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  return <label className="field"><span>{label}</span><input aria-label={label} type="number" min="0" max="1000000" step={integer ? '1' : 'any'} value={draft}
    onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={() => {
      const n = draft === '' ? undefined : Number(draft);
      if (n === undefined || (Number.isFinite(n) && n > 0 && n <= 1_000_000 && (!integer || Number.isInteger(n)))) onChange(n);
      else setDraft(value === undefined ? '' : String(value));
    }} /></label>;
}
export function QuoteFields({ quote = {}, onChange }: { quote?: MaterialQuote; onChange: (q: MaterialQuote) => void }) {
  const number = (label: string, key: 'price' | 'packCoverageM2' | 'packPieces') => <QuoteNumber label={label} value={quote[key]} integer={key === 'packPieces'} onChange={n => onChange({ ...quote, [key]: n })} />;
  return <div className="section-fields">
    {number('Цена материала', 'price')}
    <label className="field"><span>Цена за</span><select aria-label="Единица цены" value={quote.priceUnit ?? 'unknown'} onChange={e => onChange({ ...quote, priceUnit: e.target.value as MaterialQuote['priceUnit'] })}>
      <option value="unknown">Не определена</option><option value="m2">м²</option><option value="pack">упаковку</option><option value="item">штуку</option>
    </select></label>
    <label className="field"><span>Валюта</span><select aria-label="Валюта цены" value={quote.currency ?? ''} onChange={e => onChange({ ...quote, currency: e.target.value || undefined })}><option value="">Не определена</option>{[...new Set(['BYN', 'EUR', 'USD', 'RUB', ...(quote.currency ? [quote.currency] : [])])].map(c => <option key={c}>{c}</option>)}</select></label>
    {number('Площадь упаковки, м²', 'packCoverageM2')}
    {number('Штук в упаковке', 'packPieces')}
  </div>;
}
const names: Record<Surface, string> = { floor: 'Пол', walls: 'Стены', ceiling: 'Потолок' };
const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const fmtMap = (map: Record<string, number>) => Object.entries(map).map(([c, v]) => `${fmt(v)} ${c}`).join(' + ') || '—';

export default function EstimatePanel({ project, variant, roomId, surface, onSurface, onQuote, onWorkRates, onRoadmapStatus, onPreviewStage, onNotify }: { project: Project; variant: Variant; roomId: string; surface: Surface; onSurface: (s: Surface) => void; onQuote: (q: MaterialQuote) => void; onWorkRates?: (rates: WorkRates) => void; onRoadmapStatus?: (stepId: string, status: RoadmapStatus) => void; onPreviewStage?: (stage: RenovationStage) => void; onNotify?: (text: string) => void }) {
  const [reserve, setReserve] = useState(10);
  const [localRates, setLocalRates] = useState<WorkRates>(variant.workRates ?? {});
  const rates = onWorkRates ? (variant.workRates ?? {}) : localRates;
  const setRates = (patch: Partial<WorkRates>) => {
    const next = { ...rates, ...patch };
    if (onWorkRates) onWorkRates(next);
    else setLocalRates(next);
  };
  const coats = rates.paintCoats ?? 2;
  const coveragePerL = rates.paintCoverageM2PerL ?? 10;
  const canLitres = rates.paintCanLitres ?? 9;
  const paintPrice = rates.paintPricePerCan;
  const rollWidth = rates.rollWidthM ?? 1.06;
  const rollLength = rates.rollLengthM ?? 10.05;
  const rapportCm = rates.rapportCm ?? 0;
  const rollPrice = rates.rollPricePerRoll;
  const skirtPieceM = rates.skirtingPieceM ?? 2.4;
  const skirtPrice = rates.skirtingPricePerPiece;
  const glueKgPerM2 = rates.adhesiveKgPerM2 ?? 4.5;
  const glueBagKg = rates.adhesiveBagKg ?? 25;
  const gluePrice = rates.adhesivePricePerBag;

  const material = project.materials.find(m => m.id === variant.finishes[roomId][surface])!;
  const currency = rates.currency ?? material.quote?.currency ?? 'BYN';
  const currentSurfaceM2 = surfaceArea(project, roomId, surface);
  const selected = coveringEstimate(currentSurfaceM2, reserve, material.quote);
  const all = estimateVariant(project, variant, reserve);
  const furn = furnitureBudget(variant);
  const works = worksBudget(project, variant);
  const variantsComparison = compareVariants(project, reserve);
  const quantities = roomQuantities(project, roomId);
  const allQuantities = projectQuantities(project);
  const paint = paintEstimate(currentSurfaceM2, reserve, { coats, coverageM2PerLitre: coveragePerL, canLitres, pricePerCan: paintPrice, currency });
  const wallpaper = wallpaperEstimate(quantities.wallM2, project.ceilingHeight, reserve, { rollWidthM: rollWidth, rollLengthM: rollLength, rapportCm, pricePerRoll: rollPrice, currency });
  const roomSkirting = skirtingEstimate(quantities.skirtingM, reserve, { pieceLengthM: skirtPieceM, pricePerPiece: skirtPrice, currency });
  const totalSkirting = skirtingEstimate(allQuantities.totals.skirtingM, reserve, { pieceLengthM: skirtPieceM, pricePerPiece: skirtPrice, currency });
  const adhesive = adhesiveEstimate(currentSurfaceM2, reserve, { kgPerM2: glueKgPerM2, bagKg: glueBagKg, pricePerBag: gluePrice, currency });
  return <div className="estimate-panel">
    <div className="export-actions">
      <button className="wide primary" onClick={() => {
        downloadBlob(buildRenovationBriefHtml(project, variant, reserve), 'text/html;charset=utf-8', 'kvartira-tz-remonta.html');
        onNotify?.('ТЗ для мастеров и электрика выгружено (откройте HTML и нажмите «Печать / PDF»).');
      }}><Printer size={15} />ТЗ для мастеров (HTML / PDF)</button>
      <button className="wide outline" onClick={() => {
        downloadBlob(buildEstimateCsv(project, variant, reserve), 'text/csv;charset=utf-8', 'kvartira-smeta.csv');
        onNotify?.('Смета экспортирована в CSV (открывается в Numbers и Excel).');
      }}><Download size={15} />Экспорт сметы в CSV</button>
    </div>
    <div className="surface-tabs">{(['floor', 'walls', 'ceiling'] as Surface[]).map(s => <button key={s} className={surface === s ? 'active' : ''} onClick={() => onSurface(s)}>{names[s]}</button>)}</div>
    <p><strong>{material.name}</strong></p>
    <label className="field"><span>Запас, %</span><input aria-label="Запас материала, %" type="number" min="0" max="100" value={reserve} onChange={e => { const n = Number(e.target.value); if (e.target.value && Number.isFinite(n) && n >= 0 && n <= 100) setReserve(n); }} /></label>
    <div className="size-summary" aria-label="Расчёт выбранной поверхности">
      <span>Площадь поверхности</span><b>{fmt(selected.netM2)} м²</b>
      <span>С запасом</span><b>{fmt(selected.requiredM2)} м²</b>
      <span>Целых упаковок</span><b>{selected.packs ?? 'Неизвестно'}</b>
      <span>К покупке</span><b>{fmt(selected.purchasedM2)} м²</b>
      <span>Стоимость этой комнаты</span><b>{selected.cost === undefined ? 'Не рассчитана' : `${fmt(selected.cost)} ${selected.currency}`}</b>
    </div>
    <QuoteFields quote={material.quote} onChange={onQuote} />
    {material.quote?.sourceUrl && <a className="source-link" href={material.quote.sourceUrl} target="_blank" rel="noreferrer">Карточка материала</a>}
    {material.quote?.observedAt && <p className="small-note">Данные цены: {new Date(material.quote.observedAt).toLocaleDateString('ru-RU')}. Проверьте цену перед покупкой.</p>}
    <p className="small-note">Площадь — по текущей модели. Из стен вычтены проёмы с учётом заданных высот. Запас 10% — редактируемое допущение. Для диагональной укладки и подрезки укажите свой запас. Площадь упаковки берите с этикетки, а не из размеров фотографии.</p>
    <div className="size-summary" aria-label="Обмеры комнаты">
      <span>Пол</span><b>{fmt(quantities.floorM2)} м²</b>
      <span>Стены без проёмов</span><b>{fmt(quantities.wallM2)} м²</b>
      <span>Потолок</span><b>{fmt(quantities.ceilingM2)} м²</b>
      <span>Периметр</span><b>{fmt(quantities.perimeterM)} м</b>
      <span>Плинтус без дверей</span><b>{fmt(quantities.skirtingM)} м</b>
      <span>Двери / окна</span><b>{quantities.doors} / {quantities.windows}</b>
    </div>
    <details><summary>Краска, обои, плинтус и клей</summary>
      <p className="small-note">Расчёт расходников для выбранной комнаты и всей квартиры с учётом запаса {reserve}% и высоты потолка {fmt(project.ceilingHeight)} м. Цены сохраняются в варианте.</p>
      <div className="section-fields">
        <strong>Краска ({names[surface].toLowerCase()} комнаты · {fmt(currentSurfaceM2)} м²)</strong>
        <QuoteNumber label="Слоёв покраски" value={coats} integer onChange={n => { if (n) setRates({ paintCoats: n }); }} />
        <QuoteNumber label="Расход на 1 слой, м²/л" value={coveragePerL} onChange={n => { if (n) setRates({ paintCoverageM2PerL: n }); }} />
        <QuoteNumber label="Объём банки, л" value={canLitres} onChange={n => { if (n) setRates({ paintCanLitres: n }); }} />
        <QuoteNumber label={`Цена банки, ${currency}`} value={paintPrice} onChange={n => setRates({ paintPricePerCan: n })} />
        <p className="small-note">Нужно краски: <strong>{fmt(paint.litres)} л</strong> → <strong>{paint.cans} шт.</strong> по {fmt(paint.canLitres)} л ({fmt(paint.purchasedLitres)} л){paint.cost !== undefined ? ` · ${fmt(paint.cost)} ${paint.currency}` : ''}.</p>
      </div>
      <div className="section-fields">
        <strong>Обои (стены комнаты · {fmt(quantities.wallM2)} м²)</strong>
        <QuoteNumber label="Ширина рулона, м" value={rollWidth} onChange={n => { if (n) setRates({ rollWidthM: n }); }} />
        <QuoteNumber label="Длина рулона, м" value={rollLength} onChange={n => { if (n) setRates({ rollLengthM: n }); }} />
        <label className="field"><span>Раппорт, см</span><input aria-label="Раппорт обоев, см" type="number" min="0" max="200" value={rapportCm} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n <= 200) setRates({ rapportCm: n }); }} /></label>
        <QuoteNumber label={`Цена рулона, ${currency}`} value={rollPrice} onChange={n => setRates({ rollPricePerRoll: n })} />
        <p className="small-note">Полос: <strong>{wallpaper.strips}</strong> (по {wallpaper.stripsPerRoll} из рулона, высота полосы {fmt(wallpaper.stripHeightM)} м) → <strong>{wallpaper.rolls} рул.</strong>{wallpaper.cost !== undefined ? ` · ${fmt(wallpaper.cost)} ${wallpaper.currency}` : ''}.</p>
      </div>
      <div className="section-fields">
        <strong>Плинтус (комната {fmt(quantities.skirtingM)} м · квартира {fmt(allQuantities.totals.skirtingM)} м)</strong>
        <QuoteNumber label="Длина планки, м" value={skirtPieceM} onChange={n => { if (n) setRates({ skirtingPieceM: n }); }} />
        <QuoteNumber label={`Цена планки, ${currency}`} value={skirtPrice} onChange={n => setRates({ skirtingPricePerPiece: n })} />
        <p className="small-note">На комнату: <strong>{roomSkirting.pieces} пл.</strong> ({fmt(roomSkirting.purchasedM)} м){roomSkirting.cost !== undefined ? ` · ${fmt(roomSkirting.cost)} ${roomSkirting.currency}` : ''}. На всю квартиру: <strong>{totalSkirting.pieces} пл.</strong> ({fmt(totalSkirting.purchasedM)} м){totalSkirting.cost !== undefined ? ` · ${fmt(totalSkirting.cost)} ${totalSkirting.currency}` : ''}.</p>
      </div>
      <div className="section-fields">
        <strong>Клей и грунтовка ({names[surface].toLowerCase()} комнаты · {fmt(currentSurfaceM2)} м²)</strong>
        <QuoteNumber label="Расход клея, кг/м²" value={glueKgPerM2} onChange={n => { if (n) setRates({ adhesiveKgPerM2: n }); }} />
        <QuoteNumber label="Мешок клея, кг" value={glueBagKg} onChange={n => { if (n) setRates({ adhesiveBagKg: n }); }} />
        <QuoteNumber label={`Цена мешка, ${currency}`} value={gluePrice} onChange={n => setRates({ adhesivePricePerBag: n })} />
        <p className="small-note">Клей: <strong>{fmt(adhesive.adhesiveKg)} кг</strong> → <strong>{adhesive.bags} меш.</strong> по {fmt(adhesive.bagKg)} кг{adhesive.adhesiveCost !== undefined ? ` · ${fmt(adhesive.adhesiveCost)} ${adhesive.currency}` : ''}. Грунтовка (0,15 л/м²): <strong>{fmt(adhesive.primerLitres)} л</strong> ({adhesive.primerCans} кан. по 5 л).</p>
      </div>
    </details>
    <details><summary>Расценки работ и мебель</summary>
      <p className="small-note">Укажите ориентировочные расценки мастеров. Цены предметов мебели задаются во вкладке «Мебель» или при импорте карточки товара.</p>
      <label className="field"><span>Валюта работ</span><select aria-label="Валюта работ" value={currency} onChange={e => setRates({ currency: e.target.value })}>{['BYN', 'USD', 'EUR', 'RUB'].map(c => <option key={c}>{c}</option>)}</select></label>
      <QuoteNumber label={`Укладка пола, ${currency}/м²`} value={rates.floorM2} onChange={n => setRates({ floorM2: n })} />
      <QuoteNumber label={`Отделка стен, ${currency}/м²`} value={rates.wallM2} onChange={n => setRates({ wallM2: n })} />
      <QuoteNumber label={`Потолок, ${currency}/м²`} value={rates.ceilingM2} onChange={n => setRates({ ceilingM2: n })} />
      <QuoteNumber label={`Плинтус, ${currency}/м`} value={rates.skirtingM} onChange={n => setRates({ skirtingM: n })} />
      <QuoteNumber label={`Точка электрики, ${currency}/шт`} value={rates.electricalPoint} onChange={n => setRates({ electricalPoint: n })} />
      <div className="size-summary" aria-label="Сводка работ и мебели">
        <span>Работы ({works.pricedLines} из 5 поз.)</span><b>{works.total > 0 ? `${fmt(works.total)} ${works.currency}` : 'Не указаны'}</b>
        <span>Мебель и техника ({furn.priced} из {furn.totalItems})</span><b>{fmtMap(furn.subtotals)}</b>
      </div>
    </details>
    <RoadmapPanel project={project} variant={variant} reserve={reserve} onSetStatus={onRoadmapStatus} onPreviewStage={onPreviewStage} />
    <details><summary>Сравнение вариантов ({variantsComparison.length})</summary>
      <p className="small-note">Сводка известного бюджета по всем вариантам дизайна: покрытия (включая акцентные стены), мебель/техника и работы.</p>
      {variantsComparison.map(v => <div className="estimate-row" key={v.id}>
        <strong>{v.name}{v.id === variant.id ? ' · активный' : ''}</strong>
        <span>Покрытия: {fmtMap(v.coverings)} · Мебель: {fmtMap(v.furniture)}</span>
        <span>Работы: {fmtMap(v.works)} · Электрика: {v.electricalPoints} точ.{v.heatedFloorWatts > 0 ? ` · Тёплый пол: ${fmt(v.heatedFloorWatts / 1000)} кВт` : ''}</span>
        <b>Итого: {fmtMap(v.totals)}</b>
      </div>)}
    </details>
    <details><summary>Обмеры всех комнат</summary>
      <p className="small-note">Площади и плинтус пересчитываются вместе с геометрией и проёмами. Балкон показан в физических метрах; в площади демо-квартиры он учтён отдельно, поэтому сумма комнат больше.</p>
      {allQuantities.rooms.map(room => <div className="estimate-row" key={room.id}>
        <strong>{room.name}</strong>
        <span>{fmt(room.floorM2)} м² пола · {fmt(room.wallM2)} м² стен</span>
        <span>плинтус {fmt(room.skirtingM)} м · двери {room.doors} · окна {room.windows}</span>
        <b>{fmt(room.ceilingM2)} м² потолка</b>
      </div>)}
      <p>Итого: <strong>{fmt(allQuantities.totals.floorM2)} м²</strong> пола, {fmt(allQuantities.totals.wallM2)} м² стен, {fmt(allQuantities.totals.skirtingM)} м плинтуса, {allQuantities.totals.doors} дверей и {allQuantities.totals.windows} окон.</p>
    </details>
    <details><summary>Смета покрытий текущего варианта</summary>
      <p className="small-note">Одинаковый материал на одной поверхности объединяется по комнатам до округления упаковок (акцентные стены учитываются отдельно). Сумма выбранной комнаты может отличаться от её доли в общей покупке.</p>
      {all.rows.map(row => <div className="estimate-row" key={`${row.surface}:${row.materialId}`}>
        <strong>{names[row.surface]} · {row.name}</strong><span>{row.rooms.join(', ')}</span>
        <span>{fmt(row.netM2)} м² → {fmt(row.purchasedM2)} м²{row.packs !== undefined ? ` · ${row.packs} уп.` : ''}</span>
        <b>{row.cost === undefined ? 'Цена или единица неизвестна' : `${fmt(row.cost)} ${row.currency}`}</b>
      </div>)}
      {Object.entries(all.subtotals).map(([currency, cost]) => <p key={currency}>Известная часть покрытий: <strong>{fmt(cost)} {currency}</strong></p>)}
      <p>Без рассчитанной цены: {all.unknown} групп покрытий.</p>
    </details>
    <p className="small-note">Неизвестная цена не считается нулевой. Валюты не смешиваются. До заказа материалов и начала работ сверьте реальные обмеры на объекте.</p>
  </div>;
}
