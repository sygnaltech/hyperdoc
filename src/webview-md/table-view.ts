// ---------------------------------------------------------------------------
// CodeMirror integration for GFM tables.
//
// A pipe-table block is replaced by a rendered <table> widget whenever the
// caret isn't inside it — the same "reveal source per block" pattern the image
// and alert decorations already use. Clicking a rendered cell drops the caret
// into that cell's source, revealing the raw pipes to edit. Structural editing
// (add/remove rows & columns, alignment, delete) is driven by the hover buttons
// and context menu in table-ui.ts, which call applyTransform()/deleteTable().
//
// Block-level decorations (a replacement spanning line breaks) must come from a
// StateField, not a ViewPlugin — that's the one structural difference from the
// inline decorations in main.ts.
// ---------------------------------------------------------------------------

import { StateField, EditorSelection, RangeSetBuilder } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import {
  parseTable,
  serializeTable,
  renderInlineMd,
  alignToCss,
  type TableModel
} from './table-model';

/** Live source range of a rendered table, stamped on its DOM element. */
export interface TableRef {
  from: number;
  to: number;
}

interface TableEl extends HTMLTableElement {
  __mdTable: TableRef;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

class TableWidget extends WidgetType {
  constructor(
    readonly md: string,
    readonly from: number,
    readonly to: number
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.md === this.md && other.from === this.from && other.to === this.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const model = parseTable(this.md);
    const table = document.createElement('table') as TableEl;
    table.className = 'hd-md-table';
    table.contentEditable = 'false';
    table.__mdTable = { from: this.from, to: this.to };
    if (!model) {
      table.textContent = this.md;
      return table;
    }

    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    model.header.forEach((cell, c) => {
      htr.appendChild(makeCell('th', cell, model.aligns[c], 'h', c));
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    model.rows.forEach((row, r) => {
      const tr = document.createElement('tr');
      row.forEach((cell, c) => {
        tr.appendChild(makeCell('td', cell, model.aligns[c], String(r), c));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Click a cell -> reveal that cell's source and place the caret in it.
    table.addEventListener('mousedown', (e) => {
      const cell = (e.target as Element | null)?.closest('th, td') as HTMLElement | null;
      if (!cell) return;
      e.preventDefault();
      const ref = table.__mdTable;
      const rKind = cell.dataset.r ?? 'h';
      const c = Number(cell.dataset.c ?? 0);
      const pos = cellSourcePos(view.state, ref.from, ref.to, rKind, c);
      view.dispatch({ selection: EditorSelection.cursor(pos) });
      view.focus();
    });

    return table;
  }

  ignoreEvent(): boolean {
    // Let our own mousedown handler run; keep CM from re-interpreting it.
    return true;
  }
}

function makeCell(
  tag: 'th' | 'td',
  raw: string,
  align: TableModel['aligns'][number],
  r: string,
  c: number
): HTMLElement {
  const el = document.createElement(tag);
  el.dataset.r = r;
  el.dataset.c = String(c);
  const css = alignToCss(align);
  if (css) el.style.textAlign = css;
  const html = renderInlineMd(raw);
  if (html) el.innerHTML = html;
  else el.innerHTML = '<span class="hd-md-cell-empty"></span>';
  return el;
}

// ---------------------------------------------------------------------------
// Decoration state field
// ---------------------------------------------------------------------------

function buildDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges = state.selection.ranges;
  const touches = (from: number, to: number) => ranges.some((r) => r.from <= to && r.to >= from);

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'Table') return;
      const from = state.doc.lineAt(node.from).from;
      const to = state.doc.lineAt(node.to).to;
      if (touches(from, to)) return false; // caret inside -> show raw source
      const md = state.doc.sliceString(from, to);
      builder.add(from, to, Decoration.replace({ widget: new TableWidget(md, from, to), block: true }));
      return false;
    }
  });

  return builder.finish();
}

const tableField = StateField.define<DecorationSet>({
  create: (state) => buildDecorations(state),
  update(deco, tr) {
    // Rebuild on edits, caret moves (to toggle source reveal), and when lazy
    // parsing advances (so tables below the first viewport start rendering).
    if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return buildDecorations(tr.state);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f)
});

export function tableExtension(): Extension {
  return tableField;
}

// ---------------------------------------------------------------------------
// Source rewriting — the bridge structural edits go through.
// ---------------------------------------------------------------------------

/**
 * Parse the table at [from,to], apply `fn` to its model, and write the
 * re-serialised source back. The selection is left where it is (outside the
 * table, since structural edits fire while it's rendered), so mapping keeps it
 * outside and the table stays rendered.
 */
export function applyTransform(
  view: EditorView,
  ref: TableRef,
  fn: (m: TableModel) => TableModel
): void {
  const md = view.state.doc.sliceString(ref.from, ref.to);
  const model = parseTable(md);
  if (!model) return;
  const next = serializeTable(fn(model));
  if (next === md) return;
  view.dispatch({ changes: { from: ref.from, to: ref.to, insert: next } });
  view.focus();
}

/** Delete the whole table block, plus one trailing blank line if present. */
export function deleteTable(view: EditorView, ref: TableRef): void {
  let to = ref.to;
  if (to < view.state.doc.length && view.state.doc.sliceString(to, to + 1) === '\n') to += 1;
  view.dispatch({ changes: { from: ref.from, to, insert: '' } });
  view.focus();
}

// ---------------------------------------------------------------------------
// Cell -> source position, so clicking a rendered cell lands the caret in it.
// ---------------------------------------------------------------------------

function cellSourcePos(
  state: EditorState,
  from: number,
  to: number,
  rKind: string,
  col: number
): number {
  const md = state.doc.sliceString(from, to);
  const lines = md.split('\n');

  // Map the display row to a source line: header is line 0, the delimiter is
  // line 1, and body rows are the non-blank lines from index 2 on.
  let lineIndex = 0;
  if (rKind === 'h') {
    lineIndex = 0;
  } else {
    const bodyIndex = Number(rKind);
    let seen = -1;
    lineIndex = 2;
    for (let i = 2; i < lines.length; i++) {
      if (lines[i].trim() === '') continue;
      seen++;
      if (seen === bodyIndex) {
        lineIndex = i;
        break;
      }
    }
  }

  const lineStart = from + lines.slice(0, lineIndex).reduce((n, l) => n + l.length + 1, 0);
  const lineText = lines[lineIndex] ?? '';
  return lineStart + columnOffset(lineText, col);
}

/** Char offset of the start of the `col`-th cell's content within a row line. */
function columnOffset(line: string, col: number): number {
  let i = 0;
  // Skip a leading pipe, if any.
  if (line[i] === '|') i++;
  let seen = 0;
  while (i < line.length && seen < col) {
    if (line[i] === '\\') {
      i += 2;
      continue;
    }
    if (line[i] === '|') seen++;
    i++;
  }
  // Land just past the leading spaces of the target cell.
  while (i < line.length && line[i] === ' ') i++;
  return Math.min(i, line.length);
}
