import { Database } from "bun:sqlite";
import os from "os";
import fs from "fs";

// ── Database Location ─────────────────────────────────────
const SHINRO_DIR = os.homedir() + "/.shinro";
if (!fs.existsSync(SHINRO_DIR)) {
  fs.mkdirSync(SHINRO_DIR, { recursive: true });
}

const DB_PATH = SHINRO_DIR + "/app.db";
const db = new Database(DB_PATH);

// Enable foreign keys and WAL mode for performance
db.run("PRAGMA foreign_keys = ON");
db.run("PRAGMA journal_mode = WAL");

// ── Schema ────────────────────────────────────────────────

db.run(`
  CREATE TABLE IF NOT EXISTS query_traces (
    query_id    TEXT PRIMARY KEY,
    cluster_id  TEXT,
    title       TEXT,
    parsed_trace TEXT,
    suggestions TEXT,
    query_text  TEXT,
    created_at  INTEGER DEFAULT (strftime('%s', 'now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    query_id        TEXT NOT NULL,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    tool_calls      TEXT,
    created_at      INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (query_id) REFERENCES query_traces(query_id) ON DELETE CASCADE
  )
`);

// ── Prepared Statements ───────────────────────────────────

const stmtUpsertTrace = db.prepare(`
  INSERT INTO query_traces (query_id, cluster_id, title, parsed_trace, suggestions, query_text)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(query_id) DO UPDATE SET
    title = COALESCE(excluded.title, query_traces.title),
    parsed_trace = COALESCE(excluded.parsed_trace, query_traces.parsed_trace),
    suggestions = COALESCE(excluded.suggestions, query_traces.suggestions),
    cluster_id = COALESCE(excluded.cluster_id, query_traces.cluster_id),
    query_text = COALESCE(excluded.query_text, query_traces.query_text)
`);

const stmtGetTrace = db.prepare(`
  SELECT query_id, cluster_id, title, parsed_trace, suggestions, query_text, created_at
  FROM query_traces WHERE query_id = ?
`);

const stmtListTraces = db.prepare(`
  SELECT query_id, cluster_id, title, suggestions, query_text, created_at
  FROM query_traces WHERE cluster_id = ? ORDER BY created_at DESC
`);

const stmtListAllTraces = db.prepare(`
  SELECT query_id, cluster_id, title, suggestions, query_text, created_at
  FROM query_traces ORDER BY created_at DESC
`);

const stmtInsertMessage = db.prepare(`
  INSERT INTO messages (query_id, role, content, tool_calls)
  VALUES (?, ?, ?, ?)
`);

const stmtGetMessages = db.prepare(`
  SELECT id, role, content, tool_calls, created_at
  FROM messages WHERE query_id = ?
  ORDER BY id ASC
`);

const stmtDeleteMessages = db.prepare(`
  DELETE FROM messages WHERE query_id = ?
`);

const stmtDeleteTrace = db.prepare(`
  DELETE FROM query_traces WHERE query_id = ?
`);

const stmtDeleteAllTraces = db.prepare(`
  DELETE FROM query_traces
`);

const stmtDeleteTracesByCluster = db.prepare(`
  DELETE FROM query_traces WHERE cluster_id = ?
`);

const stmtUpdateTitle = db.prepare(`
  UPDATE query_traces SET title = ? WHERE query_id = ?
`);

const stmtUpdateSuggestions = db.prepare(`
  UPDATE query_traces SET suggestions = ? WHERE query_id = ?
`);

const stmtUpdateQueryText = db.prepare(`
  UPDATE query_traces SET query_text = ? WHERE query_id = ?
`);

// ── Public API ────────────────────────────────────────────

export interface TraceRecord {
  query_id: string;
  cluster_id: string | null;
  title: string | null;
  parsed_trace: string | null;
  suggestions: string | null;
  query_text: string | null;
  created_at: string;
}

export interface MessageRecord {
  id: number;
  role: string;
  content: string;
  tool_calls: string | null;
  created_at: string;
}

export interface TraceSummary {
  query_id: string;
  cluster_id: string | null;
  title: string | null;
  suggestions: string | null;
  query_text: string | null;
  created_at: string;
}

/**
 * Upsert a query trace. If the trace already exists, updates title and parsed_trace.
 */
export function saveQueryTrace(
  query_id: string,
  parsed_trace: string | null,
  title?: string | null,
  cluster_id?: string | null,
  suggestions?: string | null,
  query_text?: string | null,
): void {
  stmtUpsertTrace.run(query_id, cluster_id ?? null, title ?? null, parsed_trace ?? null, suggestions ?? null, query_text ?? null);
}

/**
 * Get a single query trace record.
 */
export function getQueryTrace(query_id: string): TraceRecord | null {
  return (stmtGetTrace.get(query_id) as TraceRecord) ?? null;
}

/**
 * List query traces globally (summaries only).
 */
export function listQueryTraces(cluster_id?: string | null): TraceSummary[] {
  // Ignored cluster_id constraint to display traces globally across connections
  return stmtListAllTraces.all() as TraceSummary[];
}

/**
 * Append a single message to the conversation for a query_id.
 */
export function appendMessage(
  query_id: string,
  role: string,
  content: string,
  tool_calls?: string | null,
): void {
  stmtInsertMessage.run(query_id, role, content, tool_calls ?? null);
}

