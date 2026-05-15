import { useState } from 'react';
import { useTrace } from '../context/TraceContext';
import { useConversation } from '../context/ConversationContext';
import { useTheme } from '../context/ThemeContext';
import Quest1Logo from './Quest1Logo';
import Quest1LogoMark from './Quest1LogoMark';
import ConfirmModal from './ConfirmModal';
import Settings from '../pages/Settings';
import SkillsPage from '../pages/SkillsPage';
import HelpPage from '../pages/HelpPage';
import FeedbackPage from '../pages/FeedbackPage';
import { PanelLeftClose, PanelLeftOpen, Database, KeyRound, Sun, Moon, Zap, BookText, HelpCircle, Bug } from 'lucide-react';
import './Sidebar.css';

type PendingDelete =
  | { kind: 'one'; id: string }
  | { kind: 'all' }
  | null;

function formatRelativeTime(timestamp: string | number): string {
  if (!timestamp) return '';
  
  let then: number;
  if (typeof timestamp === 'number' || /^\d+$/.test(String(timestamp))) {
    // Epoch seconds (SQLite strftime %s)
    then = Number(timestamp) * 1000;
  } else {
    // ISO string
    const utcTimestamp = String(timestamp).endsWith('Z') || String(timestamp).includes('+') 
      ? String(timestamp) 
      : String(timestamp).replace(' ', 'T') + 'Z';
    then = new Date(utcTimestamp).getTime();
  }
    
  const now = Date.now();
  const diff = now - then;
  
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const {
    queryIds,
    activeQueryId,
    selectQuery,
    deleteQuery,
    deleteAllQueries,
    clearTrace,
    executionState,
    queries,
  } = useTrace();

  const {
    conversations,
    activeConversationId,
    selectConversation,
    startNewConversation,
    deleteConversation,
    sidebarCollapsed,
    setSidebarCollapsed,
    setDashboardTab,
    setDashboardOpen,
    setAppMode,
    settingsModal,
    openSettingsModal,
  } = useConversation();

  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const runningStates: ReadonlyArray<string> = ['executing', 'fetching_logs', 'parsing'];
  const isActiveRunning = (id: string) =>
    id === activeQueryId && runningStates.includes(executionState);




  const handleSelect = (id: string) => { selectQuery(id); setAppMode('session'); };

  const handleConversationSelect = (id: string) => { selectConversation(id); setAppMode('session'); };

  const handleDeleteConfirmed = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    setDeleteError(null);
    try {
      if (target?.kind === 'one') await deleteQuery(target.id);
      else if (target?.kind === 'all') await deleteAllQueries();
    } catch (err: any) {
      setDeleteError(err?.message ?? 'Delete failed.');
    }
  };

  const handleNewTrace = () => {
    clearTrace();
    startNewConversation();
    setDashboardTab('query-editor');
    setDashboardOpen(true);
    setAppMode('landing');
  };

  return (
    <aside className="sidebar">

      <div className="sidebar-header">
        <div
          className="sidebar-logo-wrap"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <span className="sidebar-logo-icon">
              <span className="sidebar-logomark"><Quest1LogoMark size={22} /></span>
              <span className="sidebar-collapse-icon">
                <PanelLeftOpen size={16} strokeWidth={2} />
              </span>
            </span>
          ) : (
            <div className="sidebar-logo">
              <Quest1Logo height={20} />
              <span className="sidebar-logo-divider" />
              <div className="sidebar-logo-text">
                <span className="sidebar-logo-sub">ClickHouse Query</span>
                <span className="sidebar-logo-main">Trace Analyzer</span>
              </div>
              <span className="sidebar-collapse-arrow">
                <PanelLeftClose size={16} strokeWidth={2} />
              </span>
            </div>
          )}
        </div>

      </div>


      <div className="sidebar-new-trace">
        <button className="new-trace-btn" onClick={handleNewTrace}>
          <Zap size={16} strokeWidth={2.5} fill="currentColor" />
          <span>New Trace</span>
        </button>
      </div>


      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">Workspace</span>
        </div>

        <div className="sidebar-conversations">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`sidebar-conv-item ${conv.id === activeConversationId ? 'active' : ''}`}
              onClick={() => handleConversationSelect(conv.id)}
            >
              <svg className="sidebar-conv-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 3h10v7H4l-2 2V3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              <div className="sidebar-conv-info">
                <span className="sidebar-conv-title">{conv.title}</span>
                <div className="sidebar-conv-meta">
                  <span className="sidebar-conv-time">Workspace</span>
                  <span className="sidebar-conv-time">{formatRelativeTime(conv.timestamp)}</span>
                </div>
              </div>
              <button
                className="sidebar-conv-delete"
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                title="Delete conversation"
              >✕</button>
            </div>
          ))}

          {queryIds.map((id) => {
            const isActive = id === activeQueryId;
            const disabled = isActiveRunning(id);
            const rec = queries.get(id);
            const displayName = rec?.traceName || id.slice(0, 24) + '…';
            const traceIdPart = `Trace · ${id.slice(0, 8)}`;
            const timePart = rec?.createdAt ? formatRelativeTime(rec.createdAt) : '';

            return (
              <div
                key={id}
                className={`sidebar-conv-item ${isActive ? 'active' : ''}`}
                onClick={() => handleSelect(id)}
                title={id}
              >
                <Zap size={14} strokeWidth={2} className="sidebar-conv-icon" />
                <div className="sidebar-conv-info">
                  <span className="sidebar-conv-title">{displayName}</span>
                  <div className="sidebar-conv-meta">
                    <span className="sidebar-conv-time" title={rec?.clusterId || ''}>{traceIdPart}</span>
                    <span className="sidebar-conv-time">{timePart}</span>
                  </div>
                </div>
                <button
                  className="sidebar-conv-delete"
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (disabled) return;
                    setDeleteError(null);
                    setPendingDelete({ kind: 'one', id });
                  }}
                  title={disabled ? 'Query is running' : 'Delete query'}
                >✕</button>
              </div>
            );
          })}

          {conversations.length === 0 && queryIds.length === 0 && (
            <div className="sidebar-empty">No conversations yet.</div>
          )}
        </div>
      </div>


      <div className="sidebar-bottom-nav">
        {deleteError && <div className="sidebar-error">{deleteError}</div>}
        <div className="sidebar-bottom-divider" />

        <button className="sidebar-bottom-btn" onClick={() => openSettingsModal('connections')}>
          <Database size={15} strokeWidth={2.5} />
          <span>Connections</span>
        </button>

        <button className="sidebar-bottom-btn" onClick={() => openSettingsModal('ai-keys')}>
          <KeyRound size={15} strokeWidth={2.5} />
          <span>AI Keys</span>
        </button>

        <button className="sidebar-bottom-btn" onClick={() => openSettingsModal('skills')}>
          <BookText size={15} strokeWidth={2.5} />
          <span>Skills</span>
        </button>

        <button className="sidebar-bottom-btn" onClick={() => openSettingsModal('help')}>
          <HelpCircle size={15} strokeWidth={2.5} />
          <span>Help</span>
        </button>

        <button className="sidebar-bottom-btn" onClick={() => openSettingsModal('feedback')}>
          <Bug size={15} strokeWidth={2.5} />
          <span>Feedback</span>
        </button>

        <button className="sidebar-bottom-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? (
            <Sun size={15} strokeWidth={2.5} />
          ) : (
            <Moon size={15} strokeWidth={2.5} />
          )}
          <span>Toggle Theme</span>
        </button>
      </div>


      {settingsModal && (
        <div className="settings-modal-overlay" onClick={() => openSettingsModal(null)}>
          <div className="settings-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="settings-modal-close" onClick={() => openSettingsModal(null)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            {(settingsModal === 'ai-keys' || settingsModal === 'connections') && (
              <Settings initialTab={settingsModal} hideTabs />
            )}
            {settingsModal === 'skills' && <SkillsPage />}
            {settingsModal === 'help' && <HelpPage />}
            {settingsModal === 'feedback' && <FeedbackPage />}
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title={pendingDelete?.kind === 'all' ? 'Clear all queries' : 'Delete query'}
        message={
          pendingDelete?.kind === 'all'
            ? 'This will permanently delete all stored queries and their logs. Continue?'
            : (
              <>
                Permanently delete logs for query_id:
                <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  {pendingDelete?.kind === 'one' ? pendingDelete.id : ''}
                </div>
              </>
            )
        }
        confirmLabel={pendingDelete?.kind === 'all' ? 'Clear all' : 'Delete'}
        danger
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setPendingDelete(null)}
      />
    </aside>
  );
}
