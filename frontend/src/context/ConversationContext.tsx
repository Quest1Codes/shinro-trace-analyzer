import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ChatHistorySummary, DashboardTab } from '../types';

export type AppMode = 'landing' | 'session';

interface ConversationContextValue {
  activeConversationId: string | null;
  conversations: ChatHistorySummary[];
  dashboardTab: DashboardTab;
  dashboardOpen: boolean;
  sidebarCollapsed: boolean;
  dashboardWidth: number;
  appMode: AppMode;
  initialPrompt: string;
  settingsModal: 'ai-keys' | 'connections' | 'skills' | 'help' | 'feedback' | null;
  setAppMode: (mode: AppMode) => void;
  setDashboardTab: (tab: DashboardTab) => void;
  setDashboardOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setDashboardWidth: (width: number) => void;
  setInitialPrompt: (prompt: string) => void;
  openSettingsModal: (tab: 'ai-keys' | 'connections' | 'skills' | 'help' | 'feedback' | null) => void;
  selectConversation: (id: string | null) => void;
  startNewConversation: () => void;
  deleteConversation: (id: string) => void;
  addConversation: (conv: ChatHistorySummary) => void;
  updateConversationTitle: (id: string, title: string) => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function ConversationProvider({ children }: { children: React.ReactNode }) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatHistorySummary[]>([]);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('query-editor');
  const [dashboardOpen, setDashboardOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [dashboardWidth, setDashboardWidth] = useState(window.innerWidth / 2.15);
  const [appMode, setAppMode] = useState<AppMode>('landing');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [settingsModal, setSettingsModal] = useState<'ai-keys' | 'connections' | 'skills' | 'help' | 'feedback' | null>(null);

  const openSettingsModal = useCallback((tab: 'ai-keys' | 'connections' | 'skills' | 'help' | 'feedback' | null) => {
    setSettingsModal(tab);
  }, []);

  const selectConversation = useCallback((id: string | null) => {
    setActiveConversationId(id);
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setActiveConversationId((prev) => (prev === id ? null : prev));
  }, []);

  const addConversation = useCallback((conv: ChatHistorySummary) => {
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(conv.id);
  }, []);

  const updateConversationTitle = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }, []);

  const value = useMemo<ConversationContextValue>(
    () => ({
      activeConversationId,
      conversations,
      dashboardTab,
      dashboardOpen,
      sidebarCollapsed,
      dashboardWidth,
      appMode,
      initialPrompt,
      settingsModal,
      setAppMode,
      setDashboardTab,
      setDashboardOpen,
      setSidebarCollapsed,
      setDashboardWidth,
      setInitialPrompt,
      openSettingsModal,
      selectConversation,
      startNewConversation,
      deleteConversation,
      addConversation,
      updateConversationTitle,
    }),
    [activeConversationId, conversations, dashboardTab, dashboardOpen, sidebarCollapsed, dashboardWidth, appMode, initialPrompt, settingsModal, setAppMode, setDashboardTab, setDashboardOpen, setSidebarCollapsed, setDashboardWidth, setInitialPrompt, openSettingsModal, selectConversation, startNewConversation, deleteConversation, addConversation, updateConversationTitle],
  );

  return (
    <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>
  );
}

export function useConversation() {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error('useConversation must be used inside ConversationProvider');
  return ctx;
}
