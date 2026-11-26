import { useState } from 'react';
import { X } from 'lucide-react';
import { HUMAN_EYE_HEIGHT_M, type Project, type RenovationStage } from './model';
import Scene from './Scene';
import type { CameraPose } from './viewpoints';

export default function VariantCompare({
  project, roomId, stage, onClose,
}: {
  project: Project; roomId: string; stage: RenovationStage; onClose: () => void;
}) {
  const [leftId, setLeftId] = useState(project.activeVariantId);
  const [rightId, setRightId] = useState(() => project.variants.find(v => v.id !== project.activeVariantId)?.id ?? project.activeVariantId);
  const [compareMode, setCompareMode] = useState<'walk' | '3d'>('walk');
  const [compareRoom, setCompareRoom] = useState(roomId);
  const [split, setSplit] = useState(50);
  const [pose, setPose] = useState<CameraPose | null>(null);

  const leftVariant = project.variants.find(v => v.id === leftId) ?? project.variants[0];
  const rightVariant = project.variants.find(v => v.id === rightId) ?? project.variants[0];
  const noop = () => {};

  return <div className="dialog-backdrop" onClick={onClose}>
    <section className="dialog compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title" onClick={e => e.stopPropagation()}>
      <div className="dialog-header">
        <div>
          <h2 id="compare-title">Сравнение вариантов (шторка До / После)</h2>
          <p className="small-note">Вращайте камеру мышью или двигайте ползунок — оба варианта синхронизированы в одном ракурсе.</p>
        </div>
        <button className="icon-button" aria-label="Закрыть сравнение" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="compare-controls">
        <label className="field">
          <span>Слева</span>
          <select aria-label="Вариант слева" value={leftVariant.id} onChange={e => setLeftId(e.target.value)}>
            {project.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Справа</span>
          <select aria-label="Вариант справа" value={rightVariant.id} onChange={e => setRightId(e.target.value)}>
            {project.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Комната</span>
          <select aria-label="Комната для сравнения" value={compareRoom} onChange={e => setCompareRoom(e.target.value)}>
            {project.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="surface-tabs compact-tabs">
          <button className={compareMode === 'walk' ? 'active' : ''} onClick={() => setCompareMode('walk')}>Внутри</button>
          <button className={compareMode === '3d' ? 'active' : ''} onClick={() => setCompareMode('3d')}>Объём 3D</button>
        </div>
      </div>
      <div className="compare-viewport">
        <div className="compare-layer">
          <Scene project={project} variant={leftVariant} mode={compareMode} selectedRoom={compareRoom} selectedFurniture={null} onSelect={noop} onFurniture={noop} stage={stage} walkEyeHeight={HUMAN_EYE_HEIGHT_M} onCameraPose={setPose} />
        </div>
        <div className="compare-layer compare-right" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
          <Scene project={project} variant={rightVariant} mode={compareMode} selectedRoom={compareRoom} selectedFurniture={null} onSelect={noop} onFurniture={noop} stage={stage} walkEyeHeight={HUMAN_EYE_HEIGHT_M} externalCamera={pose} interactive={false} />
        </div>
        <div className="compare-divider" style={{ left: `${split}%` }}>
          <span>⇄</span>
        </div>
        <div className="compare-badge left">{leftVariant.name}</div>
        <div className="compare-badge right">{rightVariant.name}</div>
      </div>
      <label className="compare-slider-bar">
        <span>Положение шторки ({split}%)</span>
        <input aria-label="Положение шторки сравнения" type="range" min="5" max="95" value={split} onChange={e => setSplit(Number(e.target.value))} />
      </label>
    </section>
  </div>;
}
