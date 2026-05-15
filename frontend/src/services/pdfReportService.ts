import jsPDF from 'jspdf';
import type {
  ParsedTraceResponse,
  BackendMVCascadeNode,
  BackendTableIOStats,
} from '../types';
import { registerPdfFonts, FONT } from './fonts/registerPdfFonts';

const COLOR = {
  orange: [243, 105, 33] as [number, number, number],
  navy: [7, 24, 80] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  warn: [217, 119, 6] as [number, number, number],
  textPrimary: [15, 23, 42] as [number, number, number],
  textSecondary: [51, 65, 85] as [number, number, number],
  textMuted: [100, 116, 139] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],
  borderLight: [226, 232, 240] as [number, number, number],
  bgSubtle: [248, 250, 252] as [number, number, number],
  bgOrange: [254, 241, 234] as [number, number, number],
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 40;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 50;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

// A4 landscape dimensions
const LW = 841.89;
const LH = 595.28;
const LCW = LW - MARGIN_X * 2;

function fmtBytes(bytes?: number | null): string {
  if (bytes == null) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmtRows(n?: number | null): string {
  if (n == null) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

class PdfWriter {
  doc: jsPDF;
  y: number;
  pageNum: number = 1;
  totalPages: number = 1;
  reportTitle: string;
  isLandscape: boolean = false;
  landscapePageNums = new Set<number>();

  constructor(reportTitle: string) {
    this.doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    registerPdfFonts(this.doc);
    this.y = MARGIN_TOP;
    this.reportTitle = reportTitle;
  }

  get pw() { return this.isLandscape ? LW : PAGE_W; }
  get ph() { return this.isLandscape ? LH : PAGE_H; }

  rgb(c: [number, number, number]) {
    return c;
  }

  setFill(c: [number, number, number]) {
    this.doc.setFillColor(c[0], c[1], c[2]);
  }

  setStroke(c: [number, number, number]) {
    this.doc.setDrawColor(c[0], c[1], c[2]);
  }

  setText(c: [number, number, number]) {
    this.doc.setTextColor(c[0], c[1], c[2]);
  }

  ensureSpace(needed: number) {
    if (this.y + needed > this.ph - MARGIN_BOTTOM) {
      this.newPage();
    }
  }

  newPage() {
    if (this.isLandscape) {
      this.doc.addPage('a4', 'landscape');
      this.pageNum++;
      this.landscapePageNums.add(this.pageNum);
    } else {
      this.doc.addPage();
      this.pageNum++;
    }
    this.y = MARGIN_TOP;
    this.drawPageHeader();
  }

  switchToLandscape() {
    // Must pass orientation explicitly — without it jsPDF uses the document-level
    // orientation ("p") and swaps [841.89, 595.28] back to portrait dimensions.
    this.doc.addPage('a4', 'landscape');
    this.pageNum++;
    this.isLandscape = true;
    this.landscapePageNums.add(this.pageNum);
    this.y = MARGIN_TOP;
    this.drawPageHeader();
  }

  drawPageHeader() {
    const pw = this.pw;
    const c = this.doc;
    // Logo mark (small Q1 icon)
    drawQ1LogoMark(c, MARGIN_X, 17, 14);
    c.setFont(FONT.sans, 'bold');
    c.setFontSize(7.5);
    this.setText(COLOR.textMuted);
    c.text('Quest1 ClickHouse Query Trace Analyzer', MARGIN_X + 18, 27);
    c.setFont(FONT.sans, 'normal');
    c.setFontSize(7.5);
    this.setText(COLOR.textMuted);
    c.text(this.reportTitle, pw - MARGIN_X, 27, { align: 'right' });
    this.setStroke(COLOR.borderLight);
    c.setLineWidth(0.5);
    c.line(MARGIN_X, 34, pw - MARGIN_X, 34);
  }

  drawPageFooter(pageNum: number, totalPages: number, landscape = false) {
    const pw = landscape ? LW : PAGE_W;
    const ph = landscape ? LH : PAGE_H;
    const c = this.doc;
    this.setStroke(COLOR.borderLight);
    c.setLineWidth(0.5);
    c.line(MARGIN_X, ph - 38, pw - MARGIN_X, ph - 38);
    c.setFont(FONT.sans, 'normal');
    c.setFontSize(7.5);
    this.setText(COLOR.textMuted);
    c.text(`Page ${pageNum} of ${totalPages}`, pw / 2, ph - 24, {
      align: 'center',
    });
    c.text('Quest1 ClickHouse Query Trace Analyzer', MARGIN_X, ph - 24);
  }

  finalize() {
    const total = this.doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i);
      this.drawPageFooter(i, total, this.landscapePageNums.has(i));
    }
  }

  text(
    str: string,
    x: number,
    y: number,
    opts: {
      size?: number;
      style?: 'normal' | 'bold' | 'italic';
      color?: [number, number, number];
      align?: 'left' | 'center' | 'right';
      font?: string;
    } = {},
  ) {
    const c = this.doc;
    c.setFont(opts.font ?? FONT.sans, opts.style ?? 'normal');
    c.setFontSize(opts.size ?? 10);
    if (opts.color) this.setText(opts.color);
    else this.setText(COLOR.textPrimary);
    c.text(str, x, y, { align: opts.align ?? 'left' });
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    fill?: [number, number, number],
    stroke?: [number, number, number],
    radius = 0,
  ) {
    const c = this.doc;
    if (fill) {
      this.setFill(fill);
      if (stroke) this.setStroke(stroke);
      c.roundedRect(x, y, w, h, radius, radius, stroke ? 'FD' : 'F');
    } else if (stroke) {
      this.setStroke(stroke);
      c.roundedRect(x, y, w, h, radius, radius, 'S');
    }
  }
}

