import { type Project, type RenovationStage, type RoadmapStatus, type Variant } from './model';
import { buildRenovationRoadmap } from './renovationRoadmap';

const statusLabels: Record<RoadmapStatus, string> = {
  todo: 'Не начат',
  in_progress: 'В работе',
  done: 'Готово',
};

const nextStatus: Record<RoadmapStatus, RoadmapStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
};

export default function RoadmapPanel({
  project, variant, reserve, onSetStatus, onPreviewStage,
}: {
  project: Project;
  variant: Variant;
  reserve: number;
  onSetStatus?: (stepId: string, status: RoadmapStatus) => void;
  onPreviewStage?: (stage: RenovationStage) => void;
}) {
  const steps = buildRenovationRoadmap(project, variant, reserve);
  const doneCount = steps.filter(s => s.status === 'done').length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return <details className="roadmap-section" open>
    <summary>Этапы ремонта ({doneCount} из {steps.length} готово)</summary>
    <div className="roadmap-progress" aria-label={`Готовность ремонта: ${pct}%`}>
      <div className="roadmap-progress-bar" style={{ width: `${pct}%` }} />
    </div>
    <p className="small-note">Порядок работ привязан к вашим площадям, электрике и смете. Нажимайте на статус этапа, чтобы отмечать прогресс.</p>
    <div className="roadmap-list">
      {steps.map(step => <div key={step.id} className={`roadmap-card status-${step.status}`}>
        <div className="roadmap-head">
          <strong>{step.order}. {step.title}</strong>
          {onSetStatus ? <button className={`roadmap-status-pill ${step.status}`} onClick={() => onSetStatus(step.id, nextStatus[step.status])}>
            {statusLabels[step.status]}
          </button> : <span className={`roadmap-status-pill ${step.status}`}>{statusLabels[step.status]}</span>}
        </div>
        <span className="roadmap-summary">{step.summary}</span>
        <div className="roadmap-footer">
          <small>Оценка: <b>{step.budgetText}</b></small>
          {onPreviewStage && <button className="roadmap-preview-btn" onClick={() => onPreviewStage(step.sceneStage)}>
            Показать стадию в 3D
          </button>}
        </div>
      </div>)}
    </div>
  </details>;
}
