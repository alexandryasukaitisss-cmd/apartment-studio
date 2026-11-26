import { useLayoutEffect, useRef, useState } from 'react';
import type { SceneContextTarget } from './Scene';
import { catalog, catalogGroups, type Preset } from './furnitureCatalog';
import { contextMenuPosition } from './contextMenu';

const surfaceLabels = { floor: 'Изменить пол', walls: 'Изменить стены комнаты', ceiling: 'Изменить потолок' };

export default function SceneContextMenu({ target, roomName, furnitureName, onSurface, onFurniture, onAdd, onClose }: {
  target: SceneContextTarget; roomName: string; furnitureName?: string;
  onSurface: () => void; onFurniture: () => void; onAdd: (preset: Preset) => boolean; onClose: (restoreFocus?: boolean) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [presetName, setPresetName] = useState('Стул');
  const [addFailed, setAddFailed] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const el = menu.current!;
    const positionMenu = () => {
      const bounds = el.getBoundingClientRect();
      setPosition(contextMenuPosition(target.clientX, target.clientY, bounds.width, bounds.height, window.innerWidth, window.innerHeight));
    };
    positionMenu();
    el.querySelector<HTMLButtonElement>('button')?.focus();
    const observer = new ResizeObserver(positionMenu);
    observer.observe(el);
    window.addEventListener('resize', positionMenu);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !el.contains(event.target)) onClose(false);
    };
    window.addEventListener('pointerdown', outside, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', positionMenu); window.removeEventListener('pointerdown', outside, true) };
  }, [target, onClose]);
  return <div ref={menu} className="scene-context-menu" data-scene-context-menu role="dialog" aria-label={`Действия в комнате: ${roomName}`} style={position} onKeyDown={event => {
    // Keep form keys and walk shortcuts out of the scene's window listener.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(true) }
    if (event.key === 'Tab') {
      const controls = [...menu.current!.querySelectorAll<HTMLElement>('button,select')];
      const first = controls[0], last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }}>
    <strong>{roomName}</strong>
    {target.surface && <button className="wide" onClick={onSurface}>{surfaceLabels[target.surface]}</button>}
    {target.furnitureId && <button className="wide" onClick={onFurniture}>Настроить предмет{furnitureName ? `: ${furnitureName}` : ''}</button>}
    <label className="context-catalog">Добавить предмет
      <select aria-label="Каталог для добавления в выбранном месте" value={presetName} onChange={event => { setPresetName(event.target.value); setAddFailed(false) }}>
        {catalogGroups.map(group => <optgroup key={group} label={group}>
          {catalog.filter(p => p.group === group).map(p => <option key={p.name}>{p.name}</option>)}
        </optgroup>)}
      </select>
    </label>
    <button className="wide primary" onClick={() => setAddFailed(!onAdd(catalog.find(p => p.name === presetName)!))}>Добавить предмет</button>
    {addFailed && <p className="context-error" role="alert">Предмет не добавлен. Выберите меньшую модель или проверьте высоту потолка.</p>}
    <button className="wide" onClick={() => onClose(true)}>Закрыть меню</button>
  </div>;
}