// Quest1 logo mark — draws the Q, 1, and dot shapes at the given position & size
// Original viewBox: 0 0 110 110 — paths traced exactly from the application SVG
function drawQ1LogoMark(c: jsPDF, x: number, y: number, size: number) {
  const s = size / 110;

  // "Q" shape — navy fill (L-bracket shape, SVG path approximated without tiny arcs)
  c.setFillColor(7, 24, 80);
  c.lines(
    [
      [40*s, 0],    // → [54,10]
      [4*s, 4*s],   // → [58,14]
      [0, 16*s],    // → [58,30]
      [-4*s, 4*s],  // → [54,34]
      [-16*s, 0],   // → [38,34]
      [-4*s, 4*s],  // → [34,38]
      [0, 44*s],    // → [34,82]
      [4*s, 4*s],   // → [38,86]
      [34*s, 0],    // → [72,86]
      [4*s, 4*s],   // → [76,90]
      [0, 16*s],    // → [76,106]
      [-4*s, 4*s],  // → [72,110]
      [-58*s, 0],   // → [14,110]
      [-4*s, -4*s], // → [10,106]
      [0, -92*s],   // → [10,14]
    ],
    x + 14*s, y + 10*s,
    [1, 1], 'F', true,
  );

  // "1" shape — orange fill
  c.setFillColor(243, 105, 33);
  c.lines(
    [
      [34*s, 0],    // → [106,10]
      [4*s, 4*s],   // → [110,14]
      [0, 58*s],    // → [110,72]
      [-4*s, 4*s],  // → [106,76]
      [-16*s, 0],   // → [90,76]
      [-4*s, -4*s], // → [86,72]
      [0, -34*s],   // → [86,38]
      [-4*s, -4*s], // → [82,34]
      [-10*s, 0],   // → [72,34]
      [-4*s, -4*s], // → [68,30]
      [0, -16*s],   // → [68,14]
    ],
    x + 72*s, y + 10*s,
    [1, 1], 'F', true,
  );

  // Dot — navy fill
  c.setFillColor(7, 24, 80);
  const dotR = 4 * s;
  c.roundedRect(x + 86*s, y + 86*s, 24*s, 24*s, dotR, dotR, 'F');
}

function sectionTitle(w: PdfWriter, label: string) {
  w.ensureSpace(40);
  w.text(label, MARGIN_X, w.y + 12, {
    size: 12,
    style: 'bold',
    color: COLOR.textPrimary,
  });
  // Orange accent underline
  w.doc.setDrawColor(...COLOR.orange);
  w.doc.setLineWidth(2);
  w.doc.line(MARGIN_X, w.y + 17, MARGIN_X + 24, w.y + 17);
  w.y += 28;
}

function eyebrow(w: PdfWriter, label: string) {
  w.ensureSpace(18);
  w.text(label, MARGIN_X, w.y + 8, {
    size: 8,
    style: 'bold',
    color: COLOR.textMuted,
  });
  w.y += 16;
}

