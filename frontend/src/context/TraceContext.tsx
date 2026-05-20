import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ParsedTraceResponse, ChatMessage, ToolCallInfo } from '../types';
import { ParserStatus } from '../types';
import { useNotifications } from './NotificationContext';
import {
  executeQuery,
  fetchSystemTables,
  parseQuery,
  clearLogs,
} from '../services/queryService';
import {
  saveTrace,
  fetchTraces,
  fetchMessages,
  saveMessage,
  deleteTraceAndMessages,
  updateTraceTitle,
  updateTraceSuggestions,
  updateTraceQueryText,
  deleteAllTracesAndMessages,
} from '../services/historyService';
import { fetchTraceMeta } from '../services/traceMetaService';
import { getAIKeyStatus } from '../services/aiService';
import { useConnection } from './ConnectionContext';

export type ExecutionState = 'idle' | 'executing' | 'fetching_logs' | 'parsing' | 'done' | 'error';

export interface QRec {
  query_id: string;
  clusterId: string | null;
  traceResult: ParsedTraceResponse | null;
  executionState: ExecutionState;
  executionError: string | null;
  chatMessages: ChatMessage[];

  traceSuggestions: string[] | null;
  traceName: string | null;
  traceDescription: string | null;
  queryText: string;
  createdAt?: string;
}

interface TraceContextValue {

  queryIds: string[];
  refreshQueryList: () => Promise<void>;


  queries: Map<string, QRec>;


  activeQueryId: string | null;
  selectQuery: (id: string | null) => Promise<void>;


  traceResult: ParsedTraceResponse | null;
  executionState: ExecutionState;
  executionError: string | null;
  queryId: string | null;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  traceSuggestions: string[] | null;
  traceName: string | null;


  currentQuery: string;
  setCurrentQuery: (q: string) => void;


  runTrace: (query: string) => Promise<boolean>;
  deleteQuery: (id: string) => Promise<void>;
  deleteAllQueries: () => Promise<void>;
  clearTrace: () => void;
  renameTrace: (id: string, name: string) => void;


  persistMessage: (role: string, content: string, toolCalls?: ToolCallInfo[]) => Promise<void>;
}

const TraceContext = createContext<TraceContextValue | null>(null);

/**
 * Generate a human-readable title from a SQL query.
 * Extracts the action (SELECT, INSERT, etc.), table name, and key clauses.
 */
