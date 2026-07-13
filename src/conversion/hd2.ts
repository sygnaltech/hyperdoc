import TurndownService from 'turndown';
import { markdownToHtml } from './mdToHd';

/**
 * hd2 conversion layer — the only thing that distinguishes the experimental
 * Markdown-primary `.hd2` flavor from stable `.hd`.
 *
 *   on-disk (Markdown + HTML islands)  ──hd2BodyToEditorHtml──▶  editor (HTML)
 *   editor (HTML)  ──editorHtmlToHd2Body──▶  on-disk (Markdown + HTML islands)
 *
 * The rule of thumb: emit Markdown when Markdown can express the element
 * losslessly, and fall back to a verbatim HTML island when it can't. That
 * boundary is drawn per-element below and documented in docs/hd2/.
 */

// Elements with no clean Markdown equivalent are preserved verbatim as HTML
// islands. A block island carries its entire subtree as HTML (its inner
// Markdown is NOT re-extracted) — this is intentional and documented.
const HTML_ISLAND_TAGS = [
  'div', 'span',
  'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
  'figure', 'figcaption',
  'mark', 'sub', 'sup', 'u',
  'kbd', 'samp', 'var',
  'abbr', 'cite', 'q', 'small',
  'dl', 'dt', 'dd',
  'details', 'summary',
  'svg'
];

function baseTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    hr: '---',
    linkStyle: 'inlined'
  });

  td.keep(HTML_ISLAND_TAGS as unknown as TurndownService.Filter);

  // Strikethrough is lossless in GFM — upgrade it from the hd1 raw-HTML default.
  td.addRule('strikethrough', {
    filter: (node) => node.nodeName === 'S' || node.nodeName === 'DEL' || node.nodeName === 'STRIKE',
    replacement: (content) => (content ? `~~${content}~~` : '')
  });

  // A bare image becomes Markdown; an image carrying sizing/styling stays HTML
  // so those attributes survive the round-trip.
  td.addRule('styledImage', {
    filter: (node) => node.nodeName === 'IMG' && imageIsStyled(node as unknown as HtmlEl),
    replacement: (_content, node) => (node as unknown as HtmlEl).outerHTML
  });

  return td;
}

// Cell converter: same rules, minus the table rule (prevents recursion) and
// producing single-line inline Markdown suitable for a GFM cell.
const cellTurndown = baseTurndown();

// Full-document converter, with table handling layered on top.
const docTurndown = baseTurndown();
docTurndown.addRule('table', {
  filter: (node) => node.nodeName === 'TABLE',
  replacement: (_content, node) => {
    const table = node as unknown as HtmlEl;
    if (isComplexTable(table)) {
      return '\n\n' + table.outerHTML + '\n\n';
    }
    return '\n\n' + gfmTable(table) + '\n\n';
  }
});

export function hd2BodyToEditorHtml(markdownBody: string): string {
  return markdownToHtml(markdownBody);
}

export function editorHtmlToHd2Body(html: string): string {
  const md = docTurndown.turndown(html).trim();
  return md.length ? md + '\n' : '';
}

// ---------------------------------------------------------------------------
// Table analysis. A table is GFM-expressible only when it is rectangular, has
// a header row, and every cell is single-span with inline-only content.
// ---------------------------------------------------------------------------

// Minimal structural view of the DOM nodes turndown hands us (backed by domino
// in the extension host). Typed loosely to avoid a hard lib.dom dependency.
interface HtmlEl {
  nodeName: string;
  innerHTML: string;
  outerHTML: string;
  children: ArrayLike<HtmlEl>;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  querySelector(sel: string): HtmlEl | null;
  querySelectorAll(sel: string): ArrayLike<HtmlEl>;
}

function all(el: HtmlEl, sel: string): HtmlEl[] {
  return Array.from(el.querySelectorAll(sel));
}

function childElements(el: HtmlEl): HtmlEl[] {
  return Array.from(el.children);
}

// A row's own header/data cells (direct children only, so cells belonging to a
// nested table are not miscounted).
function cellsOf(row: HtmlEl): HtmlEl[] {
  return childElements(row).filter((c) => c.nodeName === 'TH' || c.nodeName === 'TD');
}

function imageIsStyled(img: HtmlEl): boolean {
  return (
    img.hasAttribute('width') ||
    img.hasAttribute('height') ||
    img.hasAttribute('style') ||
    (img.getAttribute('class')?.trim().length ?? 0) > 0
  );
}

function isComplexTable(table: HtmlEl): boolean {
  const rows = all(table, 'tr');
  if (rows.length === 0) return true;

  // A GFM table needs a header row: either a <thead> or <th> cells in row one.
  const hasHeader = table.querySelector('thead') != null || cellsOf(rows[0]).some((c) => c.nodeName === 'TH');
  if (!hasHeader) return true;

  const width = cellsOf(rows[0]).length;
  if (width === 0) return true;

  for (const row of rows) {
    const cells = cellsOf(row);
    if (cells.length !== width) return true; // non-rectangular
    for (const cell of cells) {
      if (span(cell, 'colspan') > 1 || span(cell, 'rowspan') > 1) return true;
      if (cellHasBlockContent(cell)) return true;
    }
  }
  return false;
}

function span(cell: HtmlEl, attr: string): number {
  const raw = cell.getAttribute(attr);
  const n = raw ? parseInt(raw, 10) : 1;
  return Number.isFinite(n) ? n : 1;
}

const BLOCK_IN_CELL = 'p, div, ul, ol, table, blockquote, pre, h1, h2, h3, h4, h5, h6, hr, figure';

function cellHasBlockContent(cell: HtmlEl): boolean {
  // A single wrapping <p> is fine (TipTap wraps cell text in a paragraph); more
  // than one block, or any non-paragraph block, means the cell can't be GFM.
  const blocks = all(cell, BLOCK_IN_CELL);
  const paras = blocks.filter((b) => b.nodeName === 'P');
  if (blocks.length !== paras.length) return true; // a non-<p> block present
  return paras.length > 1;
}

function gfmTable(table: HtmlEl): string {
  const rows = all(table, 'tr');
  const headerCells = cellsOf(rows[0]);
  const bodyRows = rows.slice(1);

  const header = '| ' + headerCells.map((c) => convertCell(c)).join(' | ') + ' |';
  const delim = '| ' + headerCells.map((c) => alignMarker(c)).join(' | ') + ' |';
  const lines = [header, delim];
  for (const row of bodyRows) {
    const cells = cellsOf(row);
    lines.push('| ' + cells.map((c) => convertCell(c)).join(' | ') + ' |');
  }
  return lines.join('\n');
}

function convertCell(cell: HtmlEl): string {
  return cellTurndown
    .turndown(cell.innerHTML)
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function alignMarker(cell: HtmlEl): string {
  const style = (cell.getAttribute('style') ?? '').toLowerCase();
  const align = (cell.getAttribute('align') ?? '').toLowerCase() ||
    (style.match(/text-align:\s*(left|center|right)/)?.[1] ?? '');
  if (align === 'center') return ':---:';
  if (align === 'right') return '---:';
  if (align === 'left') return ':---';
  return '---';
}
