import { meta } from "zod/mini";
import type {
  ParserResponse,
  QueryMetadata,
  TableIOStats,
  TableReadEvent,
  TableWriteEvent,
  PartitionKeyStats,
  PKPruningStats,
  MemoryDataPoint,
  MemoryTracking,
  MaterializedViewStats,
  MVCascadeNode,
  MVCascadeTree,
} from "./definitions";
import { ParserStatus } from "./definitions";

export class TraceParser {
  trace_log_content: string[]; // Raw trace log string. This is split by newline, and stored as an array.
  query_log_content: Record<string, any>; // Parsed struct of JSON-formatted SELECT * query output of the `system.query_log` table
  view_log_content: Record<string, any>; // Parsed struct of JSON-formatted SELECT * query output of the `system.query_views_log` table

  public constructor(trace_log: string, query_log: string, view_log: string) {
    this.trace_log_content = trace_log
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    this.trace_log_content = trace_log
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    this.query_log_content = JSON.parse(query_log);
    this.view_log_content = JSON.parse(view_log);
  }

  private jsonToNumber(value: any): number {
    if (typeof value === "number") {
      return value;
    } else if (typeof value === "string") {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  public getMetadata(): ParserResponse<QueryMetadata> {
    // todo: parse only the first line for query_log if exists.
    // todo: get data for MVs attached to table

    const response = {
      status: ParserStatus.SUCCESS,
      messages: new Array<string>(),
    } as ParserResponse<QueryMetadata>;

    const metadata: QueryMetadata = {} as QueryMetadata;
    response.response = metadata;

    const QUERY_ID_PATTERN = /\{([0-9a-f\-]{36})\}/;
    const SOURCE_IP_PATTERN = /\(from ([0-9\.:]+)\)/;
    const TIMESTAMP_PATTERN = /(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}\.\d+)/;

    // Populate metadata gotten from trace log
    if (this.trace_log_content.length != 0) {
      const line = this.trace_log_content.find((l) => QUERY_ID_PATTERN.test(l));
      if (line == undefined) {
        response.status = ParserStatus.PARTIAL;
        response.messages.push(
          "No query ID found in trace log. Some data may be empty.",
        );
      } else {
        const queryIDMatch = line.match(QUERY_ID_PATTERN);
        if (queryIDMatch && queryIDMatch.length > 1) {
          metadata.queryId = queryIDMatch[1]!;
        }

        const sourceIPMatch = line.match(SOURCE_IP_PATTERN);
        if (sourceIPMatch && sourceIPMatch.length > 1) {
          metadata.sourceIP = sourceIPMatch[1]!;
        }

        const initialTimestampMatch = line.match(TIMESTAMP_PATTERN);
        if (initialTimestampMatch && initialTimestampMatch.length > 1) {
          metadata.initialTimestamp = initialTimestampMatch[1]!;
        }

        const finalLine =
          this.trace_log_content[this.trace_log_content.length - 1]!;
        const finalTimestampMatch = finalLine.match(TIMESTAMP_PATTERN);
        if (finalTimestampMatch && finalTimestampMatch.length > 1) {
          metadata.finalTimestamp = finalTimestampMatch[1]!;
        }

        if (metadata.initialTimestamp && metadata.finalTimestamp) {
          metadata.executionTimeMs =
            new Date(metadata.finalTimestamp).getTime() -
            new Date(metadata.initialTimestamp).getTime();
        } // This will be rewritten by query_log's query_duration_ms if available, since that is more accurate.
      }
    } else {
      response.status = ParserStatus.PARTIAL;
      response.messages.push(
        "No trace log data found. Metadata fields from trace log will be empty.",
      );
    }

    // now we parse the query_log
    if (
      this.query_log_content["data"] &&
      this.query_log_content["data"].length > 0
    ) {
      const row = this.query_log_content["data"][0];
      metadata.query = row["formatted_query"] || row["query"];
      metadata.queryType = row["query_kind"];
      metadata.rowsRead = this.jsonToNumber(row["read_rows"]);
      metadata.bytesRead = this.jsonToNumber(row["read_bytes"]);
      metadata.rowsWritten = this.jsonToNumber(row["written_rows"]);
      metadata.bytesWritten = this.jsonToNumber(row["written_bytes"]);
      metadata.resultRows = this.jsonToNumber(row["result_rows"]);
      metadata.resultBytes = this.jsonToNumber(row["result_bytes"]);
      metadata.executionTimeMs = this.jsonToNumber(row["query_duration_ms"]);
      metadata.currentDatabase = row["current_database"];
    } else {
      response.status =
        response.status === ParserStatus.PARTIAL
          ? ParserStatus.ERROR
          : ParserStatus.PARTIAL;
      response.messages.push(
        "No query log data found. Metadata fields from query log will be empty.",
      );
    }

    return response;
  }

  public getTableIOStats(): ParserResponse<Array<TableIOStats>> {
    const response = {
      status: ParserStatus.SUCCESS,
      messages: new Array<string>(),
    } as ParserResponse<Array<TableIOStats>>;

    const tableMap = new Map<string, TableIOStats>();

    const getOrCreateTable = (fullName: string): TableIOStats => {
      let stats = tableMap.get(fullName);
      if (!stats) {
        const dotIdx = fullName.indexOf(".");
        stats = {
          tableName: dotIdx >= 0 ? fullName.substring(dotIdx + 1) : fullName,
          database: dotIdx >= 0 ? fullName.substring(0, dotIdx) : null,
          fullTableName: fullName,
          reads: [],
          writes: [],
          totalRowsRead: 0,
          totalRowsWritten: 0,
          totalStreamsUsed: 0,
          pkPruning: [],
          partitionKeyStats: [],
          usesFinal: false,
        };
        tableMap.set(fullName, stats);
      }
      return stats;
    };

    const READ_PATTERN =
      /(\S+\.\S+) \([0-9a-f\-]+\) \(SelectExecutor\): Reading approx\. (\d+) rows with (\d+) streams/;
    const SELECTED_PATTERN =
      /(\S+\.\S+) \([0-9a-f\-]+\) \(SelectExecutor\): Selected (\d+)\/(\d+) parts by partition key, (\d+) parts by primary key, (\d+)\/(\d+) marks by primary key, (\d+) marks to read from (\d+) ranges/;
    const PK_DROP_PATTERN =
      /(\S+\.\S+) \([0-9a-f\-]+\) \(SelectExecutor\): PK index has dropped (\d+)\/(\d+) granules, it took (\d+)ms across (\d+) threads/;
    const QUERY_FINAL_PATTERN = /FROM\s+(\w+(\.\w+)?)\s+FINAL/gi; // matches `FROM abc FINAL` and `FROM abc.def FINAL`
    // todo: Are there better ways to look for the FINAL clause?
    const WRITE_WITH_ID_PATTERN =
      /(\S+\.\S+) \([0-9a-f\-]+\) \(Shared Sink\): Wrote block with ID '[^']+', (\d+) rows/;
    // Pattern: "Wrote block with N rows" (without dedup block ID)
    const WRITE_PATTERN =
      /(\S+\.\S+) \([0-9a-f\-]+\) \(Shared Sink\): Wrote block with (\d+) rows/;

    // We will look through the query_views_log, and find data for all tables part of the MV call tree.
    if (this.view_log_content?.["data"]) {
      for (const row of this.view_log_content["data"]) {
        const query = row["view_query"];
        for (const match of query.matchAll(QUERY_FINAL_PATTERN)) {
          let tableName = (match ?? [])[1];
          if (tableName) {
            const table = getOrCreateTable(tableName);
            table.usesFinal = true;
          }
        }
      }
    } else {
      response.status = ParserStatus.PARTIAL;
      response.messages.push(
        "No view log data found. MV usage and FINAL clause stats may be missing.",
      );
    }
    // We also look at the query_log
    if (this.query_log_content?.["data"]) {
      for (const row of this.query_log_content["data"]) {
        const query: string = row["formatted_query"] || row["query"];

        if (typeof query === undefined || query == "") continue;

        for (const match of query.matchAll(QUERY_FINAL_PATTERN)) {
          let tableName = (match ?? [])[1];
          if (tableName) {
            const table = getOrCreateTable(tableName);
            table.usesFinal = true;
          }
        }
      }
    } else {
      response.status =
        response.status == ParserStatus.PARTIAL
          ? ParserStatus.ERROR
          : ParserStatus.PARTIAL;
      response.messages.push(
        "No query log data found. MV usage and FINAL clause stats may be missing.",
      );
    }

    // Table reads and writes found from trace log
    // todo: Are these the only patterns for reads and writes from trace log? Are there other patterns as well?
    for (const line of this.trace_log_content.filter((line: string) =>
      line.includes("(SelectExecutor)"),
    )) {
      const readMatch = line.match(READ_PATTERN);
      if (readMatch) {
        const table = getOrCreateTable(readMatch[1]!);
        const event: TableReadEvent = {
          approxRows: parseInt(readMatch[2]!, 10),
          streams: parseInt(readMatch[3]!, 10),
        };
        table.reads.push(event);
        table.totalRowsRead += event.approxRows;
        table.totalStreamsUsed += event.streams;
        continue;
      }

      const selectedMatch = line.match(SELECTED_PATTERN);
      if (selectedMatch) {
        const table = getOrCreateTable(selectedMatch[1]!);
        const stat: PartitionKeyStats = {
          partsSelectedByPartitionKey: parseInt(selectedMatch[2]!, 10),
          partsTotal: parseInt(selectedMatch[3]!, 10),
          partsByPrimaryKey: parseInt(selectedMatch[4]!, 10),
          marksSelectedByPrimaryKey: parseInt(selectedMatch[5]!, 10),
          marksTotalByPrimaryKey: parseInt(selectedMatch[6]!, 10),
          marksToRead: parseInt(selectedMatch[7]!, 10),
          ranges: parseInt(selectedMatch[8]!, 10),
        };
        table.partitionKeyStats.push(stat);
        continue;
      }

      const pkMatch = line.match(PK_DROP_PATTERN);
      if (pkMatch) {
        const table = getOrCreateTable(pkMatch[1]!);
        const dropped = parseInt(pkMatch[2]!, 10);
        const total = parseInt(pkMatch[3]!, 10);
        const stat: PKPruningStats = {
          granulesDropped: dropped,
          granulesTotal: total,
          pruningRatio: total > 0 ? dropped / total : 0,
          timeTakenMs: parseInt(pkMatch[4]!, 10),
          threads: parseInt(pkMatch[5]!, 10),
        };
        table.pkPruning.push(stat);
        continue;
      }
    }
    for (const line of this.trace_log_content.filter((line: string) =>
      line.includes("(Shared Sink)"),
    )) {
      for (const pattern of [WRITE_WITH_ID_PATTERN, WRITE_PATTERN]) {
        const match = line.match(pattern);
        if (match) {
          const table = getOrCreateTable(match[1]!);
          const rows = parseInt(match[2]!, 10);
          const event: TableWriteEvent = {
            rows,
          };
          table.writes.push(event);
          table.totalRowsWritten += event.rows;
          break;
        }
      }
    }
    response.response = Array.from(tableMap.values());
    return response;
  }

