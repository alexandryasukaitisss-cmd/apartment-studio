import { useEffect, useState } from 'react';
import { type Project, type Variant, type ElectricalType, type ElectricalPoint, electricalNames, electricalSymbols, MAX_ELECTRICAL_POINTS, MAX_ELECTRICAL_CONNECTIONS, addElectricalPoint, connectElectricalPoints } from './model';
import { pointRoomOffsets } from './roomMeasures';
import EngineeringControls, { type EngineeringControlsProps } from './EngineeringControls';

export interface ElectricalControlsProps {
  project: Project; variant: Variant; roomId: string; pointId: string | null; visible: boolean;
  mutate: (edit: (p: Project) => void) => boolean;
  onSelect: (id: string) => void; onVisible: (visible: boolean) => void;
  onDuplicate: () => void; onDelete: () => void;
  engineering?: Omit<EngineeringControlsProps, 'project' | 'variant' | 'roomId' | 'mutate'>;
}
export default function ElectricalControls({ project, variant, roomId, pointId, visible, mutate, onSelect, onVisible, onDuplicate, onDelete, engineering }: ElectricalControlsProps) {
  const [type, setType] = useState<ElectricalType>('socket');
  const [endpoint, setEndpoint] = useState('');
  const selected = variant.electrical.points.find(pt => pt.id === pointId);
  const selectedOffsets = selected ? pointRoomOffsets(project, selected.roomId, selected.x, selected.z) : null;
  const countsByType = (Object.keys(electricalNames) as ElectricalType[])
    .map(t => ({ sym: electricalSymbols[t], n: variant.electrical.points.filter(pt => pt.type === t).length }))
    .filter(x => x.n > 0);
  const [height, setHeight] = useState('');
  useEffect(() => setHeight(selected ? String(Math.round(selected.height * 10000) / 100) : ''), [selected?.id, selected?.height]);
  useEffect(() => setEndpoint(''), [pointId, variant.id]);
  const edit = (patch: Partial<ElectricalPoint>) => mutate(p => {
    const pt = p.variants.find(v => v.id === p.activeVariantId)!.electrical.points.find(pt => pt.id === pointId);
    if (pt) Object.assign(pt, patch);
  });
  const linked = new Set(variant.electrical.connections.flatMap(c => c.from === pointId ? [c.to] : c.to === pointId ? [c.from] : []));
  const endpoints = variant.electrical.points.filter(pt => pt.id !== pointId && !linked.has(pt.id));
  const name = (pt: ElectricalPoint) => `${pt.label || electricalNames[pt.type]} · ${project.rooms.find(r => r.id === pt.roomId)!.name}`;
  return <div className="electrical-controls">
    <label className="check-label"><input type="checkbox" checked={visible} onChange={e => onVisible(e.target.checked)} />Показать электрику на плане 2D</label>
    <p className="small-note">Условный эскиз точек. Трассы и подключение уточняются с электриком.{variant.electrical.points.length > 0 ? ` Всего по квартире: ${variant.electrical.points.length} (${countsByType.map(c => `${c.sym}: ${c.n}`).join(', ')}).` : ''}</p>
    <label className="catalog-label">Тип новой точки
      <select aria-label="Тип новой точки" value={type} onChange={e => setType(e.target.value as ElectricalType)}>
        {Object.entries(electricalNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <button className="wide primary" disabled={variant.electrical.points.length >= MAX_ELECTRICAL_POINTS} onClick={() => {
      let newId = '';
      if (mutate(p => { newId = addElectricalPoint(p, roomId, type).id })) {
        onVisible(true);
        onSelect(newId);
      }
    }}>Добавить точку в комнату</button>
    <p className="small-note">Потяните точку на плане. Буквы: Р — розетка, В — выключатель, С — светильник, И — интернет, Т — вывод для техники.</p>
    <div className="object-list">
      {variant.electrical.points.filter(pt => pt.roomId === roomId).map(pt => <button key={pt.id} className={pt.id === pointId ? 'active' : ''} onClick={() => { onVisible(true); onSelect(pt.id) }}>
        {electricalSymbols[pt.type]} · {pt.label || electricalNames[pt.type]}<span>{Math.round(pt.height * 100)} см</span>
      </button>)}
    </div>
    {selected && <div className="section-fields">
      <strong>{selected.label || electricalNames[selected.type]} · выбрана</strong>
      <div className="electrical-actions">
        <button className="outline" disabled={variant.electrical.points.length >= MAX_ELECTRICAL_POINTS} onClick={onDuplicate}>Копировать точку</button>
        <button className="outline" onClick={onDelete}>Удалить точку</button>
      </div>
      <label className="field"><span>Подпись точки</span><input aria-label="Подпись точки" value={selected.label ?? ''} maxLength={60} placeholder={electricalNames[selected.type]} onChange={e => edit({ label: e.target.value })} /></label>
      <label className="field"><span>Тип точки</span><select aria-label="Тип точки" value={selected.type} onChange={e => edit({ type: e.target.value as ElectricalType })}>
        {Object.entries(electricalNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="field"><span>Высота от пола</span><span className="number-wrap"><input aria-label="Высота точки от пола" type="number" min="0" max={project.ceilingHeight * 100} step="1" value={height} onChange={e => {
        setHeight(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n) && n >= 0 && n <= project.ceilingHeight * 100)
          edit({ height: n / 100 });
      }} onBlur={() => setHeight(String(Math.round(selected.height * 10000) / 100))} /><small>см</small></span></label>
      {selectedOffsets && <p className="small-note">Привязка от стен комнаты: слева {selectedOffsets.leftCm} см · справа {selectedOffsets.rightCm} см · сверху {selectedOffsets.topCm} см · снизу {selectedOffsets.bottomCm} см.</p>}
      <p className="small-note">Начальная высота — редактируемое допущение. При снижении потолка высоты точек ограничиваются новой высотой.</p>
      <label className="catalog-label">Условная связь с точкой
        <select aria-label="Конечная точка условной связи" value={endpoints.some(pt => pt.id === endpoint) ? endpoint : ''} onChange={e => setEndpoint(e.target.value)}>
          <option value="">Выбрать точку…</option>
          {endpoints.map(pt => <option key={pt.id} value={pt.id}>{name(pt)}</option>)}
        </select>
      </label>
      <button className="wide outline" disabled={!endpoints.some(pt => pt.id === endpoint) || variant.electrical.connections.length >= MAX_ELECTRICAL_CONNECTIONS} onClick={() => {
        if (mutate(p => connectElectricalPoints(p, selected.id, endpoint))) setEndpoint('');
      }}>Добавить условную связь</button>
      <div className="electrical-links">
        {variant.electrical.connections.filter(c => c.from === pointId || c.to === pointId).map(c => <div key={c.id}>
          <span>Условная связь · {name(variant.electrical.points.find(pt => pt.id === (c.from === pointId ? c.to : c.from))!)}</span>
          <button className="outline" aria-label={`Удалить условную связь с ${name(variant.electrical.points.find(pt => pt.id === (c.from === pointId ? c.to : c.from))!)}`} onClick={() => mutate(p => {
            const layer = p.variants.find(v => v.id === p.activeVariantId)!.electrical;
            layer.connections = layer.connections.filter(link => link.id !== c.id);
          })}>Удалить связь</button>
        </div>)}
      </div>
    </div>}
    {engineering && <EngineeringControls project={project} variant={variant} roomId={roomId} mutate={mutate} {...engineering} />}
  </div>
}
