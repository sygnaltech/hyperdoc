import type { Editor } from '@tiptap/core';
import { sanitizeHtml } from './sanitize';
import { markdownToHtml } from '../conversion/mdToHd';

export type ImageHandler = (file: File) => void | Promise<void>;

/**
 * Build a ProseMirror `handlePaste` callback that:
 *   1. Routes image files to the host save flow.
 *   2. Prefers clipboard HTML, sanitized against the HD allow-list.
 *   3. Detects markdown-flavored plain text and converts via marked.
 *   4. Otherwise falls through to ProseMirror's default plain-text handling.
 */
export function makePasteHandler(
  getEditor: () => Editor | null,
  onImageFile: ImageHandler
) {
  return (_view: unknown, event: ClipboardEvent): boolean => {
    const clipboard = event.clipboardData;
    if (!clipboard) return false;

    // 1. Image file paste
    for (const item of Array.from(clipboard.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          void onImageFile(file);
          return true;
        }
      }
    }

    const editor = getEditor();
    if (!editor) return false;

    const html = clipboard.getData('text/html');
    const text = clipboard.getData('text/plain');

    // 2. HTML clipboard (Notion, Linear, Google Docs, browser, etc.)
    if (html && htmlHasContent(html)) {
      const clean = sanitizeHtml(stripClipboardWrappers(html));
      if (clean.trim()) {
        event.preventDefault();
        editor.chain().focus().insertContent(clean).run();
        return true;
      }
    }

    // 3. Markdown-flavored plain text
    if (text && looksLikeMarkdown(text)) {
      const converted = markdownToHtml(text);
      const clean = sanitizeHtml(converted);
      if (clean.trim()) {
        event.preventDefault();
        editor.chain().focus().insertContent(clean).run();
        return true;
      }
    }

    // 4. Plain text — let ProseMirror handle as paragraphs.
    return false;
  };
}

/**
 * Conservative markdown heuristic: needs two+ distinct markdown markers
 * before we treat a paste as markdown. Prevents false positives on prose.
 */
export function looksLikeMarkdown(text: string): boolean {
  let score = 0;
  if (/^#{1,6}\s/m.test(text)) score += 2;
  if (/^[-*+]\s/m.test(text)) score += 1;
  if (/^\d+\.\s/m.test(text)) score += 1;
  if (/^>\s/m.test(text)) score += 1;
  if (/```/.test(text)) score += 2;
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) score += 1;
  if (/!\[[^\]]*\]\([^)]+\)/.test(text)) score += 1;
  if (/\*\*[^*]+\*\*/.test(text)) score += 1;
  if (/^\|.+\|/m.test(text)) score += 2;
  if (/^---\s*$/m.test(text)) score += 1;
  return score >= 2;
}

function htmlHasContent(html: string): boolean {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<meta[\s\S]*?>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  return /<[a-zA-Z]/.test(stripped);
}

/**
 * Some sources (Word, Office, browsers) wrap clipboard HTML in
 * `<!--StartFragment-->…<!--EndFragment-->`. Strip that down.
 */
function stripClipboardWrappers(html: string): string {
  const startMatch = html.match(/<!--\s*StartFragment\s*-->([\s\S]*?)<!--\s*EndFragment\s*-->/i);
  if (startMatch) return startMatch[1];
  return html;
}
