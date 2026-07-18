// ---------------------------------------------------------------------------
// Mouse affordances for rendered tables: HD-style hover "+" buttons to insert
// columns/rows, and a right-click context menu for the full structural set.
// Both operate on the rendered <table> widgets (which carry a live __mdTable
// source range) and route every edit through applyTransform()/deleteTable().
// ---------------------------------------------------------------------------

import type { EditorView } from '@codemirror/view';
import { showContextMenu } from '../webview/context-menu';
import {
  addColumn,
  deleteColumn,
  addRow,
  deleteRow,
  setAlign,
  type Align
} from './table-model';
import { applyTransform, deleteTable, type TableRef } from './table-view';

const HOVER_TOP = 28; // px above the table to count as "near top"
const HOVER_LEFT = 28; // px left of the table to count as "near left"
const PAD_X = 16;
const PAD_Y = 4;

interface TableEl extends HTMLTableElement {
  __mdTable: TableRef;
}

export function setupTableUI(view: EditorView, container: HTMLElement): void {
  const overlay = document.createElement('div');
  overlay.className = 'hd-md-table-overlay';
  container.appendChild(overlay);

  setupContextMenu(view);
  setupHover(view, container, overlay);
}

// ---------- right-click context menu -------------------------------------

function setupContextMenu(view: EditorView): void {
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as Element | null;
    const cell = target?.closest('th, td') as HTMLElement | null;
    const table = cell?.closest('.hd-md-table') as TableEl | null;
    if (!cell || !table) return;

    e.preventDefault();
    const ref = table.__mdTable;
    const col = Number(cell.dataset.c ?? 0);
    const isHeader = cell.dataset.r === 'h';
    const bodyIndex = isHeader ? -1 : Number(cell.dataset.r);

    const align = (a: Align) => () => applyTransform(view, ref, (m) => setAlign(m, col, a));

    showContextMenu(e.clientX, e.clientY, [
      { label: 'Insert column before', action: () => applyTransform(view, ref, (m) => addColumn(m, col, 'before')) },
      { label: 'Insert column after', action: () => applyTransform(view, ref, (m) => addColumn(m, col, 'after')) },
      { label: 'Delete column', action: () => applyTransform(view, ref, (m) => deleteColumn(m, col)) },
      { label: '---' },
      {
        label: isHeader ? 'Insert row below' : 'Insert row above',
        action: () =>
          applyTransform(view, ref, (m) => (isHeader ? addRow(m, 0, 'before') : addRow(m, bodyIndex, 'before')))
      },
      ...(isHeader
        ? []
        : [
            { label: 'Insert row below', action: () => applyTransform(view, ref, (m) => addRow(m, bodyIndex, 'after')) },
            { label: 'Delete row', action: () => applyTransform(view, ref, (m) => deleteRow(m, bodyIndex)) }
          ]),
      { label: '---' },
      { label: 'Align left', action: align('left') },
      { label: 'Align center', action: align('center') },
      { label: 'Align right', action: align('right') },
      { label: 'Align clear', action: align('none') },
      { label: '---' },
      { label: 'Delete table', action: () => deleteTable(view, ref) }
    ]);
  });
}

// ---------- hover insert buttons -----------------------------------------

function setupHover(view: EditorView, container: HTMLElement, overlay: HTMLElement): void {
  const clear = () => {
    overlay.innerHTML = '';
  };

  document.addEventListener('mousemove', (e) => {
    // Stay put while the pointer is over one of our own buttons.
    const overBtn = (e.target as Element | null)?.closest('.hd-md-table-col-insert, .hd-md-table-row-insert');
    if (overBtn) return;

    const tables = Array.from(container.querySelectorAll('.hd-md-table')) as TableEl[];
    const cRect = container.getBoundingClientRect();
    let rendered = false;

    for (const table of tables) {
      const zone = hoverZone(e, table);
      if (!zone) continue;
      clear();
      if (zone === 'top') renderColumnButtons(view, table, cRect, overlay);
      else renderRowButtons(view, table, cRect, overlay);
      rendered = true;
      break;
    }
    if (!rendered) clear();
  });

  container.addEventListener('scroll', clear, true);
  window.addEventListener('resize', clear);
}

type Zone = 'top' | 'left' | null;

function hoverZone(e: MouseEvent, table: HTMLTableElement): Zone {
  const rect = table.getBoundingClientRect();
  const firstRow = table.querySelector('tr');
  if (!firstRow) return null;
  const rowRect = firstRow.getBoundingClientRect();
  const firstCell = firstRow.children[0] as HTMLElement | undefined;
  const cellRect = firstCell?.getBoundingClientRect();

  if (
    e.clientX >= rect.left - PAD_X &&
    e.clientX <= rect.right + PAD_X &&
    e.clientY >= rect.top - HOVER_TOP &&
    e.clientY <= rowRect.bottom + PAD_Y
  ) {
    return 'top';
  }
  if (
    cellRect &&
    e.clientY >= rect.top - PAD_Y &&
    e.clientY <= rect.bottom + PAD_Y &&
    e.clientX >= rect.left - HOVER_LEFT &&
    e.clientX <= cellRect.right + PAD_X
  ) {
    return 'left';
  }
  return null;
}

function renderColumnButtons(view: EditorView, table: TableEl, cRect: DOMRect, overlay: HTMLElement): void {
  const headRow = table.querySelector('thead tr');
  if (!headRow) return;
  const cells = Array.from(headRow.children) as HTMLElement[];
  if (cells.length === 0) return;

  const top = table.getBoundingClientRect().top - cRect.top - 16;
  const ref = table.__mdTable;

  const first = cells[0].getBoundingClientRect();
  overlay.appendChild(
    makeBtn('col', top, first.left - cRect.left - 9, () =>
      applyTransform(view, ref, (m) => addColumn(m, 0, 'before'))
    )
  );
  cells.forEach((cell, c) => {
    const r = cell.getBoundingClientRect();
    overlay.appendChild(
      makeBtn('col', top, r.right - cRect.left - 9, () => applyTransform(view, ref, (m) => addColumn(m, c, 'after')))
    );
  });
}

function renderRowButtons(view: EditorView, table: TableEl, cRect: DOMRect, overlay: HTMLElement): void {
  const headRow = table.querySelector('thead tr') as HTMLElement | null;
  const bodyRows = Array.from(table.querySelectorAll('tbody tr')) as HTMLElement[];
  if (!headRow) return;

  const left = table.getBoundingClientRect().left - cRect.left - 22;
  const ref = table.__mdTable;

  // Button between the header and the first body row: inserts body row 0.
  const anchor = (bodyRows[0] ?? headRow).getBoundingClientRect();
  const anchorY = bodyRows[0] ? anchor.top : anchor.bottom;
  overlay.appendChild(
    makeBtn('row', anchorY - cRect.top - 9, left, () => applyTransform(view, ref, (m) => addRow(m, 0, 'before')))
  );

  bodyRows.forEach((row, r) => {
    const rect = row.getBoundingClientRect();
    overlay.appendChild(
      makeBtn('row', rect.bottom - cRect.top - 9, left, () => applyTransform(view, ref, (m) => addRow(m, r, 'after')))
    );
  });
}

function makeBtn(kind: 'col' | 'row', top: number, left: number, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = kind === 'col' ? 'hd-md-table-col-insert' : 'hd-md-table-row-insert';
  btn.textContent = '+';
  btn.title = kind === 'col' ? 'Insert column' : 'Insert row';
  btn.style.top = `${top}px`;
  btn.style.left = `${left}px`;
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return btn;
}
