import type { ParsedTraceResponse } from '../types';

const API_BASE = '/api/query';
const PARSER_BASE = '/api/parser';

export interface ExecuteQueryResponse {
  success?: boolean;
  error?: string;
  query_id?: string;
}

export interface SimpleSuccessResponse {
  success?: boolean;
  error?: string;
}

export interface ListQueriesResponse {
  queries: string[];
  error?: string;
}

export interface ClearResponse {
  message?: string;
  error?: string;
}

export async function listQueries(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/list-queries`);
  if (!res.ok) return [];
  const data: ListQueriesResponse = await res.json();
  return Array.isArray(data.queries) ? data.queries : [];
}

export async function executeQuery(query: string): Promise<ExecuteQueryResponse> {
  const res = await fetch(`${API_BASE}/execute-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data: ExecuteQueryResponse = await res.json().catch(() => ({}));
  if (!res.ok) return { ...data, success: false };
  return data;
}

export async function fetchSystemTables(queryId: string): Promise<SimpleSuccessResponse> {
  const res = await fetch(`${API_BASE}/query-system-tables/${encodeURIComponent(queryId)}`);
  const data: SimpleSuccessResponse = await res.json().catch(() => ({}));
  if (!res.ok) return { ...data, success: false };
  return data;
}

export async function parseQuery(queryId: string): Promise<ParsedTraceResponse | null> {
  const res = await fetch(`${PARSER_BASE}/parse/${encodeURIComponent(queryId)}`);
  if (!res.ok) return null;
  return (await res.json()) as ParsedTraceResponse;
}

export async function clearLogs(queryId: string): Promise<ClearResponse> {
  const res = await fetch(`${API_BASE}/clear-logs/${encodeURIComponent(queryId)}`);
  const data: ClearResponse = await res.json().catch(() => ({}));
  if (!res.ok) return { ...data, error: data.error || `HTTP ${res.status}` };
  return data;
}

export async function clearAllLogs(): Promise<ClearResponse> {
  const res = await fetch(`${API_BASE}/clear-all-logs`);
  const data: ClearResponse = await res.json().catch(() => ({}));
  if (!res.ok) return { ...data, error: data.error || `HTTP ${res.status}` };
  return data;
}
