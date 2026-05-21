import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConnectionConfig } from '../types';
import { useConnection } from '../context/ConnectionContext';
import { useTheme } from '../context/ThemeContext';
import Quest1Logo from '../components/Quest1Logo';
import Quest1LogoMark from '../components/Quest1LogoMark';
import './ConnectionSetup.css';

type BinaryStatus =
  | { state: 'checking' }
  | { state: 'found'; path: string }
  | { state: 'not_found' }
  | { state: 'error'; message: string };

type TestStep =
  | 'idle'
  | 'binary'
  | 'credentials'
  | 'validating';

export default function ConnectionSetup() {
  const navigate = useNavigate();
  const { markConnected, addConnection } = useConnection();
  const { theme, toggleTheme } = useTheme();

  const [config, setConfig] = useState<ConnectionConfig>({
    url: 'http://localhost:8123',
    user: 'default',
    password: '',
  });
  const [binaryPath, setBinaryPath] = useState('');
  const [binaryStatus, setBinaryStatus] = useState<BinaryStatus>({ state: 'checking' });
  const [testStep, setTestStep] = useState<TestStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedCredentials, setSavedCredentials] = useState<Array<{ url: string; user: string; password: string; secure: boolean }>>([]);
  const [showSavedDropdown, setShowSavedDropdown] = useState(false);


  useEffect(() => {
    fetch('/api/query/find-clickhouse-binary')
      .then((r) => r.json())
      .then((data: { found: boolean; path?: string; error?: string }) => {
        if (data.found && data.path) {
          setBinaryStatus({ state: 'found', path: data.path });
        } else {
          setBinaryStatus({ state: 'not_found' });
        }
      })
      .catch(() => {
        setBinaryStatus({ state: 'error', message: 'Could not reach backend. Is it running?' });
      });

    fetch('/api/query/credentials')
      .then((r) => r.json())
      .then((data: {
        configured: boolean;
        active?: { url: string; user: string; password: string; secure: boolean } | null;
        saved?: Array<{ url: string; user: string; password: string; secure: boolean }>;
      }) => {
        if (data.saved && data.saved.length > 0) {
          setSavedCredentials(data.saved);
        }
        if (data.configured && data.active) {
          setConfig((prev) => ({
            ...prev,
            url: data.active!.url,
            user: data.active!.user,
            password: data.active!.password ?? prev.password,
          }));
        } else if (data.saved && data.saved.length > 0) {
          // No active credential but saved ones exist — auto-fill the first
          const first = data.saved[0];
          setConfig({ url: first.url, user: first.user, password: first.password });
        }
      })
      .catch(() => { });
  }, []);

  const handleChange =
    (setter: React.Dispatch<React.SetStateAction<string>>) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setter(e.target.value);
        if (error) setError(null);
      };

  const handleConfigChange =
    (field: keyof ConnectionConfig) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setConfig((prev) => ({ ...prev, [field]: e.target.value }));
        if (error) setError(null);
      };

  const isBusy = testStep !== 'idle';

  const selectSavedCredential = (cred: { url: string; user: string; password: string }) => {
    setConfig({ url: cred.url, user: cred.user, password: cred.password });
    setShowSavedDropdown(false);
    if (error) setError(null);
  };

  const deleteSavedCredential = async (cred: { url: string; user: string }, e: React.MouseEvent) => {
    e.stopPropagation();
    const account = `${cred.user}@${cred.url}`;
    try {
      await fetch('/api/query/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account }),
      });
      setSavedCredentials((prev) => prev.filter((c) => !(c.url === cred.url && c.user === cred.user)));
    } catch {
      // best-effort
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!config.url.trim()) {
      setError('Server URL is required.');
      return;
    }
    if (!config.url.startsWith('http://') && !config.url.startsWith('https://')) {
      setError('URL must start with http:// or https://');
      return;
    }
    if (!config.user.trim()) {
      setError('User is required.');
      return;
    }
    if (binaryStatus.state === 'not_found' && !binaryPath.trim()) {
      setError('ClickHouse binary path is required when it cannot be detected automatically.');
      return;
    }


    if (binaryStatus.state === 'not_found') {
      setTestStep('binary');
      const res = await fetch('/api/query/update-clickhouse-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: binaryPath.trim() }),
      });
      const data: { success?: boolean; error?: string } = await res.json();
      if (!res.ok || !data.success) {
        setTestStep('idle');
        setError(data.error ?? 'Invalid binary path.');
        return;
      }
      setBinaryStatus({ state: 'found', path: binaryPath.trim() });
    }


    setTestStep('credentials');
    const credRes = await fetch('/api/query/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: config.url.trim(),
        user: config.user.trim(),
        password: config.password,
      }),
    });
    const credData: { success?: boolean; error?: string } = await credRes.json();
    if (!credRes.ok || !credData.success) {
      setTestStep('idle');
      setError(credData.error ?? 'Failed to store credentials.');
      return;
    }


    setTestStep('validating');
    const execRes = await fetch('/api/query/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: config.url.trim(),
        user: config.user.trim(),
        password: config.password,
      }),
    });
    const execData: { success?: boolean; error?: string } = await execRes.json();
    if (!execRes.ok || !execData.success) {
      setTestStep('idle');

      const raw = execData.error ?? 'Connection test failed.';
      const clean = raw.split('\n').find((l) => l.includes('Error') || l.includes('error') || l.includes('refused') || l.includes('Cannot')) ?? raw.split('\n')[0] ?? raw;
      setError(clean.trim());
      return;
    }


    setTestStep('idle');
    markConnected({ url: config.url.trim(), user: config.user.trim() });
    // Persist to SQLite so it appears in the connection dropdown (skip re-testing)
    addConnection(config.url.trim(), config.user.trim(), config.password, true).catch(() => { });
    navigate('/app');
  };

  const stepLabel: Record<TestStep, string> = {
    idle: 'CONNECT & ANALYZE \u2192',
    binary: 'VERIFYING BINARY...',
    credentials: 'STORING CREDENTIALS...',
    validating: 'TESTING CONNECTION...',
  };

  return (
    <div className="connection-page">
      <button className="conn-theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
        {theme === 'dark' ? (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M13.5 9.5a5.5 5.5 0 01-7-7 5.5 5.5 0 107 7z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="connection-logo">
        <div className="logo-hex">
          <Quest1LogoMark size={42} />
        </div>
        <div className="logo-title-wrap">
          <span className="logo-title-sub">CLICKHOUSE QUERY</span>
          <h1 className="logo-title">TRACE ANALYZER</h1>
        </div>
      </div>

      <form className="connection-card" onSubmit={handleConnect} autoComplete="off">
        <div className="connection-card-header">
          <h2 className="card-heading">Connection Details</h2>
        </div>

        {/* Saved credentials dropdown */}
        {savedCredentials.length > 0 && (
          <div className="saved-cred-wrap">
            <div className="form-section-label">Saved Connections</div>
            <div className="saved-cred-dropdown">
              <button
                type="button"
                className="saved-cred-trigger"
                onClick={() => setShowSavedDropdown(!showSavedDropdown)}
                disabled={isBusy}
              >
                <span className="saved-cred-trigger-text">
                  {(() => {
                    const match = savedCredentials.find((c) => c.url === config.url && c.user === config.user);
                    if (match) {
                      let host = match.url;
                      try { host = new URL(match.url).hostname; } catch { }
                      return <><span className="saved-cred-user">{match.user}</span><span className="saved-cred-at">@</span><span className="saved-cred-host">{host}</span></>;
                    }
                    return <span className="saved-cred-placeholder">Select a saved connection…</span>;
                  })()}
                </span>
                <svg className={`saved-cred-chevron${showSavedDropdown ? ' open' : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {showSavedDropdown && (
                <div className="saved-cred-menu">
                  {savedCredentials.map((cred) => {
                    const isSelected = config.url === cred.url && config.user === cred.user;
                    let displayHost = cred.url;
                    try { displayHost = new URL(cred.url).hostname; } catch { }
                    return (
                      <div
                        key={`${cred.user}@${cred.url}`}
                        className={`saved-cred-item${isSelected ? ' saved-cred-item--active' : ''}`}
                        onClick={() => selectSavedCredential(cred)}
                      >
                        <span className="saved-cred-item-text">
                          <span className="saved-cred-user">{cred.user}</span>
                          <span className="saved-cred-at">@</span>
                          <span className="saved-cred-host">{displayHost}</span>
                        </span>
                        <span
                          className="saved-cred-delete"
                          role="button"
                          title="Remove saved credential"
                          onClick={(e) => deleteSavedCredential(cred, e)}
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                          </svg>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Credentials section */}
        <div className="form-section-label">Server</div>

        <div className="form-group">
          <label className="field-label">URL</label>
          <input
            className="input-field"
            value={config.url}
            onChange={handleConfigChange('url')}
            placeholder="http://localhost:8123"
            disabled={isBusy}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="form-row">
          <div className="form-group flex-1">
            <label className="field-label">USER</label>
            <input
              className="input-field"
              value={config.user}
              onChange={handleConfigChange('user')}
              placeholder="default"
              disabled={isBusy}
              autoComplete="off"
            />
          </div>
          <div className="form-group flex-1">
            <label className="field-label">PASSWORD</label>
            <input
              className="input-field"
              type="password"
              value={config.password}
              onChange={handleConfigChange('password')}
              placeholder="optional"
              disabled={isBusy}
              autoComplete="off"
            />
          </div>
        </div>


        <div className="binary-section">
          <div className="form-section-label">ClickHouse Binary</div>

          {binaryStatus.state === 'checking' && (
            <div className="binary-status binary-status--checking">
              <span className="spinner spinner--small" />
              Detecting binary...
            </div>
          )}

          {binaryStatus.state === 'found' && (
            <div className="binary-status binary-status--found">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 6.5l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Detected at <code>{binaryStatus.path}</code></span>
            </div>
          )}

          {binaryStatus.state === 'not_found' && (
            <>
              <div className="binary-status binary-status--missing">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6.5 3.5v3M6.5 9h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Binary not found in PATH. Enter the path manually.
              </div>
              <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
                <label className="field-label">BINARY PATH</label>
                <input
                  className="input-field"
                  value={binaryPath}
                  onChange={handleChange(setBinaryPath)}
                  placeholder="/usr/local/bin/clickhouse"
                  disabled={isBusy}
                  spellCheck={false}
                />
              </div>
            </>
          )}

          {binaryStatus.state === 'error' && (
            <div className="binary-status binary-status--error">
              {binaryStatus.message}
            </div>
          )}
        </div>


        {error && (
          <div className="connection-error">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ minWidth: 13, marginTop: 1 }}>
              <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6.5 3.5v3M6.5 9h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        <button
          type="submit"
          className={`connect-btn${isBusy ? ' connect-btn--busy' : ''}`}
          disabled={isBusy || binaryStatus.state === 'checking' || binaryStatus.state === 'error'}
        >
          {isBusy ? (
            <span className="connect-btn-inner">
              <span className="spinner" />
              {stepLabel[testStep]}
            </span>
          ) : (
            stepLabel.idle
          )}
        </button>

        <div className="connection-footer">
          <span className="credentials-note">
            <span className="dot dot-amber" /> CREDENTIALS STORED USING KEYCHAIN
          </span>
          <div className="footer-icons">
            <div className="help-popover-wrap">
              <button type="button" className="footer-icon-btn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 6c0-1.1.9-2 2-2s2 .9 2 2c0 .8-.6 1.5-1.4 1.8C8.3 8 8 8.4 8 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
                </svg>
              </button>
              <div className="help-popover">
                <p className="help-popover-title">Local Storage</p>
                <ul className="help-popover-list">
                  <li><strong>Credentials</strong> (URL, user, password) are stored securely in the macOS Keychain</li>
                  <li><strong>Trace logs</strong> and parsed results are written to <code>~/.shinro/</code> during each query run</li>
                </ul>
                <p className="help-popover-note">Nothing leaves your machine.</p>
              </div>
            </div>
          </div>
        </div>
      </form>

      <div className="connection-bottom">
        <a href="#" className="connection-tos">Terms of Service &amp; Privacy Policy</a>
        <div className="quest1-logo-wrap">
          <Quest1Logo height={20} />
        </div>
      </div>
    </div>
  );
}