function drawCover(w: PdfWriter, queryId: string | undefined, clusterInfo?: { url: string; user: string } | null) {
  const c = w.doc;
  // Top accent bar
  w.setFill(COLOR.orange);
  c.rect(0, 0, PAGE_W, 6, 'F');

  // Logo mark + brand text
  drawQ1LogoMark(c, MARGIN_X, 60, 36);
  w.text('Quest1', MARGIN_X + 44, 78, {
    size: 13,
    style: 'bold',
    color: COLOR.navy,
    font: FONT.sans,
  });
  w.text('CLICKHOUSE QUERY TRACE ANALYZER', MARGIN_X + 44, 93, {
    size: 8,
    style: 'bold',
    color: COLOR.textMuted,
    font: FONT.sans,
  });

  // Title block
  w.text('Trace Analysis', MARGIN_X, 200, {
    size: 32,
    style: 'bold',
    color: COLOR.textPrimary,
  });
  w.text('Report', MARGIN_X, 238, {
    size: 32,
    style: 'bold',
    color: COLOR.textPrimary,
  });
  w.setFill(COLOR.orange);
  c.rect(MARGIN_X, 250, 50, 3, 'F');

  w.text('Technical performance & materialized view impact analysis', MARGIN_X, 276, {
    size: 11,
    color: COLOR.textSecondary,
  });

  // Metadata block
  const metaY = 330;
  w.setStroke(COLOR.border);
  c.setLineWidth(0.7);
  c.line(MARGIN_X, metaY, MARGIN_X + 240, metaY);

  const generated = new Date().toLocaleString();
  const rows: [string, string][] = [
    ['Generated', generated],
    ['Query ID', queryId ?? '—'],
    ...(clusterInfo ? [['Cluster', clusterInfo.url] as [string, string], ['User', clusterInfo.user] as [string, string]] : []),
    ['Document', 'TRACE-REPORT'],
  ];
  let yy = metaY + 20;
  for (const [k, v] of rows) {
    w.text(k.toUpperCase(), MARGIN_X, yy, {
      size: 7.5,
      style: 'bold',
      color: COLOR.textMuted,
    });
    w.text(v, MARGIN_X + 80, yy, {
      size: 9.5,
      color: COLOR.textPrimary,
      font: FONT.mono,
    });
    yy += 20;
  }

  // Footer note
  w.text(
    'Generated locally by Quest1 ClickHouse Query Trace Analyzer',
    PAGE_W / 2,
    PAGE_H - 60,
    { size: 7.5, color: COLOR.textMuted, align: 'center' },
  );

  w.y = PAGE_H; // force new page
}

function drawMetricsGrid(
  w: PdfWriter,
  metrics: { label: string; value: string }[],
) {
  const cols = 3;
  const cardW = (CONTENT_W - 12) / cols;
  const cardH = 56;
  const rows = Math.ceil(metrics.length / cols);
  w.ensureSpace(rows * (cardH + 6) + 4);
  const baseY = w.y;
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN_X + col * (cardW + 6);
    const y = baseY + row * (cardH + 6);
    w.rect(x, y, cardW, cardH, COLOR.bgSubtle, COLOR.border, 4);
    w.text(m.label.toUpperCase(), x + 12, y + 18, {
      size: 8,
      style: 'bold',
      color: COLOR.textMuted,
    });
    w.text(m.value, x + 12, y + 42, {
      size: 17,
      style: 'bold',
      color: COLOR.textPrimary,
    });
  }
  w.y += rows * (cardH + 6) + 8;
}

function drawKeyValueGrid(
  w: PdfWriter,
  pairs: { label: string; value: string }[],
) {
  const cols = 2;
  const cardW = (CONTENT_W - 8) / cols;
  const rowH = 26;
  const rows = Math.ceil(pairs.length / cols);
  w.ensureSpace(rows * rowH + 8);
  const baseY = w.y;
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN_X + col * (cardW + 8);
    const yy = baseY + row * rowH;
    w.text(p.label.toUpperCase(), x, yy + 8, {
      size: 7.5,
      style: 'bold',
      color: COLOR.textMuted,
    });
    w.text(p.value, x, yy + 20, {
      size: 10,
      color: COLOR.textPrimary,
      font: FONT.mono,
    });
    if (col === cols - 1 || i === pairs.length - 1) {
      w.setStroke(COLOR.borderLight);
      w.doc.setLineWidth(0.4);
      w.doc.line(MARGIN_X, yy + 24, PAGE_W - MARGIN_X, yy + 24);
    }
  }
  w.y += rows * rowH + 8;
}