function generateQueryTitle(sql: string): string {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  // Extract the SQL action
  const actionMatch = normalized.match(/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|EXPLAIN|WITH|SHOW|OPTIMIZE|TRUNCATE)/i);
  const action = actionMatch ? actionMatch[1].toUpperCase() : '';

  // Handle CTEs — look for the final SELECT's FROM
  const cteStripped = action === 'WITH'
    ? normalized.replace(/^WITH\s+.+?\)\s*/i, '')
    : normalized;

  // Extract table name from FROM, INTO, UPDATE, or TABLE
  const tableMatch = cteStripped.match(/\bFROM\s+(\S+)/i)
    || cteStripped.match(/\bINTO\s+(\S+)/i)
    || cteStripped.match(/\bUPDATE\s+(\S+)/i)
    || cteStripped.match(/\bTABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(\S+)/i);

  let table = tableMatch ? tableMatch[1].replace(/[`"(]/g, '') : '';
  // Use just the table name without db prefix for brevity
  if (table.includes('.')) {
    table = table.split('.').pop() || table;
  }

  // Extract key clauses
  const hasJoin = /\bJOIN\b/i.test(normalized);
  const hasGroupBy = /\bGROUP\s+BY\b/i.test(normalized);
  const hasOrderBy = /\bORDER\s+BY\b/i.test(normalized);
  const hasWhere = /\bWHERE\b/i.test(normalized);
  const hasAgg = /\b(COUNT|SUM|AVG|MIN|MAX|UNIQ)\s*\(/i.test(normalized);

  // Build a concise title
  const parts: string[] = [];

  if (action === 'WITH') parts.push('CTE Query');
  else if (action === 'SELECT' && hasAgg) parts.push('Aggregation');
  else if (action === 'SELECT') parts.push('Query');
  else if (action) parts.push(action.charAt(0) + action.slice(1).toLowerCase());

  if (table) parts.push(`on ${table}`);

  const modifiers: string[] = [];
  if (hasJoin) modifiers.push('Join');
  if (hasGroupBy) modifiers.push('Grouped');
  if (hasWhere) modifiers.push('Filtered');
  if (hasOrderBy) modifiers.push('Sorted');

  if (modifiers.length > 0) {
    parts.push(`(${modifiers.join(', ')})`);
  }

  const title = parts.join(' ');
  return title || normalized.substring(0, 60);
}

const EMPTY_CHAT: ChatMessage[] = [];

const SECTION_LABELS: Record<keyof ParsedTraceResponse, string> = {
  metadata: 'Metadata',
  tableIOStats: 'Table I/O Stats',
  memoryTracking: 'Memory Tracking',
  materializedViewStats: 'Materialized Views',
  mvCascadeTree: 'MV Cascade Tree',
};

export function TraceProvider({ children }: { children: React.ReactNode }) {
  const [queryIds, setQueryIds] = useState<string[]>([]);
  const [queries, setQueries] = useState<Map<string, QRec>>(() => new Map());
  const [activeQueryId, setActiveQueryIdState] = useState<string | null>(null);
  const [editorQuery, setEditorQuery] = useState<string>('');
  const { activeClusterId, connections } = useConnection();
  const { addNotification, clearAll: clearNotifications } = useNotifications();

  const pushTraceNotifications = useCallback((parsed: ParsedTraceResponse) => {
    clearNotifications();
    (Object.keys(SECTION_LABELS) as (keyof ParsedTraceResponse)[]).forEach((key) => {
      const section = parsed[key];
      if (!section.messages || section.messages.length === 0) return;
      let type: 'error' | 'warning' | 'info';
      let autoDismissMs: number | null;
      if (section.status === ParserStatus.Error) {
        type = 'error'; autoDismissMs = null;
      } else if (section.status === ParserStatus.Partial) {
        type = 'warning'; autoDismissMs = 10000;
      } else {
        type = 'info'; autoDismissMs = 6000;
      }
      addNotification({ type, section: SECTION_LABELS[key], messages: section.messages, autoDismissMs });
    });
  }, [addNotification, clearNotifications]);

  // Debounced autosave for query text
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedTextRef = useRef<string>('');

  const refreshQueryList = useCallback(async () => {
    // Fetch traces globally (ignoring active cluster)
    const dbTraces = await fetchTraces();

    // SQLite query is already sorted by created_at DESC
    const ids = dbTraces.map((t) => t.query_id);
    setQueryIds(ids);

    setActiveQueryIdState((prev) => (prev && !ids.includes(prev) ? null : prev));

    setQueries((prev) => {
      const next = new Map(prev);
      dbTraces.forEach((t) => {
        const existing = next.get(t.query_id) ?? {
          query_id: t.query_id,
          clusterId: t.cluster_id || null,
          traceResult: null,
          executionState: 'idle' as ExecutionState,
          executionError: null,
          chatMessages: [],
          traceSuggestions: (t.suggestions as any) || null,
          traceName: t.title || null,
          traceDescription: t.query_text ? generateQueryTitle(t.query_text) : null,
          queryText: t.query_text || '',
          createdAt: t.created_at,
        };
        if (t.title && !existing.traceName) existing.traceName = t.title;
        if (t.created_at) existing.createdAt = t.created_at;
        if (t.cluster_id) existing.clusterId = t.cluster_id;
        if (t.query_text && !existing.queryText) existing.queryText = t.query_text;
        if (t.suggestions && t.suggestions.length > 0 && (!existing.traceSuggestions || existing.traceSuggestions.length === 0)) {
          existing.traceSuggestions = t.suggestions as any;
        }
        next.set(t.query_id, existing);
      });
      return next;
    });
  }, []);

  // Refresh initial list
  useEffect(() => {
    refreshQueryList();
  }, [refreshQueryList]);

  const upsertQRec = useCallback((id: string, patch: Partial<QRec>) => {
    setQueries((prev) => {
      const next = new Map(prev);
      const existing = next.get(id) ?? {
        query_id: id,
        clusterId: activeClusterId,
        traceResult: null,
        executionState: 'idle' as ExecutionState,
        executionError: null,
        chatMessages: [],
        traceSuggestions: null,
        traceName: null,
        traceDescription: null,
        queryText: '',
      };
      next.set(id, { ...existing, ...patch });
      return next;
    });
  }, []);

  const selectQuery = useCallback(
    async (id: string | null) => {
      // Flush any pending autosave before switching
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      if (id === null) {
        setActiveQueryIdState(null);
        setEditorQuery('');
        lastSavedTextRef.current = '';
        return;
      }
      setActiveQueryIdState(id);

      // Load the query text for this trace into the editor
      const existing = queries.get(id);
      const text = existing?.queryText || '';
      setEditorQuery(text);
      lastSavedTextRef.current = text;


      setQueries((prev) => {
        if (prev.has(id)) return prev;
        const next = new Map(prev);
        next.set(id, {
          query_id: id,
          clusterId: activeClusterId,
          traceResult: null,
          executionState: 'parsing',
          executionError: null,
          chatMessages: [],
          traceSuggestions: null,
          traceName: null,
          traceDescription: null,
          queryText: '',
        });
        return next;
      });


      const alreadyHasParsed = queries.get(id)?.traceResult != null;
      if (!alreadyHasParsed) {
        const parsed = await parseQuery(id);
        if (parsed) {
          upsertQRec(id, { traceResult: parsed, executionState: 'done', executionError: null });
          pushTraceNotifications(parsed);
        } else {
          upsertQRec(id, { executionState: 'error', executionError: 'Failed to parse trace data.' });
        }
      } else {
        const existing = queries.get(id);
        if (existing?.traceResult) pushTraceNotifications(existing.traceResult);
      }


      const alreadyHasMessages = (queries.get(id)?.chatMessages ?? []).length > 0;
      if (!alreadyHasMessages) {
        try {
          const messages = await fetchMessages(id);
          if (messages.length > 0) {
            upsertQRec(id, { chatMessages: messages });
          }
        } catch {

        }
      }
    },
    [queries, upsertQRec, activeClusterId, pushTraceNotifications],
  );

  const runTrace = useCallback(
    async (query: string): Promise<boolean> => {

      // Block execution if no active connection is configured
      if (!activeClusterId || !connections.some(c => c.cluster_id === activeClusterId)) {
        const placeholder = 'pending';
        upsertQRec(placeholder, {
          executionState: 'error',
          executionError: 'No active ClickHouse connection configured. Add one in Settings → Connections.',
        });
        setActiveQueryIdState(placeholder);
        return false;
      }

      const exec = await executeQuery(query);
      if (!exec.success || !exec.query_id) {
        const placeholder = 'pending';
        upsertQRec(placeholder, {
          executionState: 'error',
          executionError: exec.error ?? 'Query execution failed.',
        });
        setActiveQueryIdState(placeholder);
        return false;
      }
      const queryId = exec.query_id;
      upsertQRec(queryId, {
        query_id: queryId,
        queryText: query,
        executionState: 'fetching_logs',
        executionError: null,
      });
      setActiveQueryIdState(queryId);


      const logs = await fetchSystemTables(queryId);
      if (!logs.success) {
        upsertQRec(queryId, {
          executionState: 'error',
          executionError: logs.error ?? 'Failed to fetch system logs.',
        });
        await refreshQueryList();
        return false;
      }


      upsertQRec(queryId, { executionState: 'parsing' });
      const parsed = await parseQuery(queryId);
      if (!parsed) {
        upsertQRec(queryId, {
          executionState: 'error',
          executionError: 'Failed to parse trace data.',
        });
        await refreshQueryList();
        return false;
      }

      const description = generateQueryTitle(query);
      upsertQRec(queryId, {
        traceResult: parsed,
        executionState: 'done',
        executionError: null,
        traceSuggestions: null,
        traceName: description,
        traceDescription: description,
      });
      pushTraceNotifications(parsed);


      // Step 4 — persist parsed trace to SQLite (scoped to active cluster)
      try {
        await saveTrace(queryId, parsed, description, activeClusterId, query);
      } catch {

      }

      await refreshQueryList();


      try {
        const keyStatus = await getAIKeyStatus();

        let provider = '';
        let model = '';
        if (keyStatus.openrouter) { provider = 'openrouter'; model = keyStatus.openrouterModel || 'anthropic/claude-sonnet-4'; }
        else if (keyStatus.openai) { provider = 'openai'; model = keyStatus.openaiModel || 'gpt-5.4-mini'; }
        else if (keyStatus.anthropic) { provider = 'anthropic'; model = keyStatus.anthropicModel || 'claude-haiku-4-5-20251001'; }

        if (provider && model) {
          const meta = await fetchTraceMeta(query, provider, model);
          if (meta?.name) {
            try { await updateTraceTitle(queryId, meta.name); } catch { }
          }
          if (meta?.suggestions && meta.suggestions.length > 0) {
            try { await updateTraceSuggestions(queryId, meta.suggestions); } catch { }
          }
          upsertQRec(queryId, {
            traceSuggestions: meta ? meta.suggestions : [],
            traceName: meta ? meta.name : null,
          });
        } else {
          upsertQRec(queryId, { traceSuggestions: [] });
        }
      } catch {
        upsertQRec(queryId, { traceSuggestions: [] });
      }

      return true;
    },
    [upsertQRec, refreshQueryList, activeClusterId, connections, pushTraceNotifications],
  );

  const deleteQuery = useCallback(
    async (id: string) => {
      const result = await clearLogs(id);
      if (result.error) {
        throw new Error(result.error);
      }

      try {
        await deleteTraceAndMessages(id);
      } catch {

      }
      setQueries((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setQueryIds((prev) => prev.filter((q) => q !== id));
      setActiveQueryIdState((prev) => (prev === id ? null : prev));
    },
    [],
  );

  const deleteAllQueries = useCallback(async () => {
    // Clear filesystem logs for each query in the current cluster only
    for (const id of queryIds) {
      try { await clearLogs(id); } catch { /* best-effort */ }
    }
    // Clear traces from SQLite for the active cluster only
    await deleteAllTracesAndMessages(activeClusterId);
    setQueries(new Map());
    setQueryIds([]);
    setActiveQueryIdState(null);
  }, [activeClusterId, queryIds]);

  const clearTrace = useCallback(() => {
    // Flush any pending autosave
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    setActiveQueryIdState(null);
    setEditorQuery('');
    lastSavedTextRef.current = '';
  }, []);

  // setCurrentQuery updates the editor AND the per-trace QRec, with debounced autosave
  const setCurrentQuery = useCallback((q: string) => {
    setEditorQuery(q);

    // Also update the active QRec so it persists across conversation switches
    if (activeQueryId) {
      upsertQRec(activeQueryId, { queryText: q });

      // Debounced autosave to backend (1s delay)
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(() => {
        if (activeQueryId && q !== lastSavedTextRef.current) {
          lastSavedTextRef.current = q;
          updateTraceQueryText(activeQueryId, q).catch(() => { /* best-effort */ });
        }
      }, 1000);
    }
  }, [activeQueryId, upsertQRec]);

  // Derive currentQuery from the editor state
  const currentQuery = editorQuery;

  const renameTrace = useCallback((id: string, name: string) => {
    upsertQRec(id, { traceName: name });
  }, [upsertQRec]);

  const active = activeQueryId ? queries.get(activeQueryId) ?? null : null;

  const setChatMessages = useCallback<React.Dispatch<React.SetStateAction<ChatMessage[]>>>(
    (valueOrFn) => {
      if (!activeQueryId) return;
      setQueries((prev) => {
        const existing = prev.get(activeQueryId);
        if (!existing) return prev;
        const nextMessages =
          typeof valueOrFn === 'function'
            ? (valueOrFn as (prev: ChatMessage[]) => ChatMessage[])(existing.chatMessages)
            : valueOrFn;
        const next = new Map(prev);
        next.set(activeQueryId, { ...existing, chatMessages: nextMessages });
        return next;
      });
    },
    [activeQueryId],
  );


  const persistMessage = useCallback(
    async (role: string, content: string, toolCalls?: ToolCallInfo[]) => {
      if (!activeQueryId) return;
      try {
        await saveMessage(activeQueryId, role, content, toolCalls);
      } catch {

      }
    },
    [activeQueryId],
  );

  const value = useMemo<TraceContextValue>(
    () => ({
      queryIds,
      refreshQueryList,
      queries,
      activeQueryId,
      selectQuery,
      traceResult: active?.traceResult ?? null,
      executionState: active?.executionState ?? 'idle',
      executionError: active?.executionError ?? null,
      chatMessages: active?.chatMessages ?? EMPTY_CHAT,
      setChatMessages,
      traceSuggestions: active?.traceSuggestions ?? null,
      traceName: active?.traceName ?? null,
      currentQuery,
      setCurrentQuery,
      runTrace,
      deleteQuery,
      deleteAllQueries,
      clearTrace,
      renameTrace,
      queryId: activeQueryId,
      persistMessage,
    }),
    [
      queryIds,
      refreshQueryList,
      queries,
      activeQueryId,
      selectQuery,
      active,
      setChatMessages,
      currentQuery,
      runTrace,
      deleteQuery,
      deleteAllQueries,
      clearTrace,
      renameTrace,
      persistMessage,
      setCurrentQuery,
    ],
  );

  return <TraceContext.Provider value={value}>{children}</TraceContext.Provider>;
}

export function useTrace() {
  const ctx = useContext(TraceContext);
  if (!ctx) throw new Error('useTrace must be used inside TraceProvider');
  return ctx;
}
