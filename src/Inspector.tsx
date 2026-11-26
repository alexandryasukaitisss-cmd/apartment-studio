import { useEffect, useRef, useState } from 'react';
import NumberField from './NumberField';
import { Upload, Plus, ExternalLink, FileCode, Box, Sparkles } from 'lucide-react';
import { type Project, type Variant, type Surface, type Furniture, type Kind, type Material, type MaterialQuote, type WorkRates, type RenovationStage, type RoadmapStatus, id, makeFurniture, center, boundFurniture, area, roomSize, resizeRoom, setCeilingHeight, setupOffice, doorwayObstructions, minimumFurnitureHeight, addElectricalPoint, MAX_ELECTRICAL_POINTS, furnitureOverlaps, moveFurnitureToRoom, passageWarnings, wallMaterialId, wallOverrideKey } from './model';
import { materialImage } from './textures';
import { lampBudget } from './sceneLighting';
import { importPhoto } from './storage';
import { catalog, kindNames } from './furnitureCatalog';
import ObjectActions, { type ObjectActionHandlers } from './ObjectActions';
import ElectricalControls, { type ElectricalControlsProps } from './ElectricalControls';
import EstimatePanel, { QuoteFields } from './EstimatePanel';
import OpeningsEditor from './OpeningsEditor';
import { parseOfflineProduct, type ImportedProduct } from './offlineProductImport';
import { roomWalls, wallTitle } from './openings';
import { defaultPresetForRoom, doorSwingConflicts, furnitureCoordsFromRoomOffset, furnitureRoomClearances, materialSurfaces, measurementChecklistItems, roomAccusative, smartMaterialSurface } from './roomMeasures';
import { applyStylePreset, stylePresets } from './stylePresets';
import { saveCustomModel } from './customModels';
import AuditPanel from './AuditPanel';
import AgentPanel from './AgentPanel';
export { catalog, kindNames } from './furnitureCatalog';
export type InspectorTab = 'finish' | 'furniture' | 'light' | 'sizes' | 'electrical' | 'estimate' | 'audit' | 'agent';
const surfaceDisplayNames: Record<Surface, string> = { floor: 'Пол', walls: 'Стены комнаты', ceiling: 'Потолок' };

