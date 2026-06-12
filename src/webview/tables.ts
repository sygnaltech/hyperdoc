import type { Editor } from '@tiptap/core';

export function setupTableUI(editor: Editor, container: HTMLElement): void {
  setupContextMenu(editor);
  setupColumnInsertButtons(editor, container);
}

// ---------- right-click context menu -------------------------------------

interface MenuItem {
  label: string;
  action?: () => void;
}

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

function showContextMenu(x: number, y: number, items: MenuItem[]): void {
  document.querySelectorAll('.hd-context-menu').forEach((m) => m.remove());

  const menu = document.createElement('div');
  menu.className = 'hd-context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  for (const item of items) {
    if (item.label === '---') {
      const sep = document.createElement('div');
      sep.className = 'hd-context-separator';
      menu.appendChild(sep);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        item.action?.();
        menu.remove();
      });
      menu.appendChild(btn);
    }
  }

  document.body.appendChild(menu);

  // Clamp into viewport.
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 4}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 4}px`;

  const dismiss = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      menu.remove();
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('contextmenu', dismiss);
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('contextmenu', dismiss);
  }, 0);
}

// ---------- hover column-insert buttons ----------------------------------

function setupColumnInsertButtons(editor: Editor, container: HTMLElement): void {
  const overlay = document.createElement('div');
  overlay.className = 'hd-table-overlay';
  container.appendChild(overlay);

  let raf: number | null = null;
  const schedule = () => {
    if (raf !== null) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      render();
    });
  };

  function render(): void {
    overlay.innerHTML = '';
    const tables = editor.view.dom.querySelectorAll('table');
    const containerRect = container.getBoundingClientRect();

    tables.forEach((tbl) => {
      const table = tbl as HTMLTableElement;
      const firstRow = table.querySelector('tr');
      if (!firstRow) return;
      const cells = Array.from(firstRow.children) as HTMLElement[];
      if (cells.length === 0) return;

      const tableRect = table.getBoundingClientRect();
      const top = tableRect.top - containerRect.top - 14;

      // Far-left button → insert column before first column.
      const firstRect = cells[0].getBoundingClientRect();
      overlay.appendChild(makeButton(
        top,
        firstRect.left - containerRect.left,
        () => {
          placeCursorInCell(cells[0], editor);
          editor.chain().focus().addColumnBefore().run();
        }
      ));

      // After each column → insert column after.
      cells.forEach((cell) => {
        const r = cell.getBoundingClientRect();
        overlay.appendChild(makeButton(
          top,
          r.right - containerRect.left,
          () => {
            placeCursorInCell(cell, editor);
            editor.chain().focus().addColumnAfter().run();
          }
        ));
      });
    });
  }

  editor.on('update', schedule);
  editor.on('selectionUpdate', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);

  // Re-render after layout settles.
  requestAnimationFrame(schedule);
}

function makeButton(top: number, leftCenter: number, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'hd-table-col-insert';
  btn.textContent = '+';
  btn.title = 'Insert column';
  btn.style.top = `${top}px`;
  btn.style.left = `${leftCenter - 9}px`; // center on the boundary
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', onClick);
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