  public getMemoryTracking(): ParserResponse<MemoryTracking> {
    const TIMESTAMP_PATTERN = /(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}\.\d+)/;
    const CURRENT_MEMORY_PATTERN =
      /MemoryTracker: Query current memory usage: ([\d.]+) (B|KiB|MiB|GiB)\./;
    const PEAK_MEMORY_PATTERN =
      /MemoryTracker: Query peak memory usage: ([\d.]+) (B|KiB|MiB|GiB)\./;

    const response = {
      status: ParserStatus.SUCCESS,
      messages: new Array<string>(),
    } as ParserResponse<MemoryTracking>;

    const toBytes = (value: number, unit: string): number => {
      switch (unit) {
        case "KiB":
          return value * 1024;
        case "MiB":
          return value * 1024 * 1024;
        case "GiB":
          return value * 1024 * 1024 * 1024;
        default:
          return value;
      }
    };

    const extractTimestamp = (line: string): string => {
      const match = line.match(TIMESTAMP_PATTERN);
      return match ? match[1]! : "";
    };

    let peakQueryMemoryBytes: number | null = null;
    const queryMemoryProgression: MemoryDataPoint[] = [];

    for (const line of this.trace_log_content.filter((line: string) =>
      line.includes("MemoryTracker:"),
    )) {
      const peakMatch = line.match(PEAK_MEMORY_PATTERN);
      if (peakMatch) {
        peakQueryMemoryBytes = toBytes(
          parseFloat(peakMatch[1]!),
          peakMatch[2]!,
        );
      }
      const queryCurrentMatch = line.match(CURRENT_MEMORY_PATTERN);
      if (queryCurrentMatch) {
        queryMemoryProgression.push({
          timestamp: extractTimestamp(line),
          usageBytes: toBytes(
            parseFloat(queryCurrentMatch[1]!),
            queryCurrentMatch[2]!,
          ),
        });
      }
    }