export default function Inspector({ project, variant, roomId, furnitureId, mutate, onSelectRoom, onSelectFurniture, notify, objectActions, electrical, onOpenElectrical, surfaceSelection, furnitureSelection, tabRequest, onPreviewStage, auditOverlayVisible, onToggleAuditOverlay, deliveryHighlightId, onSelectDeliveryItem, onSwitchMode, onToggleOverlay, onOpenElevation, onOpenCompare }: { tabRequest?: { tab: InspectorTab; request: number }; furnitureSelection?: number; surfaceSelection?: { surface: Surface; wallIndex?: number; request: number }; electrical: ElectricalControlsProps; onOpenElectrical: () => void; project: Project; variant: Variant; roomId: string; furnitureId: string | null; mutate: (f: (p: Project) => void) => boolean; objectActions: ObjectActionHandlers; onSelectRoom?: (id: string) => void; onSelectFurniture: (id: string | null) => void; notify: (s: string, error?: boolean) => void; onPreviewStage?: (stage: RenovationStage) => void; auditOverlayVisible?: boolean; onToggleAuditOverlay?: (v: boolean) => void; deliveryHighlightId?: string | null; onSelectDeliveryItem?: (id: string | null) => void; onSwitchMode?: (mode: '2d' | '3d' | 'walk' | 'split') => void; onToggleOverlay?: (overlay: 'audit' | 'lifeZones' | 'electrical' | 'engineering', visible: boolean) => void; onOpenElevation?: (roomId?: string) => void; onOpenCompare?: () => void }) {
  const [tab, setTab] = useState<InspectorTab>('finish');
  useEffect(() => { if (tabRequest) setTab(tabRequest.tab) }, [tabRequest]);
  const [surface, setSurface] = useState<Surface>('floor');
  const [accentWallIndex, setAccentWallIndex] = useState<number | null>(null);
  const [preset, setPreset] = useState(() => defaultPresetForRoom(roomId));
  const upload = useRef<HTMLInputElement>(null);
  const glbUpload = useRef<HTMLInputElement>(null);
  const room = project.rooms.find(r => r.id === roomId)!;
  const wallsOfRoom = roomWalls(project, roomId);
  const effectiveAccentWall = surface === 'walls' && accentWallIndex !== null && wallsOfRoom.some(w => w.index === accentWallIndex) ? accentWallIndex : null;
  const currentMaterialId = effectiveAccentWall !== null
    ? wallMaterialId(variant, effectiveAccentWall, roomId)
    : variant.finishes[roomId][surface];
  const material = project.materials.find(m => m.id === currentMaterialId) ?? project.materials.find(m => m.id === variant.finishes[roomId][surface])!;
  const hasWallOverride = effectiveAccentWall !== null && Boolean(variant.wallOverrides?.[wallOverrideKey(effectiveAccentWall, roomId)]);
  const doorBlocks = doorwayObstructions(project, variant.furniture).filter(b => b.roomId === roomId);
  const swingBlocks = doorSwingConflicts(project, variant.furniture).filter(c => c.roomId === roomId);
  const conflicts = furnitureOverlaps(project, variant.furniture).filter(o => o.a.roomId === roomId || o.b.roomId === roomId);
  const passages = passageWarnings(project, variant.furniture).filter(w => w.roomId === roomId);
  const lamps = lampBudget(project, variant);
  const roomLampCount = variant.electrical.points.filter(point => point.roomId === roomId && point.type === 'light').length;
  const selected = variant.furniture.find(f => f.id === furnitureId);
  const selectedClearances = selected ? furnitureRoomClearances(project, selected) : null;
  useEffect(() => {
    setPreset(defaultPresetForRoom(roomId));
    setAccentWallIndex(null);
  }, [roomId]);
  useEffect(() => {
    if (furnitureId)
      setTab('furniture')
  }, [furnitureId, furnitureSelection]);
  useEffect(() => {
    if (surfaceSelection) {
      setSurface(surfaceSelection.surface);
      setAccentWallIndex(surfaceSelection.surface === 'walls' ? (surfaceSelection.wallIndex ?? null) : null);
      setTab('finish');
    }
  }, [surfaceSelection]);
  useEffect(() => { if (electrical.pointId) setTab('electrical') }, [electrical.pointId]);
  const active = (p: Project) => p.variants.find(v => v.id === p.activeVariantId)!;
  const assignMaterialToTarget = (p: Project, matId: string, targetSurface: Surface, wallIdx: number | null) => {
    const v = active(p);
    if (targetSurface === 'walls' && wallIdx !== null) {
      v.wallOverrides ??= {};
      v.wallOverrides[wallOverrideKey(wallIdx, roomId)] = matId;
    } else {
      v.finishes[roomId][targetSurface] = matId;
    }
  };
  const pruneUnusedMaterials = (p: Project) => {
    const used = new Set([
      ...p.variants.flatMap(v => Object.values(v.finishes).flatMap(s => Object.values(s))),
      ...p.variants.flatMap(v => Object.values(v.wallOverrides ?? {})),
    ]);
    p.materials = p.materials.filter(m => used.has(m.id) || !m.id.includes('-') || m.image);
  };
  const updateMaterial = (patch: Partial<Material>, explicitSurface?: Surface) => mutate(p => {
    const targetSurface = explicitSurface ?? surface;
    const wallIdx = explicitSurface ? null : effectiveAccentWall;
    const oldId = wallIdx !== null ? wallMaterialId(active(p), wallIdx, roomId) : active(p).finishes[roomId][targetSurface];
    const old = p.materials.find(m => m.id === oldId)!;
    const newId = id();
    p.materials.push({ ...old, ...patch, id: newId });
    assignMaterialToTarget(p, newId, targetSurface, wallIdx);
    pruneUnusedMaterials(p);
  });
  const edit = (patch: Partial<Furniture>) => mutate(p => {
    const v = active(p);
    v.furniture = v.furniture.map(f => f.id === furnitureId ? boundFurniture({ ...f, ...patch }, p) : f)
  });
  async function photo(file: File) {
    try {
      const image = await importPhoto(file);
      const added = mutate(p => {
        const m: Material = { id: id(), name: file.name.slice(0, 60), pattern: 'image', color: '#ffffff', image, width: 1, height: 1, rotation: 0, roughness: .75 };
        p.materials.push(m);
        assignMaterialToTarget(p, m.id, surface, effectiveAccentWall);
      });
      if (added) notify('Фото добавлено локально. Укажите реальный размер образца.')
    } catch (e) {
      notify((e as Error).message, true)
    }
  }
  const catalogMaterials = project.materials.filter(m => ['oak', 'ivory', 'sand', 'green', 'concrete', 'smoked', 'plaster', 'white', 'laminate', 'vinyl', 'parquet', 'porcelain', 'paint', 'wallpaper'].includes(m.id) || m.image);
  const recommendedMaterials = catalogMaterials.filter(m => materialSurfaces(m).includes(surface));
  const otherMaterials = catalogMaterials.filter(m => !materialSurfaces(m).includes(surface));
  const applyCatalogMaterial = (m: Material) => {
    const targetSurface = smartMaterialSurface(m, surface);
    const targetWall = targetSurface === 'walls' ? effectiveAccentWall : null;
    if (mutate(p => assignMaterialToTarget(p, m.id, targetSurface, targetWall))) {
      if (targetSurface !== surface) {
        setSurface(targetSurface);
        setAccentWallIndex(null);
        notify(`Переключено на «${surfaceDisplayNames[targetSurface]}» и применено: ${m.name}`);
      }
    }
  };
  const roomNote = project.roomNotes?.[roomId] ?? { notes: '', checks: {} };
  const updateRoomNote = (patch: { notes?: string; checkKey?: string; checked?: boolean }) => mutate(p => {
    p.roomNotes ??= {};
    const cur = p.roomNotes[roomId] ?? { notes: '', checks: {} };
    p.roomNotes[roomId] = {
      notes: patch.notes !== undefined ? patch.notes : cur.notes,
      checks: patch.checkKey ? { ...cur.checks, [patch.checkKey]: Boolean(patch.checked) } : cur.checks,
    };
  });
  const updateWorkRates = (rates: WorkRates) => mutate(p => {
    active(p).workRates = rates;
  });
  const updateRoadmapStatus = (stepId: string, status: RoadmapStatus) => mutate(p => {
    const v = active(p);
    v.roadmap ??= {};
    v.roadmap[stepId] = status;
  });
  async function uploadGlb(file: File) {
    try {
      const saved = await saveCustomModel(file);
      const [x, z] = center(room);
      const f = boundFurniture({ ...makeFurniture('custom_glb', roomId, x, z), label: saved.name, modelAssetId: saved.assetId }, project);
      if (mutate(p => active(p).furniture.push(f))) {
        onSelectFurniture(f.id);
        notify(`3D-модель «${saved.name}» добавлена. Настройте ширину, глубину и высоту справа.`);
      }
    } catch (e) {
      notify((e as Error).message, true);
    }
  }

  return <aside className="inspector">
    <h2>
      {tab === 'finish' ? 'Отделка' : tab === 'furniture' ? 'Мебель и техника' : tab === 'light' ? 'Освещение' : tab === 'electrical' ? 'Электрика и инженерия' : tab === 'estimate' ? 'Расход и смета' : tab === 'audit' ? 'Аудит планировки' : tab === 'agent' ? 'AI-помощник (A2UI)' : 'Размеры квартиры'}
    </h2>
    <p className="room-caption">
      {room.name}
      <span>
        ≈ {(area(room.polygon) * project.scale ** 2).toFixed(2).replace('.', ',')} м²
      </span>
    </p>
    <div className="inspector-tabs" role="tablist" aria-label="Настройки">
      <button className={tab === 'finish' ? 'active' : ''} onClick={() => setTab('finish')}>Отделка</button>
      <button className={tab === 'furniture' ? 'active' : ''} onClick={() => setTab('furniture')}>Мебель</button>
      <button className={tab === 'light' ? 'active' : ''} onClick={() => setTab('light')}>Свет</button>
      <button className={tab === 'sizes' ? 'active' : ''} onClick={() => setTab('sizes')}>Размеры</button>
      <button className={tab === 'electrical' ? 'active' : ''} onClick={() => { setTab('electrical'); onOpenElectrical() }}>Электрика</button>
      <button className={tab === 'estimate' ? 'active' : ''} onClick={() => setTab('estimate')}>Смета</button>
      <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>Аудит</button>
      <button className={tab === 'agent' ? 'active' : ''} onClick={() => setTab('agent')}>AI</button>
    </div>
    {tab === 'agent' && <AgentPanel project={project} variant={variant} roomId={roomId} actionHandlers={{ mutate, notify, onSelectRoom, onSelectFurniture, onPreviewStage, onSwitchMode, onToggleOverlay, onOpenElevation, onOpenCompare }} />}
    {tab === 'audit' && <AuditPanel project={project} variant={variant} roomId={roomId} mutate={mutate} notify={notify} onSelectRoom={onSelectRoom} onSelectFurniture={onSelectFurniture} auditOverlayVisible={auditOverlayVisible} onToggleAuditOverlay={onToggleAuditOverlay} deliveryHighlightId={deliveryHighlightId} onSelectDeliveryItem={onSelectDeliveryItem} onOpenEngineering={() => { setTab('electrical'); electrical.engineering?.onVisible(true); }} />}
    {tab === 'estimate' && <EstimatePanel project={project} variant={variant} roomId={roomId} surface={surface} onSurface={setSurface} onQuote={quote => updateMaterial({ quote: { ...quote, observedAt: undefined } }, surface)} onWorkRates={updateWorkRates} onRoadmapStatus={updateRoadmapStatus} onPreviewStage={onPreviewStage} onNotify={msg => notify(msg)} />}
    {tab === 'electrical' && <ElectricalControls {...electrical} />}
    {tab === 'finish' && <>
      <div className="surface-tabs">
        {([['floor', 'Пол'], ['walls', 'Стены комнаты'], ['ceiling', 'Потолок']] as [Surface, string][]).map(([s, n]) => <button key={s} className={surface === s ? 'active' : ''} onClick={() => { setSurface(s); if (s !== 'walls') setAccentWallIndex(null); }}>
          {n}
        </button>)}
      </div>
      {surface === 'walls' && wallsOfRoom.length > 0 && <div className="accent-wall-picker">
        <label className="field">
          <span>Область стен</span>
          <select aria-label="Выбор стены для отделки" value={effectiveAccentWall === null ? '' : String(effectiveAccentWall)} onChange={e => setAccentWallIndex(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">Все стены комнаты</option>
            {wallsOfRoom.map(w => <option key={w.index} value={w.index}>{`Акцент: ${wallTitle(project, w)}`}</option>)}
          </select>
        </label>
        {hasWallOverride && effectiveAccentWall !== null && <button className="wide outline" onClick={() => {
          mutate(p => {
            const v = active(p);
            if (v.wallOverrides) {
              delete v.wallOverrides[wallOverrideKey(effectiveAccentWall, roomId)];
              if (!Object.keys(v.wallOverrides).length) delete v.wallOverrides;
            }
            pruneUnusedMaterials(p);
          });
          notify('Акцентная стена сброшена к общей отделке комнаты.');
        }}>Вернуть общую отделку стен</button>}
      </div>}
      <h3 className="finish-group-title">Свой цвет и фактура</h3>
      <div className="current-material">
        <img src={materialImage(material)} alt="Текущая отделка" />
        <div><strong>{material.name}</strong><span>{effectiveAccentWall !== null ? 'Выбранная акцентная стена' : surface === 'walls' ? 'Все стены выбранной комнаты' : surface === 'floor' ? 'Пол выбранной комнаты' : 'Потолок выбранной комнаты'}</span></div>
      </div>
      <button className="wide outline" onClick={() => upload.current?.click()}>
        <Upload size={17} />
        Загрузить фото фактуры
      </button>
      <input ref={upload} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Загрузить фото материала" onChange={e => {
        const f = e.target.files?.[0];
        if (f)
          void photo(f);
        e.target.value = ''
      }} />
      <div className="section-fields">
        <label className="field">
          <span>Цвет или фактура</span>
          <select aria-label="Цвет или фактура" value={material.pattern} onChange={e => updateMaterial({ pattern: e.target.value as Material['pattern'], ...(e.target.value === 'image' ? {} : { image: undefined }) })}>
            <option value="plain">Только цвет</option>
            <option value="wood">Дерево</option><option value="stone">Камень</option><option value="tile">Плитка</option>
            {material.image && <option value="image">Фото фактуры</option>}
          </select>
        </label>
        <NumberField label="Ширина образца" value={material.width * 100} min={5} max={1000} onChange={v => updateMaterial({ width: v / 100 })} />
        <NumberField label="Длина образца" value={material.height * 100} min={5} max={1000} onChange={v => updateMaterial({ height: v / 100 })} />
        <NumberField label="Поворот текстуры" value={material.rotation} min={0} max={360} unit="°" onChange={v => updateMaterial({ rotation: v })} />
        <label className="field">
          <span>Цвет основы</span>
          <input aria-label="Цвет основы" type="color" value={material.color} onChange={e => updateMaterial({ color: e.target.value })} />
        </label>
        <label className="field">
          <span>Блеск → матовость</span>
          <input aria-label="Блеск и матовость поверхности" type="range" min="0" max="1" step=".05" value={material.roughness} onChange={e => updateMaterial({ roughness: +e.target.value })} />
        </label>
        {surface !== 'ceiling' && <label className="field">
          <span>Формат плитки</span>
          <select aria-label="Формат плитки" value="" onChange={e => {
            const [w, h] = e.target.value.split('x').map(Number);
            updateMaterial({ width: w / 100, height: h / 100, pattern: 'tile', image: undefined })
          }}>
            <option value="" disabled>Выбрать…</option>
            {['60x60', '60x120', '30x60', '20x120'].map(v => <option key={v} value={v}>
              {`${v.replace('x', ' × ')} см`}
            </option>)}
          </select>
        </label>}
      </div>
      <p className="small-note">Размер образца задаёт повторение в сантиметрах. Цвет основы окрашивает фактуру; для своего цвета выберите «Только цвет». Ползунок: слева блестящая, справа матовая поверхность. Фото и свет — визуальное приближение.</p>
      <h3 className="finish-group-title">Материалы каталога · {surface === 'floor' ? 'для пола' : surface === 'walls' ? 'для стен' : 'для потолка'}</h3>
      <div className="swatches">
        {recommendedMaterials.map(m => <button key={m.id} className={material.id === m.id ? 'selected' : ''} onClick={() => applyCatalogMaterial(m)}>
          <img src={materialImage(m)} alt="" />
          <span>{m.name}</span>
        </button>)}
      </div>
      {otherMaterials.length > 0 && <details className="other-materials">
        <summary>Другие поверхности (переключат вкладку)</summary>
        <div className="swatches">
          {otherMaterials.map(m => <button key={m.id} className={material.id === m.id ? 'selected' : ''} onClick={() => applyCatalogMaterial(m)}>
            <img src={materialImage(m)} alt="" />
            <span>{m.name}</span>
          </button>)}
        </div>
      </details>}
      <details className="style-presets-block">
        <summary><Sparkles size={14} /> Готовые стили всей квартиры (1 клик)</summary>
        <p className="small-note">Применяет согласованную палитру полов, стен, дверей и плинтуса ко всем комнатам сразу. Отменяется одним ⌘Z.</p>
        <div className="style-preset-list">
          {stylePresets.map(sp => <button key={sp.id} className="style-preset-card" onClick={() => {
            if (mutate(p => { applyStylePreset(p, sp.id); })) {
              setAccentWallIndex(null);
              notify(`Стиль «${sp.name}» применён ко всей квартире (⌘Z — вернуть прежний).`);
            }
          }}>
            <div className="style-dots">{sp.swatches.map((hex, idx) => <span key={idx} style={{ background: hex }} />)}</div>
            <div>
              <strong>{sp.name}</strong>
              <small>{sp.subtitle}</small>
            </div>
          </button>)}
        </div>
      </details>
      <details className="doors-skirting-block">
        <summary>Двери и плинтус в 3D</summary>
        <div className="section-fields">
          <label className="field">
            <span>Стиль дверей</span>
            <select aria-label="Стиль дверей" value={variant.doorStyle ?? 'framed'} onChange={e => mutate(p => { active(p).doorStyle = e.target.value as 'framed' | 'hidden'; })}>
              <option value="framed">С наличниками</option>
              <option value="hidden">Скрытого монтажа</option>
            </select>
          </label>
          <label className="field">
            <span>Цвет дверей</span>
            <input aria-label="Цвет дверей" type="color" value={variant.doorColor ?? '#dfd8cc'} onChange={e => mutate(p => { active(p).doorColor = e.target.value; })} />
          </label>
          <label className="field">
            <span>Цвет плинтуса</span>
            <input aria-label="Цвет плинтуса" type="color" value={variant.skirtingColor ?? '#ede9e0'} onChange={e => mutate(p => { active(p).skirtingColor = e.target.value; })} />
          </label>
          <NumberField label="Высота плинтуса" value={(variant.skirtingHeight ?? .08) * 100} min={3} max={22} onChange={v => mutate(p => { active(p).skirtingHeight = v / 100; })} />
        </div>
      </details>

    </>}
    {tab === 'furniture' && <>
      {roomId === 'bed3' && <>
        <button className="wide outline" onClick={() => {
          let deskId: string | null = null;
          if (mutate(p => { deskId = setupOffice(p).find(f => f.kind === 'workstation')!.id })) {
            onSelectFurniture(deskId);
            notify('Кабинет расставлен. Одно нажатие отмены вернёт прежнюю мебель.');
          }
        }}>Расставить кабинет</button>
        <p className="small-note">Стол с компьютером и монитором, книги и спортивная зона. Заменяет мебель кабинета только в текущем варианте. Вся расстановка отменяется одним действием. Это приблизительная статичная компоновка.</p>
      </>}
      <label className="catalog-label">
        {`Добавить ${roomAccusative(roomId, room.name)}`}
        <select aria-label="Каталог мебели" value={preset} onChange={e => setPreset(e.target.value)}>
          {catalog.map(p => <option key={p.name}>
            {p.name}
          </option>)}
        </select>
      </label>
      <button className="wide primary" onClick={() => {
        const pre = catalog.find(p => p.name === preset)!;
        const [x, z] = center(room);
        const f = boundFurniture({ ...makeFurniture(pre.kind, roomId, x, z), width: pre.dims[0], depth: pre.dims[1], height: pre.dims[2], ...(pre.elevation === undefined ? {} : { elevation: pre.elevation }) }, project);
        if (mutate(p => active(p).furniture.push(f)))
          onSelectFurniture(f.id)
      }}>
        <Plus size={16} />
        Добавить предмет
      </button>
      <button className="wide outline" onClick={() => glbUpload.current?.click()}>
        <Box size={16} />
        Загрузить свою 3D-модель (.glb / .gltf)
      </button>
      <input ref={glbUpload} hidden type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" aria-label="Загрузить 3D-модель GLB" onChange={e => {
        const file = e.target.files?.[0];
        if (file) void uploadGlb(file);
        e.target.value = '';
      }} />
      <div className="object-list">
        {variant.furniture.filter(f => f.roomId === roomId).map(f => <button key={f.id} className={f.id === furnitureId ? 'active' : ''} onClick={() => onSelectFurniture(f.id)}>
          {f.label || kindNames[f.kind]}
          <span>
            {`${Math.round(f.width * 100)} × ${Math.round(f.depth * 100)} см`}
          </span>
        </button>)}
      </div>
      {selected && <div className="section-fields">
        <strong>
          {selected.label ? `${kindNames[selected.kind]} · ${selected.label}` : `${kindNames[selected.kind]} · выбран`}
        </strong>
        <ObjectActions selected={selected} {...objectActions} />
        <label className="field">
          <span>Помещение</span>
          <select aria-label="Помещение предмета" value={selected.roomId} onChange={e => {
            const targetRoomId = e.target.value;
            if (mutate(p => { moveFurnitureToRoom(p, selected.id, targetRoomId) })) {
              onSelectRoom?.(targetRoomId);
              onSelectFurniture(selected.id);
              notify(`Предмет перенесён в «${project.rooms.find(r => r.id === targetRoomId)?.name ?? targetRoomId}».`);
            }
          }}>
            {project.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Модель / заметка</span>
          <input aria-label="Модель предмета" value={selected.label ?? ''} maxLength={120} placeholder="Напр. IKEA / Атланта" onChange={e => edit({ label: e.target.value || undefined })} />
        </label>
        <div className="furniture-price-row">
          <NumberField label="Цена предмета" value={selected.price ?? 0} min={0} max={10000000} unit={selected.currency ?? 'BYN'} onChange={v => edit({ price: v > 0 ? v : undefined, currency: v > 0 ? (selected.currency ?? 'BYN') : selected.currency })} />
          <label className="field">
            <span>Валюта</span>
            <select aria-label="Валюта предмета" value={selected.currency ?? 'BYN'} onChange={e => edit({ currency: e.target.value })}>
              {['BYN', 'USD', 'EUR', 'RUB'].map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        {selected.sourceUrl && <a className="source-link" href={selected.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Карточка товара</a>}
        {selectedClearances && <>
          <p className="small-note">Зазоры до стен комнаты: слева {selectedClearances.leftCm} см · справа {selectedClearances.rightCm} см · сверху {selectedClearances.topCm} см · снизу {selectedClearances.bottomCm} см.</p>
          <NumberField label="Отступ слева" value={selectedClearances.leftCm} min={0} max={selectedClearances.roomWidthCm} onChange={v => edit(furnitureCoordsFromRoomOffset(project, selected, { leftCm: v }))} />
          <NumberField label="Отступ сверху" value={selectedClearances.topCm} min={0} max={selectedClearances.roomDepthCm} onChange={v => edit(furnitureCoordsFromRoomOffset(project, selected, { topCm: v }))} />
        </>}
        <NumberField label="Ширина предмета" value={selected.width * 100} min={20} max={350} onChange={v => edit({ width: v / 100 })} />
        <NumberField label="Глубина предмета" value={selected.depth * 100} min={1} max={350} onChange={v => edit({ depth: v / 100 })} />
        <NumberField label="Высота предмета" value={selected.height * 100} min={minimumFurnitureHeight(selected.kind) * 100} max={300} onChange={v => edit({ height: v / 100 })} />
        <NumberField label="Высота от пола" value={(selected.elevation ?? 0) * 100} min={0} max={400} onChange={v => edit({ elevation: v / 100 })} />
        <NumberField label="Поворот предмета" value={selected.rotation} min={0} max={360} unit="°" onChange={v => edit({ rotation: v })} />
        <label className="field">
          <span>Цвет мебели</span>
          <input aria-label="Цвет мебели" type="color" value={selected.color} onChange={e => edit({ color: e.target.value })} />
        </label>

      </div>}
      {(conflicts.length > 0 || doorBlocks.length > 0 || swingBlocks.length > 0 || passages.length > 0) && <div className="collision-alerts">
        {conflicts.length > 0 && <p className="small-note">Предметы пересекаются: {[...new Set(conflicts.flatMap(o => [o.a, o.b]).map(f => kindNames[f.kind]))].join(', ')}. На плане и в 3D они выделены красным.</p>}
        {doorBlocks.length > 0 && <p className="small-note">У дверных проёмов пересекаются габариты: {[...new Set(doorBlocks.map(b => kindNames[b.kind]))].join(', ')}.</p>}
        {swingBlocks.length > 0 && <p className="small-note">Дуга открывания двери задевает: {[...new Set(swingBlocks.map(c => c.furnitureId ? kindNames[variant.furniture.find(f => f.id === c.furnitureId)?.kind ?? 'chair'] : 'соседнюю дверь'))].join(', ')}. Можно сменить сторону открывания во вкладке «Размеры».</p>}
        {passages.length > 0 && <p className="small-note">Узкий проход (&lt; 50 см): {passages.map(w => `${kindNames[w.a.kind]} ↔ ${kindNames[w.b.kind]} (${Math.round(w.clearanceM * 100)} см)`).join(', ')}.</p>}
      </div>}
      <p className="small-note">Размеры обозначают полный габарит, включая каркас. На плане 2D и в 3D выбранный предмет перетаскивается мышью (привязка к стенам включена; удерживайте Option/Alt для свободного сдвига).</p>
    </>}
    {tab === 'light' && <>
      <p className="small-note">Дневной свет проходит через окна. Направление солнца условное. Непрямой свет приближённый. Вечером свет идёт от потолочных приборов и точек «Светильник». «Всё освещено» даёт ровный свет для сравнения отделки и мебели.</p>
      <div className="section-fields">
        <strong>Светильники · {room.name}</strong>
        <p className="small-note">{roomLampCount ? `Ваших точек света: ${roomLampCount}. Их положение и высота задаются в «Электрике».` : 'В комнате показан пример потолочного светильника. Он не записан в проект. Ваша первая точка света заменит этот пример.'}</p>
        <button className="wide primary" disabled={variant.electrical.points.length >= MAX_ELECTRICAL_POINTS} onClick={() => {
          let pointId = '';
          if (mutate(p => { pointId = addElectricalPoint(p, roomId, 'light').id; })) {
            electrical.onSelect(pointId);
            onOpenElectrical();
          }
        }}>Добавить потолочный светильник</button>
        <button className="wide outline" onClick={onOpenElectrical}>Расставить и настроить точки света</button>
        <p className="small-note">Всего приборов в сцене: {lamps.total}, из них примеров: {lamps.examples}. Вечером работают до 6 приборов: сначала в комнате камеры, затем ближайшие к ней. {lamps.limited ? 'Остальные приборы видны, но их свет не рассчитывается в текущем виде.' : ''} Это ограничение снижает нагрузку.</p>
      </div>
      <div className="day-switch">
        <button className={variant.lighting.mode === 'day' ? 'active' : ''} onClick={() => mutate(p => {
          active(p).lighting.mode = 'day'
        })}>☼ День</button>
        <button className={variant.lighting.mode === 'evening' ? 'active' : ''} onClick={() => mutate(p => {
          active(p).lighting.mode = 'evening'
        })}>☾ Вечер</button>
        <button className={variant.lighting.mode === 'uniform' ? 'active' : ''} onClick={() => mutate(p => {
          active(p).lighting.mode = 'uniform'
        })}>Всё освещено</button>
      </div>
      <label className="range-field">
        Яркость
        <b>{`${Math.round(variant.lighting.intensity * 100)}%`}</b>
        <input aria-label="Яркость" type="range" min=".1" max="1.5" step=".05" value={variant.lighting.intensity} onChange={e => mutate(p => {
          active(p).lighting.intensity = +e.target.value
        })} />
      </label>
      <label className="range-field">
        Температура
        <b>{`${variant.lighting.warmth} K`}</b>
        <input aria-label="Температура" type="range" min="2500" max="6500" step="100" value={variant.lighting.warmth} onChange={e => mutate(p => {
          active(p).lighting.warmth = +e.target.value
        })} />
      </label>
      <label className="range-field">
        Направление солнца
        <b>{`${variant.lighting.azimuth}°`}</b>
        <input aria-label="Направление солнца" type="range" min="0" max="360" step="5" value={variant.lighting.azimuth} onChange={e => mutate(p => {
          active(p).lighting.azimuth = +e.target.value
        })} />
      </label>
      <p className="small-note">Освещение моделируется условно. Ориентация фасада и положение здания неизвестны.</p>
    </>}
    {tab === 'sizes' && <>
      <p className="small-note">{doorBlocks.length ? `У дверных проёмов пересекаются габариты: ${[...new Set(doorBlocks.map(b => kindNames[b.kind]))].join(', ')}. Передвиньте предметы.` : 'Габариты предметов не пересекают полосу 16 см у дверных проёмов.'}</p>
      <p className="small-note">{conflicts.length ? `Предметы пересекаются: ${[...new Set(conflicts.flatMap(o => [o.a, o.b]).map(f => kindNames[f.kind]))].join(', ')}. На плане они обведены красным.` : 'Пересечений мебели нет. Предметы можно ставить вплотную.'}</p>
      {swingBlocks.length > 0 && <p className="small-note">Дуга открывания двери задевает мебель или соседнюю дверь. Проверьте сторону открывания и петли ниже.</p>}
      {passages.length > 0 && <p className="small-note">Узкий проход (&lt; 50 см): {passages.map(w => `${kindNames[w.a.kind]} ↔ ${kindNames[w.b.kind]} (${Math.round(w.clearanceM * 100)} см)`).join(', ')}.</p>}
      <p className="small-note">Размеры демо-квартиры приблизительные. Сверьте их с обмером до заказа материалов.</p>
      <NumberField label="Масштаб квартиры" value={project.scale * 100} min={50} max={200} unit="%" onChange={v => mutate(p => {
        p.scale = v / 100;
        for (const vr of p.variants)
          vr.furniture = vr.furniture.map(f => boundFurniture(f, p))
      })} />
      <NumberField label="Высота потолка" value={project.ceilingHeight * 100} min={200} max={400} onChange={v => mutate(p => {
        setCeilingHeight(p, v / 100)
      })} />
      <NumberField label="Ширина комнаты" value={roomSize(room)[0] * project.scale * 100} min={100} max={1200} onChange={v => mutate(p => resizeRoom(p, roomId, 0, v / 100 / p.scale))} />
      <NumberField label="Длина комнаты" value={roomSize(room)[1] * project.scale * 100} min={100} max={1500} onChange={v => mutate(p => resizeRoom(p, roomId, 1, v / 100 / p.scale))} />
      <p className="small-note">Редактирование сдвигает общую координатную линию и соседние комнаты, сохраняя физическую ширину дверей и окон.</p>
      <OpeningsEditor project={project} roomId={roomId} mutate={mutate} notify={notify} />
      <details className="measurement-checklist">
        <summary>Чеклист приёмки и заметки · {room.name}</summary>
        <p className="small-note">Отмечайте выполненные замеры при приёмке квартиры и записывайте нюансы (выступы, вентшахты, трубы).</p>
        {measurementChecklistItems.map(item => <label className="check-label" key={item.key}>
          <input type="checkbox" checked={Boolean(roomNote.checks[item.key])} onChange={e => updateRoomNote({ checkKey: item.key, checked: e.target.checked })} />
          <span>{item.label}</span>
        </label>)}
        <textarea className="offline-card-textarea" rows={3} aria-label="Заметки по комнате" placeholder="Заметки по комнате (перепад пола, радиаторы, пожелания для мастеров)…" value={roomNote.notes} onChange={e => updateRoomNote({ notes: e.target.value })} />
      </details>
      <div className="size-summary">
        <span>По исходному плану</span>
        <b>{`${room.sourceArea} м²`}</b>
        <span>Реконструировано</span>
        <b>{`≈ ${(area(room.polygon) * project.scale ** 2).toFixed(2).replace('.', ',')} м²`}</b>
        <span>Высота (допущение)</span>
        <b>{`${project.ceilingHeight.toFixed(2).replace('.', ',')} м`}</b>
      </div>
    </>}
    <ProductImporter project={project} roomId={roomId} surface={surface} onSwitchSurface={setSurface} mutate={mutate} notify={notify} onSelectFurniture={onSelectFurniture} />
    <p className="privacy-note">Все варианты и ваши фотографии хранятся на этом устройстве.</p>
  </aside>
}
type Product = ImportedProduct;
function ProductImporter({ project, roomId, surface, onSwitchSurface, mutate, notify, onSelectFurniture }: { project: Project; roomId: string; surface: Surface; onSwitchSurface: (s: Surface) => void; mutate: (f: (p: Project) => void) => boolean; notify: (s: string, error?: boolean) => void; onSelectFurniture: (id: string | null) => void }) {
  const [url, setUrl] = useState('');
  const [rawCard, setRawCard] = useState('');
  const [p, setP] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<MaterialQuote>({});
  const [kind, setKind] = useState<Kind>('sofa');
  const [useImage, setUseImage] = useState(false);
  const [productColor, setProductColor] = useState('#c8b090');
  const [dimensionNotice, setDimensionNotice] = useState('');
  const htmlUploadRef = useRef<HTMLInputElement>(null);
  function applyRawProduct(raw: Product) {
    if (raw.category === 'plumbing') {
      setKind('bath');
      if (raw.dimensions.lengthCm) {
        raw.dimensions = { ...raw.dimensions, depthCm: raw.dimensions.lengthCm };
        setDimensionNotice('Для ванны длина страницы использована как глубина габарита на плане. Внутренняя глубина чаши не используется.')
      } else {
        setDimensionNotice('Проверьте полный габарит по описанию товара.');
      }
    } else if (raw.category === 'flooring' || raw.category === 'tile') {
      setDimensionNotice('Для покрытия используются ширина и длина. Высота мебели не требуется.');
    } else {
      setDimensionNotice('Проверьте полный габарит по описанию товара.');
    }
    setP(raw);
    setQuote({ sourceUrl: raw.url && /^https?:\/\//i.test(raw.url) ? raw.url : undefined, retailer: raw.retailer, price: raw.offer?.price, currency: raw.offer?.currency, priceUnit: raw.offer?.unit ?? 'unknown', observedAt: raw.offer?.observedAt, packCoverageM2: raw.pack?.coverageM2, packPieces: raw.pack?.pieces });
    const colors: Record<string, string> = { 'white': '#f1efe9', 'белый': '#f1efe9', 'black': '#353735', 'черный': '#353735', 'чёрный': '#353735', 'grey': '#999c98', 'gray': '#999c98', 'серый': '#999c98', 'green': '#788c6a', 'зеленый': '#788c6a', 'зелёный': '#788c6a', 'beige': '#d4c4aa', 'бежевый': '#d4c4aa', 'brown': '#987b5c', 'коричневый': '#987b5c', 'дуб': '#c9ab82' };
    const lowerColor = (raw.color ?? '').toLowerCase();
    const matchedColor = colors[lowerColor] ?? Object.entries(colors).find(([k]) => lowerColor.includes(k))?.[1];
    setProductColor(/^#[0-9a-f]{6}$/i.test(raw.color ?? '') ? raw.color! : matchedColor ?? '#c8b090');
  }
  async function fetchProduct() {
    setBusy(true);
    setP(null);
    try {
      const response = await fetch('/api/import-product', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const raw = await response.json();
      if (!response.ok)
        throw Error(raw.message ?? raw.error ?? 'Не удалось загрузить товар.');
      applyRawProduct(raw);
    } catch (e) {
      notify((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  async function importSavedHtmlFile(file: File) {
    try {
      if (file.size > 8_000_000) throw Error('HTML-файл слишком большой (до 8 МБ).');
      const text = await file.text();
      const parsed = parseOfflineProduct(text, url || undefined);
      if (parsed.url && !url) setUrl(parsed.url);
      applyRawProduct(parsed);
      notify('Сохранённая карточка товара распознана локально.');
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  function importPastedText() {
    try {
      const parsed = parseOfflineProduct(rawCard, url || undefined);
      if (parsed.url && !url) setUrl(parsed.url);
      applyRawProduct(parsed);
      notify('Параметры из текста карточки распознаны.');
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  const targetSurfaceForProduct = (prod: Product): Surface => {
    if (prod.category === 'flooring') return 'floor';
    if (/обои|краск|штукатурк/i.test(prod.title)) return 'walls';
    return surface;
  };
  return <details className="product-import">
    <summary>Импорт товара по ссылке</summary>
    <p className="small-note">Открытые карточки OMA, 21vek, Mile и других магазинов. Локальная служба читает страницу без входа. Если магазин блокирует прямой запрос (403), загрузите сохранённую из браузера HTML-страницу (⌘S) или вставьте скопированный текст характеристик.</p>
    <input type="url" aria-label="Ссылка на товар" placeholder="https://магазин/товар" value={url} onChange={e => setUrl(e.target.value)} />
    <button className="wide outline" disabled={busy || !url} onClick={() => void fetchProduct()}>
      {busy ? 'Читаем страницу…' : 'Получить параметры'}
    </button>
    <button className="wide outline" onClick={() => htmlUploadRef.current?.click()}>
      <FileCode size={15} />
      Загрузить сохранённый HTML карточки
    </button>
    <input ref={htmlUploadRef} hidden type="file" accept=".html,.htm,text/html,text/plain" aria-label="Загрузить сохранённый HTML товара" onChange={e => {
      const f = e.target.files?.[0];
      if (f) void importSavedHtmlFile(f);
      e.target.value = '';
    }} />
    <textarea className="offline-card-textarea" rows={3} aria-label="Текст или HTML карточки товара" placeholder="Или вставьте сюда скопированный текст / характеристики со страницы OMA, 21vek, Mile…" value={rawCard} onChange={e => setRawCard(e.target.value)} />
    {rawCard.trim().length > 0 && <button className="wide outline" onClick={importPastedText}>Распознать вставленный текст</button>}
    {p && <div className="product-preview">
      {p.image && <img src={p.image.dataUrl} alt={p.title} />}
      <strong>
        {p.title}
      </strong>
      <label className="field">
        <span>
          {`Цвет товара ${p.color ? `(${p.color})` : '(не указан)'}`}
        </span>
        <input type="color" aria-label="Цвет импортируемого товара" value={productColor} onChange={e => setProductColor(e.target.value)} />
      </label>
      {dimensionNotice && <p className="small-note">
        {dimensionNotice}
      </p>}
      {p.color && !/^#[0-9a-f]{6}$/i.test(p.color) && <p className="small-note">Название цвета — из источника. Проверьте визуальный оттенок вручную.</p>}
      {p.warnings.map((w, i) => <p className="small-note" key={i}>
        {w}
      </p>)}
      <QuoteFields quote={quote} onChange={q => setQuote({ ...q, observedAt: undefined })} />
      <button className="wide outline" onClick={() => {
        const destSurface = targetSurfaceForProduct(p);
        if (mutate(pr => {
          const m: Material = { id: id(), name: p.title.slice(0, 60), pattern: p.category === 'flooring' ? 'wood' : p.category === 'tile' ? 'tile' : 'plain', color: productColor, width: (p.dimensions.widthCm ?? 100) / 100, height: (p.dimensions.lengthCm ?? p.dimensions.depthCm ?? 100) / 100, rotation: 0, roughness: .7, quote };
          pr.materials.push(m); pr.variants.find(v => v.id === pr.activeVariantId)!.finishes[roomId][destSurface] = m.id;
        })) {
          if (destSurface !== surface) onSwitchSurface(destSurface);
          notify(`Параметры и цена применены (${surfaceDisplayNames[destSurface]}). Фактура приблизительная; фото можно применить отдельно.`);
        }
      }}>Применить параметры материала</button>
      <label className="field">
        Тип объекта
        <select aria-label="Тип импортируемого объекта" value={kind} onChange={e => setKind(e.target.value as Kind)}>
          {Object.entries(kindNames).map(([k, n]) => <option key={k} value={k}>
            {n}
          </option>)}
        </select>
      </label>
      {(['widthCm', 'depthCm', 'heightCm'] as const).map((key, i) => <NumberField key={key} label={['Ширина товара', 'Глубина товара', 'Высота товара'][i]} value={p.dimensions[key] ?? 0} min={1} max={350} onChange={n => setP({ ...p, dimensions: { ...p.dimensions, [key]: n } })} />)}
      <NumberField label="Длина материала" value={p.dimensions.lengthCm ?? 0} min={1} max={1000} onChange={n => setP({ ...p, dimensions: { ...p.dimensions, lengthCm: n } })} />
      <NumberField label="Толщина материала" value={p.dimensions.thicknessMm ?? 0} min={1} max={100} unit="мм" onChange={n => setP({ ...p, dimensions: { ...p.dimensions, thicknessMm: n } })} />
      <button className="wide primary" disabled={!p.dimensions.widthCm || !p.dimensions.depthCm || !p.dimensions.heightCm} onClick={() => {
        const [x, z] = center(project.rooms.find(r => r.id === roomId)!);
        const f = boundFurniture({
          ...makeFurniture(kind, roomId, x, z),
          width: p.dimensions.widthCm! / 100,
          depth: p.dimensions.depthCm! / 100,
          height: p.dimensions.heightCm! / 100,
          color: productColor,
          label: p.title.slice(0, 100),
          ...(quote.price && quote.price > 0 ? { price: quote.price, currency: quote.currency ?? 'BYN' } : {}),
          ...(quote.sourceUrl ? { sourceUrl: quote.sourceUrl } : {}),
        }, project);
        if (mutate(pr => pr.variants.find(v => v.id === pr.activeVariantId)!.furniture.push(f))) {
          onSelectFurniture(f.id);
          notify('Добавлена приблизительная модель по указанным габаритам (с ценой в смете).')
        }
      }}>Добавить объёмную модель</button>
      <p className="small-note">Фотография не превращается в точную 3D-модель. Будет создан выбранный параметрический предмет.</p>
      {p.image && <>
        <label className="check-label">
          <input type="checkbox" checked={useImage} onChange={e => setUseImage(e.target.checked)} />
          Использовать фото как повторяемую текстуру
        </label>
        <button className="wide outline" disabled={!useImage} onClick={async () => {
          try {
            const destSurface = targetSurfaceForProduct(p);
            const blob = await (await fetch(p.image!.dataUrl)).blob();
            const image = await importPhoto(new File([blob], 'product.jpg', { type: blob.type }));
            const applied = mutate(pr => {
              const m: Material = { id: id(), name: p.title.slice(0, 60), pattern: 'image', color: '#ffffff', image, width: (p.dimensions.widthCm ?? 100) / 100, height: (p.dimensions.lengthCm ?? p.dimensions.depthCm ?? 100) / 100, rotation: 0, roughness: .7, quote };
              pr.materials.push(m);
              pr.variants.find(v => v.id === pr.activeVariantId)!.finishes[roomId][destSurface] = m.id
            });
            if (applied) {
              if (destSurface !== surface) onSwitchSurface(destSurface);
              notify('Фото применено. Проверьте размер повторения.');
            }
          } catch (e) {
            notify((e as Error).message, true)
          }

        }}>Применить фото к поверхности</button>
      </>}
      <details>
        <summary>Источники параметров</summary>
        {p.evidence.map((e, i) => <p className="small-note" key={i}>
          {e}
        </p>)}
      </details>
    </div>}
  </details>
}
