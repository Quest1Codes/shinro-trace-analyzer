import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { useConversation } from '../context/ConversationContext';
import { useTrace } from '../context/TraceContext';
import type { DashboardTab } from '../types';
import './TopNav.css';

const TABS: { key: DashboardTab; label: string; cta?: boolean }[] = [
  { key: 'query-editor', label: 'Query Editor' },
  { key: 'analysis', label: 'Analysis Dashboard' },
  { key: 'materialized-views', label: 'Materialized Views' },
  { key: 'expert-help', label: '$ route to a human', cta: true },
];

export default function TopNav() {
  const { dashboardTab, setDashboardTab, dashboardOpen, setDashboardOpen } = useConversation();
  const { activeQueryId, traceName, renameTrace } = useTrace();

  const displayName = traceName ?? (activeQueryId ? `Trace · ${activeQueryId.slice(0, 12)}…` : 'New Session');

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (!editing) setEditValue(displayName);
  }, [displayName, editing]);

  const startEdit = useCallback(() => {
    setEditValue(displayName);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [displayName]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === displayName) return;
    if (activeQueryId) renameTrace(activeQueryId, trimmed);
  }, [editValue, displayName, activeQueryId, renameTrace]);

  const handleTabClick = (tab: DashboardTab) => {
    if (dashboardTab === tab && dashboardOpen) {
      setDashboardOpen(false);
    } else {
      setDashboardTab(tab);
      setDashboardOpen(true);
    }
  };

  return (
    <header className="top-nav">
      <div className="top-nav-left">
        {editing ? (
          <input
            ref={inputRef}
            className="top-nav-rename-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') { setEditing(false); setEditValue(displayName); }
            }}
            maxLength={80}
          />
        ) : (
          <button className="top-nav-context" onClick={startEdit} title="Click to rename">
            <span className="top-nav-context-name">{displayName}</span>
            <svg className="top-nav-edit-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8.5 1.5a1.5 1.5 0 0 1 2.12 2.12L3.5 10.7 1 11l.3-2.5L8.5 1.5z"
                stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="top-nav-right">
        <div className="top-nav-tabs">
          {TABS.filter((t) => !t.cta).map((tab) => (
            <button
              key={tab.key}
              className={`top-nav-tab ${dashboardTab === tab.key && dashboardOpen ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.key)}
              title={`Click to ${dashboardTab === tab.key && dashboardOpen ? 'close' : 'open'} ${tab.label}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="top-nav-expert-sep" />

        <button
          className={`top-nav-expert-btn ${dashboardTab === 'expert-help' && dashboardOpen ? 'active' : ''}`}
          onClick={() => handleTabClick('expert-help')}
          title="Route to a human — talk to the Quest1 team"
        >
          <span className="top-nav-expert-dollar">$</span>
          <span className="top-nav-expert-label">route to a human</span>
          <ArrowRight size={11} strokeWidth={2.5} className="top-nav-expert-arrow" />
        </button>
      </div>
    </header>
  );
}
