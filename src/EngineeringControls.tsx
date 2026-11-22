import { useState } from 'react';
import { addEngineeringItem, area, engineeringNames, engineeringSymbols, MAX_ENGINEERING_ITEMS, removeEngineeringItem, removeHeatedFloorZone, upsertHeatedFloorZone, type EngineeringItem, type EngineeringType, type Project, type Variant } from './model';
import { pointRoomOffsets } from './roomMeasures';

export interface EngineeringControlsProps {
  project: Project;
  variant: Variant;
  roomId: string;
  itemId: string | null;
  visible: boolean;
  mutate: (edit: (p: Project) => void) => boolean;
  onSelect: (id: string | null) => void;
  onVisible: (visible: boolean) => void;
}

export default function EngineeringControls({ project, variant, roomId, itemId, visible, mutate, onSelect, onVisible }: EngineeringControlsProps) {
  const [type, setType] = useState<EngineeringType>('riser');
  const layer = variant.engineering ?? { items: [], heatedFloors: [] };
  const roomItems = layer.items.filter(it => it.roomId === roomId);
  const selected = layer.items.find(it => it.id === itemId);
  const room = project.rooms.find(r => r.id === roomId)!;
  const maxFloorM2 = Math.round(area(room.polygon) * project.scale ** 2 * 100) / 100;
  const heatedZone = layer.heatedFloors.find(z => z.roomId === roomId);
  const [hfArea, setHfArea] = useState(String(heatedZone?.areaM2 ?? Math.max(.5, Math.round(maxFloorM2 * .65 * 10) / 10)));
  const [hfWatts, setHfWatts] = useState(String(heatedZone?.wattsPerM2 ?? 150));

  const editItem = (patch: Partial<EngineeringItem>) => mutate(p => {
    const it = p.variants.find(v => v.id === p.activeVariantId)!.engineering?.items.find(x => x.id === itemId);
    if (it) Object.assign(it, patch);
  });

  const offsets = selected ? pointRoomOffsets(project, selected.roomId, selected.x, selected.z) : null;
  const totalWatts = layer.heatedFloors.reduce((sum, z) => sum + z.areaM2 * z.wattsPerM2, 0);

  return <div className="engineering-controls section-fields">
    <strong>Инженерия и тёплый пол</strong>
    <label className="check-label">
      <input type="checkbox" checked={visible} onChange={e => onVisible(e.target.checked)} />
      Показать инженерию на плане 2D
    </label>
    <label className="catalog-label">Инженерная отметка
      <select aria-label="Тип инженерной отметки" value={type} onChange={e => setType(e.target.value as EngineeringType)}>
        {Object.entries(engineeringNames).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
      </select>
    </label>
    <button className="wide outline" disabled={layer.items.length >= MAX_ENGINEERING_ITEMS} onClick={() => {
      let newId = '';
      if (mutate(p => { newId = addEngineeringItem(p, roomId, type).id; })) {
        onVisible(true);
        onSelect(newId);
      }
    }}>Добавить отметку в комнату</button>
    <div className="object-list">
      {roomItems.map(it => <button key={it.id} className={it.id === itemId ? 'active' : ''} onClick={() => { onVisible(true); onSelect(it.id); }}>
        {engineeringSymbols[it.type]} · {it.label || engineeringNames[it.type]}
      </button>)}
    </div>
    {selected && <div className="section-fields">
      <strong>{selected.label || engineeringNames[selected.type]} · выбрана</strong>
      <label className="field"><span>Подпись</span><input aria-label="Подпись инженерной отметки" value={selected.label ?? ''} maxLength={60} placeholder={engineeringNames[selected.type]} onChange={e => editItem({ label: e.target.value })} /></label>
      {offsets && <p className="small-note">Привязка от стен: слева {offsets.leftCm} см · справа {offsets.rightCm} см · сверху {offsets.topCm} см · снизу {offsets.bottomCm} см.</p>}
      <button className="wide outline danger" onClick={() => {
        if (mutate(p => removeEngineeringItem(p, selected.id))) onSelect(null);
      }}>Удалить отметку</button>
    </div>}

    <div className="section-fields">
      <strong>Тёплый пол · {room.name}</strong>
      {heatedZone ? <>
        <p className="small-note">Активная зона: <strong>{heatedZone.areaM2.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} м²</strong> · {heatedZone.wattsPerM2} Вт/м² ({(heatedZone.areaM2 * heatedZone.wattsPerM2 / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} кВт).</p>
        <button className="wide outline danger" onClick={() => mutate(p => removeHeatedFloorZone(p, roomId))}>Убрать тёплый пол из комнаты</button>
      </> : <>
        <label className="field"><span>Площадь, м²</span><input aria-label="Площадь тёплого пола, м²" type="number" min="0.2" max={maxFloorM2} step="0.1" value={hfArea} onChange={e => setHfArea(e.target.value)} /></label>
        <label className="field"><span>Мощность, Вт/м²</span><input aria-label="Мощность тёплого пола, Вт/м²" type="number" min="50" max="250" step="10" value={hfWatts} onChange={e => setHfWatts(e.target.value)} /></label>
        <button className="wide outline" onClick={() => {
          const a = Number(hfArea), w = Number(hfWatts);
          if (Number.isFinite(a) && Number.isFinite(w)) mutate(p => { upsertHeatedFloorZone(p, roomId, a, w); });
        }}>Добавить тёплый пол</button>
      </>}
      {totalWatts > 0 && <p className="small-note">Суммарная мощность тёплого пола по квартире: <strong>{(totalWatts / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} кВт</strong> ({layer.heatedFloors.length} зон).</p>}
    </div>
  </div>;
}
