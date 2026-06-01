import { useState, useEffect } from 'react';
import type { MCPStatus } from '../types';
import { 
  getMcpStatus, 
  connectMcp, 
  getAIKeyStatus, 
  saveProviderKeyConfig,
  deleteProviderKeyConfig,
} from '../services/aiService';
import { useConnection } from '../context/ConnectionContext';
import './Settings.css';

const OPENAI_MODELS = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1', 'gpt-4.1-mini'];
const ANTHROPIC_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5-20251001'];
const OPENROUTER_MODELS = ['anthropic/claude-sonnet-4.6','anthropic/claude-opus-4.7','anthropic/claude-haiku-4.5','openai/gpt-5.5', 'openai/gpt-5.5-pro', 'openai/gpt-5.4', 'openai/gpt-5.4-pro', 'openai/gpt-5.3-codex', 'openai/gpt-5.2', 'openai/gpt-5.2-pro', 'openai/gpt-5.2-codex'];

interface SettingsProps {
  initialTab?: 'connections' | 'ai-keys';
  hideTabs?: boolean;
  onClose?: () => void;
}

export default function Settings({ initialTab, hideTabs, onClose }: SettingsProps = {}) {
  const [activeTab, setActiveTab] = useState<'connections' | 'ai-keys'>(initialTab || 'ai-keys');
  const { connections, addConnection, deleteConnection, refreshConnections } = useConnection();

  // Connection form state
  const [connEndpoint, setConnEndpoint] = useState('http://localhost:8123');
  const [connUser, setConnUser] = useState('default');
  const [connPassword, setConnPassword] = useState('');
  const [connBinaryPath, setConnBinaryPath] = useState('');
  const [connBinaryStatus, setConnBinaryStatus] = useState<'checking' | 'found' | 'not_found' | 'error'>('checking');
  const [connBinaryDetected, setConnBinaryDetected] = useState('');
  const [connBinaryEditing, setConnBinaryEditing] = useState(false);
  const [connBinarySaving, setConnBinarySaving] = useState(false);
  const [connAdding, setConnAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState(OPENAI_MODELS[0]);
  const [anthropicModel, setAnthropicModel] = useState(ANTHROPIC_MODELS[0]);
  const [openrouterModel, setOpenrouterModel] = useState(OPENROUTER_MODELS[0]);
  const [showOpenai, setShowOpenai] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showOpenrouter, setShowOpenrouter] = useState(false);
  const [keyStatus, setKeyStatus] = useState<Awaited<ReturnType<typeof getAIKeyStatus>>>({
    openai: false,
    anthropic: false,
    openrouter: false,
  });


  const [mcpStatus, setMcpStatus] = useState<MCPStatus>({ connected: false, tools: [] });


  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    if (activeTab !== 'connections') return;
    setConnBinaryStatus('checking');
    fetch('/api/query/find-clickhouse-binary')
      .then((r) => r.json())
      .then((data: { found: boolean; path?: string }) => {
        if (data.found && data.path) {
          setConnBinaryStatus('found');
          setConnBinaryDetected(data.path);
        } else {
          setConnBinaryStatus('not_found');
        }
      })
      .catch(() => setConnBinaryStatus('error'));
  }, [activeTab]);

  async function saveBinaryPath() {
    if (!connBinaryPath.trim()) return;
    setConnBinarySaving(true);
    try {
      const res = await fetch('/api/query/update-clickhouse-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: connBinaryPath.trim() }),
      });
      const data: { success?: boolean; error?: string } = await res.json();
      if (res.ok && data.success) {
        setConnBinaryStatus('found');
        setConnBinaryDetected(connBinaryPath.trim());
        setConnBinaryPath('');
        setConnBinaryEditing(false);
        setSaveResult({ type: 'success', message: 'Binary path saved.' });
      } else {
        setSaveResult({ type: 'error', message: data.error ?? 'Invalid binary path.' });
      }
    } catch (err: any) {
      setSaveResult({ type: 'error', message: err.message || 'Failed to update binary path.' });
    } finally {
      setConnBinarySaving(false);
    }
  }

  useEffect(() => {
    if (saveResult) {
      const t = setTimeout(() => setSaveResult(null), 4000);
      return () => clearTimeout(t);
    }
  }, [saveResult]);

  async function loadStatus() {
    try {
      const [status, mcp] = await Promise.all([getAIKeyStatus(), getMcpStatus()]);
      setKeyStatus(status);
      setMcpStatus(mcp);
      if (status.openaiModel) setOpenaiModel(status.openaiModel);
      if (status.anthropicModel) setAnthropicModel(status.anthropicModel);
      if (status.openrouterModel) setOpenrouterModel(status.openrouterModel);
    } catch {

    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveResult(null);
    try {
      if (openaiKey.trim() || (keyStatus.openai && openaiModel !== keyStatus.openaiModel)) {
        await saveProviderKeyConfig('openai', openaiKey.trim(), openaiModel);
      }
      if (anthropicKey.trim() || (keyStatus.anthropic && anthropicModel !== keyStatus.anthropicModel)) {
        await saveProviderKeyConfig('anthropic', anthropicKey.trim(), anthropicModel);
      }
      if (openrouterKey.trim() || (keyStatus.openrouter && openrouterModel !== keyStatus.openrouterModel)) {
        await saveProviderKeyConfig('openrouter', openrouterKey.trim(), openrouterModel);
      }


      const newStatus = await getAIKeyStatus();
      setKeyStatus(newStatus);
      setSaveResult({ type: 'success', message: 'Keys securely saved in backend configuration!' });
    } catch (err: any) {
      setSaveResult({ type: 'error', message: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(provider: 'openai' | 'anthropic' | 'openrouter') {
    try {
      await deleteProviderKeyConfig(provider);
      if (provider === 'openai') {
        setOpenaiKey('');
        if (keyStatus.openaiModel) setOpenaiModel(keyStatus.openaiModel);
      } else if (provider === 'anthropic') {
        setAnthropicKey('');
        if (keyStatus.anthropicModel) setAnthropicModel(keyStatus.anthropicModel);
      } else if (provider === 'openrouter') {
        setOpenrouterKey('');
        if (keyStatus.openrouterModel) setOpenrouterModel(keyStatus.openrouterModel);
      }
      const newStatus = await getAIKeyStatus();
      setKeyStatus(newStatus);
      setSaveResult({ type: 'success', message: `${provider} key removed` });
    } catch (err: any) {
      setSaveResult({ type: 'error', message: err.message });
    }
  }



  function handleDiscard() {
    setOpenaiKey('');
    setAnthropicKey('');
    setOpenrouterKey('');
    setShowOpenai(false);
    setShowAnthropic(false);
    setShowOpenrouter(false);
    if (keyStatus.openaiModel) setOpenaiModel(keyStatus.openaiModel);
    if (keyStatus.anthropicModel) setAnthropicModel(keyStatus.anthropicModel);
    if (keyStatus.openrouterModel) setOpenrouterModel(keyStatus.openrouterModel);
    setSaveResult(null);
  }

  return (
    <div className="settings-page">
      <div className={`settings-content ${hideTabs ? 'settings-content-modal' : ''}`}>
        {!hideTabs && (
          <div className="settings-tabs">
            <button
              className={`settings-tab ${activeTab === 'connections' ? 'active' : ''}`}
              onClick={() => setActiveTab('connections')}
            >
              Database Connections
            </button>
            <button
              className={`settings-tab ${activeTab === 'ai-keys' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai-keys')}
            >
              AI Keys (BYOK)
            </button>
          </div>
        )}

        <div className={`settings-panel ${hideTabs ? 'settings-panel-modal' : ''}`}>
          {activeTab === 'ai-keys' && (
            <div className="ai-keys-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">AI Keys Panel</h2>
                  <span className="label-muted">AI Provider Keys</span>
                </div>
                {onClose && (
                  <button className="settings-panel-close" onClick={onClose} aria-label="Close panel">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="security-notice">
                <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ minWidth: 16 }}>
                  <rect x="3" y="8" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 8V5.5a3 3 0 0 1 6 0V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <p>Keys are stored locally using the system credential store.</p>
              </div>


              {/* ── OpenAI ── */}
              <div className="key-field">
                <div className="key-label-row">
                  <div className="key-label-info">
                    <label className="key-label-text">OpenAI</label>
                    {keyStatus.openai && <span className="key-status-badge ok">Active</span>}
                  </div>
                  {keyStatus.openai && (
                    <button className="key-remove-btn" onClick={() => handleDelete('openai')} title="Remove key">✕</button>
                  )}
                </div>
                <div className="key-input-model-row">
                  <div className="key-input-group">
                    <span className="key-provider-icon openai-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 004.981 4.18a5.985 5.985 0 00-3.998 2.9 6.046 6.046 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.26 24a6.056 6.056 0 005.772-4.206 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.747-7.073zM13.26 22.43a4.476 4.476 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.6 18.304a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.771.771 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.033.062L9.74 19.95a4.5 4.5 0 01-6.14-1.646zM2.34 7.896a4.485 4.485 0 012.366-1.973V11.6a.766.766 0 00.388.676l5.815 3.355-2.02 1.168a.076.076 0 01-.071 0l-4.83-2.786A4.504 4.504 0 012.34 7.896zm16.597 3.855l-5.843-3.369 2.02-1.168a.076.076 0 01.071 0l4.83 2.791a4.494 4.494 0 01-.676 8.105v-5.678a.79.79 0 00-.402-.681zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 00-.785 0L9.409 9.23V6.897a.066.066 0 01.028-.061l4.83-2.787a4.5 4.5 0 016.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 01-.038-.057V6.075a4.5 4.5 0 017.375-3.453l-.142.08-4.778 2.758a.795.795 0 00-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
                      </svg>
                    </span>
                    <input
                      className="key-input"
                      type={showOpenai ? 'text' : 'password'}
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder={keyStatus.openai ? '••••••••••••  (key configured)' : 'sk-...'}
                    />
                    <button className="toggle-visibility" onClick={() => setShowOpenai(!showOpenai)} title={showOpenai ? 'Hide' : 'Show'}>
                      {showOpenai ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.2" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" /><path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.2" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" /></svg>
                      )}
                    </button>
                  </div>
                  <select className="model-select" value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)}>
                    {OPENAI_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* ── Anthropic ── */}
              <div className="key-field">
                <div className="key-label-row">
                  <div className="key-label-info">
                    <label className="key-label-text">Anthropic</label>
                    {keyStatus.anthropic && <span className="key-status-badge ok">Active</span>}
                  </div>
                  {keyStatus.anthropic && (
                    <button className="key-remove-btn" onClick={() => handleDelete('anthropic')} title="Remove key">✕</button>
                  )}
                </div>
                <div className="key-input-model-row">
                  <div className="key-input-group">
                    <span className="key-provider-icon anthropic-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.52zm4.132 10.455L8.453 7.687 6.205 13.975h4.496z"/>
                      </svg>
                    </span>
                    <input
                      className="key-input"
                      type={showAnthropic ? 'text' : 'password'}
                      value={anthropicKey}
                      onChange={(e) => setAnthropicKey(e.target.value)}
                      placeholder={keyStatus.anthropic ? '••••••••••••  (key configured)' : 'sk-ant-...'}
                    />
                    <button className="toggle-visibility" onClick={() => setShowAnthropic(!showAnthropic)} title={showAnthropic ? 'Hide' : 'Show'}>
                      {showAnthropic ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.2" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" /><path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.2" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" /></svg>
                      )}
                    </button>
                  </div>
                  <select className="model-select" value={anthropicModel} onChange={(e) => setAnthropicModel(e.target.value)}>
                    {ANTHROPIC_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* ── OpenRouter ── */}
              <div className="key-field">
                <div className="key-label-row">
                  <div className="key-label-info">
                    <label className="key-label-text">OpenRouter</label>
                    {keyStatus.openrouter && <span className="key-status-badge ok">Active</span>}
                  </div>
                  {keyStatus.openrouter && (
                    <button className="key-remove-btn" onClick={() => handleDelete('openrouter')} title="Remove key">✕</button>
                  )}
                </div>
                <div className="key-input-model-row">
                  <div className="key-input-group">
                    <span className="key-provider-icon openrouter-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M16.547 2.853l-.977 1.699 1.334.77-1.552 2.686-1.336-.77-.975 1.699 1.334.77-2.143 3.709-1.785-1.03a5.027 5.027 0 00-.506 2.222c0 2.75 2.186 4.979 4.918 4.979s4.918-2.229 4.918-4.979V9.63l1.95.002V14.1c0 3.813-3.036 6.9-6.776 6.9s-6.775-3.087-6.775-6.9a6.98 6.98 0 01.73-3.143L7.6 9.63l2.924-5.067 1.336.77L12.834 3.8 11.5 3.028l.975-1.7 1.332.77L14.781 0l1.332.77-.977 1.699 1.41.813v-.428zM3.455 9.63H1.5v4.467c0 3.813 3.036 6.9 6.776 6.9a6.702 6.702 0 003.21-.814l-.977-1.699a4.763 4.763 0 01-2.233.555c-2.732 0-4.918-2.229-4.918-4.979V9.63z"/>
                      </svg>
                    </span>
                    <input
                      className="key-input"
                      type={showOpenrouter ? 'text' : 'password'}
                      value={openrouterKey}
                      onChange={(e) => setOpenrouterKey(e.target.value)}
                      placeholder={keyStatus.openrouter ? '••••••••••••  (key configured)' : 'sk-or-...'}
                    />
                    <button className="toggle-visibility" onClick={() => setShowOpenrouter(!showOpenrouter)} title={showOpenrouter ? 'Hide' : 'Show'}>
                      {showOpenrouter ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.2" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" /><path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.2" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" /></svg>
                      )}
                    </button>
                  </div>
                  <select className="model-select" value={openrouterModel} onChange={(e) => setOpenrouterModel(e.target.value)}>
                    {OPENROUTER_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>


              <div className="mcp-status-section">
                <div className="mcp-status-header">
                  <div>
                    <span className="label-muted">MCP Server</span>
                    <span className={`badge ${mcpStatus.connected ? 'badge-success' : 'badge-error'}`} style={{ marginLeft: 10 }}>
                      <span className={`dot ${mcpStatus.connected ? 'dot-green' : 'dot-red'}`} />
                      {mcpStatus.connected ? `Connected (${mcpStatus.tools.length} tools)` : 'Disconnected'}
                    </span>
                  </div>
                </div>
              </div>


              {saveResult && (
                <div className={`save-toast ${saveResult.type}`}>
                  {saveResult.type === 'success' ? '✓ ' : '✕ '}
                  {saveResult.message}
                </div>
              )}

              <div className="panel-actions">
                <button className="btn-secondary" onClick={handleDiscard}>Discard Changes</button>
                <button className="btn-primary save-btn" onClick={handleSave} disabled={saving}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <rect x="1" y="8" width="12" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4 8V5.5a3 3 0 0 1 6 0V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  {saving ? 'Encrypting...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'connections' && (
            <div className="connections-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Database Connections</h2>
                  <span className="label-muted">Manage ClickHouse cluster endpoints</span>
                </div>
                {onClose && (
                  <button className="settings-panel-close" onClick={onClose} aria-label="Close panel">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="settings-section">
                <div className="settings-section-head">
                  <h3 className="settings-section-title">ClickHouse Binary</h3>
                  <span className="settings-section-sub">Shared by all connections — used for query analysis</span>
                </div>
                {connBinaryStatus === 'checking' && (
                  <div className="conn-binary-status conn-binary-status--checking">
                    <span className="conn-binary-spinner" /> Detecting binary…
                  </div>
                )}
                {connBinaryStatus === 'found' && !connBinaryEditing && (
                  <div className="conn-binary-row">
                    <div className="conn-binary-status conn-binary-status--found">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" /><path d="M4 6.5l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span>Detected at <code>{connBinaryDetected}</code></span>
                    </div>
                    <button className="btn-secondary conn-binary-edit-btn" onClick={() => { setConnBinaryEditing(true); setConnBinaryPath(connBinaryDetected); }}>Edit</button>
                  </div>
                )}
                {((connBinaryStatus === 'not_found') || connBinaryEditing) && (
                  <>
                    {connBinaryStatus === 'not_found' && !connBinaryEditing && (
                      <div className="conn-binary-status conn-binary-status--missing">
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" /><path d="M6.5 3.5v3M6.5 9h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                        Binary not found in PATH — enter path manually
                      </div>
                    )}
                    <div className="conn-binary-edit-row">
                      <input className="input-field" value={connBinaryPath} onChange={(e) => setConnBinaryPath(e.target.value)} placeholder="/usr/local/bin/clickhouse" spellCheck={false} />
                      {connBinaryEditing && (
                        <button className="btn-secondary" onClick={() => { setConnBinaryEditing(false); setConnBinaryPath(''); }}>Cancel</button>
                      )}
                      <button className="btn-primary" disabled={connBinarySaving || !connBinaryPath.trim()} onClick={saveBinaryPath}>{connBinarySaving ? 'Saving…' : 'Save'}</button>
                    </div>
                  </>
                )}
                {connBinaryStatus === 'error' && (
                  <div className="conn-binary-status conn-binary-status--error">Could not reach backend</div>
                )}
              </div>

              <div className="settings-section">
                <div className="settings-section-head">
                  <h3 className="settings-section-title">Connections</h3>
                  <button className="btn-primary settings-section-btn" onClick={() => setShowAddForm(true)} disabled={showAddForm}>+ Add Connection</button>
                </div>

                {showAddForm && (
                  <div className="conn-add-form">
                    <div className="key-field">
                      <label className="label-muted">Endpoint URL</label>
                      <input className="input-field" value={connEndpoint} onChange={(e) => setConnEndpoint(e.target.value)} placeholder="http://localhost:8123" />
                    </div>
                    <div className="key-field">
                      <label className="label-muted">Username</label>
                      <input className="input-field" value={connUser} onChange={(e) => setConnUser(e.target.value)} placeholder="default" />
                    </div>
                    <div className="key-field">
                      <label className="label-muted">Password</label>
                      <input className="input-field" type="password" value={connPassword} onChange={(e) => setConnPassword(e.target.value)} placeholder="(optional)" />
                    </div>
                    <div className="panel-actions" style={{ marginTop: 12 }}>
                      <button className="btn-secondary" onClick={() => { setShowAddForm(false); setConnEndpoint('http://localhost:8123'); setConnUser('default'); setConnPassword(''); }}>Cancel</button>
                      <button className="btn-primary" disabled={connAdding || !connEndpoint.trim()} onClick={async () => {
                        setConnAdding(true);
                        const result = await addConnection(connEndpoint.trim(), connUser.trim() || 'default', connPassword);
                        setConnAdding(false);
                        if (result.success) {
                          setShowAddForm(false);
                          setConnEndpoint('http://localhost:8123');
                          setConnUser('default');
                          setConnPassword('');
                          setSaveResult({ type: 'success', message: 'Connection added and verified!' });
                        } else {
                          setSaveResult({ type: 'error', message: result.error || 'Connection failed' });
                        }
                      }}>{connAdding ? 'Testing...' : 'Test & Save'}</button>
                    </div>
                  </div>
                )}

                {connections.length === 0 && !showAddForm ? (
                  <div className="empty-state">
                    <p>No connections configured.</p>
                  </div>
                ) : (
                  <div className="conn-list">
                    {connections.map((c) => (
                      <div key={c.cluster_id} className="conn-list-item">
                        <div className="conn-list-info">
                          <span className="conn-dot conn-dot--active" style={{ width: 8, height: 8 }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                            <span style={{ color: 'var(--accent-green)', fontWeight: 500 }}>{c.user_name}</span>
                            <span style={{ color: 'var(--text-muted)' }}>@</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{c.endpoint}</span>
                          </span>
                        </div>
                        <button className="key-remove-btn" onClick={() => deleteConnection(c.cluster_id)} title="Remove connection">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {saveResult && activeTab === 'connections' && (
                <div className={`save-toast ${saveResult.type}`} style={{ marginTop: 16 }}>
                  {saveResult.type === 'success' ? '✓ ' : '✕ '}{saveResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
