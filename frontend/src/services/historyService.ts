import type { ChatMessage, ParsedTraceResponse, ToolCallInfo } from '../types';

const API_BASE = '/api/ai';


export async function saveTrace(
  query_id: string,
  parsed_trace: ParsedTraceResponse,
  title?: string,
  cluster_id?: string | null,
  query_text?: string | null,
): Promise<void> {
  await fetch(`${API_BASE}/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_id, parsed_trace, title, cluster_id, query_text }),
  });
}


export interface TraceSummary {
  query_id: string;
  cluster_id: string | null;
  title: string | null;
  suggestions?: string[];
  query_text: string | null;
  created_at: string;
}

export async function fetchTraces(): Promise<TraceSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/traces`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.traces ?? []).map((t: { query_id: string; cluster_id: string | null; title: string | null; suggestions: string | null; query_text: string | null; created_at: string }) => ({
      ...t,
      suggestions: t.suggestions ? JSON.parse(t.suggestions) : [],
    }));
  } catch {
    return [];
  }
}


export async function updateTraceTitle(query_id: string, title: string): Promise<void> {
  await fetch(`${API_BASE}/traces/${encodeURIComponent(query_id)}/title`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export async function updateTraceSuggestions(query_id: string, suggestions: string[]): Promise<void> {
  await fetch(`${API_BASE}/traces/${encodeURIComponent(query_id)}/suggestions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestions }),
  });
}

/**
 * Update the SQL query text for a trace (autosave).
 */
export async function updateTraceQueryText(query_id: string, query_text: string): Promise<void> {
  await fetch(`${API_BASE}/traces/${encodeURIComponent(query_id)}/query-text`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_text }),
  });
}




export async function fetchMessages(query_id: string): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(query_id)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.messages ?? []).map((m: ChatMessage) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      toolCalls: m.toolCalls,
    }));
  } catch {
    return [];
  }
}


export async function saveMessage(
  query_id: string,
  role: string,
  content: string,
  toolCalls?: ToolCallInfo[],
): Promise<void> {
  await fetch(`${API_BASE}/messages/${encodeURIComponent(query_id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, content, toolCalls }),
  });
}


export async function clearChatMessages(query_id: string): Promise<void> {
  await fetch(`${API_BASE}/messages/${encodeURIComponent(query_id)}`, {
    method: 'DELETE',
  });
}


export async function deleteTraceAndMessages(query_id: string): Promise<void> {
  await fetch(`${API_BASE}/traces/${encodeURIComponent(query_id)}`, {
    method: 'DELETE',
  });
}

/**
 * Delete traces and messages from SQLite. If cluster_id is provided, only for that cluster.
 */
export async function deleteAllTracesAndMessages(cluster_id?: string | null): Promise<void> {
  const params = cluster_id ? `?cluster_id=${encodeURIComponent(cluster_id)}` : '';
  await fetch(`${API_BASE}/traces${params}`, {
    method: 'DELETE',
  });
}
