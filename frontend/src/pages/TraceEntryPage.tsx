import { useState, useCallback, useEffect, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap, EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { acceptCompletion } from '@codemirror/autocomplete';
import { Play, AlertCircle, HelpCircle, ChevronDown, Check } from 'lucide-react';
import { format } from 'sql-formatter';
import { clickhouseSql } from '../utils/codeMirror';
import { useTrace } from '../context/TraceContext';
import { useConnection } from '../context/ConnectionContext';
import { useTheme } from '../context/ThemeContext';
import { useConversation } from '../context/ConversationContext';
import { getAIKeyStatus } from '../services/aiService';
import ApiKeyGuardModal from '../components/ApiKeyGuardModal';
import ConfirmModal from '../components/ConfirmModal';
import Settings from './Settings';
import Quest1Logo from '../components/Quest1Logo';
import { detectDestructiveSQL } from '../utils/sqlValidator';
import './TraceEntryPage.css';

const STATUS_LABEL: Record<string, string> = {
  idle: '',
  executing: 'Executing query…',
  fetching_logs: 'Fetching trace logs…',
  parsing: 'Parsing trace data…',
  done: '',
  error: '',
};

function EntryErrorBlock({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lines = error.split('\n');
  const preview = lines.slice(-3).join('\n');

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [error, expanded]);

  return (
    <div className="entry-error-block">
      <div className="entry-error-header">
        <AlertCircle size={13} strokeWidth={1.8} />
        <span>Execution Error</span>
        {lines.length > 3 && (
          <button className="entry-error-toggle" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : 'Show full trace'}
            <svg className={`entry-error-chevron${expanded ? ' open' : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2.5 3.5l2.5 2.5 2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
      <div ref={scrollRef} className={`entry-error-body${expanded ? ' expanded' : ''}`}>
        <pre className="entry-error-pre">{expanded ? error : preview}</pre>
      </div>
    </div>
  );
}

export default function TraceEntryPage() {
  const { runTrace, currentQuery, setCurrentQuery, executionState, executionError } = useTrace();
  const { connectionInfo, connections, activeClusterId, selectConnection } = useConnection();
  const { theme } = useTheme();
  const { setAppMode, setDashboardTab, setDashboardOpen, setSidebarCollapsed, setInitialPrompt, openSettingsModal, settingsModal } = useConversation();

  const [showKeyGuard, setShowKeyGuard] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [destructiveWarning, setDestructiveWarning] = useState<string | null>(null);
  const [keyChecked, setKeyChecked] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  // null = still checking, true = found, false = not found
  const [binaryFound, setBinaryFound] = useState<boolean | null>(null);
  const [editorHeight, setEditorHeight] = useState(80);
  const [contextNote, setContextNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connDropOpen, setConnDropOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLTextAreaElement>(null);
  const connDropRef = useRef<HTMLDivElement>(null);

  const isBusy = ['executing', 'fetching_logs', 'parsing'].includes(executionState);

  useEffect(() => {
    getAIKeyStatus().then((status) => {
      setHasKey(!!(status.openai || status.anthropic || status.openrouter));
      setKeyChecked(true);
    }).catch(() => setKeyChecked(true));

    fetch('/api/query/find-clickhouse-binary')
      .then((r) => r.json())
      .then((d) => setBinaryFound(!!d.found))
      .catch(() => setBinaryFound(false));
  }, []);

  const prevSettingsModalRef = useRef<typeof settingsModal>(settingsModal);
  useEffect(() => {
    const prev = prevSettingsModalRef.current;
    prevSettingsModalRef.current = settingsModal;
    if (prev === 'connections' && settingsModal === null) {
      fetch('/api/query/find-clickhouse-binary')
        .then((r) => r.json())
        .then((d) => setBinaryFound(!!d.found))
        .catch(() => setBinaryFound(false));
    }
  }, [settingsModal]);


  useEffect(() => {
    const lineCount = (currentQuery.match(/\n/g) || []).length + 1;
    const h = Math.min(320, Math.max(120, lineCount * 25 + 24));
    setEditorHeight(h);
  }, [currentQuery]);

  useEffect(() => {
    if (!connDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (connDropRef.current && !connDropRef.current.contains(e.target as Node)) {
        setConnDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [connDropOpen]);

  const handleFormat = useCallback(() => {
    if (!currentQuery.trim()) return;
    try {
      const formatted = format(currentQuery, {
        language: 'clickhouse',
        tabWidth: 2,
        keywordCase: 'upper',
        expressionWidth: 500,
      });
      setCurrentQuery(formatted);
    } catch {
      // ignore
    }
  }, [currentQuery, setCurrentQuery]);

  const executeAnalyze = useCallback(async () => {
    setIsSubmitting(true);
    const success = await runTrace(currentQuery);
    if (success) {
      if (contextNote.trim()) {
        setInitialPrompt(contextNote.trim());
      }
      setDashboardTab('analysis');
      setDashboardOpen(true);
      setSidebarCollapsed(false); 
      setAppMode('session');
    }
    setIsSubmitting(false);
  }, [currentQuery, runTrace, contextNote, setInitialPrompt, setAppMode, setDashboardTab, setDashboardOpen, setSidebarCollapsed]);

  const handleAnalyze = useCallback(async () => {
    if (!currentQuery.trim() || isSubmitting) return;

    if (!activeClusterId || !connections.some(c => c.cluster_id === activeClusterId)) {
      openSettingsModal('connections');
      return;
    }

    if (!hasKey) {
      setShowKeyGuard(true);
      return;
    }

    const check = detectDestructiveSQL(currentQuery);
    if (check.isDestructive) {
      setDestructiveWarning(check.message);
      return;
    }

    executeAnalyze();
  }, [currentQuery, isSubmitting, connections, openSettingsModal, hasKey, executeAnalyze]);

  const runKeybinding = Prec.highest(keymap.of([
    {
      key: 'Ctrl-Enter',
      mac: 'Ctrl-Enter',
      run: () => { handleAnalyze(); return true; },
    },
    {
      key: 'Tab',
      run: acceptCompletion,
    },
  ]));

  const refreshKey = () => {
    getAIKeyStatus().then((s) => {
      setHasKey(!!(s.openai || s.anthropic || s.openrouter));
    }).catch(() => { });
  };

  return (
    <div className={`trace-entry-page ${theme}`}>

      <div className="entry-card" ref={editorRef}>


        <div className="entry-header">
          <div className="entry-logo">
            <Quest1Logo height={26} />
            <span className="entry-logo-divider" />
            <div className="entry-logo-text">
              <span className="entry-logo-sub">ClickHouse Query</span>
              <span className="entry-logo-main">Trace Analyzer</span>
            </div>
          </div>
          {connectionInfo && (
            <div className="entry-conn-dropdown" ref={connDropRef}>
              <button
                className="entry-connection-pill entry-conn-toggle"
                onClick={() => connections.length > 1 && setConnDropOpen(!connDropOpen)}
                style={{ cursor: connections.length > 1 ? 'pointer' : 'default' }}
              >
                <span className="entry-conn-dot" />
                <span className="entry-conn-text">
                  {connectionInfo.user}
                  <span className="entry-conn-sep"> · </span>
                  {connectionInfo.url.replace(/^https?:\/\//, '')}
                </span>
                {connections.length > 1 && (
                  <ChevronDown size={11} strokeWidth={2} className={`entry-conn-chevron${connDropOpen ? ' open' : ''}`} />
                )}
              </button>
              {connDropOpen && (
                <div className="entry-conn-menu">
                  {connections.map((conn) => (
                    <button
                      key={conn.cluster_id}
                      className={`entry-conn-option${conn.cluster_id === activeClusterId ? ' active' : ''}`}
                      onClick={() => { selectConnection(conn.cluster_id); setConnDropOpen(false); }}
                    >
                      <span className={`entry-conn-dot${conn.cluster_id === activeClusterId ? ' active' : ''}`} />
                      <span className="entry-conn-text">
                        {conn.user_name}
                        <span className="entry-conn-sep"> · </span>
                        {conn.endpoint.replace(/^https?:\/\//, '')}
                      </span>
                      {conn.cluster_id === activeClusterId && <Check size={11} strokeWidth={2.5} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>


        <div className="entry-editor-wrap">
          <button
            className="entry-format-btn"
            onClick={handleFormat}
            disabled={!currentQuery.trim()}
            title="Format SQL"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 3h12M1 7h8M1 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
          <CodeMirror
            value={currentQuery}
            height={`${editorHeight}px`}
            theme={theme === 'dark' ? oneDark : undefined}
            extensions={[clickhouseSql(), runKeybinding, EditorView.lineWrapping]}
            placeholder="  Write or paste your ClickHouse SQL query here"
            onChange={(value) => setCurrentQuery(value)}
            basicSetup={{
              lineNumbers: currentQuery.trim().length > 0,
              foldGutter: false,
              highlightActiveLine: currentQuery.trim().length > 0,
            }}
          />
        </div>

        <div className="entry-hint-text">
          <span className="hint-key">Ctrl</span> + <span className="hint-key">Enter</span> to execute
          <span className="hint-divider">•</span>
          <span className="hint-key">Tab</span> to autocomplete
        </div>


        <div className="entry-footer">
          <div className="entry-footer-left">
            <textarea
              ref={contextRef}
              className="entry-context-input"
              value={contextNote}
              onChange={(e) => setContextNote(e.target.value)}
              placeholder="Ask Shinro AI anything about your query or trace…"
              rows={1}
            />
          </div>

          <div className="entry-footer-right">
            <button
              className={`entry-analyze-btn${isSubmitting ? ' busy' : ''}`}
              onClick={handleAnalyze}
              disabled={!currentQuery.trim() || isSubmitting || !activeClusterId || !connections.some(c => c.cluster_id === activeClusterId)}
              title={
                (!activeClusterId || !connections.some(c => c.cluster_id === activeClusterId)) ? 'No active connection configured'
                : !currentQuery.trim() ? 'Enter a query first'
                : 'Ctrl+Enter'
              }
            >
              {isSubmitting ? (
                <>
                  <span className="entry-spinner" />
                  {executionState !== 'idle' ? STATUS_LABEL[executionState] : 'Analyzing…'}
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" strokeWidth={0} />
                  Analyze trace
                </>
              )}
            </button>
          </div>
        </div>


        {(() => {
          const noConn = !connectionInfo;
          const noBinary = binaryFound === false;
          if (noConn && noBinary) {
            return (
              <div className="entry-no-key-banner">
                <AlertCircle size={14} strokeWidth={1.8} />
                No ClickHouse connection or binary configured.{' '}
                <button className="entry-no-key-link" onClick={() => openSettingsModal('connections')}>
                  Configure in Settings →
                </button>
              </div>
            );
          }
          if (noConn) {
            return (
              <div className="entry-no-key-banner">
                <AlertCircle size={14} strokeWidth={1.8} />
                No ClickHouse connection configured.{' '}
                <button className="entry-no-key-link" onClick={() => openSettingsModal('connections')}>
                  Configure Connection →
                </button>
              </div>
            );
          }
          if (noBinary) {
            return (
              <div className="entry-no-key-banner">
                <AlertCircle size={14} strokeWidth={1.8} />
                ClickHouse binary not found in PATH.{' '}
                <button className="entry-no-key-link" onClick={() => openSettingsModal('connections')}>
                  Configure in Settings →
                </button>
              </div>
            );
          }
          return null;
        })()}

        {keyChecked && !hasKey && (
          <div className="entry-no-key-banner">
            <AlertCircle size={14} strokeWidth={1.8} />
            No AI key configured.{' '}
            <button className="entry-no-key-link" onClick={() => setShowSettings(true)}>
              Configure AI Keys →
            </button>
          </div>
        )}

        {executionState === 'error' && executionError && (
          <EntryErrorBlock error={executionError} />
        )}
      </div>


      <div className="entry-below-card">
        <button
          className="entry-help-float"
          onClick={() => openSettingsModal('help')}
          title="Help & Getting Started"
        >
          <HelpCircle size={14} strokeWidth={2} />
          <span>Help</span>
        </button>
      </div>

      {showKeyGuard && (
        <ApiKeyGuardModal
          onGoToSettings={() => { setShowKeyGuard(false); setShowSettings(true); }}
          onClose={() => setShowKeyGuard(false)}
        />
      )}


      {showSettings && (
        <div className="entry-settings-overlay" onClick={() => { setShowSettings(false); refreshKey(); }}>
          <div className="entry-settings-content" onClick={(e) => e.stopPropagation()}>
            <button className="entry-settings-close" onClick={() => { setShowSettings(false); refreshKey(); }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <Settings initialTab="ai-keys" hideTabs />
          </div>
        </div>
      )}

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
        onConfirm={() => { setDestructiveWarning(null); executeAnalyze(); }}
        onCancel={() => setDestructiveWarning(null)}
      />
    </div>
  );
}
