import { useEffect, useState } from 'react';
import { Copy, Loader2, Send, Terminal } from 'lucide-react';
import { type Project, type Variant } from './model';
import { type A2UIMessage, type AllowedAgentFunctionName } from './a2ui/protocol';
import { buildAgentContext, generateOfflineA2UISurface } from './a2ui/offlineAdvisor';
import { executeA2UIAgentFunction, type AgentActionHandlers } from './a2ui/actions';
import A2UIRenderer from './a2ui/A2UIRenderer';

export interface ProviderStatus {
  id: 'codex' | 'claude' | 'opencode' | 'gemini' | 'ollama';
  name: string;
  available: boolean;
  command?: string | null;
}

const QUICK_PROMPTS = [
  'Проведи аудит и исправь проблемы',
  'Подбери стиль всей квартиры',
  'Что добавить в текущую комнату?',
  'Покажи стадии ремонта и хранение',
];

export default function AgentPanel({
  project, variant, roomId, actionHandlers,
}: {
  project: Project;
  variant: Variant;
  roomId: string;
  actionHandlers: AgentActionHandlers;
}) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<'auto' | 'codex' | 'claude' | 'opencode' | 'gemini' | 'ollama' | 'offline'>('auto');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ provider: string; model: string; elapsedMs?: number } | null>(null);
  const [hasCustomRun, setHasCustomRun] = useState(false);
  const [messages, setMessages] = useState<A2UIMessage[]>(() =>
    generateOfflineA2UISurface('Проведи аудит и покажи рекомендации', project, variant, roomId),
  );

  // Keep initial / offline surface reactive when the user switches rooms or edits the variant.
  useEffect(() => {
    if (!hasCustomRun || provider === 'offline') {
      setMessages(generateOfflineA2UISurface(prompt.trim() || 'Проведи аудит и покажи рекомендации', project, variant, roomId));
    }
  }, [project, variant, roomId, hasCustomRun, provider]);

  useEffect(() => {
    let active = true;
    void fetch('/api/agent/providers')
      .then(async res => {
        if (!res.ok) throw Error('unavailable');
        const data = await res.json();
        if (!active) return;
        const list = Array.isArray(data.providers) ? (data.providers as ProviderStatus[]) : [];
        setProviders(list);
        setServerOnline(true);
        if (!list.some(p => p.available)) setProvider('offline');
      })
      .catch(() => {
        if (!active) return;
        setServerOnline(false);
        setProvider('offline');
      });
    return () => { active = false; };
  }, []);

  const availableCount = providers.filter(p => p.available).length;

  async function runQuery(customPrompt?: string) {
    const q = (customPrompt ?? prompt).trim();
    if (!q || busy) return;
    setHasCustomRun(true);
    if (customPrompt) setPrompt(customPrompt);

    if (provider === 'offline' || serverOnline === false) {
      const offlineMsgs = generateOfflineA2UISurface(q, project, variant, roomId);
      setMessages(offlineMsgs);
      setMeta({ provider: 'offline', model: 'built-in A2UI 1.0' });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/agent/a2ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          ...(model.trim() ? { model: model.trim() } : {}),
          prompt: q,
          context: buildAgentContext(project, variant, roomId),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.message || data.error || 'Агент не ответил.');
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(data.messages as A2UIMessage[]);
        setMeta({ provider: data.provider || provider, model: data.model || 'default', elapsedMs: data.elapsedMs });
      } else {
        throw Error('Агент вернул пустой A2UI-ответ.');
      }
    } catch (e) {
      actionHandlers.notify((e as Error).message || 'Не удалось связаться с локальным CLI-агентом.', true);
      const fallback = generateOfflineA2UISurface(q, project, variant, roomId);
      setMessages(fallback);
      setMeta({ provider: 'offline (fallback)', model: 'built-in A2UI 1.0' });
    } finally {
      setBusy(false);
    }
  }

  const handleAction = (name: AllowedAgentFunctionName, args?: Record<string, unknown>) => {
    executeA2UIAgentFunction(name, args, project, actionHandlers);
  };

  const copyProtocolJson = () => {
    const text = JSON.stringify(messages, null, 2);
    void navigator.clipboard?.writeText(text).then(
      () => actionHandlers.notify('A2UI 1.0 JSON скопирован в буфер обмена.'),
      () => actionHandlers.notify('Не удалось скопировать в буфер обмена.', true),
    );
  };

  return <div className="agent-panel">
    <div className="agent-spec-head">
      <div className="agent-title-row">
        <Terminal size={14} />
        <strong>AI-помощник (A2UI 1.0)</strong>
        <span className={`audit-pill ${availableCount > 0 ? 'ok' : 'tight'}`}>
          {serverOnline === false ? 'Офлайн' : availableCount > 0 ? `${availableCount} CLI` : 'Локально'}
        </span>
      </div>
      <p className="small-note">
        Карточки действий по текущему плану и комнате. Любое изменение отменяется через ⌘Z.
      </p>
    </div>

    <div className="section-fields">
      <label className="field">
        <span>CLI-агент</span>
        <select aria-label="Выбор AI CLI провайдера" value={provider} onChange={e => setProvider(e.target.value as typeof provider)}>
          <option value="auto" disabled={serverOnline === false || availableCount === 0}>Авто (первый доступный CLI)</option>
          <option value="codex" disabled={!providers.find(p => p.id === 'codex')?.available}>Codex CLI (codex)</option>
          <option value="claude" disabled={!providers.find(p => p.id === 'claude')?.available}>Claude Code (claude)</option>
          <option value="opencode" disabled={!providers.find(p => p.id === 'opencode')?.available}>OpenCode (opencode)</option>
          <option value="gemini" disabled={!providers.find(p => p.id === 'gemini')?.available}>Gemini CLI (gemini)</option>
          <option value="ollama" disabled={!providers.find(p => p.id === 'ollama')?.available}>Ollama (локально)</option>
          <option value="offline">Встроенный офлайн A2UI</option>
        </select>
      </label>
      {provider !== 'offline' && <label className="field">
        <span>Модель (опц.)</span>
        <input
          aria-label="Модель CLI-агента"
          value={model}
          maxLength={120}
          placeholder="Напр. gpt-6.2-sol, sonnet, gemini-2.5-pro"
          onChange={e => setModel(e.target.value)}
        />
      </label>}
    </div>

    <div className="agent-quick-chips">
      {QUICK_PROMPTS.map(q => <button key={q} className="agent-chip" disabled={busy} onClick={() => void runQuery(q)}>
        {q}
      </button>)}
    </div>

    <form className="agent-prompt-form" onSubmit={e => { e.preventDefault(); void runQuery(); }}>
      <textarea
        rows={2}
        aria-label="Запрос AI-помощнику по ремонту"
        placeholder="Спросите про перестановку, стиль, блики на ТВ, бюджет или аудит…"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
      />
      <button type="submit" className="wide primary" disabled={busy || !prompt.trim()}>
        {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
        {busy ? 'Агент собирает A2UI-поверхность…' : 'Сгенерировать A2UI-ответ'}
      </button>
    </form>

    {meta && <div className="agent-meta-bar">
      <Terminal size={12} />
      <span>{`${meta.provider} · ${meta.model}${meta.elapsedMs ? ` · ${(meta.elapsedMs / 1000).toFixed(1)} с` : ''}`}</span>
    </div>}

    <A2UIRenderer messages={messages} onAction={handleAction} />

    <details className="audit-details">
      <summary>Протокол A2UI 1.0 (JSON) и вызов из терминала</summary>
      <p className="small-note">Из CLI можно вызывать напрямую: <code>npm run agent -- --provider codex --prompt "..."</code> (поддерживает <code>codex</code>, <code>claude</code>, <code>opencode</code>, <code>gemini</code>, <code>ollama</code>, <code>offline</code>).</p>
      <button className="roadmap-preview-btn" onClick={copyProtocolJson}>
        <Copy size={12} /> Скопировать A2UI JSON
      </button>
      <pre className="a2ui-json-preview">{JSON.stringify(messages, null, 2)}</pre>
    </details>
  </div>;
}
