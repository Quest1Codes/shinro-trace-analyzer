import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import type { Request, Response } from "express";
import { getCHClient, checkClusterPresence } from "../query/clickhouse";
import {
  LOG_DIR,
  getTracePath,
  getQueryLogPath,
  getViewLogPath,
} from "../helpers/fs";

// Cached cluster name — resolved once per process, reused for all tool calls
let cachedClusterName: string | null | undefined; // undefined = not resolved yet

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

const SYSTEM_TABLE_DESCRIPTIONS: Record<string, string> = {
  "_custom_metrics_dictionary_custom_metrics_tables": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_database_replicated_recovery_time": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_dimensional": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_failed_mutations": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_group": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_histograms": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_shared_catalog_recovery_time": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_table_read_only_duration_seconds": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_total_memory_async_inserts": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_total_memory_data_skipping_indices": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_total_memory_dictionaries": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_total_memory_merges": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_dictionary_total_memory_processes": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_view_error_metrics": "Internal system table: Use DESCRIBE to see schema.",
  "_custom_metrics_view_metrics_and_events": "Internal system table: Use DESCRIBE to see schema.",
  "aggregate_function_combinators": "Contains a list of all available aggregate function combinators, which could be applied to aggregate functions and change the way they work.",
  "aggregated_zookeeper_log": "Contains statistics (number of operations, latencies, errors) of ZooKeeper operations grouped by session_id, parent_path and operation. Periodically flushed to disk. It is safe to truncate or drop this table at any time.",
  "asynchronous_insert_log": "Contains a history for all asynchronous inserts executed on current server. It is safe to truncate or drop this table at any time.",
  "asynchronous_inserts": "Contains information about pending asynchronous inserts in queue in server's memory.",
  "asynchronous_loader": "Contains information and status for recent asynchronous jobs (e.g. for tables loading). The table contains a row for every job.",
  "asynchronous_metric_log": "Contains the historical values for system.asynchronous_metrics, once per time interval (one second by default). It is safe to truncate or drop this table at any time.",
  "asynchronous_metrics": "Contains metrics that are calculated periodically in the background. For example, the amount of RAM in use.",
  "azure_queue": "Contains in-memory state of AzureQueue metadata and currently processed rows per file.",
  "azure_queue_settings": "Contains a list of settings of AzureQueue tables.",
  "background_schedule_pool": "Contains information about tasks in all BackgroundSchedulePool instances. Each row represents a task.",
  "background_schedule_pool_log": "Contains history of background schedule pool task executions. It is safe to truncate or drop this table at any time.",
  "background_schedule_pool_log_0": "Contains history of background schedule pool task executions. It is safe to truncate or drop this table at any time.",
  "backup_log": "Contains logging entries with the information about BACKUP and RESTORE operations. It is safe to truncate or drop this table at any time.",
  "backups": "Contains a list of all BACKUP or RESTORE operations with their current states and other properties. Note, that table is not persistent and it shows only operations executed after the last server restart.",
  "blob_storage_log": "Contains logging entries with information about various blob storage operations such as uploads and deletes. It is safe to truncate or drop this table at any time.",
  "build_options": "Contains a list of all build flags, compiler options and commit hash for used build.",
  "certificates": "Contains information about available certificates and their sources.",
  "clickpipes_log": "Internal system table: Use DESCRIBE to see schema.",
  "clusters": "Contains information about clusters defined in the configuration file or generated by a Replicated database.",
  "codecs": "Contains information about system codecs.",
  "collations": "Contains a list of all available collations for alphabetical comparison of strings.",
  "columns": "Lists all columns from all tables of the current server.",
  "completions": "Contains a list of completion tokens.",
  "contributors": "Contains a list of all ClickHouse contributors <3",
  "crash_log": "Contains information about stack traces for fatal errors. The table does not exist in the database by default, it is created only when fatal errors occur. It is safe to truncate or drop this table at any time.",
  "current_roles": "Contains active roles of a current user. SET ROLE changes the contents of this table.",
  "custom_metrics": "Internal system table: Use DESCRIBE to see schema.",
  "dashboards": "Contains queries used by /dashboard page accessible though HTTP interface. This table can be useful for monitoring and troubleshooting. The table contains a row for every chart in a dashboard.",
  "data_skipping_indices": "Contains all the information about all the data skipping indices in tables, similar to system.columns.",
  "data_type_families": "Contains a list of all available native data types along with all the aliases used for compatibility with other DBMS.",
  "database_engines": "Contains a list of all available database engines",
  "database_replicas": "Contains information and status of all database replicas on current server. Each database replica is represented by a single row.",
  "databases": "Lists all databases of the current server.",
  "delta_lake_metadata_log": "Contains content of Delta metadata files. It is safe to truncate or drop this table at any time.",
  "detached_parts": "Contains a list of all parts which are being found in /detached directory along with a reason why it was detached. ClickHouse server doesn't use such parts anyhow.",
  "detached_tables": "Lists all detached tables of the current server.",
  "dictionaries": "Contains information about dictionaries.",
  "dimensional_metrics": "Contains dimensional metrics, which have multiple dimensions (labels) to provide more granular information. For example, counting failed merges by their error code. This table is always up to date.",
  "disks": "Contains information about disks defined in the server configuration.",
  "distributed_cache": "A system table, which works the same as system.filesystem_cache system table, but reads cache information from a distributed cache",
  "distributed_cache_client_settings": "A system table, which allows to see distributed cache clients settings.",
  "distributed_cache_events": "Implements `events` system table, which allows you to obtain information for profiling.",
  "distributed_cache_metrics": "Implements `metrics` system table, which provides information about the operation of the server.",
  "distributed_cache_registry": "A system table, which allows to see available distributed cache servers and information about them.",
  "distributed_cache_server_usage": "A system table, which allows to see cache usage per client id.",
  "dns_cache": "Contains information about cached DNS records.",
  "dropped_tables": "Contains a list of tables which were dropped from Atomic databases but not completely removed yet.",
  "dropped_tables_parts": "Contains parts of system.dropped_tables tables",
  "enabled_roles": "Contains all active roles at the moment, including current role of the current user and granted roles for current role.",
  "error_log": "Contains history of error values from table system.errors, periodically flushed to disk. It is safe to truncate or drop this table at any time.",
  "errors": "Contains a list of all errors which have ever happened including the error code, last time and message with unsymbolized stacktrace.",
  "events": "Contains profiling events and their current value.",
  "filesystem_cache": "Contains information about all entries inside filesystem cache for remote objects.",
  "filesystem_cache_log": "Contains a history of all events occurred with filesystem cache for objects on a remote filesystem. It is safe to truncate or drop this table at any time.",
  "filesystem_cache_settings": "Contains information about all filesystem cache settings",
  "filesystem_read_prefetches_log": "Contains a history of all prefetches done during reading from MergeTables backed by a remote filesystem. It is safe to truncate or drop this table at any time.",
  "formats": "Contains a list of all the formats along with flags whether a format is suitable for input/output or whether it supports parallelization.",
  "functions": "Contains a list of all available ordinary and aggregate functions with their descriptions.",
  "grants": "Contains the information about privileges granted to ClickHouse user accounts.",
  "graphite_retentions": "Contains information about parameters graphite_rollup which are used in tables with *GraphiteMergeTree engines.",
  "histogram_metrics": "Contains histogram metrics which can be calculated instantly and exported in the Prometheus format. For example, the keeper response time. This table is always up to date.",
  "iceberg_history": "Displays the history of an iceberg table similar to the Spark history table",
  "iceberg_metadata_log": "Contains content of Iceberg metadata files. It is safe to truncate or drop this table at any time.",
  "iceberg_metadata_log_0": "Contains content of Iceberg metadata files. It is safe to truncate or drop this table at any time.",
  "instrumentation": "Contains a list of all functions instrumented with XRay with their IDs and handlers.",
  "jemalloc_bins": "Contains information about memory allocations done via jemalloc allocator in different size classes (bins) aggregated from all arenas. These statistics might not be absolutely accurate because of thread local caching in jemalloc.",
  "jemalloc_profile_text": "Displays the symbolized jemalloc heap profile. Run 'SYSTEM JEMALLOC FLUSH PROFILE' to generate a profile first.",
  "jemalloc_stats": "Returns jemalloc statistics in a single row with a single column. Equivalent to SYSTEM JEMALLOC STATS command.",
  "kafka_consumers": "Contains information about Kafka consumers. Applicable for Kafka table engine (native ClickHouse integration).",
  "keywords": "Contains a list of all keywords used in ClickHouse parser.",
  "licenses": "Contains licenses of third-party libraries that are located in the contrib directory of ClickHouse sources.",
  "macros": "Contains a list of all macros defined in server configuration.",
  "masking_policies": "Contains information about masking policies that can be used to mask data in tables.",
  "merge_coordinator_state": "Contains a list of all assigned by coordinator merges.",
  "merge_coordinator_statistics": "Contains statistics of all replicas registered in coordinator state.",
  "merge_tree_settings": "Contains a list of all MergeTree engine specific settings, their current and default values along with descriptions. You may change any of them in SETTINGS section in CREATE query.",
  "merge_worker_state": "Contains a list of all assigned by coordinator merges.",
  "merges": "Contains a list of merges currently executing merges of MergeTree tables and their progress. Each merge operation is represented by a single row.",
  "metric_log": "Contains history of metrics values from tables system.metrics and system.events, periodically flushed to disk. It is safe to truncate or drop this table at any time.",
  "metric_log_0": "Contains history of metrics values from tables system.metrics and system.events, periodically flushed to disk. It is safe to truncate or drop this table at any time.",
  "metrics": "Contains metrics which can be calculated instantly, or have a current value. For example, the number of simultaneously processed queries or the current replica delay. This table is always up to date.",
  "models": "Contains a list of CatBoost models loaded into a LibraryBridge's memory along with time when it was loaded.",
  "moves": "Contains information about in-progress data part moves of MergeTree tables. Each data part movement is represented by a single row.",
  "mutations": "Contains a list of mutations and their progress. Each mutation command is represented by a single row.",
  "named_collections": "Contains a list of all named collections which were created via SQL query or parsed from configuration file.",
  "numbers": "Generates all natural numbers, starting from 0 (to 2^64 - 1, and then again) in sorted order.",
  "numbers_mt": "Multithreaded version of `system.numbers`. Numbers order is not guaranteed.",
  "one": "This table contains a single row with a single dummy UInt8 column containing the value 0. Used when the table is not specified explicitly, for example in queries like `SELECT 1`.",
  "opentelemetry_span_log": "Contains information about trace spans for executed queries. It is safe to truncate or drop this table at any time.",
  "part_log": "This table contains information about events that occurred with data parts in the MergeTree family tables, such as adding or merging data. It is safe to truncate or drop this table at any time.",
  "part_moves_between_shards": "Contains information about parts which are currently in a process of moving between shards and their progress.",
  "parts": "Contains a list of currently existing (both active and inactive) parts of all *-MergeTree tables. Each part is represented by a single row.",
  "parts_columns": "Contains a list of columns of all currently existing parts of all MergeTree tables. Each column is represented by a single row.",
  "privileges": "Contains a list of all available privileges that could be granted to a user or role.",
  "processes": "Contains a list of currently executing processes (queries) with their progress.",
  "processors_profile_log": "Contains profiling information on processors level (building blocks for a pipeline for query execution. It is safe to truncate or drop this table at any time.",
  "projection_parts": "Contains a list of currently existing projection parts (a copy of some part containing aggregated data or just sorted in different order) created for all the projections for all tables within a cluster.",
  "projection_parts_columns": "Contains a list of columns of all currently existing projection parts of all MergeTree tables. Each column is represented by a single row.",
  "projections": "Contains all the information about all the projections in tables, similar to system.data_skipping_indices.",
  "prometheus_metrics": "Internal system table: Use DESCRIBE to see schema.",
  "query_cache": "Contains information about all entries inside query cache in server's memory.",
  "query_condition_cache": "Contains information about all entries inside query condition cache in server's memory.",
  "query_log": "Contains information about executed queries, for example, start time, duration of processing, error messages. It is safe to truncate or drop this table at any time.",
  "query_metric_log": "Contains history of memory and metric values from table system.events for individual queries, periodically flushed to disk. It is safe to truncate or drop this table at any time.",
  "query_metric_log_0": "Contains history of memory and metric values from table system.events for individual queries, periodically flushed to disk. It is safe to truncate or drop this table at any time.",
  "query_thread_log": "Contains information about threads that execute queries, for example, thread name, thread start time, duration of query processing. It is safe to truncate or drop this table at any time.",
  "query_views_log": "Contains information about the dependent views executed when running a query, for example, the view type or the execution time. It is safe to truncate or drop this table at any time.",
  "quota_limits": "Contains information about maximums for all intervals of all quotas. Any number of rows or zero can correspond to specific quota.",
  "quota_usage": "Contains quota usage by the current user: how much is used and how much is left.",
  "quotas": "Contains information about quotas.",
  "quotas_usage": "Contains quota usage by all users.",
  "remote_data_paths": "Contains a mapping from a filename on local filesystem to a blob name inside object storage.",
  "replicas": "Contains information and status of all table replicas on current server. Each replica is represented by a single row.",
  "replicated_fetches": "Contains information about currently running background fetches.",
  "replicated_merge_tree_settings": "Contains a list of all ReplicatedMergeTree engine specific settings, their current and default values along with descriptions. You may change any of them in SETTINGS section in CREATE query.",
  "replication_queue": "Contains information about tasks from replication queues stored in ClickHouse Keeper, or ZooKeeper, for each table replica.",
  "resources": "Contains a list of all currently existing resources.",
  "rocksdb": "Contains a list of metrics exposed from embedded RocksDB.",
  "role_grants": "Contains the role grants for users and roles. To add entries to this table, use `GRANT role TO user`. Using this table you may find out which roles are assigned to which users or which roles a user has.",
  "roles": "Contains a list of all roles created at the server.",
  "row_policies": "Contains filters for one particular table, as well as a list of roles and/or users which should use this row policy.",
  "s3_queue_settings": "Contains a list of settings of S3Queue tables.",
  "s3queue": "Contains in-memory state of S3Queue metadata and currently processed rows per file.",
  "s3queue_log": "Contains logging entries with the information files processes by S3Queue engine. It is safe to truncate or drop this table at any time.",
  "scheduler": "Contains information and status for scheduling nodes residing on the local server.",
  "schema_inference_cache": "Contains information about all cached file schemas.",
  "server_settings": "Contains a list of all server-wide settings (which are effective only on server startup and usually cannot be modified at runtime), their current and default values along with descriptions.",
  "session_log": "Contains information about all successful and failed login and logout events. It is safe to truncate or drop this table at any time.",
  "settings": "Contains a list of all user-level settings (which can be modified in a scope of query or session), their current and default values along with descriptions.",
  "settings_changes": "Contains the information about the settings changes through different ClickHouse versions. You may make ClickHouse behave like a particular previous version by changing the `compatibility` user-level settings.",
  "settings_profile_elements": "Describes the content of each settings profile configured on the server. Including settings constraints, roles and users for which the settings are applied, and parent settings profiles.",
  "settings_profiles": "Contains properties of configured setting profiles.",
  "shared_merge_tree_condemned_parts": "Contains information about all condemned parts (i.e. about to be killed parts) for all SharedMergeTree tables.",
  "shared_merge_tree_fetches": "Contains information about currently running background fetches (metadata fetches) for SharedMergeTree tables.",
  "shared_merge_tree_outdated_parts": "Contains information about all outdated (not active) parts for all SharedMergeTree tables.",
  "shared_merge_tree_settings": "Contains a list of all SharedMergeTree engine specific settings.",
  "snapshot_locks": "Shows the snapshot locks and unlocking status",
  "stack_trace": "Allows to obtain an unsymbolized stacktrace from all the threads of the server process.",
  "storage_policies": "Contains information about storage policies and volumes defined in the server configuration.",
  "symbols": "Contains information for introspection of ClickHouse binary. This table is only useful for C++ experts and ClickHouse engineers.",
  "system_tables_tracking_ivoryaws_aj_31": "Internal system table: Use DESCRIBE to see schema.",
  "table_engines": "Contains a list of all available table engines along with information whether a particular table engine supports some specific features (e.g. settings, skipping indices, projections, replication, TTL, deduplication, parallel insert, etc.)",
  "table_functions": "Contains a list of all available table functions with their descriptions.",
  "tables": "Lists all tables of the current server.",
  "text_log": "Contains logging entries which are normally written to a log file or to stdout. It is safe to truncate or drop this table at any time.",
  "time_zones": "Contains a list of time zones that are supported by the ClickHouse server. This list of timezones might vary depending on the version of ClickHouse.",
  "trace_log": "Contains stack traces collected by the sampling query profiler. It is safe to truncate or drop this table at any time.",
  "trace_log_0": "Contains stack traces collected by the sampling query profiler. It is safe to truncate or drop this table at any time.",
  "unicode": "Contains all unicode codepoints.",
  "user_directories": "Contains the information about configured user directories - directories on the file system from which ClickHouse server is allowed to read user provided data.",
  "user_processes": "This system table can be used to get overview of memory usage and ProfileEvents of users.",
  "users": "Contains a list of all users profiles either configured at the server through a configuration file or created via SQL.",
  "view_refreshes": "Lists all Refreshable Materialized Views of current server.",
  "virtual_parts": "Contains information about all virtual parts for all SharedMergeTree tables.",
  "warnings": "Contains warnings about server configuration to be displayed by clickhouse-client right after it connects to the server.",
  "workloads": "Contains a list of all currently existing workloads.",
  "zeros": "Produces unlimited number of non-materialized zeros.",
  "zeros_mt": "Multithreaded version of system.zeros.",
  "zookeeper": "Exposes data from the [Zoo]Keeper cluster defined in the config. Allow to get the list of children for a particular node or read the value written inside it.",
  "zookeeper_connection": "Shows the information about current connections to [Zoo]Keeper (including auxiliary [ZooKeepers)",
  "zookeeper_connection_log": "Contains history of ZooKeeper connections. It is safe to truncate or drop this table at any time."
};

