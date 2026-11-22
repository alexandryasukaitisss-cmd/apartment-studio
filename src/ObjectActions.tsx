import { useState } from 'react';
import { Copy, RotateCw, Trash2, Replace, Map, Compass } from 'lucide-react';
import type { Furniture } from './model';
import { catalog, kindNames, type Preset } from './furnitureCatalog';

export interface ObjectActionHandlers {
  onDelete: () => void;
  onDuplicate: () => void;
  onRotate: (step?: number) => void;
  onFaceRoom: () => void;
  onReplace: (preset: Preset) => boolean;
  onPlan: () => void;
}

export default function ObjectActions({ selected, onDelete, onDuplicate, onRotate, onFaceRoom, onReplace, onPlan }: ObjectActionHandlers & { selected: Furniture }) {
  const [replacing, setReplacing] = useState(false);
  return <div className="object-actions" aria-label={`Действия: ${kindNames[selected.kind]}`}>
    <div className="object-action-buttons">
      <button onClick={onPlan} title="Переместить на плане 2D"><Map size={15} />На плане</button>
      <button onClick={onDuplicate} aria-label="Дублировать предмет"><Copy size={15} />Копия</button>
      <button onClick={e => onRotate(e.shiftKey ? 15 : 90)} aria-label="Повернуть предмет на 90°" title="Повернуть на 90° (с Shift — на 15°)"><RotateCw size={15} />90°</button>
      <button onClick={() => onRotate(15)} aria-label="Повернуть предмет на 15°" title="Повернуть на 15°"><RotateCw size={15} />15°</button>
      <button onClick={onFaceRoom}><Compass size={15} />Лицом в комнату</button>
      <button onClick={() => setReplacing(v => !v)} aria-expanded={replacing}><Replace size={15} />Заменить</button>
      <button className="danger" onClick={onDelete} aria-label="Удалить предмет"><Trash2 size={15} />Удалить</button>
    </div>
    {replacing && <label className="object-replace-label">Заменить выбранный предмет
      <select aria-label="Модель для замены" value="" onChange={e => {
        const preset = catalog.find(p => p.name === e.target.value);
        if (preset && onReplace(preset))
          setReplacing(false)
      }}>
        <option value="" disabled>Выберите модель…</option>
        {catalog.map(p => <option key={p.name}>{p.name}</option>)}
      </select>
    </label>}
  </div>
}
