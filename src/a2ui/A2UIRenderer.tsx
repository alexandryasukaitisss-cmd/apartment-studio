import { type ReactNode, useMemo } from 'react';
import { AlertTriangle, ArrowUpRight, Info, Layers, Plus } from 'lucide-react';
import {
  type A2UIAction,
  type A2UIComponent,
  type A2UIMessage,
  type A2UISurfaceState,
  type AllowedAgentFunctionName,
  reduceA2UIMessages,
  resolveBindableString,
} from './protocol';

function renderNode(
  id: string,
  surface: A2UISurfaceState,
  onAction: (name: AllowedAgentFunctionName, args?: Record<string, unknown>) => void,
  visited: Set<string>,
  depth: number,
): ReactNode {
  if (depth > 24 || visited.has(id)) return null;
  const comp: A2UIComponent | undefined = surface.components.get(id);
  if (!comp) return null;
  const nextVisited = new Set(visited);
  nextVisited.add(id);
  const dm = surface.dataModel;
  const kids = (comp.children ?? []).map(cid => renderNode(cid, surface, onAction, nextVisited, depth + 1));

  const trigger = (action?: A2UIAction) => {
    if (!action?.callAgentFunction) return;
    onAction(action.callAgentFunction.name, action.callAgentFunction.args);
  };

  switch (comp.component) {
    case 'Column':
      return <div key={id} className="a2ui-col">{kids}</div>;
    case 'Row':
      return <div key={id} className="a2ui-row">{kids}</div>;
    case 'Card':
      return <div key={id} className="a2ui-card">{kids}</div>;
    case 'Divider':
      return <hr key={id} className="a2ui-divider" />;
    case 'Text': {
      const content = resolveBindableString(comp.text, dm);
      if (comp.variant === 'h1' || comp.variant === 'h2') return <h3 key={id} className="a2ui-h2">{content}</h3>;
      if (comp.variant === 'h3') return <h4 key={id} className="a2ui-h3">{content}</h4>;
      if (comp.variant === 'caption') return <p key={id} className="a2ui-caption">{content}</p>;
      return <p key={id} className="a2ui-body">{content}</p>;
    }
    case 'Badge':
      return <span key={id} className={`a2ui-badge tone-${comp.tone ?? 'neutral'}`}>
        {resolveBindableString(comp.text ?? comp.label, dm)}
      </span>;
    case 'Metric':
      return <div key={id} className="a2ui-metric">
        <span>{resolveBindableString(comp.label, dm)}</span>
        <b>{resolveBindableString(comp.value, dm)}</b>
        {comp.hint && <small>{resolveBindableString(comp.hint, dm)}</small>}
      </div>;
    case 'Button':
      return <button
        key={id}
        className={`a2ui-btn ${comp.variant === 'primary' ? 'primary' : 'outline'}`}
        onClick={() => trigger(comp.action)}
      >
        {resolveBindableString(comp.label ?? comp.text, dm)}
      </button>;
    case 'StylePresetCard':
      return <button key={id} className="style-preset-card a2ui-domain-card" onClick={() => trigger(comp.action)}>
        {comp.swatches && comp.swatches.length > 0 && <div className="style-dots">
          {comp.swatches.map((hex, i) => <span key={i} style={{ background: hex }} />)}
        </div>}
        <div className="a2ui-domain-copy">
          <strong>{resolveBindableString(comp.title, dm)}</strong>
          {comp.subtitle && <small>{resolveBindableString(comp.subtitle, dm)}</small>}
        </div>
        <ArrowUpRight size={14} className="a2ui-domain-icon" />
      </button>;
    case 'AuditFixCard':
      return <div key={id} className={`audit-issue sev-${comp.severity ?? 'info'} a2ui-fix-card`}>
        <div className="audit-issue-head">
          {comp.severity === 'error' || comp.severity === 'warn' ? <AlertTriangle size={14} /> : <Info size={14} />}
          <strong>{resolveBindableString(comp.title, dm)}</strong>
        </div>
        {comp.detail && <p>{resolveBindableString(comp.detail, dm)}</p>}
        {comp.action && <button className="roadmap-preview-btn" onClick={() => trigger(comp.action)}>
          {resolveBindableString(comp.actionLabel ?? comp.label, dm) || 'Применить'}
        </button>}
      </div>;
    case 'FurnitureCard':
      return <div key={id} className="a2ui-furniture-card">
        <div className="a2ui-furniture-head">
          <strong>{resolveBindableString(comp.title, dm)}</strong>
          {comp.dimsText && <span className="audit-pill ok">{resolveBindableString(comp.dimsText, dm)}</span>}
        </div>
        {comp.note && <small>{resolveBindableString(comp.note, dm)}</small>}
        {comp.action && <button className="roadmap-preview-btn" onClick={() => trigger(comp.action)}>
          <Plus size={12} /> {resolveBindableString(comp.actionLabel, dm) || 'Добавить в комнату'}
        </button>}
      </div>;
    case 'StagePreviewBar':
      return <button key={id} className="a2ui-stage-btn" onClick={() => trigger(comp.action)}>
        <Layers size={13} />
        <span>{resolveBindableString(comp.label ?? comp.title, dm)}</span>
      </button>;
    default:
      return null;
  }
}

export default function A2UIRenderer({
  messages,
  onAction,
}: {
  messages: A2UIMessage[];
  onAction: (name: AllowedAgentFunctionName, args?: Record<string, unknown>) => void;
}) {
  const surfaces = useMemo(() => [...reduceA2UIMessages(messages).values()], [messages]);
  if (surfaces.length === 0) return null;

  return <div className="a2ui-surfaces" data-a2ui-version="1.0">
    {surfaces.map(surface => {
      const rootId = surface.components.has('root')
        ? 'root'
        : surface.components.keys().next().value;
      if (!rootId) return null;
      return <section key={surface.surfaceId} className="a2ui-surface" data-surface-id={surface.surfaceId}>
        {renderNode(rootId, surface, onAction, new Set(), 0)}
      </section>;
    })}
  </div>;
}