function drawSqlBlock(w: PdfWriter, sql: string) {
  const c = w.doc;
  c.setFont(FONT.mono, 'normal');
  c.setFontSize(9);
  const lines = c.splitTextToSize(sql, CONTENT_W - 24) as string[];

  let i = 0;
  while (i < lines.length) {
    const remaining = lines.length - i;
    const available = PAGE_H - MARGIN_BOTTOM - w.y - 16;
    const fits = Math.max(1, Math.min(remaining, Math.floor(available / 12)));
    const blockH = fits * 12 + 16;
    w.rect(MARGIN_X, w.y, CONTENT_W, blockH, COLOR.bgSubtle, COLOR.border, 4);
    w.setText(COLOR.textPrimary);
    c.setFont(FONT.mono, 'normal');
    c.setFontSize(9);
    let yy = w.y + 14;
    for (let j = 0; j < fits; j++) {
      c.text(lines[i + j]!, MARGIN_X + 12, yy);
      yy += 12;
    }
    w.y += blockH + 8;
    i += fits;
    if (i < lines.length) w.newPage();
  }
}

function drawTable(
  w: PdfWriter,
  headers: string[],
  rows: string[][],
  colWidths: number[],
) {
  const c = w.doc;
  const headerH = 22;
  const rowH = 18;
  // Header
  w.ensureSpace(headerH + rowH);
  let xCursor = MARGIN_X;
  w.rect(MARGIN_X, w.y, CONTENT_W, headerH, COLOR.navy);
  c.setFont(FONT.sans, 'bold');
  c.setFontSize(8);
  w.setText([255, 255, 255]);
  for (let i = 0; i < headers.length; i++) {
    c.text(headers[i]!, xCursor + 6, w.y + 14);
    xCursor += colWidths[i]!;
  }
  w.y += headerH;

  c.setFont(FONT.sans, 'normal');
  c.setFontSize(9);

  for (let r = 0; r < rows.length; r++) {
    w.ensureSpace(rowH + 2);
    const rowY = w.y;
    if (r % 2 === 0) {
      w.setFill(COLOR.bgSubtle);
      c.rect(MARGIN_X, rowY, CONTENT_W, rowH, 'F');
    }
    xCursor = MARGIN_X;
    w.setText(COLOR.textPrimary);
    for (let i = 0; i < rows[r]!.length; i++) {
      const cell = rows[r]![i]!;
      const lines = c.splitTextToSize(cell, colWidths[i]! - 12) as string[];
      c.text(lines[0] ?? '', xCursor + 6, rowY + 12);
      xCursor += colWidths[i]!;
    }
    w.y += rowH;
  }
  // bottom border
  w.setStroke(COLOR.border);
  c.setLineWidth(0.5);
  c.line(MARGIN_X, w.y, PAGE_W - MARGIN_X, w.y);
  w.y += 8;
}

function drawAlertBox(
  w: PdfWriter,
  message: string,
  level: 'info' | 'warning',
) {
  const color = level === 'warning' ? COLOR.warn : COLOR.navy;
  const bg = level === 'warning' ? [254, 247, 237] as [number, number, number] : [240, 244, 255] as [number, number, number];
  const lines = w.doc.splitTextToSize(message, CONTENT_W - 24) as string[];
  const h = Math.max(28, lines.length * 11 + 14);
  w.ensureSpace(h + 4);
  w.rect(MARGIN_X, w.y, CONTENT_W, h, bg, color, 4);
  // accent stripe
  w.setFill(color);
  w.doc.rect(MARGIN_X, w.y, 3, h, 'F');
  let yy = w.y + 14;
  for (const ln of lines) {
    w.text(ln, MARGIN_X + 14, yy, { size: 9, color: COLOR.textPrimary });
    yy += 11;
  }
  w.y += h + 6;
}

