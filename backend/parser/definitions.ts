export interface QueryMetadata {
  queryId: string;
  sourceIP: string;
  query: string;
  currentDatabase: string;
  initialTimestamp: string;
  finalTimestamp: string;
  executionTimeMs: number;
  queryType: string; // todo: enum?
  bytesRead: number;
  rowsRead: number;
  bytesWritten: number;
  rowsWritten: number;
  resultRows: number;
  resultBytes: number;
  memoryUsage: number;
}

export interface TableIOStats {
  tableName: string;
  database: string | null;
  fullTableName: string;
  reads: TableReadEvent[];
  writes: TableWriteEvent[];
  totalRowsRead: number;
  totalRowsWritten: number;
  totalStreamsUsed: number;
  pkPruning: PKPruningStats[];
  partitionKeyStats: PartitionKeyStats[];
  usesFinal: boolean;
}

export interface TableReadEvent {
  approxRows: number;
  streams: number;
}

export interface TableWriteEvent {
  rows: number;
}

export interface PKPruningStats {
  granulesDropped: number;
  granulesTotal: number;
  pruningRatio: number;
  timeTakenMs: number;
  threads: number;
}

export interface PartitionKeyStats {
  partsSelectedByPartitionKey: number;
  partsTotal: number;
  partsByPrimaryKey: number;
  marksSelectedByPrimaryKey: number;
  marksTotalByPrimaryKey: number;
  marksToRead: number;
  ranges: number;
}

export interface MemoryDataPoint {
  timestamp: string;
  usageBytes: number;
}

export interface MaterializedViewStats {
  mvName: string;
  mvQuery: string;
  mvQueriedTimestampMicrosecondPrecision: string;
  mvTargetTable: string;
  rowsRead: number;
  bytesRead: number;
  rowsWritten: number;
  bytesWritten: number;
  peakMemoryUsageBytes: number;
}

export interface MVMemoryStats {
  dataPoints: MemoryDataPoint[];
  peakUsageBytes: number;
}

export interface MemoryTracking {
  peakQueryMemoryBytes: number | null;
  queryMemoryProgression: MemoryDataPoint[];
}

export interface MVCascadeNode {
  sourceTable: string;
  mvName: string;
  targetTable: string;
  viewQuery: string;
  durationMs: number;
  readRows: number;
  readBytes: number;
  writtenRows: number;
  writtenBytes: number;
  peakMemoryUsageBytes: number;
  status: string;
  children: MVCascadeNode[];
}

export interface MVCascadeTree {
  rootTable: string;
  children: MVCascadeNode[];
}

export enum ParserStatus {
  SUCCESS = "success",
  ERROR = "error",
  PARTIAL = "partial",
}

export interface ParserResponse<T> {
  status: ParserStatus;
  messages: string[];
  response: T | undefined;
}

export interface ParsedTraceResponse {
  metadata: ParserResponse<QueryMetadata>;
  tableIOStats: ParserResponse<TableIOStats[]>;
  memoryTracking: ParserResponse<MemoryTracking>;
  materializedViewStats: ParserResponse<MaterializedViewStats[]>;
  mvCascadeTree: ParserResponse<MVCascadeTree>;
}
