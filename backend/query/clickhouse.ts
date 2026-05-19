import { spawn, exec as execCb, execFile as execFileCb } from "child_process";
import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { writeFile } from "fs/promises";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { promisify } from "util";
import dns from "dns/promises";
import { TraceParser } from "../parser/parser";
import {
  getQueryLogPath,
  getTablesPath,
  getTracePath,
  getViewLogPath,
} from "../helpers/fs";

import type { CHCredential } from "../keychain/clickhouse_credential";

import { clickhouseKeychain } from "../keychain/clickhouse_credential";

import { BLANK_JSON_DATA } from "../helpers/stubs";

export { clickhouseRouter } from "./router";

const exec = promisify(execCb);
const execFile = promisify(execFileCb);

const EXEC_TIMEOUT = 120_000;
const BINARY_CHECK_TIMEOUT = 10_000;

const HTTP_TO_NATIVE_PORT: Record<string, { port: string; secure: boolean }> = {
  "8443": { port: "9440", secure: true },
  "8123": { port: "9000", secure: false },
};

const CONFIG_PATH = homedir() + "/.shinro/config.json";

function readBinaryConfig(): string | undefined {
  try {
    if (!existsSync(CONFIG_PATH)) return undefined;
    const data = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return typeof data.binaryPath === "string" ? data.binaryPath : undefined;
  } catch {
    return undefined;
  }
}

function writeBinaryConfig(path: string): void {
  mkdirSync(homedir() + "/.shinro", { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify({ binaryPath: path }, null, 2));
}

let binaryPath: string | undefined;

export function getBinaryPath() {
  return binaryPath;
}

async function validateBinary(path: string): Promise<boolean> {
  try {
    await execFile(path, ["client", "--version"], {
      timeout: BINARY_CHECK_TIMEOUT,
    });
    return true;
  } catch {
    return false;
  }
}

export async function findBinary(): Promise<string | undefined> {
  if (binaryPath && (await validateBinary(binaryPath))) return binaryPath;

  const saved = readBinaryConfig();
  if (saved && (await validateBinary(saved))) {
    binaryPath = saved;
    return saved;
  }

  try {
    const { stdout } = await exec("which clickhouse", { timeout: 5_000 });
    const path = stdout.trim();
    if (path && (await validateBinary(path))) {
      binaryPath = path;
      return path;
    }
  } catch {}

  return undefined;
}

export async function setBinaryPath(path: string): Promise<void> {
  if (!(await validateBinary(path))) {
    throw new Error(`Invalid clickhouse binary at: ${path}`);
  }
  binaryPath = path;
  writeBinaryConfig(path);
}

async function resolveHostname(hostname: string): Promise<string> {
  // macOS mDNS .local hostnames are not resolvable by the ClickHouse binary.
  // Use the OS resolver (which supports mDNS) to get the actual IP.
  if (hostname.endsWith(".local")) {
    try {
      const { address } = await dns.lookup(hostname);
      return address;
    } catch {
      return "127.0.0.1";
    }
  }
  return hostname;
}

async function buildClientArgs(query: string): Promise<string[]> {
  const args = ["client"];
  const credentials = clickhouseKeychain.getActiveCredential();
  if (credentials) {
    const parsed = new URL(credentials.url);
    const hostname = await resolveHostname(parsed.hostname);
    args.push("--host", hostname);

    const httpPort = credentials.port || parsed.port;
    const mapped = httpPort ? HTTP_TO_NATIVE_PORT[httpPort] : undefined;

    if (mapped) {
      args.push("--port", mapped.port);
      if (mapped.secure) args.push("--secure");
    } else if (httpPort) {
      args.push("--port", httpPort);
      if (credentials.secure) args.push("--secure");
    } else if (credentials.secure) {
      args.push("--secure");
    }

    if (credentials.user) args.push("--user", credentials.user);
    if (credentials.password) args.push("--password", credentials.password);
  }

  args.push(
    "--async_insert=0",
    "--send_logs_level=trace",
    "--format=null",
    "-q",
    query,
  );
  return args;
}

export async function executeQuery(query: string): Promise<string> {
  // Returns query ID if successful, throws an error if execution fails.

  if (!binaryPath) throw new Error("ClickHouse binary not configured");

  const args = await buildClientArgs(query);

  const child = spawn(binaryPath, args, { stdio: ["pipe", "pipe", "pipe"] });
  // Close stdin so INSERT queries don't hang waiting for input
  child.stdin.end();

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Process timed out after 120 seconds"));
    }, EXEC_TIMEOUT);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  if (exitCode !== 0) {
    throw new Error(stderr || stdout || `Process exited with code ${exitCode}`);
  }

  // parse stderr (trace log) to get query data
  const parser = new TraceParser(stderr, BLANK_JSON_DATA, BLANK_JSON_DATA);
  const queryID = parser.getMetadata().response?.queryId;

  if (!queryID) {
    throw new Error("Failed to extract Query ID from trace");
  }

  // write trace to final location
  const finalTracePath = getTracePath(queryID, true)!;
  await writeFile(finalTracePath, stderr);
  return queryID;
}