    response.response = {
      peakQueryMemoryBytes,
      queryMemoryProgression,
    } as MemoryTracking;

    return response;
  }

  public getMaterializedViewStats(): ParserResponse<MaterializedViewStats[]> {
    const response = {
      status: ParserStatus.SUCCESS,
      messages: new Array<string>(),
    } as ParserResponse<MaterializedViewStats[]>;

    const metadata = this.getMetadata();

    const stats = new Array<MaterializedViewStats>();
    response.response = stats;

    if (metadata.response?.queryType !== "Insert") {
      response.messages.push("MV Stats only available on INSERT queries.");
      return response;
    }

    if (
      !this.view_log_content?.["data"] ||
      this.view_log_content["data"].length === 0
    ) {
      response.status = ParserStatus.ERROR;
      response.messages.push(
        "No view log data found. Materialized view stats will be empty.",
      );
      return response;
    }

    for (const row of this.view_log_content["data"]) {
      stats.push({
        mvName: row["view_name"],
        mvQuery: row["view_query"],
        mvQueriedTimestampMicrosecondPrecision: row["event_time_microseconds"],
        mvTargetTable: row["view_target"],
        rowsRead: this.jsonToNumber(row["read_rows"]),
        bytesRead: this.jsonToNumber(row["read_bytes"]),
        rowsWritten: this.jsonToNumber(row["written_rows"]),
        bytesWritten: this.jsonToNumber(row["written_bytes"]),
        peakMemoryUsageBytes: this.jsonToNumber(row["peak_memory_usage"]),
      });
    }

    return response;
  }

  public getMVCascadeTree(): ParserResponse<MVCascadeTree> {
    const fromPattern = /FROM\s+(\w+(\.\w+)?)/i; // matches `FROM abc` and `FROM abc.def`
    const insertPattern = /INSERT\s+INTO\s+([\w]+(\.[\w]+)?)/i; // matches `INSERT INTO abc` and `INSERT INTO abc.def`

    const response = {
      status: ParserStatus.SUCCESS,
      messages: new Array<string>(),
    } as ParserResponse<MVCascadeTree>;

    if (this.getMetadata().response?.queryType !== "Insert") {
      response.messages.push("MV Fanout is only available on INSERT queries.");
      return response;
    }

    const sourceTableMap = new Map<string, MVCascadeNode[]>();

    if (!this.view_log_content?.["data"]) {
      response.status = ParserStatus.ERROR;
      response.messages.push(
        "No view log data found. MV cascade tree cannot be constructed.",
      );
      return response;
    }

    for (const row of this.view_log_content["data"]) {
      const viewQuery: string = row["view_query"];
      const fromMatch = viewQuery.match(fromPattern);

      const sourceTable = fromMatch ? fromMatch[1]! : "";
      const targetTable = row["view_target"];

      const node: MVCascadeNode = {
        sourceTable,
        mvName: row["view_name"],
        targetTable,
        viewQuery,
        durationMs: row["view_duration_ms"],
        readRows: row["read_rows"],
        readBytes: row["read_bytes"],
        writtenRows: row["written_rows"],
        writtenBytes: row["written_bytes"],
        peakMemoryUsageBytes: row["peak_memory_usage"],
        status: row["status"],
        children: [],
      };

      if (!sourceTableMap.has(sourceTable)) {
        sourceTableMap.set(sourceTable, []);
      }
      sourceTableMap.get(sourceTable)!.push(node);
    }

    const metadata = this.getMetadata();
    if (!metadata.response?.query || metadata.response.queryType !== "Insert")
      // todo: INSERT INTO table only supported. Will SELECT FROM view also be applicable?
      return response; // If we can't find the query or it's not an INSERT query, we can't build the cascade tree.

    const insertMatch = metadata.response.query.match(insertPattern);
    if (!insertMatch) return response; // If we can't find the target table of the INSERT query, we can't build the cascade tree.

    const rootTable = insertMatch[1]!;

    const buildChildren = (tableName: string): MVCascadeNode[] => {
      const nodes = sourceTableMap.get(tableName) || [];
      for (const node of nodes) {
        node.children = buildChildren(node.targetTable);
      }
      return nodes;
    };

    response.response = {
      rootTable,
      children: buildChildren(rootTable),
    } as MVCascadeTree;

    return response;
  }
}
