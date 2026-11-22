import { useState } from 'react';
import { Plus } from 'lucide-react';
import { type Project } from './model';
import { addOpening, openingLimits, openingNames, openingWidthRange, removeOpening, roomOpeningTitle, roomOpenings, roomWalls, updateOpening, wallTitle, type OpeningKind } from './openings';
import { openingHeights } from './openingHeights';
import { defaultDoorSwingSign } from './roomMeasures';
import { wallFaceSpans } from './wallSides';
import NumberField from './NumberField';

const cm = (metres: number) => Math.round(metres * 1000) / 10;

export default function OpeningsEditor({ project, roomId, mutate, notify }: { project: Project; roomId: string; mutate: (f: (p: Project) => void) => boolean; notify: (s: string, error?: boolean) => void }) {
  const [newWall, setNewWall] = useState<number | null>(null);
  const [newOpeningKind, setNewOpeningKind] = useState<OpeningKind>('door');
  const openings = roomOpenings(project, roomId);
  const walls = roomWalls(project, roomId);
  const wallForNewOpening = walls.some(w => w.index === newWall) ? newWall! : walls[0]?.index;
  const roomName = (id: string | null) => id ? (project.rooms.find(r => r.id === id)?.name ?? id) : 'наружу';
  return <>
    <h3 className="finish-group-title">Двери и окна</h3>
    {openings.length === 0 && <p className="small-note">В этой комнате нет проёмов. Добавьте дверь или окно ниже.</p>}
    <div className="opening-list">
      {openings.map((row, n) => {
        const width = row.opening.end - row.opening.start;
        const limits = openingLimits(project, row.wallIndex, row.openingIndex, roomId);
        const localMin = Math.max(0, limits.minStart - row.faceStart);
        const localMax = Math.max(localMin, limits.maxStart - row.faceStart);
        const [minWidth, maxWidth] = openingWidthRange[row.opening.kind];
        const mid = (row.opening.start + row.opening.end) / 2;
        const span = wallFaceSpans(row.wall, project, 0, row.length).find(s => mid >= s.start - 1e-6 && mid <= s.end + 1e-6);
        const currentSwing = row.opening.swing ?? defaultDoorSwingSign(project, row.wall, row.opening);
        const currentHinge = row.opening.hinge ?? 'start';
        const sillM = row.opening.sillHeight ?? openingHeights.windowSill;
        const headM = row.opening.headHeight ?? (row.opening.kind === 'window' ? openingHeights.windowHead : openingHeights.door);
        return <div className="opening-row" key={`${row.wallIndex}-${row.openingIndex}`}>
          <div className="opening-title">
            <strong>{`Проём ${n + 1} · ${openingNames[row.opening.kind]}`}</strong>
            <span>{roomOpeningTitle(project, row)}</span>
          </div>
          <label className="field">
            <span>Тип проёма</span>
            <select aria-label={`Тип проёма ${n + 1}`} value={row.opening.kind} onChange={e => mutate(p => updateOpening(p, row.wallIndex, row.openingIndex, { kind: e.target.value as OpeningKind }, roomId))}>
              <option value="door">Дверь</option>
              <option value="window">Окно</option>
            </select>
          </label>
          <NumberField label={`Отступ проёма ${n + 1}`} value={cm(row.localStart)} min={cm(localMin)} max={cm(localMax)} onChange={v => mutate(p => updateOpening(p, row.wallIndex, row.openingIndex, { start: row.faceStart + v / 100, end: row.faceStart + v / 100 + width }, roomId))} />
          <NumberField label={`Ширина проёма ${n + 1}`} value={cm(width)} min={cm(minWidth)} max={cm(Math.max(minWidth, Math.min(maxWidth, limits.maxWidth)))} onChange={v => mutate(p => updateOpening(p, row.wallIndex, row.openingIndex, { end: row.opening.start + v / 100 }, roomId))} />
          {row.opening.kind === 'door' ? <>
            <label className="field">
              <span>Открывание</span>
              <select aria-label={`Сторона открывания ${n + 1}`} value={String(currentSwing)} onChange={e => mutate(p => updateOpening(p, row.wallIndex, row.openingIndex, { swing: Number(e.target.value) as 1 | -1 }, roomId))}>
                <option value="1">В «{roomName(span?.positive ?? null)}»</option>
                <option value="-1">В «{roomName(span?.negative ?? null)}»</option>
              </select>
            </label>
            <label className="field">
              <span>Петли</span>
              <select aria-label={`Петли двери ${n + 1}`} value={currentHinge} onChange={e => mutate(p => updateOpening(p, row.wallIndex, row.openingIndex, { hinge: e.target.value as 'start' | 'end' }, roomId))}>
                <option value="start">У начала проёма</option>
                <option value="end">У конца проёма</option>
              </select>
            </label>
            <NumberField label={`Высота двери ${n + 1}`} value={cm(headM)} min={150} max={cm(project.ceilingHeight)} onChange={v => mutate(p => updateOpening(p, row.wallIndex, row.openingIndex, { headHeight: v / 100 }, roomId))} />
          </> : <>
            <NumberField label={`Подоконник ${n + 1}`} value={cm(sillM)} min={0} max={cm(Math.max(0, headM - .25))} onChange={v => mutate(p => updateOpening(p, row.wallIndex, row.openingIndex, { sillHeight: v / 100 }, roomId))} />
            <NumberField label={`Верх окна ${n + 1}`} value={cm(headM)} min={cm(sillM + .25)} max={cm(project.ceilingHeight)} onChange={v => mutate(p => updateOpening(p, row.wallIndex, row.openingIndex, { headHeight: v / 100 }, roomId))} />
          </>}
          <button className="wide outline danger" onClick={() => mutate(p => removeOpening(p, row.wallIndex, row.openingIndex))}>Удалить проём</button>
        </div>;
      })}
    </div>
    {wallForNewOpening !== undefined && <div className="opening-add">
      <h4>Добавить проём</h4>
      <label className="field">
        <span>Стена</span>
        <select aria-label="Стена для нового проёма" value={wallForNewOpening} onChange={e => setNewWall(Number(e.target.value))}>
          {walls.map(info => <option key={info.index} value={info.index}>{wallTitle(project, info)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Тип</span>
        <select aria-label="Тип нового проёма" value={newOpeningKind} onChange={e => setNewOpeningKind(e.target.value as OpeningKind)}>
          <option value="door">Дверь</option>
          <option value="window">Окно</option>
        </select>
      </label>
      <button className="wide primary" onClick={() => {
        if (mutate(p => { addOpening(p, wallForNewOpening, newOpeningKind, undefined, roomId) }))
          notify(`${newOpeningKind === 'door' ? 'Дверь добавлена' : 'Окно добавлено'} в самом широком свободном месте. Проверьте отступ и ширину.`)
      }}>
        <Plus size={15} />
        Добавить
      </button>
    </div>}
  </>;
}
