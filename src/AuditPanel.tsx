import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info, Eye, RotateCw, Truck, Droplets, Archive } from 'lucide-react';
import { type FinishAllowance, type Project, type Variant } from './model';
import { doorSwingInfo } from './roomMeasures';
import { runLayoutAudit, STORAGE_CHECKLIST_ITEMS } from './layoutAudit';
import NumberField from './NumberField';

export default function AuditPanel({
  project, variant, roomId, mutate, notify,
  onSelectRoom, onSelectFurniture,
  auditOverlayVisible, onToggleAuditOverlay,
  deliveryHighlightId, onSelectDeliveryItem,
  onOpenEngineering,
}: {
  project: Project;
  variant: Variant;
  roomId: string;
  mutate: (fn: (p: Project) => void) => boolean;
  notify: (msg: string, error?: boolean) => void;
  onSelectRoom?: (id: string) => void;
  onSelectFurniture?: (id: string | null) => void;
  auditOverlayVisible?: boolean;
  onToggleAuditOverlay?: (v: boolean) => void;
  deliveryHighlightId?: string | null;
  onSelectDeliveryItem?: (furnitureId: string | null) => void;
  onOpenEngineering?: () => void;
}) {
  const report = useMemo(() => runLayoutAudit(project, variant), [project, variant]);
  const currentRoom = report.rooms.find(r => r.roomId === roomId);
  const updateAllowance = (patch: Partial<FinishAllowance>) => mutate(p => {
    p.finishAllowance = { ...report.allowance, ...patch };
  });
  const updateStorageItem = (key: string, value: string) => mutate(p => {
    p.storageChecklist ??= {};
    if (value.trim()) p.storageChecklist[key] = value;
    else delete p.storageChecklist[key];
  });
  const flipDoor = (wallIndex: number, openingIndex: number) => {
    if (mutate(p => {
      const w = p.walls[wallIndex];
      const o = w?.openings?.[openingIndex];
      if (!w || !o || o.kind !== 'door') return;
      const currentSwing = doorSwingInfo(p, w, o)?.sign ?? 1;
      o.swing = currentSwing === 1 ? -1 : 1;
    })) {
      notify('Направление открывания двери изменено на наружное.');
    }
  };

  return <div className="audit-panel">
    <div className="audit-summary-cards">
      <div className={`audit-kpi ${report.counts.error > 0 ? 'has-error' : ''}`}>
        <span>Критично</span>
        <b>{report.counts.error}</b>
      </div>
      <div className={`audit-kpi ${report.counts.warn > 0 ? 'has-warn' : ''}`}>
        <span>Риски</span>
        <b>{report.counts.warn}</b>
      </div>
      <div className="audit-kpi">
        <span>Советы</span>
        <b>{report.counts.info}</b>
      </div>
    </div>

    {onToggleAuditOverlay && <button className={`wide ${auditOverlayVisible ? 'primary' : 'outline'}`} onClick={() => onToggleAuditOverlay(!auditOverlayVisible)}>
      <Eye size={15} />
      {auditOverlayVisible ? 'Скрыть слой аудита на 2D-плане' : 'Показать грязную зону, трассы и занос на 2D'}
    </button>}

    <div className="section-fields">
      <strong>Чистовой запас отделки</strong>
      <p className="small-note">Штукатурка, стяжка и потолок «съедают» реальные сантиметры. Аудит проверяет, влезет ли мебель после выравнивания стен.</p>
      <NumberField label="Штукатурка / плитка на стену" value={report.allowance.wallCm} min={0} max={15} unit="см" onChange={v => updateAllowance({ wallCm: v })} />
      <NumberField label="Стяжка + чистовой пол" value={report.allowance.floorCm} min={0} max={25} unit="см" onChange={v => updateAllowance({ floorCm: v })} />
      <NumberField label="Опуск потолка (ГКЛ/натяжной)" value={report.allowance.ceilingCm} min={0} max={30} unit="см" onChange={v => updateAllowance({ ceilingCm: v })} />
      {currentRoom && <div className="size-summary" aria-label="Чистовые габариты комнаты">
        <span>Чистовые стены ({currentRoom.roomName})</span>
        <b>{`${currentRoom.netWidthCm} × ${currentRoom.netDepthCm} см`}</b>
        <span>Чистовая высота потолка</span>
        <b>{`${currentRoom.netCeilingCm} см`}</b>
        <span>Натяжной потолок</span>
        <b>{currentRoom.seamlessCeilingOk ? 'Без шва (≤ 5 м)' : 'Нужен шов / профиль'}</b>
      </div>}
      {currentRoom?.needsVentilationReminder && <p className="small-note">Для спальни/кабинета около 12 м² заложите приточную вентиляцию (бризер или клапан), чтобы не спать с открытым окном.</p>}
    </div>

    <div className="audit-issues-block">
      <strong>Замечания и проверки ({report.issues.length})</strong>
      {report.issues.length === 0 ? <p className="audit-ok-note"><CheckCircle2 size={15} /> Критических замечаний по планировке не найдено.</p> : <div className="audit-issue-list">
        {report.issues.map(issue => <div key={issue.id} className={`audit-issue sev-${issue.severity}`}>
          <div className="audit-issue-head" onClick={() => {
            if (issue.roomId) onSelectRoom?.(issue.roomId);
            if (issue.furnitureId) onSelectFurniture?.(issue.furnitureId);
          }}>
            {issue.severity === 'error' ? <AlertTriangle size={14} /> : issue.severity === 'warn' ? <AlertTriangle size={14} /> : <Info size={14} />}
            <strong>{issue.title}</strong>
          </div>
          <p>{issue.detail}</p>
          {issue.action?.type === 'flip_door' && <button className="roadmap-preview-btn" onClick={() => flipDoor(issue.action!.wallIndex, issue.action!.openingIndex)}>
            <RotateCw size={12} /> Перевернуть дверь наружу
          </button>}
        </div>)}
      </div>}
    </div>

    <details className="audit-details" open>
      <summary><Truck size={14} /> Занос крупной мебели от входа ({report.delivery.length})</summary>
      <p className="small-note">Проверка проёмов (−8 см на коробку) и поворота 90° в коридоре. Клик по предмету подсветит маршрут на плане 2D.</p>
      <div className="audit-compact-list">
        {report.delivery.map(d => <button key={d.furnitureId} className={`audit-row status-${d.status} ${deliveryHighlightId === d.furnitureId ? 'active' : ''}`} onClick={() => {
          onSelectDeliveryItem?.(deliveryHighlightId === d.furnitureId ? null : d.furnitureId);
          onToggleAuditOverlay?.(true);
        }}>
          <div className="audit-row-top">
            <strong>{d.label}</strong>
            <span className={`audit-pill ${d.status}`}>{d.status === 'ok' ? 'Пройдёт' : d.status === 'tight' ? 'Боком / разбор' : 'Риск'}</span>
          </div>
          <small>{d.reason}</small>
        </button>)}
      </div>
    </details>

    <details className="audit-details">
      <summary><Droplets size={14} /> Сантехника и уклон канализации ({report.plumbing.length})</summary>
      {!report.hasRiserMarkers && <div className="audit-tip-box">
        <p className="small-note">Отметка стояка «Ст» пока не поставлена — расчёт ориентировочный. Поставьте реальный стояк в слое «Инженерия» для точных уклонов.</p>
        {onOpenEngineering && <button className="roadmap-preview-btn" onClick={onOpenEngineering}>Поставить стояк на плане</button>}
      </div>}
      <div className="audit-compact-list">
        {report.plumbing.map(run => <div key={run.furnitureId} className={`audit-row status-${run.severity === 'ok' ? 'ok' : run.severity === 'warn' ? 'tight' : 'blocked'}`}>
          <div className="audit-row-top">
            <strong>{run.label}</strong>
            <span className={`audit-pill ${run.severity === 'ok' ? 'ok' : run.severity === 'warn' ? 'tight' : 'blocked'}`}>
              {`${run.distanceM.toFixed(1).replace('.', ',')} м · +${Math.ceil(run.requiredRiseCm)} см`}
            </span>
          </div>
          <small>{run.note}</small>
        </div>)}
      </div>
    </details>

    <details className="audit-details">
      <summary><Archive size={14} /> Хранение ({report.storage.ratioPct}%) и хоз-чеклист</summary>
      <p className="small-note">{report.storage.note}</p>
      <div className="size-summary">
        <span>Площадь хранения</span><b>{`${report.storage.totalStorageM2.toFixed(2).replace('.', ',')} м²`}</b>
        <span>Шкафов (погонных)</span><b>{`${report.storage.totalLinearM.toFixed(1).replace('.', ',')} пог. м`}</b>
      </div>
      <div className="storage-checklist">
        <p className="small-note">Запишите, куда спрячете бытовые вещи — чтобы не забыть на этапе заказа шкафов и розеток:</p>
        {STORAGE_CHECKLIST_ITEMS.map(item => <label className="field" key={item.key}>
          <span>{item.label}</span>
          <input
            aria-label={item.label}
            value={project.storageChecklist?.[item.key] ?? ''}
            maxLength={120}
            placeholder="Напр. гардеробная / шкаф прихожей / балкон"
            onChange={e => updateStorageItem(item.key, e.target.value)}
          />
        </label>)}
      </div>
    </details>
  </div>;
}
