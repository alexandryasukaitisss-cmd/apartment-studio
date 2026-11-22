import { useCallback, useEffect, useRef, useState } from 'react';
import { Home, BedDouble, Sofa, Bath, DoorOpen, Shirt, Grid2X2, Save, Undo2, Redo2, Copy, Download, Upload, PanelLeft, SlidersHorizontal, Mouse, Info, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Maximize2, CircleHelp, Ruler } from 'lucide-react';
import { type Project, type Surface, createProject, duplicateVariant, parseProject, area, moveFurniture, replaceFurniture, duplicateFurniture, boundFurniture, faceFurnitureInRoom, addFurnitureAt, moveElectricalPoint, duplicateElectricalPoint, removeElectricalPoint, moveEngineeringItem, removeEngineeringItem } from './model';
import { loadProject, saveProject } from './storage';
import Plan from './Plan';
import Scene, { type SceneContextTarget } from './Scene';
import SceneContextMenu from './SceneContextMenu';
import { validContextTarget } from './contextMenu';
import Inspector, { type InspectorTab } from './Inspector';
import Onboarding from './Onboarding';
import ObjectActions, { type ObjectActionHandlers } from './ObjectActions';
import { kindNames, type Preset } from './furnitureCatalog';
import { commitProjectEdit, undoProject, redoProject } from './projectEdits';
export default function App() {
  const [project, setProject] = useState<Project>(createProject);
  const [dragPreview, setDragPreview] = useState<Project | null>(null);
  const dragging = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'2d' | '3d' | 'walk'>('3d');
  const [roomId, setRoomId] = useState('living');
  // Finish picking changes the inspector room without requesting a walk-camera move.
  const [walkRoomId, setWalkRoomId] = useState('living');
  const [surfaceSelection, setSurfaceSelection] = useState<{ surface: Surface; wallIndex?: number; request: number }>();
  const [furnitureSelection, setFurnitureSelection] = useState(0);
  const [contextTarget, setContextTarget] = useState<SceneContextTarget | null>(null);
  const contextRef = useRef<SceneContextTarget | null>(null);
  const sceneRegion = useRef<HTMLElement>(null);
  const inspectorShell = useRef<HTMLDivElement>(null);
  const closeContextMenu = useCallback((restoreFocus = false) => {
    contextRef.current = null;
    setContextTarget(null);
    if (restoreFocus) sceneRegion.current?.focus();
  }, []);
  useEffect(() => { closeContextMenu() }, [project, mode, closeContextMenu]);
  const [quality, setQuality] = useState<'balanced' | 'high'>('balanced');
  const [furnitureId, setFurnitureId] = useState<string | null>(null);
  const [electricalId, setElectricalId] = useState<string | null>(null);
  const [electricalVisible, setElectricalVisible] = useState(false);
  const [engineeringId, setEngineeringId] = useState<string | null>(null);
  const [engineeringVisible, setEngineeringVisible] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const selectFurniture = (id: string | null) => { setElectricalId(null); setEngineeringId(null); setFurnitureId(id) };
  const selectElectrical = (id: string) => { setFurnitureId(null); setEngineeringId(null); setElectricalId(id); setMode('2d'); setElectricalVisible(true) };
  const selectEngineering = (id: string | null) => { setFurnitureId(null); setElectricalId(null); setEngineeringId(id); if (id) { setMode('2d'); setEngineeringVisible(true); } };
  const [status, setStatus] = useState('Загрузка…');
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [mobile, setMobile] = useState<'rooms' | 'settings' | null>(null);
  const [variantDialog, setVariantDialog] = useState(false);
  const [onboarding, setOnboarding] = useState(() => {
    try { return localStorage.getItem('apartment-studio-onboarding-1') !== 'done' } catch { return false }
  });
  const [inspectorTab, setInspectorTab] = useState<{ tab: InspectorTab; request: number }>();
  const closeOnboarding = useCallback(() => {
    setOnboarding(false);
    try { localStorage.setItem('apartment-studio-onboarding-1', 'done') } catch { /* storage can be unavailable */ }
  }, []);
  const [variantName, setVariantName] = useState('');
  const history = useRef<{ past: Project[]; future: Project[] }>({ past: [], future: [] });
  const [, setHistoryVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const saveCounter = useRef(0);
  const variant = project.variants.find(v => v.id === project.activeVariantId)!;
  const selected = variant.furniture.find(f => f.id === furnitureId);
  const selectedElectrical = variant.electrical.points.find(pt => pt.id === electricalId);
  const selectedEngineering = variant.engineering?.items.find(it => it.id === engineeringId);
  const notify = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    let active = true;
    void loadProject().then(saved => {
      if (active) {
        if (saved)
          setProject(saved);
        setStatus(saved ? 'Сохранено на устройстве' : 'Новый проект');
        setLoaded(true)
      }
    }).catch(() => {
      if (active) {
        setLoaded(true);
        setStatus('Хранилище недоступно');
        notify('Не удалось открыть локальное хранилище. Используйте экспорт проекта.', true)
      }
    });
    return () => {
      active = false
    }
  }, [notify]);
  useEffect(() => {
    if (!loaded)
      return;
    setStatus('Сохраняем…');
    const token = ++saveCounter.current;
    const timer = window.setTimeout(() => {
      void saveProject(project).then(() => {
        if (token === saveCounter.current)
          setStatus('Сохранено на устройстве')
      }).catch(() => {
        setStatus('Не сохранено');
        notify('Недостаточно места или хранилище недоступно. Экспортируйте проект.', true)
      })
    }, 600);
    return () => clearTimeout(timer)
  }, [project, loaded, notify]);
  const mutate = useCallback((fn: (p: Project) => void): boolean => {
    if (dragging.current)
      return false;
    const previous = projectRef.current;
    let next: Project;
    try {
      next = commitProjectEdit(previous, history.current, fn)
    } catch (e) {
      notify((e as Error).message || 'Изменение не помещается в комнату.', true);
      return false
    }
    if (next !== previous) {
      projectRef.current = next;
      setProject(next);
      setHistoryVersion(v => v + 1)
    }
    return true
  }, [notify]);
  const undo = useCallback(() => {
    if (dragging.current)
      return;
    const prev = undoProject(projectRef.current, history.current);
    setProject(prev);
    projectRef.current = prev;
    setHistoryVersion(v => v + 1)
  }, []);
  const redo = useCallback(() => {
    if (dragging.current)
      return;
    const next = redoProject(projectRef.current, history.current);
    setProject(next);
    projectRef.current = next;
    setHistoryVersion(v => v + 1)
  }, []);
  const removeSelected = useCallback(() => {
    if (electricalId) {
      if (mutate(p => removeElectricalPoint(p, electricalId))) setElectricalId(null);
      return;
    }
    if (engineeringId) {
      if (mutate(p => removeEngineeringItem(p, engineeringId))) setEngineeringId(null);
      return;
    }
    if (!furnitureId || !projectRef.current.variants.find(v => v.id === projectRef.current.activeVariantId)?.furniture.some(f => f.id === furnitureId))
      return;
    if (mutate(p => {
      const v = p.variants.find(v => v.id === p.activeVariantId)!;
      v.furniture = v.furniture.filter(f => f.id !== furnitureId)
    }))
      setFurnitureId(null)
  }, [furnitureId, electricalId, engineeringId, mutate]);
  const objectActions: ObjectActionHandlers = {
    onDelete: removeSelected,
    onDuplicate: () => {
      let newId: string | undefined;
      if (selected && mutate(p => { newId = duplicateFurniture(p, selected.id).id }) && newId) {
        setFurnitureId(newId);
        notify('Копия создана рядом и выбрана.')
      }
    },
    onRotate: (step = 90) => {
      if (selected)
        mutate(p => {
          const v = p.variants.find(v => v.id === p.activeVariantId)!;
          v.furniture = v.furniture.map(f => f.id === selected.id ? boundFurniture({ ...f, rotation: (f.rotation + step + 360) % 360 }, p) : f)
        })
    },
    onFaceRoom: () => { if (selected) mutate(p => { faceFurnitureInRoom(p, selected.id) }) },
    onReplace: (preset: Preset) => !!selected && mutate(p => { replaceFurniture(p, selected.id, preset) }),
    onPlan: () => { setMode('2d'); setMobile(null) }
  };
  const previewDrag = (id: string, x: number, z: number, electrical = false, snap = true, kind?: 'furniture' | 'electrical' | 'engineering') => {
    const preview = structuredClone(projectRef.current);
    try {
      if (kind === 'engineering') moveEngineeringItem(preview, id, x, z);
      else if (electrical || kind === 'electrical') moveElectricalPoint(preview, id, x, z);
      else moveFurniture(preview, id, x, z, { snap });
      setDragPreview(preview);
    } catch {
      // If the cursor passes over a room where the item cannot fit, keep the last valid preview.
    }
  };
  const finishDrag = (id: string, x: number, z: number, electrical = false, snap = true, kind?: 'furniture' | 'electrical' | 'engineering') => {
    dragging.current = false;
    setDragPreview(null);
    if (!mutate(p => {
      if (kind === 'engineering') moveEngineeringItem(p, id, x, z);
      else if (electrical || kind === 'electrical') moveElectricalPoint(p, id, x, z);
      else moveFurniture(p, id, x, z, { snap });
    })) return;
    if (electrical || kind === 'electrical' || kind === 'engineering') return;
    const moved = projectRef.current.variants.find(v => v.id === projectRef.current.activeVariantId)?.furniture.find(f => f.id === id);
    if (moved && moved.roomId !== roomId) {
      setRoomId(moved.roomId);
      setWalkRoomId(moved.roomId);
    }
  };
  const cancelDrag = useCallback(() => {
    dragging.current = false;
    setDragPreview(null)
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (contextRef.current) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeContextMenu(true);
        } else if (!(e.target instanceof Element && e.target.closest('[data-scene-context-menu]'))) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (e.target instanceof Element && (e.target.closest('input,select,textarea') || (e.target instanceof HTMLElement ? e.target.isContentEditable : e.target.closest('[contenteditable]:not([contenteditable="false"])'))))
        return;
      if (dragging.current && e.key !== 'Escape')
        return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selected || selectedElectrical || selectedEngineering)) {
        e.preventDefault();
        removeSelected()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey)
          redo();
        else
          undo()
      }
      if (e.key === 'Escape') {
        setMobile(null);
        setVariantDialog(false);
        setElectricalId(null);
        setEngineeringId(null);
        setMeasureMode(false);
        if (mode === 'walk')
          setMode('3d');
        else
          setFurnitureId(null)
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true)
  }, [undo, redo, mode, selected, selectedElectrical, selectedEngineering, removeSelected, closeContextMenu]);
  const select = (id: string) => {
    setRoomId(id);
    setWalkRoomId(id);
    if (variant.electrical.points.find(pt => pt.id === electricalId)?.roomId !== id) setElectricalId(null);
    if (variant.engineering?.items.find(it => it.id === engineeringId)?.roomId !== id) setEngineeringId(null);
    if (project.variants.find(v => v.id === project.activeVariantId)?.furniture.find(f => f.id === furnitureId)?.roomId !== id)
      setFurnitureId(null)
  };
  const selectSurface = (id: string, surface: Surface, wallIndex?: number) => {
    setRoomId(id);
    setFurnitureId(null);
    setElectricalId(null);
    setEngineeringId(null);
    setSurfaceSelection(previous => ({ surface, ...(wallIndex !== undefined ? { wallIndex } : {}), request: (previous?.request ?? 0) + 1 }));
    setMobile('settings');
  };
  const openContextMenu = (target: SceneContextTarget) => {
    if (!validContextTarget(projectRef.current, target)) return;
    window.dispatchEvent(new CustomEvent('apartment-walk', { detail: 'stop' }));
    contextRef.current = target;
    setContextTarget(target);
  };
  const focusInspector = () => requestAnimationFrame(() => inspectorShell.current?.focus());
  const configureContextFurniture = () => {
    if (!contextTarget || !validContextTarget(projectRef.current, contextTarget) || !contextTarget.furnitureId) return;
    setRoomId(contextTarget.roomId);
    selectFurniture(contextTarget.furnitureId);
    setFurnitureSelection(request => request + 1);
    setMobile('settings');
    closeContextMenu();
    focusInspector();
  };
  const addContextFurniture = (preset: Preset): boolean => {
    if (!contextTarget || !validContextTarget(projectRef.current, contextTarget)) {
      notify('Место добавления больше недоступно.', true);
      closeContextMenu();
      return false;
    }
    let newId = '';
    if (!mutate(p => { newId = addFurnitureAt(p, contextTarget.roomId, contextTarget.x, contextTarget.z, preset).id })) return false;
    setRoomId(contextTarget.roomId);
    selectFurniture(newId);
    setFurnitureSelection(request => request + 1);
    setMobile('settings');
    closeContextMenu();
    focusInspector();
    return true;
  };
  async function save() {
    try {
      await saveProject(projectRef.current);
      setStatus('Сохранено на устройстве');
      notify('Проект сохранён на этом устройстве.')
    } catch {
      notify('Не удалось сохранить. Используйте экспорт JSON.', true)
    }
  }
  function exportFile() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kvartira-project.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Резервная копия проекта экспортирована.')
  }
  async function importFile(file: File) {
    closeContextMenu();
    try {
      if (file.size > 25_000_000)
        throw Error('Файл слишком большой (до 25 МБ).');
      const next = parseProject(await file.text());
      mutate(p => Object.assign(p, next));
      setFurnitureId(null);
      setElectricalId(null);
      closeOnboarding();
      notify('Проект импортирован. Отмена возвращает предыдущий проект.')
    } catch (e) {
      notify((e as Error).message, true)
    }
  }
  return <div className="app">
    <header className="header">
      <div className="brand">
        <Home size={32} strokeWidth={1.8} />
        <h1>Квартира</h1>
        <div className="project-subtitle">{project.name} · демо</div>
      </div>
      <nav className="view-switch" aria-label="Режим просмотра">
        {([['2d', 'План 2D'], ['3d', 'Объём 3D'], ['walk', 'Прогулка']] as const).map(([m, n]) => <button key={m} className={mode === m ? 'active' : ''} aria-pressed={mode === m} onClick={() => {
          if (m === 'walk') setWalkRoomId(roomId);
          setMode(m);
          if (m !== '2d') setElectricalId(null);
          setMobile(null)
        }}>
          {n}
        </button>)}
      </nav>
      <div className="header-actions">
        <button className="icon-button help-button" aria-label="Как пользоваться" title="Как пользоваться" onClick={() => setOnboarding(true)}>
          <CircleHelp size={18} />
        </button>
        <select className="variant-select" aria-label="Вариант дизайна" value={project.activeVariantId} onChange={e => {
          if (mutate(p => { p.activeVariantId = e.target.value })) {
            setFurnitureId(null);
            setElectricalId(null);
          }
        }}>
          {project.variants.map(v => <option key={v.id} value={v.id}>
            {v.name}
          </option>)}
        </select>
        <button className="save-button primary" aria-label="Сохранить проект" onClick={() => void save()}>
          <Save size={16} />
          <span>Сохранить</span>
        </button>
      </div>
    </header>
    <div className="mobile-bar">
      <button onClick={() => setMobile(mobile === 'rooms' ? null : 'rooms')}>
        <PanelLeft size={17} />
        Помещения
      </button>
      <span>
        {project.rooms.find(r => r.id === roomId)!.name}
      </span>
      <button onClick={() => setMobile(mobile === 'settings' ? null : 'settings')}>
        <SlidersHorizontal size={17} />
        Настройки
      </button>
    </div>
    <main className="workspace">
      <aside className={`room-sidebar ${mobile === 'rooms' ? 'mobile-open' : ''}`}>
        <div className="sidebar-title">
          <h2>Помещения</h2>
          <button className="icon-button" aria-label="Открыть размеры" title="План и размеры" onClick={() => { setMode('2d'); setInspectorTab({ tab: 'sizes', request: Date.now() }); }}>
            <Maximize2 size={17} />
          </button>
        </div>
        <div className="rooms-list">
          {project.rooms.map(r => {
            const Icon = r.id === 'living' ? Sofa : r.id.startsWith('bath') ? Bath : r.id === 'closet' ? Shirt : r.id === 'balcony' ? Grid2X2 : r.id === 'entry' || r.id === 'corridor' ? DoorOpen : BedDouble;
            return <button key={r.id} className={r.id === roomId ? 'active' : ''} onClick={() => {
              select(r.id);
              setMobile(null)
            }}>
              <Icon size={22} strokeWidth={1.4} />
              <span>
                {r.name}
              </span>
              <small title={`По исходному плану: ${r.sourceArea} м²`}>
                ≈ {(area(r.polygon) * project.scale ** 2).toFixed(2).replace('.', ',')}
              </small>
            </button>
          })}
        </div>
        <div className="mini-plan-panel">
          <div className="mini-heading">
            <span>План квартиры 2D</span>
            <button className="icon-button" aria-label="Развернуть план 2D" onClick={() => setMode('2d')}>
              <Maximize2 size={15} />
            </button>
          </div>
          <Plan project={project} variant={variant} selectedRoom={roomId} selectedFurniture={furnitureId} onSelect={select} onFurniture={selectFurniture} mini />
        </div>
        <div className="project-tools">
          <button onClick={() => {
            setVariantName(variant.name);
            setVariantDialog(true)
          }}>
            <Copy size={15} />
            Варианты и название
          </button>
          <button onClick={exportFile}>
            <Download size={15} />
            Экспорт проекта
          </button>
          <button onClick={() => fileRef.current?.click()}>
            <Upload size={15} />
            Импорт проекта
          </button>
          <input ref={fileRef} hidden type="file" accept="application/json,.json" aria-label="Импорт проекта JSON" onChange={e => {
            const f = e.target.files?.[0];
            if (f)
              void importFile(f);
            e.target.value = ''
          }} />
        </div>
        <small className="save-status" role="status">
          <span className={status.includes('Не') ? 'status-dot error' : 'status-dot'} />
          {status}
        </small>
      </aside>
      <section ref={sceneRegion} tabIndex={-1} className="canvas-region" aria-label="Визуализатор квартиры">
        <div className="canvas-toolbar">
          <div className="undo-tools">
            <button className="icon-button" aria-label="Отменить" title="Отменить ⌘Z" disabled={!history.current.past.length} onClick={undo}>
              <Undo2 size={18} />
            </button>
            <button className="icon-button" aria-label="Повторить" title="Повторить ⇧⌘Z" disabled={!history.current.future.length} onClick={redo}>
              <Redo2 size={18} />
            </button>
          </div>
          {mode === '3d' && <button className="fit-view" onClick={() => window.dispatchEvent(new Event('apartment-fit'))}>
            <Maximize2 size={14} />
            Вписать
          </button>}
          {mode === 'walk' && <div className="ceiling-view-controls">
            <button aria-label="Осмотреть потолок" title="Посмотреть вверх без перемещения камеры" onClick={() => window.dispatchEvent(new CustomEvent('apartment-look', { detail: 'ceiling' }))}>↑ Потолок</button>
            <button aria-label="Смотреть прямо" title="Вернуть горизонтальный взгляд" onClick={() => window.dispatchEvent(new CustomEvent('apartment-look', { detail: 'forward' }))}>↔ Прямо</button>
          </div>}
          {mode !== '2d' && <label className="image-quality">Качество<select aria-label="Качество изображения" value={quality} onChange={e => setQuality(e.target.value as 'balanced' | 'high')}><option value="balanced">Сбалансированное</option><option value="high">Высокое</option></select></label>}
          {mode === '2d' && <div className="plan-layer-tools">
            <button className={`fit-view ${measureMode ? 'active-tool' : ''}`} aria-pressed={measureMode} title="Измерить расстояние между двумя точками на плане" onClick={() => setMeasureMode(v => !v)}>
              <Ruler size={14} />
              Линейка
            </button>
            <label className="electrical-layer-toggle"><input type="checkbox" checked={electricalVisible} onChange={e => { setElectricalVisible(e.target.checked); if (!e.target.checked) setElectricalId(null) }} />Электрика</label>
            <label className="electrical-layer-toggle"><input type="checkbox" checked={engineeringVisible} onChange={e => { setEngineeringVisible(e.target.checked); if (!e.target.checked) setEngineeringId(null) }} />Инженерия</label>
          </div>}
          <span className="approx-label">
            <Info size={13} />
            Размеры приблизительные
          </span>
        </div>
        {mode === '2d' ? <div className="plan-stage">
          <Plan project={dragPreview ?? project} variant={dragPreview?.variants.find(v => v.id === project.activeVariantId) ?? variant} selectedRoom={roomId} selectedFurniture={furnitureId} onSelect={select} onFurniture={selectFurniture} electricalVisible={electricalVisible} selectedElectrical={electricalId} onElectrical={selectElectrical} engineeringVisible={engineeringVisible} selectedEngineering={engineeringId} onEngineering={selectEngineering} measureMode={measureMode} onDragStart={() => { dragging.current = true }} onDrag={previewDrag} onDragEnd={finishDrag} onDragCancel={cancelDrag} />
        </div> : <Scene project={dragPreview ?? project} variant={dragPreview?.variants.find(v => v.id === project.activeVariantId) ?? variant} mode={mode} selectedRoom={mode === 'walk' ? walkRoomId : roomId} selectedFurniture={furnitureId} onSelect={select} onFurniture={selectFurniture} onSurface={selectSurface} onContext={openContextMenu} quality={quality} onDragStart={() => { dragging.current = true }} onDrag={previewDrag} onDragEnd={finishDrag} onDragCancel={cancelDrag} />}
        {contextTarget && validContextTarget(project, contextTarget) && <SceneContextMenu target={contextTarget} roomName={project.rooms.find(r => r.id === contextTarget.roomId)!.name} furnitureName={contextTarget.furnitureId ? kindNames[variant.furniture.find(f => f.id === contextTarget.furnitureId)!.kind] : undefined} onClose={closeContextMenu} onFurniture={configureContextFurniture} onAdd={addContextFurniture} onSurface={() => {
          if (contextTarget.surface) selectSurface(contextTarget.roomId, contextTarget.surface, contextTarget.wallIndex);
          closeContextMenu();
          focusInspector();
        }} />}
        {selected && mode !== 'walk' && <div className="selected-object-bar">
          <strong>{kindNames[selected.kind]} · выбран</strong>
          <ObjectActions key={selected.id} selected={selected} {...objectActions} />
        </div>}
        <div className="canvas-bottom">
          <div className="canvas-help">
            <Mouse size={18} />
            <span>
              {mode === 'walk' ? 'Нажмите на пол или стену, чтобы изменить отделку · потяните — взгляд · WASD / стрелки — шаг · Esc — выйти' : mode === '3d' ? 'Потяните — вращение · выберите предмет и потяните по полу — переместить · клик по стене — акцентная отделка' : measureMode ? 'Режим линейки: кликните или протяните между двумя точками · Esc — выйти' : 'Потяните предмет или точку — переместить · Option/Alt — без привязки · Delete — удалить · ⌘Z — отменить'}
            </span>
          </div>
          <div className="day-switch compact">
            <button className={variant.lighting.mode === 'day' ? 'active' : ''} onClick={() => mutate(p => {
              p.variants.find(v => v.id === p.activeVariantId)!.lighting.mode = 'day'
            })}>☼ День</button>
            <button className={variant.lighting.mode === 'evening' ? 'active' : ''} onClick={() => mutate(p => {
              p.variants.find(v => v.id === p.activeVariantId)!.lighting.mode = 'evening'
            })}>☾ Вечер</button>
            <button className={variant.lighting.mode === 'uniform' ? 'active' : ''} title="Ровный свет для сравнения отделки и мебели" onClick={() => mutate(p => {
              p.variants.find(v => v.id === p.activeVariantId)!.lighting.mode = 'uniform'
            })}>Всё освещено</button>
          </div>
        </div>
        {mode === 'walk' && <div className="walk-controls" aria-label="Управление прогулкой">
          {[[ArrowUp, 'w', 'Вперёд'], [ArrowLeft, 'a', 'Влево'], [ArrowDown, 's', 'Назад'], [ArrowRight, 'd', 'Вправо']].map(([Icon, key, label]) => {
            const I = Icon as typeof ArrowUp;
            return <button key={key as string} aria-label={label as string} onPointerDown={e => {
              if (contextRef.current) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              window.dispatchEvent(new CustomEvent('apartment-walk', { detail: key }))
            }} onPointerUp={() => window.dispatchEvent(new CustomEvent('apartment-walk', { detail: 'stop' }))} onPointerCancel={() => window.dispatchEvent(new CustomEvent('apartment-walk', { detail: 'stop' }))}>
              <I size={21} />
            </button>
          })}
        </div>}
        <div className="scene-caption">
          {`${project.name} · потолок ${project.ceilingHeight.toFixed(2).replace('.', ',')} м`}
        </div>
      </section>
      <div ref={inspectorShell} tabIndex={-1} className={`inspector-shell ${mobile === 'settings' ? 'mobile-open' : ''}`}>
        <Inspector tabRequest={inspectorTab} surfaceSelection={surfaceSelection} furnitureSelection={furnitureSelection} project={project} variant={variant} roomId={roomId} furnitureId={furnitureId} mutate={mutate} onSelectRoom={select} onSelectFurniture={selectFurniture} notify={notify} objectActions={objectActions} onOpenElectrical={() => { setMode('2d'); setElectricalVisible(true); setFurnitureId(null) }} electrical={{ project, variant, roomId, pointId: electricalId, visible: electricalVisible, mutate, onSelect: selectElectrical, onVisible: visible => { setElectricalVisible(visible); if (visible) setMode('2d'); else setElectricalId(null) }, onDelete: removeSelected, onDuplicate: () => {
          let newId = '';
          if (selectedElectrical && mutate(p => { newId = duplicateElectricalPoint(p, selectedElectrical.id).id })) selectElectrical(newId);
        }, engineering: { itemId: engineeringId, visible: engineeringVisible, onSelect: selectEngineering, onVisible: visible => { setEngineeringVisible(visible); if (visible) setMode('2d'); else setEngineeringId(null); } } }} />
      </div>
    </main>
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>
      <span>
        {notice.text}
      </span>
      <button aria-label="Закрыть сообщение" onClick={() => setNotice(null)}>×</button>
    </div>}
    {onboarding && <Onboarding onClose={closeOnboarding} onImport={file => void importFile(file)} onOpenSizes={() => {
      closeOnboarding();
      setMode('2d');
      setMobile('settings');
      setInspectorTab({ tab: 'sizes', request: Date.now() });
    }} />}
    {variantDialog && <div className="dialog-backdrop" onClick={() => setVariantDialog(false)}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="variant-title" onClick={e => e.stopPropagation()}>
        <h2 id="variant-title">Варианты дизайна</h2>
        <p>Каждый вариант сохраняет свою отделку, мебель, свет и электрику.</p>
        <label>
          Название текущего варианта
          <input autoFocus aria-label="Название варианта" value={variantName} maxLength={80} onChange={e => setVariantName(e.target.value)} />
        </label>
        <div className="dialog-actions">
          <button className="outline" onClick={() => setVariantDialog(false)}>Закрыть</button>
          <button className="outline" onClick={() => {
            mutate(p => {
              const v = p.variants.find(v => v.id === p.activeVariantId)!;
              const copied = duplicateVariant(v);
              p.variants.push(copied);
              p.activeVariantId = copied.id
            });
            setVariantDialog(false);
            setFurnitureId(null);
            setElectricalId(null);
            notify('Создан независимый вариант.')
          }} disabled={project.variants.length >= 20}>
            <Copy size={15} />
            Дублировать
          </button>
          <button className="primary" disabled={!variantName.trim()} onClick={() => {
            mutate(p => {
              p.variants.find(v => v.id === p.activeVariantId)!.name = variantName.trim()
            });
            setVariantDialog(false)
          }}>Переименовать</button>
        </div>
      </section>
    </div>}
  </div>
}