/**
 * Get all messages for a query_id, ordered by creation time.
 */
export function getMessages(query_id: string): MessageRecord[] {
  return stmtGetMessages.all(query_id) as MessageRecord[];
}

/**
 * Delete all messages for a query_id (clear chat).
 */
export function clearMessages(query_id: string): void {
  stmtDeleteMessages.run(query_id);
}

/**
 * Delete a query trace and all associated messages (CASCADE).
 */
export function deleteTrace(query_id: string): void {
  stmtDeleteTrace.run(query_id);
}

/**
 * Delete traces and messages. If cluster_id is provided, only deletes for that cluster.
 */
export function deleteAllTraces(cluster_id?: string | null): void {
  if (cluster_id) {
    stmtDeleteTracesByCluster.run(cluster_id);
  } else {
    stmtDeleteAllTraces.run();
  }
}

/**
 * Update the title for a query trace.
 */
export function updateTraceTitle(query_id: string, title: string): void {
  stmtUpdateTitle.run(title, query_id);
}

/**
 * Update the suggestions for a query trace.
 */
export function updateTraceSuggestions(query_id: string, suggestions: string): void {
  stmtUpdateSuggestions.run(suggestions, query_id);
}

/**
 * Update the SQL query text for a query trace.
 */
export function updateTraceQueryText(query_id: string, query_text: string): void {
  stmtUpdateQueryText.run(query_text, query_id);
}

// ══════════════════════════════════════════════════════════
// ── Connections ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════

db.run(`
  CREATE TABLE IF NOT EXISTS connections (
    cluster_id  TEXT PRIMARY KEY,
    user_name   TEXT NOT NULL,
    endpoint    TEXT NOT NULL,
    is_removed  INTEGER NOT NULL DEFAULT 0,
    last_login  DATETIME DEFAULT (datetime('now'))
  )
`);

const stmtUpsertConnection = db.prepare(`
  INSERT INTO connections (cluster_id, user_name, endpoint, is_removed)
  VALUES (?, ?, ?, 0)
  ON CONFLICT(cluster_id) DO UPDATE SET
    user_name = excluded.user_name,
    endpoint = excluded.endpoint,
    is_removed = 0,
    last_login = datetime('now')
`);

const stmtListConnections = db.prepare(`
  SELECT cluster_id, user_name, endpoint, is_removed, last_login
  FROM connections WHERE is_removed = 0 ORDER BY last_login DESC
`);

const stmtListAllConnections = db.prepare(`
  SELECT cluster_id, user_name, endpoint, is_removed, last_login
  FROM connections ORDER BY last_login DESC
`);

const stmtGetConnection = db.prepare(`
  SELECT cluster_id, user_name, endpoint, is_removed, last_login
  FROM connections WHERE cluster_id = ?
`);

const stmtSoftDeleteConnection = db.prepare(`
  UPDATE connections SET is_removed = 1 WHERE cluster_id = ?
`);

const stmtTouchConnection = db.prepare(`
  UPDATE connections SET last_login = datetime('now') WHERE cluster_id = ?
`);

// ── Connection Types ──────────────────────────────────────

export interface ConnectionRecord {
  cluster_id: string;
  user_name: string;
  endpoint: string;
  is_removed: boolean;
  last_login: string;
}

export interface ConnectionSummary {
  cluster_id: string;
  user_name: string;
  endpoint: string;
  is_removed: boolean;
  last_login: string;
}

// ── Connection CRUD ───────────────────────────────────────

/**
 * Save a connection (password is stored separately in the macOS Keychain).
 */
export function saveConnection(
  cluster_id: string,
  user_name: string,
  endpoint: string,
): void {
  stmtUpsertConnection.run(cluster_id, user_name, endpoint);
}

/**
 * List active (non-removed) connections.
 */
export function listConnections(): ConnectionSummary[] {
  const rows = stmtListConnections.all() as any[];
  return rows.map((r) => ({
    cluster_id: r.cluster_id,
    user_name: r.user_name,
    endpoint: r.endpoint,
    is_removed: !!r.is_removed,
    last_login: r.last_login,
  }));
}

/**
 * List all connections including removed ones.
 */
export function listAllConnections(): ConnectionSummary[] {
  const rows = stmtListAllConnections.all() as any[];
  return rows.map((r) => ({
    cluster_id: r.cluster_id,
    user_name: r.user_name,
    endpoint: r.endpoint,
    is_removed: !!r.is_removed,
    last_login: r.last_login,
  }));
}

/**
 * Get a single connection.
 */
export function getConnection(cluster_id: string): ConnectionRecord | null {
  const row = stmtGetConnection.get(cluster_id) as any | undefined;
  if (!row) return null;
  return {
    cluster_id: row.cluster_id,
    user_name: row.user_name,
    endpoint: row.endpoint,
    is_removed: !!row.is_removed,
    last_login: row.last_login,
  };
}

/**
 * Soft-delete a connection (marks as removed, preserves history).
 */
export function deleteConnection(cluster_id: string): void {
  stmtSoftDeleteConnection.run(cluster_id);
}

/**
 * Update last_login timestamp for a connection.
 */
export function touchConnection(cluster_id: string): void {
  stmtTouchConnection.run(cluster_id);
}
