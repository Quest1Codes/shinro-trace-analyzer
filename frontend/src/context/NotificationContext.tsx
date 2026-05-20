import { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type NotificationType = 'error' | 'warning' | 'info';

export interface AppNotification {
  id: string;
  type: NotificationType;
  section: string;
  messages: string[];
  autoDismissMs: number | null;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  addNotification: (n: Omit<AppNotification, 'id'>) => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const addNotification = useCallback((n: Omit<AppNotification, 'id'>) => {
    setNotifications((prev) => [{ ...n, id: crypto.randomUUID() }, ...prev]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({ notifications, addNotification, dismissNotification, clearAll }),
    [notifications, addNotification, dismissNotification, clearAll],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
}
