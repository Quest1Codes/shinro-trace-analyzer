import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap, EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { acceptCompletion } from '@codemirror/autocomplete';
import { format } from 'sql-formatter';
import { Info } from 'lucide-react';
import { clickhouseSql } from '../utils/codeMirror';
import { useTrace } from '../context/TraceContext';
import { useConnection } from '../context/ConnectionContext';
import { useTheme } from '../context/ThemeContext';
import { useConversation } from '../context/ConversationContext';
import ConfirmModal from '../components/ConfirmModal';
import { detectDestructiveSQL } from '../utils/sqlValidator';
import './QueryEditor.css';

const STATUS_LABELS = {
  idle: 'Ready',
  executing: 'Executing query...',
  fetching_logs: 'Fetching trace logs...',
  parsing: 'Parsing trace data...',
  done: 'Trace complete',
  error: 'Execution failed',
} as const;

export default function QueryEditor() {
  const { runTrace, executionState, executionError, clearTrace, currentQuery, setCurrentQuery, queries, activeQueryId } = useTrace();
  const { connectionInfo, connections, allConnections, activeClusterId, selectConnection } = useConnection();
  const { theme } = useTheme();
  const { setDashboardTab, openSettingsModal } = useConversation();

  // ── Context-aware connection display ─────────────────────
  // Resolves the connection for the active trace's cluster.
  // Falls back to the globally active connection when no trace is selected.
  const displayConnection = useMemo(() => {
    if (activeQueryId) {
      const rec = queries.get(activeQueryId);
      if (rec?.clusterId) {
        // Look up in allConnections (includes soft-deleted / removed)
        const match = allConnections.find((c) => c.cluster_id === rec.clusterId);
        if (match) {
          return {
            user: match.user_name,
            url: match.endpoint,
            isRemoved: match.is_removed,
            clusterId: match.cluster_id,
          };
        }
        // Connection was hard-deleted before soft-delete was implemented.
        // Construct a fallback so we never show "No connections" in conversation view.
        return {
          user: 'unknown',
          url: rec.clusterId,
          isRemoved: true,
          clusterId: rec.clusterId,
        };
      }
    }
    // No trace selected or cluster not found — show global active
    if (connectionInfo) {
      return {
        user: connectionInfo.user,
        url: connectionInfo.url,
        isRemoved: false,
        clusterId: activeClusterId,
      };
    }
    return null;
  }, [activeQueryId, queries, allConnections, connectionInfo, activeClusterId]);

  const isConversationView = activeQueryId !== null;

  const code = currentQuery;
  const setCode = setCurrentQuery;
  const [lineCol, setLineCol] = useState({ line: 1, col: 1 });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const isBusy = executionState === 'executing' || executionState === 'fetching_logs' || executionState === 'parsing';

  const statusColor =
    executionState === 'error' ? 'var(--accent-red)' :
      executionState === 'done' ? 'var(--accent-green)' :
        isBusy ? 'var(--accent-yellow)' :
          undefined;

  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [destructiveWarning, setDestructiveWarning] = useState<string | null>(null);
  const errorPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomPanelOpen && executionError && errorPanelRef.current) {
      errorPanelRef.current.scrollTop = errorPanelRef.current.scrollHeight;
    }
  }, [bottomPanelOpen, executionError]);

  const handleFormat = useCallback(() => {
    if (!code.trim()) return;
    try {
      const formatted = format(code, {
        language: 'clickhouse',
        tabWidth: 2,
        keywordCase: 'upper',
        expressionWidth: 500,
      });
      setCode(formatted);
    } catch {

    }
  }, [code, setCode]);

  const executeRun = useCallback(async () => {
    const savedQuery = code;
    clearTrace();
    setCurrentQuery(savedQuery);
    setBottomPanelOpen(false);
    const success = await runTrace(savedQuery);
    if (success) {
      setDashboardTab('analysis');
    } else {
      setBottomPanelOpen(true);
    }
  }, [code, clearTrace, setCurrentQuery, runTrace, setDashboardTab]);

  const handleRunAndNavigate = useCallback(async () => {
    if (!code.trim() || isBusy) return;

    if (!activeClusterId || !connections.some(c => c.cluster_id === activeClusterId) || Boolean(displayConnection?.isRemoved)) {
      openSettingsModal('connections');
      return;
    }

    const check = detectDestructiveSQL(code);
    if (check.isDestructive) {
      setDestructiveWarning(check.message);
      return;
    }

    executeRun();
  }, [code, isBusy, activeClusterId, displayConnection, openSettingsModal, executeRun]);


  // Strip protocol and trailing slash for display
  const formatEndpoint = (ep: string) => {
    try {
      const u = new URL(ep);
      return u.host;
    } catch {
      return ep;
    }
  };

  // Prec.highest ensures these bindings fire before basicSetup's defaults
  // (which include Enter→newline and Tab→indent).
  const runKeybinding = Prec.highest(keymap.of([
    {
      key: 'Ctrl-Enter',
      mac: 'Ctrl-Enter',
      run: () => { handleRunAndNavigate(); return true; },
    },
    {
      key: 'Tab',
      run: acceptCompletion,
    },
  ]));

  return (
    <div className="query-editor-page">
      <div className="editor-main">
        <div className="editor-breadcrumb" ref={dropdownRef}>
          {connections.length === 0 && !displayConnection ? (
            <span
              className="label-muted conn-empty-hint"
              onClick={() => openSettingsModal('connections')}
              style={{ cursor: 'pointer' }}
            >
              No connections configured. Add one in Settings →
            </span>
          ) : (
            <div className="conn-selector">
              <button
                className={`conn-selector-btn${displayConnection?.isRemoved ? ' conn-selector-btn--removed' : ''}${isConversationView ? ' conn-selector-btn--locked' : ''}`}
                onClick={() => !isConversationView && setDropdownOpen((v) => !v)}
                style={isConversationView ? { cursor: 'default' } : undefined}
                title={isConversationView ? 'Connection is locked to this conversation\'s original cluster' : undefined}
              >
                {displayConnection ? (
                  <>
                    <span className={`conn-dot${displayConnection.isRemoved ? ' conn-dot--removed' : ' conn-dot--active'}`} />
                    <span className={`conn-user${displayConnection.isRemoved ? ' conn-text--removed' : ''}`}>{displayConnection.user}</span>
                    <span className="conn-at">@</span>
                    <span className={`conn-host${displayConnection.isRemoved ? ' conn-text--removed' : ''}`}>{formatEndpoint(displayConnection.url)}</span>
                  </>
                ) : (
                  <span className="label-muted">Select connection…</span>
                )}
                {/* Hide chevron when dropdown is locked in conversation view */}
                {!isConversationView && (
                  <svg className={`conn-chevron${dropdownOpen ? ' open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {dropdownOpen && !isConversationView && (
                <div className="conn-dropdown">
                  {connections.map((c) => (
                    <button
                      key={c.cluster_id}
                      className={`conn-dropdown-item${c.cluster_id === displayConnection?.clusterId ? ' active' : ''}`}
                      onClick={async () => {
                        await selectConnection(c.cluster_id);
                        setDropdownOpen(false);
                      }}
                    >
                      <span className={`conn-dot${c.cluster_id === activeClusterId ? ' conn-dot--active' : ''}`} />
                      <span className="conn-user">{c.user_name}</span>
                      <span className="conn-at">@</span>
                      <span className="conn-host">{formatEndpoint(c.endpoint)}</span>
                      {c.cluster_id === activeClusterId && (
                        <span className="conn-active-badge">Active</span>
                      )}
                    </button>
                  ))}



                  <div className="conn-dropdown-divider" />
                  <button
                    className="conn-dropdown-item conn-dropdown-add"
                    onClick={() => { setDropdownOpen(false); openSettingsModal('connections'); }}
                  >
                    + Manage Connections
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="editor-container">
          <button
            className="editor-format-btn"
            onClick={handleFormat}
            disabled={!code.trim()}
            title="Format SQL"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 3h12M1 7h8M1 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <CodeMirror
            value={code}
            height="100%"
            theme={theme === 'dark' ? oneDark : undefined}
            extensions={[clickhouseSql(), runKeybinding, EditorView.lineWrapping]}
            placeholder="-- Write your ClickHouse SQL query here and press Ctrl+Enter to run"
            onChange={(value, viewUpdate) => {
              setCode(value);
              const line = viewUpdate.state.doc.lineAt(viewUpdate.state.selection.main.head);
              setLineCol({
                line: line.number,
                col: viewUpdate.state.selection.main.head - line.from + 1,
              });
            }}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
            }}
          />
        </div>

        {bottomPanelOpen && executionError && (
          <div className="editor-bottom-panel">
            <div className="bottom-panel-header">
              <span className="bottom-panel-title">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="var(--accent-red)" strokeWidth="1.2" />
                  <path d="M7 4v3.5M7 9.5h.01" stroke="var(--accent-red)" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Execution Error
              </span>
              <button className="bottom-panel-close" onClick={() => setBottomPanelOpen(false)}>&#x2715;</button>
            </div>
            <div className="bottom-panel-content" ref={errorPanelRef}>
              <pre className="bottom-panel-error">{executionError}</pre>
            </div>
          </div>
        )}

        <div className="editor-status-bar">
          <div className="status-left">
            {isBusy && <span className="status-spinner" />}
            <span className="label-muted" style={{ color: statusColor }}>
              {STATUS_LABELS[executionState]}
            </span>
            {executionError && !bottomPanelOpen && (
              <span className="status-error" onClick={() => setBottomPanelOpen(true)} style={{ cursor: 'pointer' }}>
                {executionError}
              </span>
            )}
          </div>
          <div className="status-right">
            <span className="label-muted">Ln {lineCol.line}, Col {lineCol.col}</span>
          </div>
        </div>

        <div className="editor-toolbar">
          <div className="run-help-trigger">
            <Info size={14} className="run-help-icon" />
            <div className="run-help-tooltip">
              Running this query will start a new trace conversation.
            </div>
          </div>
          <button
            className={`btn-primary run-btn${isBusy ? ' run-btn--busy' : ''}`}
            onClick={handleRunAndNavigate}
            disabled={isBusy || !code.trim() || !activeClusterId || !connections.some(c => c.cluster_id === activeClusterId) || Boolean(displayConnection?.isRemoved)}
            title={
              (!activeClusterId || !connections.some(c => c.cluster_id === activeClusterId)) ? 'No active connection configured'
              : displayConnection?.isRemoved ? 'Connection for this trace was removed'
              : !code.trim() ? 'Enter a query first'
              : 'Run query'
            }
          >
            {isBusy ? (
              <>
                <span className="status-spinner status-spinner--btn" /> Running...
              </>
            ) : (
              <>
                {'\u25B6'} Run Query
                <span className="run-btn-keycap">⌃↵</span>
              </>
            )}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={destructiveWarning !== null}
        title="Destructive Query Detected"
        message={
          <>
            {destructiveWarning} Shinro analyzes query performance traces — destructive queries are not executed against your database, but generating an analysis report for them may not be meaningful.
            <br /><br />
            Do you want to proceed anyway?
          </>
        }
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        danger
        onConfirm={() => { setDestructiveWarning(null); executeRun(); }}
        onCancel={() => setDestructiveWarning(null)}
      />
    </div>
  );
}
