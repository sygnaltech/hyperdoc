import type { Editor } from '@tiptap/core';
import { showContextMenu } from './context-menu';

const HOVER_THRESHOLD_TOP = 28;   // px above the table top to count as "near top"
const HOVER_THRESHOLD_LEFT = 28;  // px left of the table to count as "near left"
const HOVER_THRESHOLD_X_PAD = 16; // px horizontal slack for top-zone
const HOVER_THRESHOLD_Y_PAD = 4;  // px vertical slack for left-zone

export function setupTableUI(editor: Editor, container: HTMLElement): void {
  const overlay = document.createElement('div');
  overlay.className = 'hd-table-overlay';
  container.appendChild(overlay);

  setupContextMenu(editor);
  setupHoverButtons(editor, container, overlay);
}

// ---------- right-click context menu -------------------------------------

function setupContextMenu(editor: Editor): void {
  editor.view.dom.addEventListener('contextmenu', (e) => {
    const target = e.target as Element | null;
    const cell = target?.closest('th, td') as HTMLElement | null;
    if (!cell || !editor.view.dom.contains(cell)) return;

    e.preventDefault();
    placeCursorInCell(cell, editor);

    showContextMenu(e.clientX, e.clientY, [
      { label: 'Insert column before', action: () => editor.chain().focus().addColumnBefore().run() },
      { label: 'Insert column after',  action: () => editor.chain().focus().addColumnAfter().run() },
      { label: 'Delete column',         action: () => editor.chain().focus().deleteColumn().run() },
      { label: '---' },
      { label: 'Insert row above',  action: () => editor.chain().focus().addRowBefore().run() },
      { label: 'Insert row below',  action: () => editor.chain().focus().addRowAfter().run() },
      { label: 'Delete row',         action: () => editor.chain().focus().deleteRow().run() },
      { label: '---' },
      { label: 'Toggle header row',    action: () => editor.chain().focus().toggleHeaderRow().run() },
      { label: 'Toggle header column', action: () => editor.chain().focus().toggleHeaderColumn().run() },
      { label: '---' },
      { label: 'Delete table', action: () => editor.chain().focus().deleteTable().run() }
    ]);
  });
}

// ---------- hover insert buttons (column + row) --------------------------

interface BtnRef extends HTMLButtonElement {
  __hdTable: HTMLTableElement;
  __hdSide: 'col' | 'row';
}

function setupHoverButtons(editor: Editor, container: HTMLElement, overlay: HTMLElement): void {
  let topHovered: HTMLTableElement | null = null;
  let leftHovered: HTMLTableElement | null = null;

  let raf: number | null = null;
  const schedule = () => {
    if (raf !== null) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      renderAll(editor, container, overlay);
      applyVisibility();
    });
  };

  function applyVisibility() {
    overlay.querySelectorAll<BtnRef>('.hd-table-col-insert').forEach((btn) => {
      btn.classList.toggle('visible', btn.__hdTable === topHovered);
    });
    overlay.querySelectorAll<BtnRef>('.hd-table-row-insert').forEach((btn) => {
      btn.classList.toggle('visible', btn.__hdTable === leftHovered);
    });
  }

  function onMouseMove(e: MouseEvent) {
    const result = detectHover(e, editor.view.dom);
    if (result.top !== topHovered || result.left !== leftHovered) {
      topHovered = result.top;
      leftHovered = result.left;
      applyVisibility();
    }
  }

  editor.on('update', schedule);
  editor.on('selectionUpdate', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  document.addEventListener('mousemove', onMouseMove);

  requestAnimationFrame(schedule);
}

