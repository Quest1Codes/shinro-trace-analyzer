import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { Download } from 'lucide-react';
import { clickhouseSql } from '../utils/codeMirror';
import { useTrace } from '../context/TraceContext';
import { useTheme } from '../context/ThemeContext';
import { useConversation } from '../context/ConversationContext';
import { useConnection } from '../context/ConnectionContext';
import { downloadAnalysisReport } from '../services/pdfReportService';
import type { BackendQueryMetadata, BackendMemoryTracking, BackendTableIOStats } from '../types';
import './AnalysisDashboard.css';

function fmtBytes(bytes: number): { value: string; unit: string } {
  if (bytes >= 1e9) return { value: (bytes / 1e9).toFixed(2), unit: 'GB' };
  if (bytes >= 1e6) return { value: (bytes / 1e6).toFixed(1), unit: 'MB' };
  if (bytes >= 1e3) return { value: (bytes / 1e3).toFixed(1), unit: 'KB' };
  return { value: String(bytes), unit: 'B' };
}

function fmtRows(n: number): { value: string; unit: string } {
  if (n >= 1e9) return { value: (n / 1e9).toFixed(2), unit: 'B' };
  if (n >= 1e6) return { value: (n / 1e6).toFixed(2), unit: 'M' };
  if (n >= 1e3) return { value: (n / 1e3).toFixed(1), unit: 'K' };
  return { value: n.toLocaleString(), unit: '' };
}

function buildMemoryChartData(tracking: BackendMemoryTracking) {
  const pts = tracking.queryMemoryProgression;
  if (!pts.length) return [];
  const t0 = new Date(pts[0]!.timestamp.replace(/\./g, (m, i) =>
    i === 10 ? ' ' : i === 13 || i === 16 ? ':' : m
  )).getTime();
  return pts.map((p, i) => {
    const t = new Date(p.timestamp.replace(/\./g, (m, idx) =>
      idx === 10 ? ' ' : idx === 13 || idx === 16 ? ':' : m
    )).getTime();
    const elapsed = isNaN(t) ? i * 10 : t - t0;
    return { time: `${elapsed}ms`, usageMb: p.usageBytes / (1024 * 1024) };
  });
}

function EmptyState() {
  const { setDashboardTab } = useConversation();
  return (
    <div className="analysis-empty">
      <div className="analysis-empty-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="8" width="40" height="32" rx="3" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M4 16h40" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M14 28h20M14 34h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="36" cy="36" r="8" fill="var(--bg-primary)" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M36 33v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <h2 className="analysis-empty-title">No trace data yet</h2>
      <p className="analysis-empty-desc">
        Run a query in the Query Editor to capture a trace and see execution analysis here.
      </p>
      <button className="btn-primary" onClick={() => setDashboardTab('query-editor')}>
        Go to Query Editor
      </button>
    </div>
  );
}

function fmtGranules(stats: BackendTableIOStats): string {
  if (!stats.pkPruning || !stats.pkPruning.length) return 'none';
  const pk = stats.pkPruning[0]!;
  return `${pk.granulesDropped}/${pk.granulesTotal} ${(pk.pruningRatio * 100).toFixed(1)}% ${pk.timeTakenMs}ms t${pk.threads}`;
}

function fmtPartitionKey(stats: BackendTableIOStats): string {
  if (!stats.partitionKeyStats || !stats.partitionKeyStats.length) return 'none';
  const p = stats.partitionKeyStats[0]!;
  return `${p.partsSelectedByPartitionKey}/${p.partsTotal} parts  ${p.marksSelectedByPrimaryKey}/${p.marksTotalByPrimaryKey} marks`;
}

