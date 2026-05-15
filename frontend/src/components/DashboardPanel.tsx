import { useConversation } from '../context/ConversationContext';
import QueryEditor from '../pages/QueryEditor';
import AnalysisDashboard from '../pages/AnalysisDashboard';
import ViewsImpact from '../pages/ViewsImpact';
import ExpertHelp from '../pages/ExpertHelp';
import './DashboardPanel.css';

export default function DashboardPanel() {
  const { dashboardTab } = useConversation();

  return (
    <div className="dashboard-panel">
      <div className="dashboard-panel-content">
        {dashboardTab === 'query-editor' && <QueryEditor />}
        {dashboardTab === 'analysis' && <AnalysisDashboard />}
        {dashboardTab === 'materialized-views' && <ViewsImpact />}
        {dashboardTab === 'expert-help' && <ExpertHelp />}
      </div>
    </div>
  );
}