// === Memory chart drawn from data points ===
function drawMemoryChart(
  w: PdfWriter,
  data: { time: string; usageMb: number }[],
) {
  if (data.length === 0) return;
  const chartW = CONTENT_W;
  const chartH = 160;
  const padL = 48;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  w.ensureSpace(chartH + 16);
  // Frame
  w.rect(MARGIN_X, w.y, chartW, chartH, COLOR.bgSubtle, COLOR.border, 4);

  const innerX = MARGIN_X + padL;
  const innerY = w.y + padT;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const maxV = Math.max(...data.map((d) => d.usageMb), 1);
  const minV = 0;
  const range = maxV - minV;

  // Y-axis ticks
  const ticks = 4;
  w.doc.setFont(FONT.sans, 'normal');
  w.doc.setFontSize(7);
  w.setText(COLOR.textMuted);
  w.setStroke(COLOR.borderLight);
  w.doc.setLineWidth(0.4);
  for (let i = 0; i <= ticks; i++) {
    const t = i / ticks;
    const v = minV + range * (1 - t);
    const yy = innerY + innerH * t;
    w.doc.text(`${v.toFixed(2)} MB`, MARGIN_X + 6, yy + 3);
    w.doc.line(innerX, yy, innerX + innerW, yy);
  }

  // Plot polyline (filled area)
  const points: [number, number][] = data.map((d, i) => {
    const x = innerX + (data.length === 1 ? 0 : (i / (data.length - 1)) * innerW);
    const t = (d.usageMb - minV) / (range || 1);
    const yy = innerY + innerH - innerH * t;
    return [x, yy];
  });

  const c = w.doc;
  c.setLineWidth(1.4);
  c.setDrawColor(8, 145, 178);
  for (let i = 1; i < points.length; i++) {
    c.line(points[i - 1]![0], points[i - 1]![1], points[i]![0], points[i]![1]);
  }
  c.setFillColor(8, 145, 178);
  for (const p of points) {
    c.circle(p[0], p[1], 1.6, 'F');
  }

  // X-axis labels (sparse)
  c.setFont(FONT.sans, 'normal');
  c.setFontSize(7);
  w.setText(COLOR.textMuted);
  const labelStep = Math.max(1, Math.floor(data.length / 5));
  for (let i = 0; i < data.length; i += labelStep) {
    const x = innerX + (data.length === 1 ? 0 : (i / (data.length - 1)) * innerW);
    c.text(data[i]!.time, x, innerY + innerH + 14, { align: 'center' });
  }

  w.y += chartH + 8;
}

// === MV Cascade: Compact indented tree + stats table ===

function mvStatusColor(status: string): [number, number, number] {
  if (status === 'QueryFinish') return COLOR.green;
  if (status === 'ExceptionWhileProcessing') return COLOR.red;
  return COLOR.warn;
}

function mvStatusLabel(status: string): string {
  if (status === 'QueryFinish') return 'OK';
  if (status === 'ExceptionWhileProcessing') return 'ERR';
  return 'WARN';
}

function mvCountNodes(nodes: BackendMVCascadeNode[]): number {
  let count = 0;
  for (const n of nodes) { count++; count += mvCountNodes(n.children); }
  return count;
}

function mvMaxDepth(nodes: BackendMVCascadeNode[], d = 0): number {
  return nodes.reduce((mx, n) => Math.max(mx, mvMaxDepth(n.children, d + 1)), d);
}

interface MvFlatRow { depth: number; node: BackendMVCascadeNode; index: number; }

function flattenMvNodes(nodes: BackendMVCascadeNode[], depth: number, out: MvFlatRow[]) {
  for (const n of nodes) {
    out.push({ depth, node: n, index: out.length + 1 });
    flattenMvNodes(n.children, depth + 1, out);
  }
}

const TREE_ROW_H = 22;
const TREE_INDENT = 24;
const TREE_DOT_R = 3.5;
const TREE_LINE_COLOR: [number, number, number] = [180, 190, 205];

function truncMvText(c: jsPDF, text: string, maxW: number): string {
  if (c.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && c.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
  return t + '…';
}

function drawTreeRow(
  w: PdfWriter, node: BackendMVCascadeNode, depth: number,
  y: number, isLast: boolean[], rowIdx: number,
) {
  const c = w.doc;
  const baseX = MARGIN_X + 8;
  if (rowIdx % 2 === 0) { w.setFill(COLOR.bgSubtle); c.rect(MARGIN_X, y - 1, CONTENT_W, TREE_ROW_H, 'F'); }
  c.setDrawColor(...TREE_LINE_COLOR);
  c.setLineWidth(0.8);
  for (let i = 0; i < depth; i++) {
    const lx = baseX + i * TREE_INDENT + TREE_INDENT / 2;
    if (i < depth - 1) {
      if (!isLast[i]) c.line(lx, y - 1, lx, y + TREE_ROW_H - 1);
    } else {
      const midY = y + TREE_ROW_H / 2;
      c.line(lx, y - 1, lx, midY);
      c.line(lx, midY, lx + TREE_INDENT / 2 - 2, midY);
      if (!isLast[depth - 1]) c.line(lx, midY, lx, y + TREE_ROW_H - 1);
    }
  }
  const dotX = baseX + depth * TREE_INDENT + TREE_INDENT / 2;
  const dotY = y + TREE_ROW_H / 2;
  const sc = mvStatusColor(node.status);
  c.setFillColor(...sc); c.circle(dotX, dotY, TREE_DOT_R, 'F');
  const textX = dotX + TREE_DOT_R + 6;
  const tableName = node.targetTable || node.mvName || '-';
  c.setFont(FONT.sans, 'bold'); c.setFontSize(8.5); w.setText(COLOR.textPrimary);
  c.text(tableName, textX, dotY + 3);
  const tableW = c.getTextWidth(tableName);
  if (node.mvName && node.mvName !== node.targetTable) {
    c.setFont(FONT.mono, 'normal'); c.setFontSize(7); w.setText(COLOR.orange);
    c.text(`  ${node.mvName}`, textX + tableW, dotY + 3);
  }
  const rightX = MARGIN_X + CONTENT_W - 8;
  c.setFont(FONT.mono, 'normal'); c.setFontSize(7);
  const statsStr = `${node.durationMs ?? 0}ms · W:${fmtRows(node.writtenRows)} · R:${fmtRows(node.readRows)}`;
  w.setText(COLOR.textMuted);
  c.text(statsStr, rightX, dotY + 2.5, { align: 'right' });
}

function drawMvTreeRows(
  w: PdfWriter, nodes: BackendMVCascadeNode[], depth: number,
  isLast: boolean[], counter: { idx: number },
) {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const last = i === nodes.length - 1;
    const currentIsLast = [...isLast, last];
    w.ensureSpace(TREE_ROW_H + 4);
    drawTreeRow(w, node, depth, w.y, currentIsLast, counter.idx);
    w.y += TREE_ROW_H;
    counter.idx++;
    if (node.children.length > 0) drawMvTreeRows(w, node.children, depth + 1, currentIsLast, counter);
  }
}

