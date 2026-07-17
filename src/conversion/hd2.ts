import TurndownService from 'turndown';
import { markdownToHtml, markdownInlineToHtml } from './mdToHd';

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

// Interactive controls (save side). A task item serializes to a GFM checkbox
// (`- [x]`), a radio item to our paren marker (`- ( )`). The parent list just
// passes its already-marked children through.
docTurndown.addRule('taskItem', {
  filter: (node) => node.nodeName === 'LI' && attr(node, 'data-type') === 'task',
  replacement: (content, node) => controlLine(attr(node, 'data-checked') === 'true' ? '[x]' : '[ ]', content)
});
docTurndown.addRule('radioItem', {
  filter: (node) => node.nodeName === 'LI' && attr(node, 'data-type') === 'radio',
  replacement: (content, node) => controlLine(attr(node, 'data-checked') === 'true' ? '(x)' : '( )', content)
});
docTurndown.addRule('controlList', {
  filter: (node) =>
    node.nodeName === 'UL' &&
    (attr(node, 'data-type') === 'tasklist' || attr(node, 'data-type') === 'radiogroup'),
  replacement: (content) => '\n\n' + content.replace(/^\n+|\n+$/g, '') + '\n\n'
});
// A NAMED radio group can't be expressed as `- ( )` markers — the group name
// has nowhere to live — so it stays a verbatim HTML island. Added last so it
// takes precedence over the generic controlList rule above.
docTurndown.addRule('namedRadioGroup', {
  filter: (node) =>
    node.nodeName === 'UL' &&
    attr(node, 'data-type') === 'radiogroup' &&
    (attr(node, 'data-group')?.trim().length ?? 0) > 0,
  replacement: (_content, node) => '\n\n' + (node as unknown as HtmlEl).outerHTML + '\n\n'
});

export function hd2BodyToEditorHtml(markdownBody: string): string {
  return markdownToHtml(segmentControls(markdownBody));
}

// ---------------------------------------------------------------------------
// Interactive controls (load side).
//
// GFM would render `- [x]` with a forbidden `<input>`, and our radio syntax
// `- ( )` is not standard Markdown at all. Both are also grouped by ADJACENCY:
// a run of consecutive marker lines is one control list, and ANY break — a
// blank line, other content, or a switch of marker kind — starts a new one.
// (A blank line separates groups and survives the round-trip as block spacing
// between the two lists.) That grouping can't be recovered from parsed HTML, so
// we segment the runs directly from the raw Markdown lines here, emitting the
// HD-allowed representation as an HTML block that the parser passes through:
//
//   <ul data-type="tasklist">   <li data-type="task"  data-checked="…">label
//   <ul data-type="radiogroup"> <li data-type="radio" data-checked="…">label
//
// State lives in `data-checked`, which is agent-readable and round-trips.
// ---------------------------------------------------------------------------

type ControlKind = 'task' | 'radio';
interface ControlItem { checked: boolean; label: string; }

// A control occupies a whole line: an OPTIONAL list bullet, then the
// bracket/paren marker, then the label. `[ ]`/`[x]` = checkbox, `( )`/`(x)` =
// radio. The bullet is optional so a hand-typed `() foo` is recognized the same
// way the editor's input rule treats it; the fill character is case-insensitive
// and may be empty (`[]` / `()`).
const TASK_LINE = /^\s*(?:[-*+]\s+)?\[([ xX]?)\]\s+(.*)$/;
const RADIO_LINE = /^\s*(?:[-*+]\s+)?\(([ xX]?)\)\s+(.*)$/;

function matchControl(line: string): { kind: ControlKind; item: ControlItem } | null {
  const task = line.match(TASK_LINE);
  if (task) return { kind: 'task', item: { checked: task[1].toLowerCase() === 'x', label: task[2] } };
  const radio = line.match(RADIO_LINE);
  if (radio) return { kind: 'radio', item: { checked: radio[1].toLowerCase() === 'x', label: radio[2] } };
  return null;
}

function segmentControls(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const start = matchControl(lines[i]);
    if (!start) {
      out.push(lines[i]);
      i++;
      continue;
    }

    // Consume the run of consecutive SAME-kind markers. A blank line, other
    // content, or a different marker kind ends the run (and the group).
    const kind = start.kind;
    const items: ControlItem[] = [];
    while (i < lines.length) {
      const next = matchControl(lines[i]);
      if (!next || next.kind !== kind) break;
      items.push(next.item);
      i++;
    }
    out.push(renderControlBlock(kind, items));
  }

  return out.join('\n');
}

function renderControlBlock(kind: ControlKind, items: ControlItem[]): string {
  const listType = kind === 'task' ? 'tasklist' : 'radiogroup';
  // A radio group may have at most one selection; if the source marked several,
  // keep only the first so the loaded document is a valid single-select group.
  let radioTaken = false;
  const lis = items
    .map((it) => {
      let checked = it.checked;
      if (kind === 'radio') {
        if (checked && radioTaken) checked = false;
        else if (checked) radioTaken = true;
      }
      return (
        `<li data-type="${kind}" data-checked="${checked ? 'true' : 'false'}">` +
        `${markdownInlineToHtml(it.label)}</li>`
      );
    })
    .join('\n');
  // Blank lines around the block so the Markdown parser treats it as raw HTML.
  return `\n<ul data-type="${listType}">\n${lis}\n</ul>\n`;
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

function attr(node: unknown, name: string): string | null {
  return (node as HtmlEl).getAttribute(name);
}

// `- [x] text` / `- ( ) text`. Cell/inline content is flattened to one line so
// the marker line stays a valid single list item.
function controlLine(marker: string, content: string): string {
  const text = content.trim().replace(/\r?\n+/g, ' ');
  return `- ${marker} ${text}\n`;
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
