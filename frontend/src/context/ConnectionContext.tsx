import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import {
  fetchConnections,
  fetchAllConnections,
  addConnection as addConnectionApi,
  removeConnection,
  activateConnection as activateApi,
  type ConnectionSummary,
} from '../services/connectionService';
import { deleteAllTracesAndMessages } from '../services/historyService';

export type { ConnectionSummary };

export interface ConnectionInfo {
  url: string;
  user: string;
}

interface ConnectionContextValue {
  // Active connections only (non-removed)
  connections: ConnectionSummary[];
  // All connections including removed (for historical lookup)
  allConnections: ConnectionSummary[];
  refreshConnections: () => Promise<void>;

  // Active connection
  activeClusterId: string | null;
  connectionInfo: ConnectionInfo | null;
  isConnected: boolean;

  // Actions
  addConnection: (
    endpoint: string,
    userName: string,
    password: string,
    skipTest?: boolean,
    nativePort?: string,
    nativeSecure?: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  deleteConnection: (clusterId: string) => Promise<void>;
  selectConnection: (clusterId: string) => Promise<{ success: boolean; error?: string }>;

  // Legacy compat
  markConnected: (info: ConnectionInfo) => void;
  disconnect: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [allConnections, setAllConnections] = useState<ConnectionSummary[]>([]);
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);

  const isConnected = connectionInfo !== null;

  // Load connections on mount
  const refreshConnections = useCallback(async () => {
    const [active, all] = await Promise.all([fetchConnections(), fetchAllConnections()]);
    setConnections(active);
    setAllConnections(all);
  }, []);

  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  // Auto-select first active connection if none is active
  useEffect(() => {
    if (activeClusterId === null && connections.length > 0) {
      const first = connections[0]!;
      // Activate the first connection
      activateApi(first.cluster_id).then((result) => {
        if (result.success) {
          setActiveClusterId(first.cluster_id);
          setConnectionInfo({
            url: result.endpoint || first.endpoint,
            user: result.user_name || first.user_name,
          });
        }
      });
    }
  }, [connections, activeClusterId]);

  const addConnection = useCallback(
    async (
      endpoint: string,
      userName: string,
      password: string,
      skipTest?: boolean,
      nativePort?: string,
      nativeSecure?: boolean,
    ) => {
      const result = await addConnectionApi(
        endpoint,
        userName,
        password,
        skipTest,
        nativePort,
        nativeSecure,
      );
      if (result.success) {
        await refreshConnections();
        // Auto-activate the newly added connection
        if (result.cluster_id) {
          const activateResult = await activateApi(result.cluster_id);
          if (activateResult.success) {
            setActiveClusterId(result.cluster_id);
            setConnectionInfo({
              url: activateResult.endpoint || endpoint,
              user: activateResult.user_name || userName,
            });
          }
        }
      }
      return result;
    },
    [refreshConnections],
  );

  const deleteConnection = useCallback(
    async (clusterId: string) => {
      // Soft-delete the connection (marks as removed, preserves history)
      await removeConnection(clusterId);

      // Refresh both lists to get updated is_removed state
      await refreshConnections();

      // If we deleted the active connection, switch to the next active one
      if (activeClusterId === clusterId) {
        // connections state hasn't updated yet from refreshConnections,
        // so we need to get the fresh list
        const freshActive = await fetchConnections();
        if (freshActive.length > 0) {
          const next = freshActive[0]!;
          const result = await activateApi(next.cluster_id);
          if (result.success) {
            setActiveClusterId(next.cluster_id);
            setConnectionInfo({
              url: result.endpoint || next.endpoint,
              user: result.user_name || next.user_name,
            });
          } else {
            setActiveClusterId(null);
            setConnectionInfo(null);
          }
        } else {
          // No active connections left
          setActiveClusterId(null);
          setConnectionInfo(null);
        }
      }
    },
    [activeClusterId, refreshConnections],
  );

  const selectConnection = useCallback(
    async (clusterId: string) => {
      const result = await activateApi(clusterId);
      if (result.success) {
        setActiveClusterId(clusterId);
        setConnectionInfo({
          url: result.endpoint || '',
          user: result.user_name || '',
        });
      }
      return result;
    },
    [],
  );

  // Legacy compat for ConnectionSetup page
  const markConnected = useCallback((info: ConnectionInfo) => {
    setConnectionInfo(info);
  }, []);

  const disconnect = useCallback(() => {
    setActiveClusterId(null);
    setConnectionInfo(null);
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      connections,
      allConnections,
      refreshConnections,
      activeClusterId,
      connectionInfo,
      isConnected,
      addConnection,
      deleteConnection,
      selectConnection,
      markConnected,
      disconnect,
    }),
    [
      connections,
      allConnections,
      refreshConnections,
      activeClusterId,
      connectionInfo,
      isConnected,
      addConnection,
      deleteConnection,
      selectConnection,
      markConnected,
      disconnect,
    ],
  );

  return (
    <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
  );
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error('useConnection must be used inside ConnectionProvider');
  return ctx;
}