// ─── Helpers ─────────────────────────────────────────────

async function readJson(filePath: string): Promise<{ data: any[] }> {
  if (!existsSync(filePath)) return { data: [] };
  try {
    const data = await readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return { data: [] };
  }
}

async function readText(filePath: string): Promise<string> {
  if (!existsSync(filePath)) return "";
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

function formatBytes(b: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let val = b;
  for (const unit of units) {
    if (Math.abs(val) < 1024) return `${val.toFixed(1)} ${unit}`;
    val /= 1024;
  }
  return `${val.toFixed(1)} PiB`;
}

function queryFinishRow(queryLogData: { data: any[] }): any | null {
  const rows = queryLogData.data ?? [];
  for (const r of rows) {
    if (r.type === "QueryFinish") return r;
  }
  return rows.length > 0 ? rows[rows.length - 1] : null;
}

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
                text: JSON.stringify({ queries: [], message: "No queries have been analyzed yet." }),
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
              text: JSON.stringify({ error: err.message ?? "Failed to list queries." }),
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
    async ({ query_id }) => {
      const qlPath = getQueryLogPath(query_id);
      if (!qlPath) return noQueryMsg(query_id);

      const ql = await readJson(qlPath);
      const finish = queryFinishRow(ql);
      if (!finish) return noQueryMsg(query_id);

      // Count MVs
      const vlPath = getViewLogPath(query_id);
      const vl = vlPath ? await readJson(vlPath) : { data: [] };
      const viewRows = vl.data ?? [];
      const mvNames = [
        ...new Set(viewRows.map((r: any) => r.view_name ?? "")),
      ].sort();

      const summary = {
        query: finish.formatted_query || finish.query || "",
        query_id: finish.initial_query_id || finish.query_id || "",
        query_type: finish.query_kind ?? "",
        database: finish.current_database ?? "",
        duration_ms: finish.query_duration_ms ?? 0,
        read_rows: finish.read_rows ?? 0,
        read_bytes: formatBytes(finish.read_bytes ?? 0),
        written_rows: finish.written_rows ?? 0,
        written_bytes: formatBytes(finish.written_bytes ?? 0),
        result_rows: finish.result_rows ?? 0,
        peak_memory_usage: formatBytes(finish.memory_usage ?? 0),
        timestamp: finish.event_time ?? "",
        materialized_views_triggered: mvNames.length,
        materialized_view_names: mvNames,
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
    async ({ query_id }) => {
      const vlPath = getViewLogPath(query_id);
      const vl = vlPath ? await readJson(vlPath) : { data: [] };
      const viewRows = vl.data ?? [];

      if (viewRows.length === 0) {
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

      const result = viewRows.map((r: any) => ({
        view_name: r.view_name ?? "",
        target_table: r.view_target ?? "",
        read_rows: r.read_rows ?? 0,
        written_rows: r.written_rows ?? 0,
        duration_ms: r.view_duration_ms ?? 0,
        peak_memory: formatBytes(r.peak_memory_usage ?? 0),
        status: r.status ?? "",
      }));

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  // ── get_query_log (raw) ──────────────────────────────────

  server.tool(
    "get_query_log",
    "Get the FULL raw system.query_log JSON for the given query. WARNING: Very large. Prefer get_query_summary.",
    queryIdParam,
    async ({ query_id }) => {
      const qlPath = getQueryLogPath(query_id);
      if (!qlPath) return noQueryMsg(query_id);

      const ql = await readJson(qlPath);
      if ((ql.data ?? []).length === 0) return noQueryMsg(query_id);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(ql, null, 2) },
        ],
      };
    },
  );

  // ── get_query_view_log (raw) ─────────────────────────────

  server.tool(
    "get_query_view_log",
    "Get the FULL raw system.query_views_log JSON for the given query. WARNING: Very large. Prefer get_mv_summary.",
    queryIdParam,
    async ({ query_id }) => {
      const vlPath = getViewLogPath(query_id);
      const vl = vlPath ? await readJson(vlPath) : { data: [] };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(vl, null, 2) },
        ],
      };
    },
  );

  // ── get_raw_trace_logs ───────────────────────────────────

  server.tool(
    "get_raw_trace_logs",
    "Get raw trace logs (clickhouse-client stderr) for the given query. WARNING: Very large. Use search_trace_logs instead.",
    queryIdParam,
    async ({ query_id }) => {
      const tracePath = getTracePath(query_id);
      const text = tracePath ? await readText(tracePath) : "";
      return {
        content: [
          {
            type: "text" as const,
            text:
              text ||
              `No trace logs available for query_id '${query_id}'.`,
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
    async ({ query_id, pattern, case_sensitive, max_results }) => {
      const tracePath = getTracePath(query_id);
      const content = tracePath ? await readText(tracePath) : "";
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
          'SQL SELECT query targeting system tables. Example: "SELECT database, table, partition, rows FROM system.parts WHERE active AND database = \'fintech\' ORDER BY rows DESC"',
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
              text: JSON.stringify({ error: "Only SELECT queries are allowed." }),
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