function fmtGranulesForPdf(stats: BackendTableIOStats): string {
  if (!stats.pkPruning || !stats.pkPruning.length) return '—';
  const pk = stats.pkPruning[0]!;
  return `${pk.granulesDropped}/${pk.granulesTotal} (${(pk.pruningRatio * 100).toFixed(1)}%)`;
}

function fmtPartitionKeyForPdf(stats: BackendTableIOStats): string {
  if (!stats.partitionKeyStats || !stats.partitionKeyStats.length) return '—';
  const p = stats.partitionKeyStats[0]!;
  return `${p.partsSelectedByPartitionKey}/${p.partsTotal} parts`;
}

function fmtCompact(rows: number | null | undefined, bytes: number | null | undefined): string {
  return `${fmtRows(rows)}/${fmtBytes(bytes).replace(/ /g, '')}`;
}

function drawMvStatsTable(w: PdfWriter, flatRows: MvFlatRow[]) {
  const c = w.doc;
  // colW must sum to exactly CONTENT_W (515)
  const headers = ['#', 'MV / Target', 'Source', 'Dur.', 'Read (rows/bytes)', 'Written (rows/bytes)', 'Peak Mem'];
  const colW =     [20,  138,           113,       44,     70,                  70,                     60];
  // total: 20+138+113+44+70+70+60 = 515 ✓
  const headerH = 22;
  const rowH = 18;
  w.ensureSpace(headerH + rowH * 2);
  let xc = MARGIN_X;
  w.rect(MARGIN_X, w.y, CONTENT_W, headerH, COLOR.navy);
  c.setFont(FONT.sans, 'bold'); c.setFontSize(6.5); w.setText([255, 255, 255]);
  for (let i = 0; i < headers.length; i++) { c.text(headers[i]!, xc + 4, w.y + 14); xc += colW[i]!; }
  w.y += headerH;
  for (const row of flatRows) {
    w.ensureSpace(rowH + 2);
    const ry = w.y;
    if (row.index % 2 === 0) { w.setFill(COLOR.bgSubtle); c.rect(MARGIN_X, ry, CONTENT_W, rowH, 'F'); }
    xc = MARGIN_X;
    // #
    c.setFont(FONT.sans, 'normal'); c.setFontSize(7); w.setText(COLOR.textMuted);
    c.text(String(row.index), xc + 4, ry + 12); xc += colW[0]!;
    // MV / Target
    const indent = '  '.repeat(row.depth);
    c.setFont(FONT.sans, 'bold'); c.setFontSize(7); w.setText(COLOR.textPrimary);
    c.text(truncMvText(c, indent + (row.node.targetTable || row.node.mvName || '-'), colW[1]! - 8), xc + 4, ry + 12);
    xc += colW[1]!;
    // Source
    c.setFont(FONT.mono, 'normal'); c.setFontSize(6.5); w.setText(COLOR.textSecondary);
    c.text(truncMvText(c, row.node.sourceTable || '-', colW[2]! - 8), xc + 4, ry + 12); xc += colW[2]!;
    // Dur.
    c.setFont(FONT.mono, 'normal'); c.setFontSize(7); w.setText(COLOR.textPrimary);
    c.text(`${row.node.durationMs ?? 0}ms`, xc + 4, ry + 12); xc += colW[3]!;
    // Read
    w.setText(COLOR.textSecondary);
    c.text(truncMvText(c, fmtCompact(row.node.readRows, row.node.readBytes), colW[4]! - 8), xc + 4, ry + 12); xc += colW[4]!;
    // Written
    c.text(truncMvText(c, fmtCompact(row.node.writtenRows, row.node.writtenBytes), colW[5]! - 8), xc + 4, ry + 12); xc += colW[5]!;
    // Peak Mem
    w.setText(COLOR.textPrimary);
    c.text(`${((row.node.peakMemoryUsageBytes ?? 0) / (1024 * 1024)).toFixed(1)} MB`, xc + 4, ry + 12);
    w.y += rowH;
  }
  w.setStroke(COLOR.border); c.setLineWidth(0.5);
  c.line(MARGIN_X, w.y, MARGIN_X + CONTENT_W, w.y); w.y += 8;
}

