import { useState, useRef, useCallback, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { clickhouseSql } from '../utils/codeMirror';
import { useTrace } from '../context/TraceContext';
import { useTheme } from '../context/ThemeContext';
import { useConversation } from '../context/ConversationContext';
import type { BackendMVCascadeNode } from '../types';
import './ViewsImpact.css';

function fmtRows(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

function fmtBytes(b: number): string {
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GiB';
  if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MiB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KiB';
  return b + ' B';
}

function nodeStatus(status: string): 'success' | 'warning' | 'error' {
  if (status === 'QueryFinish') return 'success';
  if (status === 'ExceptionWhileProcessing') return 'error';
  return 'warning';
}

interface InspectorData {
  mvName: string;
  sourceTable: string;
  targetTable: string;
  viewQuery: string;
  status: string;
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  node: BackendMVCascadeNode;
  parentId: string | null;
}

const NODE_WIDTH = 290;
const NODE_HEIGHT = 230;
const H_GAP = 80;
const V_GAP = 40;

function layoutTree(
  children: BackendMVCascadeNode[],
): { nodes: LayoutNode[]; edges: { from: string; to: string }[] } {
  const nodes: LayoutNode[] = [];
  const edges: { from: string; to: string }[] = [];
  let idCounter = 0;

  function positionWithEdges(
    node: BackendMVCascadeNode,
    depth: number,
    yOffset: number,
    parentId: string | null,
  ): { height: number; id: string } {
    const id = `node-${idCounter++}`;
    const x = depth * (NODE_WIDTH + H_GAP);

    const childResults: { height: number; id: string }[] = [];
    let childY = yOffset;

    for (const child of node.children) {
      const result = positionWithEdges(child, depth + 1, childY, id);
      childResults.push(result);
      edges.push({ from: id, to: result.id });
      childY += result.height + V_GAP;
    }

    const childrenTotalHeight = childResults.length > 0
      ? childResults.reduce((sum, c) => sum + c.height, 0) + (childResults.length - 1) * V_GAP
      : NODE_HEIGHT;

    const selfHeight = Math.max(NODE_HEIGHT, childrenTotalHeight);
    const y = yOffset + selfHeight / 2 - NODE_HEIGHT / 2;

    nodes.push({ id, x, y, width: NODE_WIDTH, height: NODE_HEIGHT, node, parentId });

    return { height: selfHeight, id };
  }

  let globalY = 0;
  for (const child of children) {
    const result = positionWithEdges(child, 0, globalY, null);
    globalY += result.height + V_GAP;
  }

  return { nodes, edges };
}

function getTreeBounds(nodes: LayoutNode[]) {
  if (!nodes.length) return { minX: 0, maxX: 0, minY: 0, maxY: 0, w: 0, h: 0 };
  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function parseTableRef(ref: string): { db: string; table: string } {
  const dot = ref.indexOf('.');
  if (dot !== -1) return { db: ref.slice(0, dot), table: ref.slice(dot + 1) };
  return { db: '', table: ref };
}

function CascadeCard({
  layoutNode,
  onHoverName,
  onLeaveName,
}: {
  layoutNode: LayoutNode;
  onHoverName: (data: InspectorData, rect: DOMRect) => void;
  onLeaveName: () => void;
}) {
  const { node } = layoutNode;
  const status = nodeStatus(node.status);
  const statusColor =
    status === 'success' ? 'var(--accent-cyan)' :
    status === 'warning' ? 'var(--accent-yellow)' :
    'var(--accent-red)';

  const target = parseTableRef(node.targetTable || node.mvName);
  const source = parseTableRef(node.sourceTable || '');
  const dbname = parseTableRef(node.mvName || '')
  const handleNameMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onHoverName({
      mvName: node.mvName,
      sourceTable: node.sourceTable,
      targetTable: node.targetTable,
      viewQuery: node.viewQuery,
      status: node.status,
    }, rect);
  };

  return (
    <div
      className={`cascade-card status-${status}`}
      style={{
        position: 'absolute',
        left: layoutNode.x,
        top: layoutNode.y,
        width: layoutNode.width,
      }}
    >
      <div
        className="cascade-name cascade-name-hover"
        onMouseEnter={handleNameMouseEnter}
        onMouseLeave={onLeaveName}
      >
        <div className="cascade-name-row">
          <div className="cascade-table-title">
            {dbname.db && (
              <span className="cascade-db-name">{dbname.db}</span>
            )}
            <span className="cascade-table-name">{target.table}</span>
          </div>
          <span className="cascade-status-dot" style={{ background: statusColor }} title={status} />
        </div>

        {node.mvName && node.mvName !== node.targetTable && (
          <span className="cascade-mv-label">{node.mvName}</span>
        )}
      </div>
      <div className="cascade-stats">
        {node.sourceTable && (
          <div className="cascade-stat">
            <span className="label-muted">Source:</span>
            <span className="cascade-source-value">
              {source.db && <span className="cascade-source-db">{source.db}.</span>}
              {source.table}
            </span>
          </div>
        )}
        {node.durationMs > 0 && (
          <div className="cascade-stat">
            <span className="label-muted">Duration:</span>
            <span>{node.durationMs}ms</span>
          </div>
        )}
        <div className="cascade-stat">
          <span className="label-muted">Read:</span>
          <span>{fmtRows(node.readRows)} rows</span>
        </div>
        {node.readBytes > 0 && (
          <div className="cascade-stat">
            <span className="label-muted">Read Bytes:</span>
            <span>{fmtBytes(node.readBytes)}</span>
          </div>
        )}
        <div className="cascade-stat">
          <span className="label-muted">Written:</span>
          <span>{fmtRows(node.writtenRows)} rows</span>
        </div>
        {node.writtenBytes > 0 && (
          <div className="cascade-stat">
            <span className="label-muted">Written Bytes:</span>
            <span>{fmtBytes(node.writtenBytes)}</span>
          </div>
        )}
        {(node.peakMemoryUsageBytes ?? 0) > 0 && (
          <div className="cascade-stat">
            <span className="label-muted">Peak Mem:</span>
            <span>{fmtBytes(node.peakMemoryUsageBytes)}</span>
          </div>
        )}
        {node.targetTable && (
          <div className="cascade-stat">
            <span className="label-muted">Target:</span>
            <span className="cascade-target-value">{node.targetTable}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EdgeSVG({ nodes, edges }: { nodes: LayoutNode[]; edges: { from: string; to: string }[] }) {
  const nodeMap = new Map<string, LayoutNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  return (
    <svg className="canvas-edges" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs>

        <marker id="arrowhead" markerWidth="9" markerHeight="8" refX="0" refY="4" orient="auto">
          <path d="M 0 0 L 9 4 L 0 8 Z" fill="var(--border-accent)" />
        </marker>
      </defs>
      {edges.map((edge, i) => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return null;

        const x1 = from.x + from.width;
        const y1 = from.y + from.height / 2;
        const x2 = to.x - 9;   
        const y2 = to.y + to.height / 2;
        const midX = (x1 + x2) / 2;

        return (
          <path
            key={i}
            d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="var(--border-accent)"
            strokeWidth="1.5"
            markerEnd="url(#arrowhead)"
          />
        );
      })}
    </svg>
  );
}

const TOOLTIP_WIDTH = 480;
const TOOLTIP_MARGIN = 12;

function NodeInspectorTooltip({
  data,
  anchor,
}: {
  data: InspectorData;
  anchor: { x: number; y: number };
}) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [safePos, setSafePos] = useState({ x: anchor.x, y: anchor.y });


  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tooltipH = tooltipRef.current?.offsetHeight ?? 300;

    const x = Math.max(TOOLTIP_MARGIN, Math.min(anchor.x, vw - TOOLTIP_WIDTH - TOOLTIP_MARGIN));

    const y = anchor.y + tooltipH + TOOLTIP_MARGIN > vh
      ? Math.max(TOOLTIP_MARGIN, anchor.y - tooltipH - 16)
      : anchor.y;

    setSafePos({ x, y });
  }, [anchor.x, anchor.y]);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.viewQuery);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      ref={tooltipRef}
      className="inspector-tooltip"
      style={{ left: safePos.x, top: safePos.y }}
    >
      <div className="inspector-tooltip-badges">
        <span className="badge badge-info">Materialized</span>
        {data.sourceTable && (
          <span className="badge" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-accent)', color: 'var(--text-secondary)' }}>
            Source: {data.sourceTable}
          </span>
        )}
        {data.targetTable && (
          <span className="badge" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-accent)', color: 'var(--text-secondary)' }}>
            Target: {data.targetTable}
          </span>
        )}
      </div>

      {data.viewQuery && (
        <div className="inspector-tooltip-sql">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="label">View Query</span>
            <button className="copy-btn" onClick={handleCopy} title="Copy Query">
              {copied ? (
                <span style={{ fontSize: 10, color: 'var(--accent-green)' }}>Copied!</span>
              ) : (
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </div>
          <div className="inspector-tooltip-editor">
            <CodeMirror
              value={data.viewQuery}
              theme={theme === 'dark' ? oneDark : undefined}
              extensions={[clickhouseSql(), EditorView.lineWrapping]}
              readOnly={true}
              editable={false}
              basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CanvasView({
  nodes,
  edges,
}: {
  nodes: LayoutNode[];
  edges: { from: string; to: string }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 60, y: 60 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const [tooltipData, setTooltipData] = useState<{ data: InspectorData; anchor: { x: number; y: number } } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const zoomLimitsRef = useRef({ min: 0.3, max: 2 });

  const computeLimitsAndRecenter = useCallback(() => {
    if (!containerRef.current || !nodes.length) return;
    const rect = containerRef.current.getBoundingClientRect();
    const b = getTreeBounds(nodes);
    const scaleX = (rect.width - 80) / Math.max(b.w, 1);
    const scaleY = (rect.height - 80) / Math.max(b.h, 1);
    const min = Math.max(0.3, Math.min(1, Math.min(scaleX, scaleY)));
    const max = Math.min(3, Math.max(min + 0.1, (rect.width * 0.7) / NODE_WIDTH));
    zoomLimitsRef.current = { min, max };
    const newZoom = Math.max(min, Math.min(1, Math.min(scaleX, scaleY)));
    setZoom(newZoom);
    setPan({
      x: (rect.width - b.w * newZoom) / 2 - b.minX * newZoom,
      y: (rect.height - b.h * newZoom) / 2 - b.minY * newZoom,
    });
  }, [nodes]); 


  useEffect(() => {
    computeLimitsAndRecenter();
  }, [computeLimitsAndRecenter]);

  const handleWheel = useCallback((e: React.WheelEvent) => {

    const { min, max } = zoomLimitsRef.current;
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setZoom((z) => {
      const newZoom = Math.min(max, Math.max(min, z * delta));
      setPan((p) => ({
        x: cx - (cx - p.x) * (newZoom / z),
        y: cy - (cy - p.y) * (newZoom / z),
      }));
      return newZoom;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const recenter = useCallback(() => {
    computeLimitsAndRecenter();
  }, [computeLimitsAndRecenter]);

  const handleHoverName = useCallback((data: InspectorData, rect: DOMRect) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltipData({
      data,
      anchor: { x: rect.left, y: rect.bottom + 8 },
    });
  }, []);

  const handleLeaveName = useCallback(() => {
    tooltipTimer.current = setTimeout(() => setTooltipData(null), 300);
  }, []);

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      <div className="canvas-controls">
        <button className="canvas-control-btn" onClick={() => {
          if (!containerRef.current) return;
          const { max } = zoomLimitsRef.current;
          const rect = containerRef.current.getBoundingClientRect();
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          setZoom((z) => {
            const newZoom = Math.min(max, z * 1.2);
            setPan((p) => ({
              x: cx - (cx - p.x) * (newZoom / z),
              y: cy - (cy - p.y) * (newZoom / z),
            }));
            return newZoom;
          });
        }}>+</button>
        <button className="canvas-control-btn" onClick={() => {
          if (!containerRef.current) return;
          const { min } = zoomLimitsRef.current;
          const rect = containerRef.current.getBoundingClientRect();
          const cx = rect.width / 2;
          const cy = rect.height / 2;
          setZoom((z) => {
            const newZoom = Math.max(min, z * 0.8);
            setPan((p) => ({
              x: cx - (cx - p.x) * (newZoom / z),
              y: cy - (cy - p.y) * (newZoom / z),
            }));
            return newZoom;
          });
        }}>&minus;</button>
        <button className="canvas-control-btn" onClick={recenter} title="Recenter">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M7 1v3M7 10v3M1 7h3M10 7h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div
        className="canvas-world"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <EdgeSVG nodes={nodes} edges={edges} />
        {nodes.map((ln) => (
          <CascadeCard key={ln.id} layoutNode={ln} onHoverName={handleHoverName} onLeaveName={handleLeaveName} />
        ))}
      </div>

      {tooltipData && (
        <div
          onMouseEnter={() => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); }}
          onMouseLeave={() => setTooltipData(null)}
        >
          <NodeInspectorTooltip data={tooltipData.data} anchor={tooltipData.anchor} />
        </div>
      )}
    </div>
  );
}

export default function ViewsImpact() {
  const { setDashboardTab } = useConversation();
  const { traceResult, executionState } = useTrace();

  if (!traceResult && executionState === 'idle') {
    return (
      <div className="analysis-empty">
        <div className="analysis-empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path d="M8 24h8M24 8v8M40 24h-8M24 40v-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="8" cy="24" r="4" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="40" cy="24" r="4" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="24" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="24" cy="40" r="4" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </div>
        <h2 className="analysis-empty-title">No trace data yet</h2>
        <p className="analysis-empty-desc">
          Run a query in the Query Editor to see materialized view cascade analysis here.
        </p>
        <button className="btn-primary" onClick={() => setDashboardTab('query-editor')}>
          Go to Query Editor
        </button>
      </div>
    );
  }

  if (!traceResult) {
    return (
      <div className="analysis-empty">
        <span className="analysis-spinner" />
      </div>
    );
  }

  const cascadeTree = traceResult.mvCascadeTree.response;
  const hasCascade = cascadeTree && cascadeTree.children.length > 0;

  const totalDepth = (nodes: BackendMVCascadeNode[], d = 0): number =>
    nodes.reduce((max, n) => Math.max(max, totalDepth(n.children, d + 1)), d);
  const cascadeDepth = hasCascade ? totalDepth(cascadeTree.children) + 1 : 0;


  const layout = hasCascade ? layoutTree(cascadeTree.children) : { nodes: [], edges: [] };

  return (
    <div className="views-impact-page">
      <div className="views-header">
        <div>
          <h1 className="views-title">Materialized Views</h1>
          <span className="label-muted">Materialized View Pipeline Execution Impact</span>
        </div>
        {hasCascade && (
          <div className="views-badges">
            <span className="badge badge-info">Cascade Depth: {cascadeDepth}</span>
          </div>
        )}
      </div>

      {hasCascade ? (
        <CanvasView nodes={layout.nodes} edges={layout.edges} />
      ) : (
        <div className="cascade-no-data">
          <p>No materialized view cascade detected for this query.</p>
          <p style={{ marginTop: 6 }}>MV cascades are triggered by INSERT operations into source tables that have attached materialized views.</p>
        </div>
      )}
    </div>
  );
}
