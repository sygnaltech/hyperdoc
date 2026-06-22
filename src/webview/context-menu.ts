/**
 * Shared right-click context menu. Used by the table UI and the
 * image/figure element UI. A `'---'` label renders a separator.
 */

export interface MenuItem {
  label: string;
  action?: () => void;
}

export function showContextMenu(x: number, y: number, items: MenuItem[]): void {
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