function TableIOStatsSection({ stats }: { stats: BackendTableIOStats[] }) {
  if (!stats.length) return null;

  const totalTables = stats.length;

  return (
    <div className="table-io-section">
      <h2 className="section-title">Table I/O ({totalTables} tables)</h2>
      <span className="label-muted" style={{ marginBottom: 12, display: 'block' }}>Per-table read/write activity</span>
      <div className="table-io-wrapper">
        <table className="io-table">
          <thead>
            <tr>
              <th>Table</th>
              <th>Read Events</th>
              <th>Write Events</th>
              <th>Rows Read</th>
              <th>Rows Written</th>
              <th>Streams</th>
              <th>Uses FINAL</th>
              <th>Granules Skipped</th>
              <th>Partition Key</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((t, i) => (
              <tr key={i}>
                <td className="io-table-name">{t.fullTableName || t.tableName}</td>
                <td>{t.reads ? t.reads.length : 0}</td>
                <td>{t.writes ? t.writes.length : 0}</td>
                <td>{t.totalRowsRead.toLocaleString()}</td>
                <td>{t.totalRowsWritten.toLocaleString()}</td>
                <td>{t.totalStreamsUsed}</td>
                <td>{t.usesFinal ? <strong>yes</strong> : 'no'}</td>
                <td className="io-table-detail">{fmtGranules(t)}</td>
                <td className="io-table-detail">{fmtPartitionKey(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AnalysisDashboard() {
  const { traceResult, executionState } = useTrace();
  const { theme } = useTheme();
  const { setDashboardTab } = useConversation();
  const { connectionInfo } = useConnection();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadReport = async () => {
    if (!traceResult || downloading) return;
    setDownloading(true);
    try {
      await downloadAnalysisReport(traceResult, connectionInfo);
    } catch (err) {
      console.error('Failed to generate PDF report', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = () => {
    const query = traceResult?.metadata.response?.query;
    if (query) {
      navigator.clipboard.writeText(query);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!traceResult && executionState === 'idle') {
    return <EmptyState />;
  }

  if (executionState === 'error') {
    return (
      <div className="analysis-empty">
        <h2 className="analysis-empty-title">Execution failed</h2>
        <p className="analysis-empty-desc">Check the error details in the Query Editor.</p>
        <button className="btn-primary" onClick={() => setDashboardTab('query-editor')}>
          Back to Query Editor
        </button>
      </div>
    );
  }

  if (!traceResult) {
    return (
      <div className="analysis-empty">
        <div className="analysis-empty-icon">
          <span className="analysis-spinner" />
        </div>
        <h2 className="analysis-empty-title">Processing trace...</h2>
        <p className="analysis-empty-desc">
          {executionState === 'executing' && 'Executing query and capturing trace logs.'}
          {executionState === 'fetching_logs' && 'Waiting for ClickHouse to flush system logs. This can take up to 30 seconds.'}
          {executionState === 'parsing' && 'Parsing trace data and calculating metrics.'}
        </p>
      </div>
    );
  }

  const meta: BackendQueryMetadata | undefined = traceResult.metadata.response;
  const memTracking: BackendMemoryTracking | undefined = traceResult.memoryTracking.response;
  const tableIOStats: BackendTableIOStats[] = traceResult.tableIOStats.response ?? [];

  const bytesRead = meta?.bytesRead ? fmtBytes(meta.bytesRead) : null;
  const rowsRead = meta?.rowsRead != null ? fmtRows(meta.rowsRead) : null;
  const resultRows = meta?.resultRows != null ? fmtRows(meta.resultRows) : null;
  const peakMem = memTracking?.peakQueryMemoryBytes != null ? fmtBytes(memTracking.peakQueryMemoryBytes) : null;
  const chartData = memTracking ? buildMemoryChartData(memTracking) : [];
  const hasMemoryData = chartData.length > 0;

  const metrics = [
    { label: 'Execution Time', value: meta?.executionTimeMs != null ? String(meta.executionTimeMs) : '--', unit: 'ms' },
    { label: 'Peak Memory', value: peakMem?.value ?? '--', unit: peakMem?.unit ?? '' },
    { label: 'Rows Read', value: rowsRead?.value ?? '--', unit: rowsRead?.unit ?? '' },
    { label: 'Bytes Read', value: bytesRead?.value ?? '--', unit: bytesRead?.unit ?? '' },
    { label: 'Result Rows', value: resultRows?.value ?? '--', unit: resultRows?.unit ?? '' },
  ];

  return (
    <div className="analysis-page">
      <div className="analysis-header">
        <h1 className="analysis-title">Analysis Dashboard</h1>
        {meta?.queryId && (
          <div className="badge badge-success">
            <span className="dot dot-green" /> Query ID: {meta.queryId}
          </div>
        )}
      </div>

      <div className="metrics-grid">
        {metrics.map((m) => (
          <div key={m.label} className="metric-card">
            <div className="metric-header">
              <span className="label-muted">{m.label}</span>
            </div>
            <div className="metric-value">
              {m.value}<span className="metric-unit">{m.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {hasMemoryData && (
        <div className="memory-io-row">
          <div className="memory-chart-section">
            <div className="memory-chart-header">
              <div>
                <h2 className="section-title">Query Memory Progression</h2>
                <span className="label-muted">Memory (MB) over time</span>
              </div>
              <div className="chart-legend">
                <span className="legend-item">
                  <span className="legend-dot" style={{ background: 'var(--accent-cyan)' }} /> Memory (MB)
                </span>
              </div>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="time" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(2)} MB`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                    formatter={(v) => [`${Number(v).toFixed(4)} MB`, 'Memory']}
                  />
                  <Area type="monotone" dataKey="usageMb" stroke="#22d3ee" fill="url(#memGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tableIOStats.length > 0 && <TableIOStatsSection stats={tableIOStats} />}

      <div className="bottom-panels">
        <div className="source-query-panel">
          <div className="panel-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 className="label-muted" style={{ marginBottom: 0, paddingLeft: 1 }}>Source Query</h3>
            {meta?.query && (
              <button className="copy-btn" onClick={handleCopy} title="Copy Query">
                {copied ? (
                  <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>Copied!</span>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
            )}
          </div>
          {meta?.query ? (
            <div className="dashboard-editor-container">
              <CodeMirror
                value={meta.query}
                theme={theme === 'dark' ? oneDark : undefined}
                extensions={[clickhouseSql(), EditorView.lineWrapping]}
                readOnly={true}
                editable={false}
                basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
              />
            </div>
          ) : (
            <p className="panel-empty">Query text not available.</p>
          )}
        </div>

        <div className="metadata-panel">
          <h3 className="label-muted" style={{ marginBottom: 12 }}>Query Context Metadata</h3>
          {meta ? (
            <div className="metadata-grid">
              <div className="meta-item">
                <span className="label-muted">User / IP</span>
                <span>{meta.sourceIP || '--'}</span>
              </div>
              <div className="meta-item">
                <span className="label-muted">Database</span>
                <span>{meta.currentDatabase || '--'}</span>
              </div>
              <div className="meta-item">
                <span className="label-muted">Query Type</span>
                <span>{meta.queryType || '--'}</span>
              </div>
              <div className="meta-item">
                <span className="label-muted">Result Bytes</span>
                <span>{meta.resultBytes != null ? fmtBytes(meta.resultBytes).value + ' ' + fmtBytes(meta.resultBytes).unit : '--'}</span>
              </div>
            </div>
          ) : (
            <p className="panel-empty">Metadata not available.</p>
          )}

          {traceResult.metadata.messages.length > 0 && (
            <div className="meta-alerts">
              {traceResult.metadata.messages.map((msg, i) => (
                <div key={i} className={`meta-alert ${traceResult.metadata.status === 'error' ? 'warning' : 'info'}`}>
                  {msg}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="analysis-footer">
        <div className="footer-links">
          <span className="footer-link-btn" onClick={() => setDashboardTab('materialized-views')}>
            View MV Cascade
          </span>
          <span
            className={`footer-link-btn footer-link-btn--accent${downloading ? ' is-busy' : ''}`}
            onClick={handleDownloadReport}
            title="Download a technical PDF report of this trace analysis"
          >
            <Download size={13} strokeWidth={2.2} />
            {downloading ? 'Generating PDF…' : 'Download PDF Report'}
          </span>
        </div>
      </footer>
    </div>
  );
}