// ─── Singleton ClickHouse JS client ─────────────────────
// A single long-lived client is reused across all calls within the process.
// must invoke `invalidateCHClient()` whenever the active credential
// changes so the next `getCHClient()` rebuilds with fresh credentials.

let chClient: ClickHouseClient | null = null;

// Cached cluster name, tied to the lifecycle of `chClient`/`credentials`.
// `undefined` means "not yet probed"; `null` means "probed, no cluster".
let cachedClusterName: string | null | undefined;

export function getCHClient(): ClickHouseClient {
  const credentials = clickhouseKeychain.getActiveCredential();
  if (!credentials) throw new Error("ClickHouse credentials not configured");
  if (!chClient) {
    chClient = createClient({
      url: credentials.url,
      username: credentials.user,
      password: credentials.password,
      request_timeout: 60_000,
    });
  }
  return chClient;
}

export async function invalidateCHClient(): Promise<void> {
  if (chClient) {
    await chClient.close().catch(() => {});
    chClient = null;
  }
  cachedClusterName = undefined;
}

export async function testConnection(
  url?: string,
  user?: string,
  password?: string,
): Promise<void> {
  let targetUrl: string;
  let targetUser: string;
  let targetPass: string;

  if (url) {
    targetUrl = url;
    targetUser = user ?? "default";
    targetPass = password ?? "";
  } else {
    const active = clickhouseKeychain.getActiveCredential();
    if (!active) throw new Error("url is required");
    targetUrl = active.url;
    targetUser = user ?? active.user ?? "default";
    targetPass = password ?? active.password ?? "";
  }

  const testClient = createClient({
    url: targetUrl,
    username: targetUser,
    password: targetPass,
  });
  try {
    const result = await testClient.query({
      query: "SELECT 1",
      format: "JSON",
    });
    await result.json();
  } finally {
    await testClient.close();
  }
}

export async function checkClusterPresence(
  client: ClickHouseClient,
): Promise<string | null> {
  try {
    const result = await client.query({
      query: "SELECT cluster FROM system.clusters ORDER BY cluster LIMIT 1",
      format: "JSON",
    });
    const json = (await result.json()) as { data: { cluster: string }[] };
    return json.data[0]?.cluster ?? null;
  } catch {
    return null;
  }
}