function drawMvCascade(
  w: PdfWriter, rootTable: string, children: BackendMVCascadeNode[],
) {
  w.newPage();
  sectionTitle(w, 'Materialized View Cascade');
  if (children.length === 0) {
    w.text('No materialized view cascade detected for this query.', MARGIN_X, w.y + 14, {
      size: 10, color: COLOR.textMuted,
    });
    w.y += 28;
    return;
  }
  const totalNodes = mvCountNodes(children);
  const maxDp = mvMaxDepth(children);
  const badgeY = w.y;
  const badges = [
    { label: 'Root Table', value: rootTable || '-' },
    { label: 'Total MVs', value: String(totalNodes) },
    { label: 'Max Depth', value: String(maxDp + 1) },
  ];
  const badgeW = (CONTENT_W - 12) / badges.length;
  const badgeH = 40;
  for (let i = 0; i < badges.length; i++) {
    const bx = MARGIN_X + i * (badgeW + 6);
    w.rect(bx, badgeY, badgeW, badgeH, COLOR.bgSubtle, COLOR.border, 4);
    w.text(badges[i]!.label.toUpperCase(), bx + 10, badgeY + 14, { size: 7, style: 'bold', color: COLOR.textMuted });
    w.text(badges[i]!.value, bx + 10, badgeY + 30, { size: 11, style: 'bold', color: COLOR.textPrimary, font: FONT.mono });
  }
  w.y += badgeH + 14;
  eyebrow(w, 'CASCADE TREE');
  w.ensureSpace(TREE_ROW_H + 8);
  const rootY = w.y;
  w.rect(MARGIN_X, rootY, CONTENT_W, TREE_ROW_H, COLOR.navy, COLOR.navy, 3);
  const c = w.doc;
  c.setFillColor(...COLOR.orange); c.rect(MARGIN_X + 10, rootY + TREE_ROW_H / 2 - 3, 6, 6, 'F');
  c.setFont(FONT.sans, 'bold'); c.setFontSize(6.5);
  w.setText([140, 160, 200] as [number, number, number]);
  c.text('INSERT INTO', MARGIN_X + 22, rootY + TREE_ROW_H / 2 - 1);
  c.setFont(FONT.mono, 'bold'); c.setFontSize(9); w.setText([255, 255, 255]);
  c.text(rootTable || '-', MARGIN_X + 78, rootY + TREE_ROW_H / 2 + 3);
  w.y += TREE_ROW_H;
  drawMvTreeRows(w, children, 0, [], { idx: 0 });
  w.y += 16;
  eyebrow(w, 'MV EXECUTION DETAILS');
  const flatRows: MvFlatRow[] = [];
  flattenMvNodes(children, 0, flatRows);
  drawMvStatsTable(w, flatRows);
}

