// ---------------------------------------------------------------------------
// GFM table model — parse, serialise, structural transforms, and inline render.
//
// The Markdown source stays the single source of truth. This module turns a
// pipe-table's source text into a small {header, aligns, rows} model, applies
// structural edits to that model, and renders it back to padded GFM source. It
// also renders a cell's inline Markdown to a safe HTML fragment for the widget.
// ---------------------------------------------------------------------------

export type Align = 'none' | 'left' | 'center' | 'right';

export interface TableModel {
  header: string[];
  aligns: Align[];
  rows: string[][]; // body rows only (header is separate)
}

const DELIM_CELL = /^\s*:?-+:?\s*$/;

/**
 * Parse a pipe-table's source (header line, delimiter line, then zero+ body
 * rows) into a model. Returns null if the text isn't a valid GFM table.
 */
export function parseTable(md: string): TableModel | null {
  const lines = md.replace(/\n+$/, '').split('\n');
  if (lines.length < 2) return null;

  const header = splitRow(lines[0]);
  const delimCells = splitRow(lines[1]);
  if (delimCells.length === 0 || !delimCells.every((c) => DELIM_CELL.test(c))) return null;

  const cols = header.length;
  const aligns: Align[] = [];
  for (let i = 0; i < cols; i++) aligns.push(alignOf(delimCells[i] ?? '---'));

  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;
    rows.push(normalizeLen(splitRow(lines[i]), cols));
  }

  return { header: normalizeLen(header, cols), aligns, rows };
}

function alignOf(cell: string): Align {
  const c = cell.trim();
  const l = c.startsWith(':');
  const r = c.endsWith(':');
  if (l && r) return 'center';
  if (l) return 'left';
  if (r) return 'right';
  return 'none';
}

/** Split a table row on unescaped pipes, dropping the optional outer pipes. */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (/(^|[^\\])\|$/.test(s)) s = s.replace(/\|$/, '');

  const cells: string[] = [];
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      buf += ch + s[i + 1];
      i++;
    } else if (ch === '|') {
      cells.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  cells.push(buf);
  return cells.map((c) => c.trim().replace(/\\\|/g, '|'));
}

function normalizeLen(cells: string[], cols: number): string[] {
  const out = cells.slice(0, cols);
  while (out.length < cols) out.push('');
  return out;
}

// ---------------------------------------------------------------------------
// Serialisation — model back to padded, aligned GFM source.
// ---------------------------------------------------------------------------

const escapeCell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function serializeTable(model: TableModel): string {
  const cols = model.header.length;
  const widths: number[] = [];
  for (let c = 0; c < cols; c++) {
    let w = escapeCell(model.header[c] ?? '').length;
    for (const row of model.rows) w = Math.max(w, escapeCell(row[c] ?? '').length);
    widths[c] = Math.max(3, w);
  }

  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
  const rowLine = (cells: string[]) =>
    '| ' + cells.map((c, i) => pad(escapeCell(c ?? ''), widths[i])).join(' | ') + ' |';

  const delimLine =
    '| ' + model.aligns.map((a, i) => delimiterCell(a, widths[i])).join(' | ') + ' |';

  const lines = [rowLine(model.header), delimLine, ...model.rows.map(rowLine)];
  return lines.join('\n');
}

function delimiterCell(align: Align, width: number): string {
  const w = Math.max(3, width);
  switch (align) {
    case 'left':
      return ':' + '-'.repeat(w - 1);
    case 'right':
      return '-'.repeat(w - 1) + ':';
    case 'center':
      return ':' + '-'.repeat(w - 2) + ':';
    default:
      return '-'.repeat(w);
  }
}

// ---------------------------------------------------------------------------
// Structural transforms — pure; each returns a new model.
// ---------------------------------------------------------------------------

const clone = (m: TableModel): TableModel => ({
  header: m.header.slice(),
  aligns: m.aligns.slice(),
  rows: m.rows.map((r) => r.slice())
});

export function addColumn(m: TableModel, at: number, side: 'before' | 'after'): TableModel {
  const n = clone(m);
  const idx = Math.max(0, Math.min(n.header.length, side === 'before' ? at : at + 1));
  n.header.splice(idx, 0, '');
  n.aligns.splice(idx, 0, 'none');
  for (const row of n.rows) row.splice(idx, 0, '');
  return n;
}

export function deleteColumn(m: TableModel, at: number): TableModel {
  if (m.header.length <= 1) return m;
  const n = clone(m);
  n.header.splice(at, 1);
  n.aligns.splice(at, 1);
  for (const row of n.rows) row.splice(at, 1);
  return n;
}

export function addRow(m: TableModel, atBody: number, side: 'before' | 'after'): TableModel {
  const n = clone(m);
  const idx = Math.max(0, Math.min(n.rows.length, side === 'before' ? atBody : atBody + 1));
  n.rows.splice(idx, 0, n.header.map(() => ''));
  return n;
}

export function deleteRow(m: TableModel, atBody: number): TableModel {
  if (atBody < 0 || atBody >= m.rows.length) return m;
  const n = clone(m);
  n.rows.splice(atBody, 1);
  return n;
}

export function setAlign(m: TableModel, col: number, align: Align): TableModel {
  if (col < 0 || col >= m.aligns.length) return m;
  const n = clone(m);
  n.aligns[col] = align;
  return n;
}

/** A blank starter table: `cols` columns, one empty body row. */
export function blankTable(cols: number): TableModel {
  const header = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
  return { header, aligns: header.map(() => 'none'), rows: [header.map(() => '')] };
}

// ---------------------------------------------------------------------------
// Inline Markdown -> safe HTML, for rendering cell content in the widget.
// A curated subset: code, bold, italic, strikethrough, links. Everything is
// HTML-escaped first, so nothing the source contains can inject markup.
// ---------------------------------------------------------------------------

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SAFE_URL = /^(https?:|mailto:|tel:|#|\/|\.|[^:\s]+$)/i;

const SENTINEL = String.fromCharCode(0); // never occurs in Markdown source, so no collision

export function renderInlineMd(raw: string): string {
  if (raw === '') return '';

  // Protect code spans first (their contents are literal), swapping each out for
  // a NUL-delimited index that later text transforms can't disturb.
  const codes: string[] = [];
  let s = raw.replace(/`([^`]+)`/g, (_m, code) => {
    codes.push('<code>' + escapeHtml(code) + '</code>');
    return SENTINEL + (codes.length - 1) + SENTINEL;
  });

  s = escapeHtml(s);

  // Links: [text](url) — only safe URLs; unsafe ones fall back to plain text.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => {
    const u = url.replace(/&amp;/g, '&');
    if (!SAFE_URL.test(u)) return text;
    return '<a href="' + escapeHtml(u) + '" rel="noreferrer">' + text + '</a>';
  });

  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_]+)_/g, '$1<em>$2</em>');

  // Restore code spans.
  s = s.replace(new RegExp(SENTINEL + '(\\d+)' + SENTINEL, 'g'), (_m, i) => codes[Number(i)]);
  return s;
}

export const alignToCss = (a: Align): string => (a === 'none' ? '' : a);
