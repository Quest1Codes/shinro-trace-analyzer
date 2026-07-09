export interface ConnectionConfig {
  url: string;
  user: string;
  password: string;
  nativePort?: string;
  nativeSecure?: boolean;
}

export interface QueryHistoryItem {
  id: string;
  timestamp: string;
  query: string;
}

export interface SchemaColumn {
  name: string;
  type: string;
}

export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
}

export interface PerformanceMetric {
  label: string;
  value: string;
  unit: string;
  sublabel: string;
}

export interface MemoryDataPoint {
  timestamp: number;
  usageBytes: number;
  limitBytes?: number;
}

export interface MVCascadeNode {
  id: string;
  type: string;
  name: string;
  duration: string;
  readRows: string;
  writeRows: string;
  status: 'success' | 'warning' | 'error';
  children: MVCascadeNode[];
}



export type LLMProvider = 'openai' | 'anthropic' | 'openrouter';

export interface AIKeyStatus {
  openai: boolean;
  anthropic: boolean;
  openrouter: boolean;
  openaiModel?: string;
  anthropicModel?: string;
  openrouterModel?: string;
}

export interface MCPToolInfo {
  name: string;
  description: string;
}

export interface MCPStatus {
  connected: boolean;
  tools: MCPToolInfo[];
}

export interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  result?: string;
  isLoading?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallInfo[];
  metadata?: {
    impactForecast?: string;
    resourceGain?: string;
    codeBlock?: string;
    provider?: LLMProvider;
  };
}

export type TabView = 'query-editor' | 'analysis-dashboard' | 'materialized-views' | 'shinro-ai';

export type DashboardTab = 'query-editor' | 'analysis' | 'materialized-views' | 'expert-help';

export interface ChatHistorySummary {
  id: string;
  title: string;
  timestamp: string;
  queryId?: string;
}

export interface ConversationState {
  activeConversationId: string | null;
  conversations: ChatHistorySummary[];
}

export interface ChatHistoryRecord {
  query_id: string;
  title: string | null;
  messages: ChatMessage[];
  parsed_trace: ParsedTraceResponse | null;
  created_at: string;
}



export const enum ParserStatus {
  Success = 'success',
  Error = 'error',
  Partial = 'partial',
}

export interface ParserResponse<T> {
  status: ParserStatus;
  messages: string[];
  response: T | undefined;
}

export interface BackendQueryMetadata {
  queryId?: string;
  sourceIP?: string;
  query?: string;
  currentDatabase?: string;
  initialTimestamp?: string;
  finalTimestamp?: string;
  executionTimeMs?: number;
  queryType?: string;
  bytesRead?: number;
  rowsRead?: number;
  bytesWritten?: number;
  rowsWritten?: number;
  resultRows?: number;
  resultBytes?: number;
  memoryUsage?: number;
}

export interface BackendMemoryDataPoint {
  timestamp: string;
  usageBytes: number;
}

export interface BackendMemoryTracking {
  peakQueryMemoryBytes: number | null;
  queryMemoryProgression: BackendMemoryDataPoint[];
}

export interface BackendMVCascadeNode {
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
  children: BackendMVCascadeNode[];
}

export interface BackendMVCascadeTree {
  rootTable: string;
  children: BackendMVCascadeNode[];
}

export interface BackendTableReadEvent {
  approxRows: number;
  streams: number;
}

export interface BackendTableWriteEvent {
  rows: number;
}

export interface BackendPKPruningStats {
  granulesDropped: number;
  granulesTotal: number;
  pruningRatio: number;
  timeTakenMs: number;
  threads: number;
}

export interface BackendPartitionKeyStats {
  partsSelectedByPartitionKey: number;
  partsTotal: number;
  partsByPrimaryKey: number;
  marksSelectedByPrimaryKey: number;
  marksTotalByPrimaryKey: number;
  marksToRead: number;
  ranges: number;
}

export interface BackendTableIOStats {
  tableName: string;
  database: string | null;
  fullTableName: string;
  reads: BackendTableReadEvent[];
  writes: BackendTableWriteEvent[];
  totalRowsRead: number;
  totalRowsWritten: number;
  totalStreamsUsed: number;
  pkPruning: BackendPKPruningStats[];
  partitionKeyStats: BackendPartitionKeyStats[];
  usesFinal: boolean;
}

export interface BackendMaterializedViewStats {
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

export interface ParsedTraceResponse {
  metadata: ParserResponse<BackendQueryMetadata>;
  tableIOStats: ParserResponse<BackendTableIOStats[]>;
  memoryTracking: ParserResponse<BackendMemoryTracking>;
  materializedViewStats: ParserResponse<BackendMaterializedViewStats[]>;
  mvCascadeTree: ParserResponse<BackendMVCascadeTree>;
}
