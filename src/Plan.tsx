import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { kindNames } from './furnitureCatalog';
import { type Project, type Variant, type Furniture, type ElectricalPoint, type EngineeringItem, type Point, solidSpans, center, area, electricalNames, electricalSymbols, engineeringNames, engineeringSymbols, furnitureFront, furnitureOverlaps, roomAt } from './model';
import { doorSwingConflicts, doorSwingInfo } from './roomMeasures';
import { lifeZonePolygons, type CameraPose } from './viewpoints';
import { runLayoutAudit } from './layoutAudit';
type DragKind = 'furniture' | 'electrical' | 'engineering';
interface PlanProps {
  project: Project; variant: Variant; selectedRoom: string; selectedFurniture: string | null;
  onSelect: (id: string) => void; onFurniture: (id: string) => void; mini?: boolean;
  onDragStart?: () => void;
  electricalVisible?: boolean; selectedElectrical?: string | null; onElectrical?: (id: string) => void;
  engineeringVisible?: boolean; selectedEngineering?: string | null; onEngineering?: (id: string) => void;
  lifeZonesVisible?: boolean;
  auditOverlayVisible?: boolean;
  deliveryHighlightId?: string | null;
  cameraPose?: CameraPose | null;
  onCameraJump?: (x: number, z: number, roomId: string) => void;
  measureMode?: boolean;
  onDrag?: (id: string, x: number, z: number, electrical?: boolean, snap?: boolean, kind?: DragKind) => void;
  onDragEnd?: (id: string, x: number, z: number, electrical?: boolean, snap?: boolean, kind?: DragKind) => void;
  onDragCancel?: () => void;
}
export default function Plan({ project, variant, selectedRoom, selectedFurniture, onSelect, onFurniture, mini = false, onDragStart, onDrag, onDragEnd, onDragCancel, electricalVisible = false, selectedElectrical, onElectrical, engineeringVisible = false, selectedEngineering, onEngineering, lifeZonesVisible = false, auditOverlayVisible = false, deliveryHighlightId = null, cameraPose = null, onCameraJump, measureMode = false }: PlanProps) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; kind: DragKind; pointerId: number; start: Point; origin: Point; client: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [ruler, setRuler] = useState<{ a: Point; b: Point; drawing: boolean } | null>(null);
  const callbacks = useRef({ onDrag, onDragEnd, onDragCancel });
  callbacks.current = { onDrag, onDragEnd, onDragCancel };
  useEffect(() => { if (!measureMode) setRuler(null); }, [measureMode]);
  const point = (clientX: number, clientY: number): Point | null => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix)
      return null;
    const transformed = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return [transformed.x, transformed.y]
  };
  const snapRulerPoint = (pt: Point, disableSnap: boolean): Point => {
    if (disableSnap) return pt;
    const thresh = .12 / project.scale;
    let best = pt, bestDist = thresh;
    for (const r of project.rooms) for (const corner of r.polygon) {
      const d = Math.hypot(corner[0] - pt[0], corner[1] - pt[1]);
      if (d < bestDist) { best = corner; bestDist = d; }
    }
    return best;
  };
  const cancel = () => {
    const current = drag.current;
    drag.current = null;
    if (current) {
      callbacks.current.onDragCancel?.();
      if (svg.current?.hasPointerCapture(current.pointerId))
        svg.current.releasePointerCapture(current.pointerId)
    }
  };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { cancel(); setRuler(null); } };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      if (drag.current) {
        drag.current = null;
        callbacks.current.onDragCancel?.()
      }
    }
  }, []);
  const start = (e: ReactPointerEvent<SVGGElement>, f: Furniture | ElectricalPoint | EngineeringItem, kind: DragKind = 'furniture') => {
    if (mini || measureMode || !onDrag || !onDragEnd || e.button !== 0 || !e.isPrimary || drag.current)
      return;
    const start = point(e.clientX, e.clientY);
    if (!start)
      return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.focus();
    onSelect(f.roomId);
    if (kind === 'electrical') onElectrical?.(f.id);
    else if (kind === 'engineering') onEngineering?.(f.id);
    else onFurniture(f.id);
    suppressClick.current = false;
    drag.current = { id: f.id, kind, pointerId: e.pointerId, start, origin: [f.x, f.z], client: [e.clientX, e.clientY], moved: false };
    svg.current?.setPointerCapture(e.pointerId);
    onDragStart?.()
  };
  const position = (e: ReactPointerEvent<SVGSVGElement>): Point | null => {
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId)
      return null;
    if (Math.hypot(e.clientX - current.client[0], e.clientY - current.client[1]) >= 3)
      current.moved = true;
    const target = point(e.clientX, e.clientY);
    return target && current.moved ? [current.origin[0] + target[0] - current.start[0], current.origin[1] + target[1] - current.start[1]] : null
  };
  const maxX = Math.max(...project.rooms.flatMap(r => r.polygon.map(p => p[0]))), maxZ = Math.max(...project.rooms.flatMap(r => r.polygon.map(p => p[1]))), facadeZ = Math.max(...project.rooms.filter(r => r.id !== 'balcony').flatMap(r => r.polygon.map(p => p[1])));
  const overlapping = new Set(furnitureOverlaps(project, variant.furniture).flatMap(o => [o.a.id, o.b.id]));
  const swingConflicts = !mini ? doorSwingConflicts(project, variant.furniture) : [];
  const conflictingDoorKeys = new Set(swingConflicts.flatMap(c => [
    `${c.wallIndex}-${c.openingIndex}`,
    ...(c.otherDoor ? [`${c.otherDoor.wallIndex}-${c.otherDoor.openingIndex}`] : []),
  ]));
  const heatedRoomIds = new Set((variant.engineering?.heatedFloors ?? []).map(z => z.roomId));
  const zones = !mini && lifeZonesVisible ? lifeZonePolygons(project, variant) : [];
  const auditOverlay = !mini && (auditOverlayVisible || deliveryHighlightId) ? runLayoutAudit(project, variant) : null;
  const highlightedDelivery = auditOverlay?.delivery.find(d => d.furnitureId === (deliveryHighlightId ?? selectedFurniture));
  const sortedFurniture = [...variant.furniture].sort((a, b) => {
    const rank = (k: Furniture['kind']) => k === 'rug' || k === 'platform' ? 0 : k === 'person' ? 3 : k === 'upper_cabinet' || k === 'hood' ? 2 : 1;
    return rank(a.kind) - rank(b.kind);
  });
  return <svg ref={svg} onPointerDown={e => {
    if (mini && onCameraJump && e.button === 0) {
      const pt = point(e.clientX, e.clientY);
      const room = pt ? roomAt(project, pt) : undefined;
      if (pt && room) {
        onCameraJump(pt[0], pt[1], room.id);
      }
      return;
    }
    if (!mini && measureMode && e.button === 0) {
      const pt = point(e.clientX, e.clientY);
      if (!pt) return;
      e.preventDefault();
      const snapped = snapRulerPoint(pt, e.altKey);
      setRuler(prev => prev && prev.drawing ? { a: prev.a, b: snapped, drawing: false } : { a: snapped, b: snapped, drawing: true });
    }
  }} onPointerMove={e => {
    if (!mini && measureMode && ruler?.drawing) {
      const pt = point(e.clientX, e.clientY);
      if (pt) setRuler(prev => prev ? { ...prev, b: snapRulerPoint(pt, e.altKey) } : null);
      return;
    }
    const target = position(e);
    if (target && drag.current)
      callbacks.current.onDrag?.(drag.current.id, target[0], target[1], drag.current.kind === 'electrical', !e.altKey, drag.current.kind)
  }} onPointerUp={e => {
    if (!mini && measureMode && ruler?.drawing) {
      const pt = point(e.clientX, e.clientY);
      if (pt) {
        const snapped = snapRulerPoint(pt, e.altKey);
        if (Math.hypot(snapped[0] - ruler.a[0], snapped[1] - ruler.a[1]) > .08) {
          setRuler({ a: ruler.a, b: snapped, drawing: false });
        }
      }
      return;
    }
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId)
      return;
    const target = position(e);
    drag.current = null;
    suppressClick.current = current.moved;
    if (target)
      callbacks.current.onDragEnd?.(current.id, target[0], target[1], current.kind === 'electrical', !e.altKey, current.kind);
    else
      callbacks.current.onDragCancel?.();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId)
  }} onPointerCancel={e => { if (drag.current?.pointerId === e.pointerId) cancel() }} onLostPointerCapture={e => { if (drag.current?.pointerId === e.pointerId) cancel() }} onClickCapture={e => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.stopPropagation()
    }
  }} className={`${mini ? 'plan mini-plan' : 'plan full-plan'}${measureMode ? ' measure-mode' : ''}`} viewBox={`-1 -1 ${maxX + 2} ${maxZ + 2.1}`} role="img" aria-label="План квартиры. Размеры приблизительные">
    <defs>
      {project.materials.map(m => <pattern key={m.id} id={`${mini ? 'mini' : 'full'}-${m.id}`} width={m.width / project.scale} height={m.height / project.scale} patternUnits="userSpaceOnUse" patternTransform={`rotate(${m.rotation})`}>
        <rect width={m.width / project.scale} height={m.height / project.scale} fill={m.color} />
        {m.pattern === 'wood' && <>
          <path d={`M0 0H${m.width}V${m.height}`} fill="none" stroke="#7c654e" strokeWidth=".008" />
          <path d={`M${m.width * .5} 0V${m.height}`} stroke="#b09470" strokeWidth=".003" />
        </>}
        {m.pattern === 'tile' && <rect width={m.width / project.scale} height={m.height / project.scale} stroke="#e6ded0" strokeWidth=".014" fill="none" />}
        {m.image && <image href={m.image} width={m.width / project.scale} height={m.height / project.scale} preserveAspectRatio="none" />}
      </pattern>)}
    </defs>
    {project.rooms.map(r => <g key={r.id} role="button" tabIndex={mini ? -1 : 0} aria-label={`Выбрать ${r.name}`} onClick={() => onSelect(r.id)} onKeyDown={e => {
      if (e.key === 'Enter' || e.key === ' ')
        onSelect(r.id)
    }}>
      <polygon points={r.polygon.map(p => p.join(',')).join(' ')} fill={`url(#${mini ? 'mini' : 'full'}-${variant.finishes[r.id].floor})`} stroke={selectedRoom === r.id ? '#305b4b' : '#d6d0c4'} strokeWidth={selectedRoom === r.id ? .065 : .015} />
      <polygon points={r.polygon.map(p => p.join(',')).join(' ')} fill={selectedRoom === r.id ? '#305b4b' : '#ffffff'} opacity={selectedRoom === r.id ? .09 : .06} />
    </g>)}
    {project.walls.flatMap((w, i) => {
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      return solidSpans(w).map(([s, e], j) => <line key={`${i}-${j}`} x1={w.a[0] + (w.b[0] - w.a[0]) * s / len} y1={w.a[1] + (w.b[1] - w.a[1]) * s / len} x2={w.a[0] + (w.b[0] - w.a[0]) * e / len} y2={w.a[1] + (w.b[1] - w.a[1]) * e / len} stroke={w.proposed ? '#6c7068' : '#515a50'} strokeWidth=".14" />)
    })}
    {project.walls.flatMap((w, i) => {
      const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      if (!len) return [];
      const ux = (w.b[0] - w.a[0]) / len, uz = (w.b[1] - w.a[1]) / len;
      return (w.openings ?? []).map((o, j) => {
        const x1 = w.a[0] + ux * o.start, y1 = w.a[1] + uz * o.start;
        const x2 = w.a[0] + ux * o.end, y2 = w.a[1] + uz * o.end;
        if (mini || o.kind !== 'door') {
          return <line key={`o${i}-${j}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={o.kind === 'window' ? '#97b8c1' : '#ccbfa8'} strokeWidth={o.kind === 'window' ? .08 : .022} />;
        }
        const swing = doorSwingInfo(project, w, o);
        if (!swing) return null;
        const hasConflict = conflictingDoorKeys.has(`${i}-${j}`);
        return <g key={`o${i}-${j}`} className="door-opening" pointerEvents="none">
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={hasConflict ? '#a33b2e' : '#ccbfa8'} strokeWidth=".028" />
          <path className="door-swing" d={`M${swing.hx} ${swing.hy}L${swing.ox} ${swing.oy}A${swing.radius} ${swing.radius} 0 0 ${swing.sweep} ${swing.cx} ${swing.cy}`} fill="none" stroke={hasConflict ? '#a33b2e' : '#8d8370'} strokeWidth={hasConflict ? '.028' : '.018'} strokeDasharray=".06 .04" />
        </g>;
      });
    })}
    {!mini && lifeZonesVisible && zones.length > 0 && <g className="life-zones-layer" pointerEvents="none">
      {zones.map(z => {
        const fill = z.kind === 'tv_cone' ? '#2563eb' : z.kind === 'clearance' ? '#d97706' : '#2f7a62';
        return <polygon key={z.id} points={z.polygon.map(p => p.join(',')).join(' ')} fill={fill} fillOpacity=".14" stroke={fill} strokeWidth=".024" strokeDasharray=".08 .05"><title>{z.label}</title></polygon>;
      })}
    </g>}
    {sortedFurniture.map(f => <g key={f.id} onPointerDown={e => start(e, f)} className={!mini && onDrag ? 'draggable-furniture' : undefined} transform={`translate(${f.x} ${f.z}) rotate(${f.rotation}) scale(${1 / project.scale})`} onClick={e => {
      e.stopPropagation();
      onSelect(f.roomId);
      onFurniture(f.id)
    }} role="button" tabIndex={mini ? -1 : 0} aria-label={`Выбрать: ${kindNames[f.kind]}`} onKeyDown={e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(f.roomId);
        onFurniture(f.id)
      }
    }}>
      <title>{`${kindNames[f.kind]} · ${Math.round(f.width * 100)} × ${Math.round(f.depth * 100)} см · высота от пола ${Math.round((f.elevation ?? 0) * 100)} см${overlapping.has(f.id) ? ' · пересекается с другим предметом' : ''}`}</title>
      {f.kind === 'person' ? <>
        <ellipse cx="0" cy="0" rx={f.width * .48} ry={f.depth * .45} fill={f.color} fillOpacity=".82" stroke={f.id === selectedFurniture ? '#173f31' : '#293933'} strokeWidth={f.id === selectedFurniture ? .05 : .02} />
        <circle cx="0" cy="0" r={Math.min(f.width, f.depth) * .32} fill="#edf3f0" stroke="#293933" strokeWidth=".018" />
        <path d={`M0 ${f.depth * .32}L0 ${f.depth * .58}`} stroke="#173f31" strokeWidth=".03" />
        {!mini && <text y={-f.depth * .62} textAnchor="middle" fontSize=".14" fontWeight="700" fill="#173f31">186</text>}
      </> : f.kind === 'round_table' ? <>
        <ellipse cx="0" cy="0" rx={f.width / 2} ry={f.depth / 2} fill={f.color} stroke={f.id === selectedFurniture ? '#244d3e' : overlapping.has(f.id) ? '#a33b2e' : '#877c69'} strokeWidth={f.id === selectedFurniture || overlapping.has(f.id) ? .055 : .018} />
        <circle cx="0" cy="0" r={Math.min(f.width, f.depth) * .12} fill="#877c69" fillOpacity=".35" />
      </> : <>
        <rect x={-f.width / 2} y={-f.depth / 2} width={f.width} height={f.depth} rx={f.kind === 'plant' ? f.width / 2 : .05} fill={f.kind === 'television' || f.kind === 'tv_stand_mobile' ? '#26383e' : f.color} fillOpacity={f.kind === 'rug' ? .45 : f.kind === 'upper_cabinet' ? .7 : 1} stroke={f.id === selectedFurniture ? '#244d3e' : overlapping.has(f.id) ? '#a33b2e' : '#877c69'} strokeWidth={f.id === selectedFurniture || overlapping.has(f.id) ? .055 : .015} strokeDasharray={overlapping.has(f.id) && f.id !== selectedFurniture ? '.12 .07' : f.kind === 'rug' || f.kind === 'upper_cabinet' ? '.08 .05' : undefined} />
        {f.kind === 'slat_partition' && <path d={`M${-f.width * .45} 0H${f.width * .45}`} stroke="#5a452c" strokeWidth={f.depth * .65} strokeDasharray=".04 .06" />}
        {f.kind === 'bed' && <>
          <rect x={-f.width * .46} y={-f.depth * .43} width={f.width * .92} height={f.depth * .21} rx=".035" fill="#eeeade" />
          <path d={`M${-f.width * .46} ${f.depth * -.15}h${f.width * .92}`} stroke="#ede9df" strokeWidth=".08" />
        </>}
        {f.kind === 'sofa' && <path d={`M${-f.width * .35} ${-f.depth * .34}h${f.width * .7}v${f.depth * .65}h${-f.width * .7}Z`} stroke="#ede9df" strokeWidth=".05" fill="none" />}
      </>}
    </g>)}
    {!mini && variant.furniture.filter(f => f.id === selectedFurniture).map(f => {
      const [dx, dz] = furnitureFront(f.rotation), length = Math.min(.45, f.depth / 2) / project.scale;
      const tipX = f.x + dx * length, tipZ = f.z + dz * length, head = .10 / project.scale;
      return <g key={`front-${f.id}`} className="furniture-front" pointerEvents="none" role="img" aria-label="Передняя сторона">
        <title>Передняя сторона</title>
        <path d={`M${f.x} ${f.z}L${tipX} ${tipZ}M${tipX - dx * head - dz * head} ${tipZ - dz * head + dx * head}L${tipX} ${tipZ}L${tipX - dx * head + dz * head} ${tipZ - dz * head - dx * head}`} fill="none" stroke="#173f31" strokeWidth={.04 / project.scale} />
        <text x={tipX + .12 / project.scale} y={tipZ} fontSize={.14 / project.scale} fill="#173f31">Передняя сторона</text>
      </g>;
    })}
    {!mini && project.rooms.map(r => {
      const [x, z] = center(r);
      return <g key={`label-${r.id}`} pointerEvents="none" transform={`translate(${x},${z})`} className="plan-label">
        <text textAnchor="middle" y="-.1">
          {r.name}
        </text>
        <text textAnchor="middle" y=".22" className="area-label">
          {`≈ ${(area(r.polygon) * project.scale ** 2).toFixed(2).replace('.', ',')} м²`}
        </text>
      </g>
    })}
    {!mini && electricalVisible && <g className="electrical-layer">
      {variant.electrical.connections.map(c => {
        const from = variant.electrical.points.find(pt => pt.id === c.from)!, to = variant.electrical.points.find(pt => pt.id === c.to)!;
        return <line key={c.id} x1={from.x} y1={from.z} x2={to.x} y2={to.z} className="electrical-connection" pointerEvents="none"><title>Условная связь</title></line>;
      })}
      {variant.electrical.points.map(pt => <g key={pt.id} className={`electrical-point ${pt.id === selectedElectrical ? 'selected' : ''}`} transform={`translate(${pt.x} ${pt.z})`} role="button" tabIndex={0} aria-label={`Выбрать точку: ${pt.label || electricalNames[pt.type]}`} onPointerDown={e => start(e, pt, 'electrical')} onClick={e => {
        e.stopPropagation(); onSelect(pt.roomId); onElectrical?.(pt.id);
      }} onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(pt.roomId); onElectrical?.(pt.id) }
      }}>
        <title>{`${pt.label || electricalNames[pt.type]} · ${Math.round(pt.height * 100)} см от пола`}</title>
        <circle r=".31" fill="transparent" className="electrical-hit" />
        <circle r=".18" className="electrical-marker" pointerEvents="none" />
        <text textAnchor="middle" dominantBaseline="central" className="electrical-symbol" pointerEvents="none">{electricalSymbols[pt.type]}</text>
        {pt.label && <text x=".24" y="-.2" className="electrical-label" pointerEvents="none">{pt.label}</text>}
      </g>)}
    </g>}
    {!mini && engineeringVisible && <g className="engineering-layer">
      {project.rooms.filter(r => heatedRoomIds.has(r.id)).map(r => <polygon key={`hf-${r.id}`} points={r.polygon.map(p => p.join(',')).join(' ')} fill="#e67e22" opacity=".11" pointerEvents="none" />)}
      {(variant.engineering?.items ?? []).map(it => <g key={it.id} className={`engineering-point ${it.id === selectedEngineering ? 'selected' : ''}`} transform={`translate(${it.x} ${it.z})`} role="button" tabIndex={0} aria-label={`Выбрать отметку: ${it.label || engineeringNames[it.type]}`} onPointerDown={e => start(e, it, 'engineering')} onClick={e => {
        e.stopPropagation(); onSelect(it.roomId); onEngineering?.(it.id);
      }} onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(it.roomId); onEngineering?.(it.id); }
      }}>
        <title>{`${it.label || engineeringNames[it.type]}`}</title>
        <rect x="-.24" y="-.2" width=".48" height=".4" fill="transparent" />
        <rect x="-.2" y="-.16" width=".4" height=".32" rx=".06" className="engineering-marker" pointerEvents="none" />
        <text textAnchor="middle" dominantBaseline="central" className="engineering-symbol" pointerEvents="none">{engineeringSymbols[it.type]}</text>
        {it.label && <text x=".26" y="-.18" className="engineering-label" pointerEvents="none">{it.label}</text>}
      </g>)}
    </g>}
    {!mini && ruler && (() => {
      const distM = Math.hypot(ruler.b[0] - ruler.a[0], ruler.b[1] - ruler.a[1]) * project.scale;
      const mx = (ruler.a[0] + ruler.b[0]) / 2, my = (ruler.a[1] + ruler.b[1]) / 2;
      const label = distM >= 1 ? `${Math.round(distM * 100)} см (${distM.toFixed(2).replace('.', ',')} м)` : `${Math.round(distM * 100)} см`;
      return <g className="ruler-overlay" pointerEvents="none">
        <line x1={ruler.a[0]} y1={ruler.a[1]} x2={ruler.b[0]} y2={ruler.b[1]} stroke="#1f5e4b" strokeWidth=".045" strokeDasharray=".1 .06" />
        <circle cx={ruler.a[0]} cy={ruler.a[1]} r=".07" fill="#1f5e4b" />
        <circle cx={ruler.b[0]} cy={ruler.b[1]} r=".07" fill="#1f5e4b" />
        {distM > .01 && <g transform={`translate(${mx} ${my - .2})`}>
          <rect x="-.95" y="-.18" width="1.9" height=".34" rx=".08" fill="#1f5e4b" />
          <text textAnchor="middle" dominantBaseline="central" fontSize=".16" fill="#fff" fontWeight="600">{label}</text>
        </g>}
      </g>;
    })()}
    {!mini && auditOverlay && <g className="audit-overlay" pointerEvents="none">
      {auditOverlay.dirtyZone && <>
        <polygon points={auditOverlay.dirtyZone.viewCone.map(p => p.join(',')).join(' ')} fill="#6b5e9c" fillOpacity=".08" stroke="#6b5e9c" strokeWidth=".018" strokeDasharray=".08 .06" />
        <polygon points={auditOverlay.dirtyZone.polygon.map(p => p.join(',')).join(' ')} fill="#9b6633" fillOpacity=".20" stroke="#8a5625" strokeWidth=".03" strokeDasharray=".09 .05" />
        <text x={(auditOverlay.dirtyZone.polygon[0][0] + auditOverlay.dirtyZone.polygon[2][0]) / 2} y={(auditOverlay.dirtyZone.polygon[0][1] + auditOverlay.dirtyZone.polygon[2][1]) / 2} textAnchor="middle" fontSize=".15" fontWeight="650" fill="#6d4016">Грязная зона</text>
      </>}
      {auditOverlay.plumbing.map(run => {
        const stroke = run.severity === 'error' ? '#b83227' : run.severity === 'warn' ? '#c27416' : '#2c6b94';
        const mx = (run.from[0] + run.to[0]) / 2, my = (run.from[1] + run.to[1]) / 2;
        return <g key={`pl-${run.furnitureId}`}>
          <line x1={run.from[0]} y1={run.from[1]} x2={run.to[0]} y2={run.to[1]} stroke={stroke} strokeWidth=".032" strokeDasharray=".08 .05" />
          <text x={mx} y={my - .06} textAnchor="middle" fontSize=".13" fontWeight="650" fill={stroke}>{`${run.distanceM.toFixed(1)}м (+${Math.ceil(run.requiredRiseCm)}см)`}</text>
        </g>;
      })}
      {highlightedDelivery && highlightedDelivery.pathPoints.length >= 2 && (() => {
        const stroke = highlightedDelivery.status === 'blocked' ? '#b83227' : highlightedDelivery.status === 'tight' ? '#c27416' : '#1f7a54';
        const dPath = highlightedDelivery.pathPoints.map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt[0]} ${pt[1]}`).join(' ');
        return <g className="delivery-route">
          <path d={dPath} fill="none" stroke={stroke} strokeWidth=".065" strokeDasharray=".16 .08" strokeLinecap="round" strokeLinejoin="round" />
          {highlightedDelivery.pathPoints.map((pt, idx) => <circle key={idx} cx={pt[0]} cy={pt[1]} r=".08" fill={stroke} />)}
        </g>;
      })()}
    </g>}
    {cameraPose && (() => {
      // Forward vector in plan coordinates from Three.js YXZ yaw: (-sin(yaw), -cos(yaw))
      const fx = -Math.sin(cameraPose.yaw), fz = -Math.cos(cameraPose.yaw);
      const halfFov = (cameraPose.mode === 'walk' ? 37 : 26) * Math.PI / 180;
      const dist = cameraPose.mode === 'walk' ? (mini ? 2.1 : 1.7) : (mini ? 2.8 : 2.2);
      const rot = (dx: number, dz: number, a: number): Point => [dx * Math.cos(a) - dz * Math.sin(a), dx * Math.sin(a) + dz * Math.cos(a)];
      const [lx, lz] = rot(fx, fz, -halfFov);
      const [rx, rz] = rot(fx, fz, halfFov);
      const x1 = cameraPose.x + lx * dist, y1 = cameraPose.z + lz * dist;
      const x2 = cameraPose.x + rx * dist, y2 = cameraPose.z + rz * dist;
      return <g className="camera-cone" pointerEvents="none">
        <path d={`M${cameraPose.x} ${cameraPose.z}L${x1} ${y1}A${dist} ${dist} 0 0 1 ${x2} ${y2}Z`} fill="#1f6b54" fillOpacity=".24" stroke="#1f6b54" strokeWidth={mini ? .05 : .03} />
        <circle cx={cameraPose.x} cy={cameraPose.z} r={mini ? .22 : .15} fill="#1f6b54" stroke="#fff" strokeWidth={mini ? .06 : .04} />
      </g>;
    })()}
    {!mini && <>
      <path d={`M-.45 0V${facadeZ}M-.58 0h.26M-.58 ${facadeZ}h.26`} stroke="#a9aa9f" strokeWidth=".025" />
      <text transform={`translate(-.62 ${facadeZ / 2}) rotate(-90)`} textAnchor="middle" className="dimension-label">
        ≈
        {(facadeZ * project.scale).toFixed(2)}
        м
      </text>
      <path d={`M0 ${maxZ + .4}H${maxX}M0 ${maxZ + .25}v.3M${maxX} ${maxZ + .25}v.3`} stroke="#a9aa9f" strokeWidth=".025" />
      <text x={maxX / 2} y={maxZ + .75} textAnchor="middle" className="dimension-label">
        ≈
        {(maxX * project.scale).toFixed(2)}
        м · демо-планировка
      </text>
    </>}
  </svg>
}
