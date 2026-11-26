import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { electricalNames, electricalSymbols, engineeringNames, engineeringSymbols, HUMAN_HEIGHT_M, type Project, type Variant } from './model';
import { kindNames } from './furnitureCatalog';
import { roomWalls, wallTitle } from './openings';
import { buildWallElevation } from './viewpoints';

export default function WallElevation({
  project, variant, roomId, initialWallIndex, onSelectRoom, onClose,
}: {
  project: Project; variant: Variant; roomId: string; initialWallIndex?: number | null; onSelectRoom?: (id: string) => void; onClose: () => void;
}) {
  const [activeRoomId, setActiveRoomId] = useState(roomId);
  const walls = useMemo(() => roomWalls(project, activeRoomId), [project, activeRoomId]);
  const [wallIndex, setWallIndex] = useState<number>(() => initialWallIndex ?? walls[0]?.index ?? 0);
  const [showHuman, setShowHuman] = useState(true);
  const room = project.rooms.find(r => r.id === activeRoomId) ?? project.rooms[0];

  useEffect(() => { setActiveRoomId(roomId); }, [roomId]);

  useEffect(() => {
    if (!walls.some(w => w.index === wallIndex) && walls[0]) {
      setWallIndex(walls[0].index);
    }
  }, [walls, wallIndex]);

  const data = useMemo(() => buildWallElevation(project, variant, activeRoomId, wallIndex), [project, variant, activeRoomId, wallIndex]);
  const wallPos = Math.max(0, walls.findIndex(w => w.index === wallIndex));
  const stepWall = (delta: number) => {
    if (!walls.length) return;
    const next = walls[(wallPos + delta + walls.length) % walls.length];
    setWallIndex(next.index);
  };

  const scalePx = 150; // 1 m = 150 px in SVG viewBox
  const padL = 78, padR = 46, padT = 48, padB = 56;
  const wPx = (data?.lengthM ?? 3) * scalePx;
  const hPx = (data?.ceilingM ?? project.ceilingHeight) * scalePx;
  const vbW = padL + wPx + padR;
  const vbH = padT + hPx + padB;
  const xOf = (uM: number) => padL + uM * scalePx;
  const yOf = (hM: number) => padT + (data!.ceilingM - hM) * scalePx;

  const downloadSvg = () => {
    const svgEl = document.getElementById('wall-elevation-svg');
    if (!svgEl) return;
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `razvertka-${activeRoomId}-wall-${wallIndex}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="dialog-backdrop" onClick={onClose}>
    <section className="dialog elevation-dialog" role="dialog" aria-modal="true" aria-labelledby="elevation-title" onClick={e => e.stopPropagation()}>
      <div className="dialog-header">
        <div>
          <h2 id="elevation-title">Развёртка стены · {room.name}</h2>
          <p className="small-note">Точные высоты розеток, выключателей, проёмов и мебели от уровня пола (0 см).</p>
        </div>
        <button className="icon-button" aria-label="Закрыть развёртку" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="elevation-controls">
        <label className="field">
          <span>Помещение</span>
          <select aria-label="Помещение развёртки" value={activeRoomId} onChange={e => {
            setActiveRoomId(e.target.value);
            onSelectRoom?.(e.target.value);
          }}>
            {project.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="elevation-wall-stepper">
          <button className="icon-button" aria-label="Предыдущая стена" title="Предыдущая стена" onClick={() => stepWall(-1)}>
            <ChevronLeft size={16} />
          </button>
          <select aria-label="Выбор стены для развёртки" value={wallIndex} onChange={e => setWallIndex(Number(e.target.value))}>
            {walls.map((w, i) => <option key={w.index} value={w.index}>{`${i + 1}/${walls.length} · ${wallTitle(project, w)}`}</option>)}
          </select>
          <button className="icon-button" aria-label="Следующая стена" title="Следующая стена" onClick={() => stepWall(1)}>
            <ChevronRight size={16} />
          </button>
        </div>
        <label className="check-label">
          <input type="checkbox" checked={showHuman} onChange={e => setShowHuman(e.target.checked)} />
          <span>Человек 186 см</span>
        </label>
        <button className="outline" onClick={downloadSvg}><Download size={14} />SVG</button>
      </div>
      {data && <div className="elevation-stage">
        <svg id="wall-elevation-svg" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${vbW} ${vbH}`} className="elevation-svg" role="img" aria-label={`Развёртка стены ${data.title}`}>
          {/* Wall background */}
          <rect x={padL} y={padT} width={wPx} height={hPx} fill="#f7f4ec" stroke="#475249" strokeWidth="2.5" />
          {/* Horizontal height grid lines */}
          {[0, .3, .9, 1.1, 1.5, HUMAN_HEIGHT_M, 2.1, data.ceilingM].filter(h => h <= data.ceilingM + .001).map((h, i) => (
            <g key={i}>
              <line x1={padL - 8} y1={yOf(h)} x2={padL + wPx} y2={yOf(h)} stroke={h === HUMAN_HEIGHT_M ? '#2f7a62' : '#d5d1c6'} strokeWidth={h === 0 || h === data.ceilingM ? 1.5 : 1} strokeDasharray={h === 0 || h === data.ceilingM ? undefined : '4 4'} />
              <text x={padL - 12} y={yOf(h) + 4} textAnchor="end" fontSize="11" fill={h === HUMAN_HEIGHT_M ? '#1f5c48' : '#5e665f'} fontWeight={h === HUMAN_HEIGHT_M ? '700' : '400'}>
                {Math.round(h * 100)} см
              </text>
            </g>
          ))}
          {/* Skirting board */}
          <rect x={padL} y={yOf(data.skirtingM)} width={wPx} height={data.skirtingM * scalePx} fill={variant.skirtingColor ?? '#e5e0d4'} stroke="#b7b1a4" strokeWidth="1" />
          {/* Openings */}
          {data.openings.map((o, i) => {
            const x = xOf(o.u0), w = (o.u1 - o.u0) * scalePx;
            const y = yOf(o.topM), h = (o.topM - o.bottomM) * scalePx;
            return <g key={`op-${i}`}>
              <rect x={x} y={y} width={w} height={h} fill={o.kind === 'window' ? '#d9ecf2' : '#e6dfd1'} stroke={o.kind === 'window' ? '#608b99' : '#7b705e'} strokeWidth="2" />
              <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" fontSize="12" fontWeight="600" fill="#3a4540">
                {o.kind === 'window' ? 'Окно' : 'Дверь'} {Math.round((o.u1 - o.u0) * 100)}×{Math.round((o.topM - o.bottomM) * 100)}
              </text>
              {o.kind === 'window' && <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize="10" fill="#4f636a">
                подоконник {Math.round(o.bottomM * 100)} см · верх {Math.round(o.topM * 100)} см
              </text>}
            </g>;
          })}
          {/* Projected wall furniture */}
          {data.furniture.map(f => {
            const x = xOf(f.u0), w = Math.max(8, (f.u1 - f.u0) * scalePx);
            const y = yOf(f.topM), h = Math.max(8, (f.topM - f.bottomM) * scalePx);
            return <g key={f.id}>
              <rect x={x} y={y} width={w} height={h} fill={f.color} fillOpacity=".35" stroke="#535c54" strokeWidth="1.5" rx="3" />
              <text x={x + w / 2} y={y + Math.min(h / 2 + 4, 18)} textAnchor="middle" fontSize="11" fill="#242b26" fontWeight="600">
                {f.label || kindNames[f.kind]}
              </text>
              <text x={x + w / 2} y={y + Math.min(h / 2 + 18, h - 5)} textAnchor="middle" fontSize="10" fill="#4a534c">
                {Math.round(f.bottomM * 100)}–{Math.round(f.topM * 100)} см
              </text>
            </g>;
          })}
          {/* 186 cm human scale silhouette */}
          {showHuman && data.lengthM >= .6 && (() => {
            const hx = xOf(Math.min(data.lengthM - .32, .38));
            const topY = yOf(HUMAN_HEIGHT_M), footY = yOf(0);
            const hTotal = footY - topY;
            return <g className="human-elevation" opacity=".78">
              <circle cx={hx} cy={topY + hTotal * .065} r={hTotal * .06} fill="#3d6a5c" />
              <rect x={hx - 22} y={topY + hTotal * .14} width="44" height={hTotal * .38} rx="12" fill="#3d6a5c" />
              <rect x={hx - 17} y={topY + hTotal * .52} width="14" height={hTotal * .48} rx="6" fill="#3d6a5c" />
              <rect x={hx + 3} y={topY + hTotal * .52} width="14" height={hTotal * .48} rx="6" fill="#3d6a5c" />
              <text x={hx} y={topY - 8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1f5c48">186 см</text>
            </g>;
          })()}
          {/* Engineering items */}
          {data.engineering.map(it => {
            const x = xOf(it.u), y = yOf(it.heightM);
            return <g key={it.id}>
              <rect x={x - 14} y={y - 11} width="28" height="22" rx="4" fill="#e1f0fa" stroke="#286085" strokeWidth="1.8" />
              <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e4969">{engineeringSymbols[it.type]}</text>
              <title>{`${it.label || engineeringNames[it.type]} · ${Math.round(it.heightM * 100)} см`}</title>
            </g>;
          })}
          {/* Electrical points */}
          {data.electrical.map(pt => {
            const x = xOf(pt.u), y = yOf(pt.heightM);
            return <g key={pt.id}>
              <line x1={x} y1={yOf(0)} x2={x} y2={y} stroke="#b67624" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={x} cy={y} r="12" fill="#fff6e0" stroke="#9a5f1b" strokeWidth="2" />
              <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#653b0c">{electricalSymbols[pt.type]}</text>
              <text x={x} y={y - 16} textAnchor="middle" fontSize="10" fontWeight="600" fill="#7a4910">
                {`${Math.round(pt.heightM * 100)} см${pt.label ? ` · ${pt.label}` : ''}`}
              </text>
              <title>{`${pt.label || electricalNames[pt.type]} · высота ${Math.round(pt.heightM * 100)} см · от левого угла ${Math.round(pt.u * 100)} см`}</title>
            </g>;
          })}
          {/* Top width dimension line */}
          <line x1={padL} y1={padT - 20} x2={padL + wPx} y2={padT - 20} stroke="#59625b" strokeWidth="1.3" />
          <line x1={padL} y1={padT - 27} x2={padL} y2={padT - 13} stroke="#59625b" strokeWidth="1.3" />
          <line x1={padL + wPx} y1={padT - 27} x2={padL + wPx} y2={padT - 13} stroke="#59625b" strokeWidth="1.3" />
          <text x={padL + wPx / 2} y={padT - 26} textAnchor="middle" fontSize="12" fontWeight="600" fill="#2c352f">
            {`${data.title} · длина ≈ ${Math.round(data.lengthM * 100)} см (${data.lengthM.toFixed(2).replace('.', ',')} м)`}
          </text>
          {/* Floor baseline label */}
          <text x={padL + wPx / 2} y={padT + hPx + 34} textAnchor="middle" fontSize="11" fill="#5e665f">
            Уровень чистового пола (0 см) · плинтус {Math.round(data.skirtingM * 100)} см · потолок {Math.round(data.ceilingM * 100)} см
          </text>
        </svg>
      </div>}
      {data && <div className="elevation-legend">
        <span>Точек электрики на этой стене: <b>{data.electrical.length}</b></span>
        <span>Проёмов: <b>{data.openings.length}</b></span>
        <span>Мебели вдоль стены: <b>{data.furniture.length}</b></span>
      </div>}
    </section>
  </div>;
}
