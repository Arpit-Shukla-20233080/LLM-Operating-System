import { useEffect, useState, useCallback } from 'react';
import { useConfigStore } from '../../stores/configStore';

const COMMON_MODELS = [
  'gemini/gemini-2.5-flash-lite',
  'gemini/gemini-2.0-flash-exp',
  'anthropic/claude-opus-4-5',
  'anthropic/claude-3-5-sonnet-20241022',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/o1-mini',
];

type Section = 'model' | 'provider' | 'tools' | 'mcp';

export default function Settings(_props: Record<string, unknown>) {
  const { config, isDirty, loading, error, fetch: fetchConfig, update, save, reload } =
    useConfigStore();
  const [section, setSection] = useState<Section>('model');
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reloadChanges, setReloadChanges] = useState<string[] | null>(null);

  useEffect(() => {
    if (!config) fetchConfig();
  }, [config, fetchConfig]);

  const handleSave = useCallback(async () => {
    const result = await save();
    setSaveMsg({ ok: result.ok, text: result.message });
    setTimeout(() => setSaveMsg(null), 4000);
  }, [save]);

  const handleReload = useCallback(async () => {
    const result = await reload();
    setReloadChanges(result.changes);
    setTimeout(() => setReloadChanges(null), 6000);
  }, [reload]);

  const get = useCallback(
    (path: string[]) => {
      if (!config) return undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cur: any = config;
      for (const key of path) {
        if (cur == null) return undefined;
        cur = cur[key];
      }
      return cur;
    },
    [config],
  );

  if (loading) return <div className="settings-loading">Loading config…</div>;
  if (error) return <div className="settings-error">❌ {error}</div>;
  if (!config) return <div className="settings-loading">No config loaded.</div>;

  const SECTIONS: { key: Section; label: string; icon: string }[] = [
    { key: 'model', label: 'Model', icon: '🧠' },
    { key: 'provider', label: 'Provider', icon: '🔑' },
    { key: 'tools', label: 'Tools', icon: '🛠️' },
    { key: 'mcp', label: 'MCP Servers', icon: '🔌' },
  ];

  return (
    <div className="settings">
      {/* ── Sidebar ───────────────────────────────────────────── */}
      <nav className="settings-nav">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={`settings-nav-item${section === s.key ? ' settings-nav-item--active' : ''}`}
            onClick={() => setSection(s.key)}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="settings-content">
        {section === 'model' && (
          <ModelSection get={get} update={update} />
        )}
        {section === 'provider' && (
          <ProviderSection get={get} update={update} />
        )}
        {section === 'tools' && (
          <ToolsSection get={get} update={update} />
        )}
        {section === 'mcp' && (
          <McpSection config={config} />
        )}

        {/* ── Action bar ─────────────────────────────────────── */}
        <div className="settings-actions">
          <button
            className={`settings-btn settings-btn--save${isDirty ? ' settings-btn--dirty' : ''}`}
            onClick={handleSave}
            disabled={!isDirty}
          >
            💾 Save
          </button>
          <button className="settings-btn" onClick={handleReload}>
            🔄 Hot Reload
          </button>
          <button className="settings-btn" onClick={fetchConfig}>
            ↺ Refresh
          </button>
        </div>

        {saveMsg && (
          <div className={`settings-toast${saveMsg.ok ? ' settings-toast--ok' : ' settings-toast--err'}`}>
            {saveMsg.ok ? '✅' : '❌'} {saveMsg.text}
          </div>
        )}
        {reloadChanges && (
          <div className="settings-toast settings-toast--ok">
            🔄 Reloaded: {reloadChanges.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section: Model ────────────────────────────────────────────
function ModelSection({
  get,
  update,
}: {
  get: (p: string[]) => unknown;
  update: (p: string[], v: unknown) => void;
}) {
  const modelPath = ['agents', 'defaults', 'model'];
  const tempPath = ['agents', 'defaults', 'temperature'];
  const tokensPath = ['agents', 'defaults', 'maxTokens'];
  const iterPath = ['agents', 'defaults', 'maxToolIterations'];

  const model = (get(modelPath) as string) ?? '';
  const temperature = (get(tempPath) as number) ?? 0.7;
  const maxTokens = (get(tokensPath) as number) ?? 4096;
  const maxIter = (get(iterPath) as number) ?? 10;

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Model & Parameters</h3>

      <label className="settings-field">
        <span className="field-label">Model</span>
        <select
          className="settings-select"
          value={model}
          onChange={(e) => update(modelPath, e.target.value)}
        >
          {COMMON_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          {!COMMON_MODELS.includes(model) && model && (
            <option value={model}>{model}</option>
          )}
        </select>
        <input
          className="settings-input"
          value={model}
          onChange={(e) => update(modelPath, e.target.value)}
          placeholder="or type a custom model string"
          spellCheck={false}
        />
      </label>

      <label className="settings-field">
        <span className="field-label">Temperature <span className="field-value">{temperature.toFixed(2)}</span></span>
        <input
          type="range" min={0} max={2} step={0.05}
          className="settings-slider"
          value={temperature}
          onChange={(e) => update(tempPath, parseFloat(e.target.value))}
        />
      </label>

      <label className="settings-field">
        <span className="field-label">Max Tokens</span>
        <input
          type="number" min={256} max={128000} step={256}
          className="settings-input"
          value={maxTokens}
          onChange={(e) => update(tokensPath, parseInt(e.target.value))}
        />
      </label>

      <label className="settings-field">
        <span className="field-label">Max Tool Iterations</span>
        <input
          type="number" min={1} max={50}
          className="settings-input"
          value={maxIter}
          onChange={(e) => update(iterPath, parseInt(e.target.value))}
        />
      </label>

      <p className="settings-hint">ℹ️ Model, temperature, max tokens, and iterations are hot-reloadable.</p>
    </div>
  );
}

// ── Section: Provider ─────────────────────────────────────────
function ProviderSection({
  get,
  update,
}: {
  get: (p: string[]) => unknown;
  update: (p: string[], v: unknown) => void;
}) {
  const providers = ['anthropic', 'openai', 'google', 'ollama'] as const;
  const [activeProvider, setActiveProvider] = useState<string>('anthropic');

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">API Provider</h3>
      <p className="settings-hint">⚠️ API key changes require a hot reload to take effect.</p>

      <div className="settings-tabs">
        {providers.map((p) => (
          <button
            key={p}
            className={`settings-tab${activeProvider === p ? ' settings-tab--active' : ''}`}
            onClick={() => setActiveProvider(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="settings-tab-panel">
        <label className="settings-field">
          <span className="field-label">API Key</span>
          <input
            type="password"
            className="settings-input"
            placeholder="Enter API key (masked on load)"
            value={(get(['providers', activeProvider, 'apiKey']) as string) ?? ''}
            onChange={(e) => update(['providers', activeProvider, 'apiKey'], e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="settings-field">
          <span className="field-label">API Base URL <span className="field-value">(optional)</span></span>
          <input
            type="url"
            className="settings-input"
            placeholder="https://api.example.com/v1"
            value={(get(['providers', activeProvider, 'apiBase']) as string) ?? ''}
            onChange={(e) => update(['providers', activeProvider, 'apiBase'], e.target.value)}
            spellCheck={false}
          />
        </label>
      </div>
    </div>
  );
}

// ── Section: Tools ────────────────────────────────────────────
function ToolsSection({
  get,
  update,
}: {
  get: (p: string[]) => unknown;
  update: (p: string[], v: unknown) => void;
}) {
  const restrictPath = ['tools', 'restrictToWorkspace'];
  const timeoutPath = ['tools', 'exec', 'timeout'];
  const restricted = (get(restrictPath) as boolean) ?? true;
  const timeout = (get(timeoutPath) as number) ?? 30;

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Tool Settings</h3>

      <label className="settings-field settings-field--toggle">
        <span className="field-label">Restrict to workspace</span>
        <button
          className={`settings-toggle${restricted ? ' settings-toggle--on' : ''}`}
          onClick={() => update(restrictPath, !restricted)}
          role="switch"
          aria-checked={restricted}
        >
          <span className="toggle-knob" />
        </button>
      </label>

      <label className="settings-field">
        <span className="field-label">Exec timeout (seconds)</span>
        <input
          type="number" min={5} max={600}
          className="settings-input"
          value={timeout}
          onChange={(e) => update(timeoutPath, parseInt(e.target.value))}
        />
      </label>
    </div>
  );
}

// ── Section: MCP Servers ──────────────────────────────────────
function McpSection({ config }: { config: Record<string, unknown> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const servers: Record<string, any> = (config['mcpServers'] as Record<string, unknown>) ?? {};
  const names = Object.keys(servers);

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">MCP Servers</h3>
      <p className="settings-hint">
        ⚠️ MCP server changes require a <strong>full kernel restart</strong>. They cannot be hot-reloaded.
      </p>

      {names.length === 0 && (
        <div className="settings-empty">No MCP servers configured.</div>
      )}

      <div className="mcp-server-list">
        {names.map((name) => {
          const s = servers[name] as { command?: string; enabled?: boolean };
          return (
            <div key={name} className="mcp-server-card">
              <div className="mcp-server-name">🔌 {name}</div>
              {s.command && (
                <div className="mcp-server-cmd">{s.command}</div>
              )}
              <div className={`mcp-server-status${s.enabled !== false ? ' mcp-status--enabled' : ' mcp-status--disabled'}`}>
                {s.enabled !== false ? 'enabled' : 'disabled'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