async function getClusterName(
  client: ClickHouseClient,
): Promise<string | null> {
  if (cachedClusterName !== undefined) return cachedClusterName;
  cachedClusterName = await checkClusterPresence(client);
  return cachedClusterName;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ClickHouse flushes system.query_log and system.query_views_log
// asynchronously (default flush_interval = 7500ms). We poll until the entry
// appears or we time out (~30s).
async function waitForQueryLog(
  client: ClickHouseClient,
  tableSql: string,
  queryId: string,
  maxWaitMs = 30_000,
  pollIntervalMs = 2_000,
): Promise<string> {
  const deadline = Date.now() + maxWaitMs;
  let lastResult = BLANK_JSON_DATA;

  while (Date.now() < deadline) {
    const result = await client.query({
      query: tableSql,
      format: "JSON",
      query_params: { qid: queryId },
    });
    lastResult = await result.text();
    const parsed = JSON.parse(lastResult) as { data: unknown[] };
    if (parsed.data && parsed.data.length > 0) return lastResult;
    await sleep(pollIntervalMs);
  }

  return lastResult; // return whatever we have even if empty
}

export async function querySystemTables(queryID: string): Promise<void> {
  if (!queryID)
    throw new Error(
      "Could not extract query_id from trace.txt. Run /execute-query first.",
    );

  const queryLogPath = getQueryLogPath(queryID, true)!;
  const viewLogPath = getViewLogPath(queryID, true)!;
  const tablesPath = getTablesPath(queryID, true)!;

  const client = getCHClient();

  const clusterName = await getClusterName(client);
  const wrap = (table: string) =>
    clusterName ? `clusterAllReplicas('${clusterName}', ${table})` : table;

  // Force flush logs to eliminate background poll waiting times
  let flushed = false;
  try {
    if (clusterName) {
      await client
        .command({ query: `SYSTEM FLUSH LOGS ON CLUSTER '${clusterName}'` })
        .catch(() => client.command({ query: "SYSTEM FLUSH LOGS" }));
    } else {
      await client.command({ query: "SYSTEM FLUSH LOGS" });
    }
    flushed = true;
  } catch {
    // Ignored if permissions are missing, it will gently fall back to polling
  }

  // Poll for query_log (30s timeout, 2s interval).
  // The table may not exist on this cluster, or the user may lack permissions —
  // treat any failure as "no data" so the rest of the pipeline (trace parsing,
  // UI, MCP tools) can still run with whatever info we have from trace.txt.
  const queryLogSql = `SELECT * FROM ${wrap("system.query_log")} WHERE query_id = {qid:String} AND type = 'QueryFinish'`;
  let queryLogData = BLANK_JSON_DATA;
  try {
    queryLogData = await waitForQueryLog(
      client,
      queryLogSql,
      queryID,
      30_000,
      2_000,
    );
  } catch (err) {
    console.warn(
      `[querySystemTables] Failed to read system.query_log for ${queryID}: ${(err as Error)?.message ?? err}. Continuing with empty query_log.`,
    );
    queryLogData = BLANK_JSON_DATA;
  }
  await writeFile(queryLogPath, queryLogData);

  // Check query_kind from the fetched query_log to decide if views log is needed.
  // Only INSERT queries trigger materialized views.
  let queryKind = "";
  try {
    const parsed = JSON.parse(queryLogData) as {
      data: { query_kind?: string }[];
    };
    queryKind = parsed.data?.[0]?.query_kind ?? "";
  } catch {
    /* leave empty */
  }

  if (queryKind === "Insert") {
    // INSERT — poll for query_views_log (30s timeout, 2s interval).
    // Same graceful-fallback story as query_log above.
    const viewLogSql = `SELECT * FROM ${wrap("system.query_views_log")} WHERE initial_query_id = {qid:String}`;
    let viewLogData = BLANK_JSON_DATA;
    try {
      viewLogData = await waitForQueryLog(
        client,
        viewLogSql,
        queryID,
        30_000,
        2_000,
      );
    } catch (err) {
      console.warn(
        `[querySystemTables] Failed to read system.query_views_log for ${queryID}: ${(err as Error)?.message ?? err}. Continuing with empty views log.`,
      );
      viewLogData = BLANK_JSON_DATA;
    }
    await writeFile(viewLogPath, viewLogData);
  } else {
    // Non-INSERT (or unknown because query_log was unavailable) — no MVs to fetch.
    await writeFile(viewLogPath, BLANK_JSON_DATA);
  }

  // Fetch tables (no polling needed) — select only needed columns to avoid
  // pulling the entire schema metadata across all cluster replicas.
  // system.tables is almost always readable, but we still guard it so a
  // permission/availability hiccup doesn't fail the whole flow.
  try {
    const tablesResult = await client.query({
      query: `SELECT database, name, engine, total_rows, total_bytes FROM ${wrap("system.tables")}`,
      format: "JSON",
    });
    await writeFile(tablesPath, await tablesResult.text());
  } catch (err) {
    console.warn(
      `[querySystemTables] Failed to read system.tables for ${queryID}: ${(err as Error)?.message ?? err}. Continuing with empty tables list.`,
    );
    await writeFile(tablesPath, BLANK_JSON_DATA);
  }
}