function detectHover(
  e: MouseEvent,
  editorDom: HTMLElement
): { top: HTMLTableElement | null; left: HTMLTableElement | null } {
  const tables = Array.from(editorDom.querySelectorAll('table')) as HTMLTableElement[];
  let top: HTMLTableElement | null = null;
  let left: HTMLTableElement | null = null;

  for (const table of tables) {
    const tableRect = table.getBoundingClientRect();
    const firstRow = table.querySelector('tr') as HTMLTableRowElement | null;
    if (!firstRow) continue;
    const firstRowRect = firstRow.getBoundingClientRect();
    const firstCell = firstRow.children[0] as HTMLElement | undefined;
    const firstCellRect = firstCell?.getBoundingClientRect();

    // Top hover zone: above the table down to the bottom of the first row,
    // within the table's horizontal extent (+ a small horizontal pad).
    if (
      e.clientX >= tableRect.left - HOVER_THRESHOLD_X_PAD &&
      e.clientX <= tableRect.right + HOVER_THRESHOLD_X_PAD &&
      e.clientY >= tableRect.top - HOVER_THRESHOLD_TOP &&
      e.clientY <= firstRowRect.bottom + HOVER_THRESHOLD_Y_PAD
    ) {
      top = table;
    }

    // Left hover zone: left of the table through the right edge of the
    // first column, within the table's vertical extent (+ small pad).
    if (
      firstCellRect &&
      e.clientY >= tableRect.top - HOVER_THRESHOLD_Y_PAD &&
      e.clientY <= tableRect.bottom + HOVER_THRESHOLD_Y_PAD &&
      e.clientX >= tableRect.left - HOVER_THRESHOLD_LEFT &&
      e.clientX <= firstCellRect.right + HOVER_THRESHOLD_X_PAD
    ) {
      left = table;
    }
  }

  // Keep buttons visible while pointer is over one of them.
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (el?.classList.contains('hd-table-col-insert')) {
    top = (el as BtnRef).__hdTable;
  }
  if (el?.classList.contains('hd-table-row-insert')) {
    left = (el as BtnRef).__hdTable;
  }

  return { top, left };
}

function renderAll(editor: Editor, container: HTMLElement, overlay: HTMLElement) {
  overlay.innerHTML = '';
  const tables = Array.from(editor.view.dom.querySelectorAll('table')) as HTMLTableElement[];
  const containerRect = container.getBoundingClientRect();

  for (const table of tables) {
    renderColumnButtons(table, editor, containerRect, overlay);
    renderRowButtons(table, editor, containerRect, overlay);
  }
}

function renderColumnButtons(
  table: HTMLTableElement,
  editor: Editor,
  containerRect: DOMRect,
  overlay: HTMLElement
) {
  const firstRow = table.querySelector('tr') as HTMLTableRowElement | null;
  if (!firstRow) return;
  const cells = Array.from(firstRow.children) as HTMLElement[];
  if (cells.length === 0) return;

  const tableRect = table.getBoundingClientRect();
  const top = tableRect.top - containerRect.top - 16;

  const firstRect = cells[0].getBoundingClientRect();
  overlay.appendChild(
    makeBtn('hd-table-col-insert', table, top, firstRect.left - containerRect.left - 9, () => {
      placeCursorInCell(cells[0], editor);
      editor.chain().focus().addColumnBefore().run();
    })
  );

  for (const cell of cells) {
    const r = cell.getBoundingClientRect();
    overlay.appendChild(
      makeBtn('hd-table-col-insert', table, top, r.right - containerRect.left - 9, () => {
        placeCursorInCell(cell, editor);
        editor.chain().focus().addColumnAfter().run();
      })
    );
  }
}

function renderRowButtons(
  table: HTMLTableElement,
  editor: Editor,
  containerRect: DOMRect,
  overlay: HTMLElement
) {
  const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
  if (rows.length === 0) return;

  const tableRect = table.getBoundingClientRect();
  const left = tableRect.left - containerRect.left - 22;

  const firstRowRect = rows[0].getBoundingClientRect();
  const firstCell = rows[0].children[0] as HTMLElement;
  overlay.appendChild(
    makeBtn('hd-table-row-insert', table, firstRowRect.top - containerRect.top - 9, left, () => {
      placeCursorInCell(firstCell, editor);
      editor.chain().focus().addRowBefore().run();
    })
  );

  for (const row of rows) {
    const r = row.getBoundingClientRect();
    const cell = row.children[0] as HTMLElement;
    overlay.appendChild(
      makeBtn('hd-table-row-insert', table, r.bottom - containerRect.top - 9, left, () => {
        placeCursorInCell(cell, editor);
        editor.chain().focus().addRowAfter().run();
      })
    );
  }
}

function makeBtn(
  className: string,
  table: HTMLTableElement,
  top: number,
  left: number,
  onClick: () => void
): BtnRef {
  const btn = document.createElement('button') as BtnRef;
  btn.type = 'button';
  btn.className = className;
  btn.textContent = '+';
  btn.title = className.includes('col') ? 'Insert column' : 'Insert row';
  btn.style.top = `${top}px`;
  btn.style.left = `${left}px`;
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', onClick);
  btn.__hdTable = table;
  btn.__hdSide = className.includes('col') ? 'col' : 'row';
  return btn;
}

// ---------- shared helpers -----------------------------------------------

function placeCursorInCell(cell: HTMLElement, editor: Editor): void {
  try {
    const pos = editor.view.posAtDOM(cell, 0);
    if (typeof pos === 'number' && pos >= 0) {
      editor.commands.setTextSelection(pos + 1);
    }
  } catch {
    // ignore
  }
}
