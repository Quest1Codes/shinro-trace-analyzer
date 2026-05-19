import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { readdir } from "fs/promises";
import { existsSync } from "fs";
import type { Request, Response } from "express";
import { getCHClient, checkClusterPresence } from "../query/clickhouse";
import { LOG_DIR, ParserData, getParserData } from "../helpers/fs";
import { TraceParser } from "../parser/parser";

import SYSTEM_TABLE_DESCRIPTIONS from "./system_table_descriptions.json" with { type: "json" };

// Cached cluster name — resolved once per process, reused for all tool calls
let cachedClusterName: string | null | undefined; // undefined = not resolved yet

let parserDataCache = new Map<string, ParserData>();

function getCachedParserData(
  queryId: string,
  bypassCache: boolean = false,
): ParserData {
  if (!bypassCache && parserDataCache.has(queryId)) {
    return parserDataCache.get(queryId)!;
  }
  const data = getParserData(queryId);
  parserDataCache.set(queryId, data);
  return data;
}

async function getClusterName(): Promise<string | null> {
  if (cachedClusterName !== undefined) return cachedClusterName;
  try {
    const client = getCHClient();
    cachedClusterName = await checkClusterPresence(client);
  } catch {
    cachedClusterName = null;
  }
  return cachedClusterName;
}

// ─── Helpers ─────────────────────────────────────────────

function noQueryMsg(query_id: string): {
  content: { type: "text"; text: string }[];
} {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: `No data found for query_id '${query_id}'. Did you pass the right ID? Use list_queries to see available query IDs.`,
        }),
      },
    ],
  };
}

// Common Zod param for query_id used by all trace tools
const queryIdParam = {
  query_id: z
    .string()
    .describe(
      "The ClickHouse query_id of the run to analyze. Use list_queries to discover available IDs.",
    ),
  bypass_cache: z
    .boolean()
    .default(false)
    .describe("Whether to bypass the cache and fetch fresh data."),
};

// ─── MCP Server ──────────────────────────────────────────

