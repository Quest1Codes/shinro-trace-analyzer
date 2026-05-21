import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useCallback, useRef } from 'react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import DashboardPanel from './DashboardPanel';
import ShinroAI from '../pages/ShinroAI';
import TraceEntryPage from '../pages/TraceEntryPage';
import NotificationToastContainer from './NotificationToast';
import { useTrace } from '../context/TraceContext';
import { useConversation } from '../context/ConversationContext';
import './AppLayout.css';

const DASHBOARD_MIN = 360;
const DASHBOARD_MAX_RATIO = 0.7;

export default function AppLayout() {
  const { clearTrace } = useTrace();
  const {
    setDashboardTab,
    dashboardOpen,
    setDashboardOpen,
    sidebarCollapsed,
    dashboardWidth,
    setDashboardWidth,
    appMode,
    setAppMode,
  } = useConversation();
  const navigate = useNavigate();
  const location = useLocation();

  const panelsRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === '1') { e.preventDefault(); setDashboardTab('query-editor'); setDashboardOpen(true); }
      if (e.key === '2') { e.preventDefault(); setDashboardTab('analysis'); setDashboardOpen(true); }
      if (e.key === '3') { e.preventDefault(); setDashboardTab('materialized-views'); setDashboardOpen(true); }
      if (e.key === 'n') { e.preventDefault(); clearTrace(); setAppMode('landing'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, clearTrace, location.pathname, setDashboardTab, setDashboardOpen, setAppMode]);


  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !panelsRef.current) return;
      const rect = panelsRef.current.getBoundingClientRect();
      const maxW = rect.width * DASHBOARD_MAX_RATIO;

      const newWidth = rect.right - ev.clientX;
      setDashboardWidth(Math.max(DASHBOARD_MIN, Math.min(maxW, newWidth)));
    };

    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [setDashboardWidth]);

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <NotificationToastContainer />
      <div className="app-body">
        <Sidebar />
        <div className="app-content">
          {appMode === 'session' && <TopNav />}
          <div className="app-panels" ref={panelsRef}>
            {appMode === 'landing' ? (
              <main className="app-conversation">
                <TraceEntryPage />
              </main>
            ) : (
              <>
                <main className="app-conversation">
                  <ShinroAI />
                </main>
                {dashboardOpen && (
                  <>
                    <div
                      className="panel-resize-handle"
                      onMouseDown={onResizeStart}
                      title="Drag to resize"
                    >
                      <div className="resize-handle-grip" />
                    </div>
                    <aside
                      className="app-dashboard"
                      style={{ width: dashboardWidth, minWidth: DASHBOARD_MIN }}
                    >
                      <DashboardPanel />
                    </aside>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