// === Public entry ===
export async function downloadAnalysisReport(
  trace: ParsedTraceResponse,
  clusterInfo?: { url: string; user: string } | null,
): Promise<void> {
  const meta = trace.metadata.response;
  const memTracking = trace.memoryTracking.response;
  const tableIO: BackendTableIOStats[] = trace.tableIOStats.response ?? [];
  const cascadeTree = trace.mvCascadeTree.response;

  const queryId = meta?.queryId;
  const reportTitle = `Trace Report${queryId ? ` · ${queryId.slice(0, 8)}` : ''}`;

  const w = new PdfWriter(reportTitle);

  // Cover
  drawCover(w, queryId, clusterInfo);
  w.newPage();

  // Executive summary
  sectionTitle(w, 'Executive Summary');
  const peakMemMB = memTracking?.peakQueryMemoryBytes != null ? memTracking.peakQueryMemoryBytes / (1024 * 1024) : undefined;
  const metrics = [
    {
      label: 'Execution Time',
      value:
        meta?.executionTimeMs != null ? `${meta.executionTimeMs} ms` : '—',
    },
    {
      label: 'Peak Memory',
      value: peakMemMB != null ? `${peakMemMB.toFixed(2)} MB` : '—',
    },
    { label: 'Rows Read', value: fmtRows(meta?.rowsRead) },
    { label: 'Bytes Read', value: fmtBytes(meta?.bytesRead) },
    { label: 'Result Rows', value: fmtRows(meta?.resultRows) },
    { label: 'Tables Touched', value: String(tableIO.length) },
  ];
  drawMetricsGrid(w, metrics);
  w.y += 6;

  // Query Context
  sectionTitle(w, 'Query Context');
  const ctx: { label: string; value: string }[] = [
    { label: 'Query ID', value: meta?.queryId ?? '—' },
    { label: 'Query Type', value: meta?.queryType ?? '—' },
    { label: 'Database', value: meta?.currentDatabase ?? '—' },
    { label: 'User / Source IP', value: meta?.sourceIP ?? '—' },
    {
      label: 'Result Bytes',
      value: fmtBytes(meta?.resultBytes),
    },
    {
      label: 'Status',
      value:
        trace.metadata.status === 'success'
          ? 'OK'
          : trace.metadata.status === 'partial'
            ? 'Warning'
            : 'Error',
    },
  ];
  drawKeyValueGrid(w, ctx);

  // Alerts
  if (trace.metadata.messages.length) {
    sectionTitle(w, 'Notes & Alerts');
    for (const m of trace.metadata.messages) {
      drawAlertBox(
        w,
        m,
        trace.metadata.status === 'error' ? 'warning' : 'info',
      );
    }
  }

  // Source Query
  if (meta?.query) {
    sectionTitle(w, 'Source Query');
    drawSqlBlock(w, meta.query);
  }

  // Memory chart
  if (memTracking && memTracking.queryMemoryProgression.length > 0) {
    sectionTitle(w, 'Query Memory Progression');
    eyebrow(w, 'MEMORY (MB) OVER TIME');
    const pts = memTracking.queryMemoryProgression;
    const t0 = parseTs(pts[0]!.timestamp);
    const data = pts.map((p, i) => {
      const t = parseTs(p.timestamp);
      const elapsed = isNaN(t) ? i * 10 : t - t0;
      return { time: `${elapsed}ms`, usageMb: p.usageBytes / (1024 * 1024) };
    });
    drawMemoryChart(w, data);
  }

  // Table I/O
  if (tableIO.length > 0) {
    sectionTitle(w, `Table I/O (${tableIO.length} table${tableIO.length > 1 ? 's' : ''})`);
    const headers = ['Table', 'R Evt', 'W Evt', 'Rows R', 'Rows W', 'Streams', 'FINAL', 'Granules Skipped', 'Partition Key'];
    const colWidths = [125, 40, 40, 55, 55, 38, 32, 75, 55];
    const rows = tableIO.map((t) => [
      t.fullTableName || t.tableName || '—',
      String(t.reads ? t.reads.length : 0),
      String(t.writes ? t.writes.length : 0),
      fmtRows(t.totalRowsRead),
      fmtRows(t.totalRowsWritten),
      String(t.totalStreamsUsed),
      t.usesFinal ? 'YES' : 'no',
      fmtGranulesForPdf(t),
      fmtPartitionKeyForPdf(t),
    ]);
    drawTable(w, headers, rows, colWidths);
  }

  // Materialized Views (section title is drawn inside drawMvCascade on the landscape page)
  if (cascadeTree) {
    drawMvCascade(w, cascadeTree.rootTable, cascadeTree.children);
  }

  w.finalize();

  const filename = `quest1-trace-report-${queryId ? queryId.slice(0, 8) : Date.now()}.pdf`;
  w.doc.save(filename);
}

function parseTs(ts: string): number {
  // ClickHouse "2024.10.21 12:34:56.123" -> ISO-ish
  const iso = ts
    .replace(/\./g, (m, i) =>
      i === 4 || i === 7 ? '-' : i === 10 ? ' ' : i === 13 || i === 16 ? ':' : m,
    )
    .replace(' ', 'T');
  return new Date(iso).getTime();
}