function createServer() {
  const server = new McpServer({
    name: "clickhouse-query-analysis",
    version: "1.0.0",
  });

  // ── list_queries ──────────────────────────────────────────

  server.tool(
    "list_queries",
    "List all available query IDs that have been analyzed. Returns the directory names under the logs folder. Use these IDs when calling other trace tools.",
    {},
    async () => {
      try {
        if (!existsSync(LOG_DIR)) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  queries: [],
                  message: "No queries have been analyzed yet.",
                }),
              },
            ],
          };
        }
        const entries = await readdir(LOG_DIR, { withFileTypes: true });
        const queries = entries
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ queries }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: err.message ?? "Failed to list queries.",
              }),
            },
          ],
        };
      }
    },
  );

  // ── get_system_table_descriptions ──────────────────────────

  server.tool(
    "get_system_table_descriptions",
    "Return a mapping of ClickHouse system table names to their descriptions. Use this to discover which system table is most relevant to your query.",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(SYSTEM_TABLE_DESCRIPTIONS, null, 2),
          },
        ],
      };
    },
  );

  // ── get_query_summary ────────────────────────────────────

  server.tool(
    "get_query_summary",
    "Get a concise summary of the given query including SQL text, duration, rows read/written, memory usage, and materialized views triggered.",
    queryIdParam,
    async ({ query_id, bypass_cache }) => {
      const parserData = getCachedParserData(query_id, bypass_cache);
      const parser = new TraceParser(
        parserData.trace,
        parserData.queryLog,
        parserData.viewLog,
      );

      const metadata = parser.getMetadata();
      const mvInfo = parser.getMaterializedViewStats();

      const summary = {
        query: metadata.response?.query,
        query_id: metadata.response?.queryId,
        query_type: metadata.response?.queryType,
        database: metadata.response?.currentDatabase,
        duration_ms: metadata.response?.executionTimeMs,
        read_rows: metadata.response?.rowsRead,
        read_bytes: metadata.response?.bytesRead,
        written_rows: metadata.response?.rowsWritten,
        written_bytes: metadata.response?.bytesWritten,
        result_rows: metadata.response?.resultRows,
        peak_memory_usage: metadata.response?.memoryUsage,
        final_timestamp: metadata.response?.finalTimestamp,
        materialized_views_triggered: mvInfo.response?.length,
        materialized_view_names: mvInfo.response?.map((mv) => mv.mvName),
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(summary, null, 2) },
        ],
      };
    },
  );

  // ── get_mv_summary ───────────────────────────────────────

  server.tool(
    "get_mv_summary",
    "Get materialized view execution stats for the given query — view name, target table, rows read/written, duration, peak memory, status.",
    queryIdParam,
    async ({ query_id, bypass_cache }) => {
      const parserData = getCachedParserData(query_id, bypass_cache);
      const parser = new TraceParser(
        parserData.trace,
        parserData.queryLog,
        parserData.viewLog,
      );

      const mvInfo = parser.getMaterializedViewStats();

      if (mvInfo.response?.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                message: "No materialized views triggered by this query.",
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(mvInfo.response, null, 2),
          },
        ],
      };
    },
  );

  // ── get_query_log (raw) ──────────────────────────────────

  server.tool(
    "get_query_log",
    "Get the FULL raw system.query_log JSON for the given query. WARNING: Very large. Prefer get_query_summary.",
    queryIdParam,
    async ({ query_id, bypass_cache }) => {
      const parserData = getCachedParserData(query_id, bypass_cache);
      const ql = parserData.queryLog ? JSON.parse(parserData.queryLog) : null;
      if ((ql.data ?? []).length === 0) return noQueryMsg(query_id);

      return {
        content: [{ type: "text" as const, text: JSON.stringify(ql, null, 2) }],
      };
    },
  );

  // ── get_query_view_log (raw) ─────────────────────────────

  server.tool(
    "get_query_view_log",
    "Get the FULL raw system.query_views_log JSON for the given query. WARNING: Very large. Prefer get_mv_summary.",
    queryIdParam,
    async ({ query_id, bypass_cache }) => {
      const parserData = getCachedParserData(query_id, bypass_cache);
      const vl = parserData.viewLog
        ? JSON.parse(parserData.viewLog)
        : { data: [] };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(vl, null, 2) }],
      };
    },
  );

  // ── get_raw_trace_logs ───────────────────────────────────

  server.tool(
    "get_raw_trace_logs",
    "Get raw trace logs (clickhouse-client stderr) for the given query. WARNING: Very large. Use search_trace_logs instead.",
    queryIdParam,
    async ({ query_id, bypass_cache }) => {
      const parserData = getCachedParserData(query_id, bypass_cache);
      const text = parserData.trace;
      return {
        content: [
          {
            type: "text" as const,
            text: text || `No trace logs available for query_id '${query_id}'.`,
          },
        ],
      };
    },
  );

  // ── search_trace_logs ────────────────────────────────────

  server.tool(
    "search_trace_logs",
    'Search trace logs of the given query using regex. Examples: "MemoryTracker", "HashJoin", "SelectExecutor".',
    {
      ...queryIdParam,
      pattern: z
        .string()
        .describe(
          'RegEx pattern to search for (e.g. "MemoryTracker", "HashJoin")',
        ),
      case_sensitive: z
        .boolean()
        .optional()
        .describe("Case-sensitive matching (default: false)"),
      max_results: z
        .number()
        .int()
        .optional()
        .describe("Max matching lines to return (default: 100)"),
    },
    async ({
      query_id,
      pattern,
      case_sensitive,
      max_results,
      bypass_cache,
    }) => {
      const parserData = getCachedParserData(query_id, bypass_cache);
      const content = parserData.trace;
      if (!content) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No trace logs available for query_id '${query_id}'.`,
            },
          ],
        };
      }

      const limit = max_results ?? 100;
      const flags = case_sensitive ? "g" : "gi";

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch (e: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid regex pattern: ${e.message}`,
            },
          ],
        };
      }

      const lines = content.split("\n");
      const matches = lines.filter((line) => {
        regex.lastIndex = 0;
        return regex.test(line);
      });

      const result = matches.slice(0, limit);
      if (matches.length > limit) {
        result.push(
          `\n... (${matches.length - limit} more matches not shown)\n`,
        );
      }

      const output =
        result.length > 0
          ? result.join("\n")
          : `No matches found for pattern: ${pattern}`;

      return {
        content: [{ type: "text" as const, text: output }],
      };
    },
  );

  // ── list_systable_columns ──────────────────────────────

  server.tool(
    "list_systable_columns",
    "List all column names and types for a given ClickHouse system table. ALWAYS call this before query_systable to discover exact column names — never guess column names.",
    {
      table: z
        .string()
        .describe(
          'System table name WITHOUT the system. prefix. Examples: "query_log", "parts", "columns", "processes", "merges"',
        ),
    },
    async ({ table }) => {
      try {
        const client = getCHClient();
        const result = await client.query({
          query: `SELECT name, type FROM system.columns WHERE database = 'system' AND table = '${table.replace(/'/g, "''")}' ORDER BY position`,
          format: "JSON",
        });
        const json = (await result.json()) as {
          data: { name: string; type: string }[];
        };

        if (json.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `System table 'system.${table}' not found or has no columns.`,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { table: `system.${table}`, columns: json.data },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: err.message ?? "Failed to list columns.",
              }),
            },
          ],
        };
      }
    },
  );

  // ── query_systable ─────────────────────────────────────

  server.tool(
    "query_systable",
    "Execute a read-only SELECT query against ClickHouse system tables (e.g. system.parts, system.merges, system.mutations). Only SELECT queries containing 'system.' are allowed. A LIMIT 100 is appended if no LIMIT is present. IMPORTANT: Always call list_systable_columns first to discover valid column names.",
    {
      query: z
        .string()
        .describe(
          "SQL SELECT query targeting system tables. Example: \"SELECT database, table, partition, rows FROM system.parts WHERE active AND database = 'fintech' ORDER BY rows DESC\"",
        ),
    },
    async ({ query }) => {
      // Validate: must be a SELECT
      const trimmed = query.trim();
      if (!/^SELECT\b/i.test(trimmed)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Only SELECT queries are allowed.",
              }),
            },
          ],
        };
      }

      // Validate: must reference system.*
      if (!/system\./i.test(trimmed)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error:
                  "Query must target system tables (must contain 'system.').",
              }),
            },
          ],
        };
      }

      // Enforce LIMIT if not present
      let queryToRun = /\bLIMIT\b/i.test(trimmed)
        ? trimmed
        : `${trimmed} LIMIT 100`;

      try {
        const client = getCHClient();

        // Wrap system.X → clusterAllReplicas('name', system.X) if in a cluster
        const clusterName = await getClusterName();
        if (clusterName) {
          queryToRun = queryToRun.replace(
            /\b(system\.\w+)/gi,
            `clusterAllReplicas('${clusterName}', $1)`,
          );
        }

        const result = await client.query({
          query: queryToRun,
          format: "JSON",
        });
        const text = await result.text();
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err: any) {
        const msg: string = err.message ?? "";

        // Self-healing: if UNKNOWN_IDENTIFIER, report the bad column and hint
        // the LLM to call list_systable_columns first.
        if (msg.includes("UNKNOWN_IDENTIFIER")) {
          const colMatch = msg.match(/Unknown expression identifier '([^']+)'/);
          const badCol = colMatch?.[1] ?? "(unknown)";
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Column '${badCol}' does not exist. Call list_systable_columns first to discover valid column names, then retry.`,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: msg || "Query execution failed.",
              }),
            },
          ],
        };
      }
    },
  );

  return server;
}

// ─── Transport handling ──────────────────────────────────

const transports = new Map<string, StreamableHTTPServerTransport>();

export async function handleMCPRequest(req: Request, res: Response) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "GET") {
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).json({ error: "No active session. Send POST first." });
      return;
    }
    await transport.handleRequest(req, res);
    return;
  }

  if (req.method === "POST") {
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
      },
    });

    transport.onclose = () => {
      const sid = [...transports.entries()].find(
        ([_, t]) => t === transport,
      )?.[0];
      if (sid) {
        transports.delete(sid);
      }
    };

    const server = createServer();
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  if (req.method === "DELETE") {
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      transports.delete(sessionId);
      return;
    }
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
