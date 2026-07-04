import type { Editor } from '@tiptap/core';
import { insertPlainText } from './paste';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a date as `DD MMM YYYY`, e.g. `04 Jul 2026`. */
export function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Editor keyboard shortcuts handled at the DOM level (capture) so they work
 * regardless of ProseMirror's own keymap:
 *   - Ctrl/Cmd + ;        → insert today's date as `DD MMM YYYY`
 *   - Ctrl/Cmd + Shift + V → paste clipboard contents as plain text
 */
export function setupShortcuts(editor: Editor): void {
  editor.view.dom.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    // Ctrl+;  → insert date
    if (!e.shiftKey && !e.altKey && e.key === ';') {
      e.preventDefault();
      editor.chain().focus().insertContent(formatDate(new Date())).run();
      return;
    }

    // Ctrl+Shift+V → paste as plain text
    if (e.shiftKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      void pastePlainFromClipboard(editor);
    }
  });
}

async function pastePlainFromClipboard(editor: Editor): Promise<void> {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    // Clipboard read unavailable/denied — nothing we can do without the event.
    return;
  }
  if (text) insertPlainText(editor, text);
}
