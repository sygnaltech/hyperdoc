import type { Editor } from '@tiptap/core';
import { sanitizeHtml } from './sanitize';
import { markdownToHtml } from '../conversion/mdToHd';

export type ImageHandler = (file: File) => void | Promise<void>;

/**
 * Build a ProseMirror `handlePaste` callback that:
 *   1. Routes image files to the host save flow.
 *   2. Inside a code block or blockquote, always pastes as plain text (so pasted
 *      HTML source lands verbatim/raw in the block).
 *   3. Plain text that is itself HTML markup → render it as HTML, sanitized to
 *      the allowed elements (preferred over clipboard HTML, which for such
 *      copies is only syntax highlighting of the same source).
 *   4. Otherwise, clipboard HTML, sanitized against the HD allow-list.
 *   5. Detects markdown-flavored plain text and converts via marked.
 *   6. Otherwise falls through to ProseMirror's default plain-text handling.
 *
 * Any pasted content that yields a code block or blockquote is normalized so the
 * block has no leading/trailing blank lines.
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

    // 2. Inside a code block or blockquote → always plain text, never rich/markdown.
    //    Pasted HTML source therefore lands raw in the block.
    if ((editor.isActive('codeBlock') || editor.isActive('blockquote')) && text) {
      event.preventDefault();
      insertPlainText(editor, text);
      return true;
    }

    // 3. Plain text that is literally HTML markup (copied source, AI output, or a
    //    code editor that only exposes highlighted HTML). Render it as HTML,
    //    sanitized to the allowed elements, preserving structure as closely as
    //    possible. Preferred over clipboard text/html, which for such copies is
    //    just syntax highlighting whose text content is the escaped source.
    if (text && looksLikeHtml(text)) {
      const clean = normalizePastedBlocks(sanitizeHtml(stripClipboardWrappers(text)));
      if (clean.trim()) {
        event.preventDefault();
        editor.chain().focus().insertContent(clean).run();
        return true;
      }
    }

    // 4. HTML clipboard (Notion, Linear, Google Docs, browser, etc.)
    if (html && htmlHasContent(html)) {
      const clean = normalizePastedBlocks(sanitizeHtml(stripClipboardWrappers(html)));
      if (clean.trim()) {
        event.preventDefault();
        editor.chain().focus().insertContent(clean).run();
        return true;
      }
    }

    // 5. Markdown-flavored plain text
    if (text && looksLikeMarkdown(text)) {
      const converted = markdownToHtml(text);
      const clean = normalizePastedBlocks(sanitizeHtml(converted));
      if (clean.trim()) {
        event.preventDefault();
        editor.chain().focus().insertContent(clean).run();
        return true;
      }
    }

    // 6. Plain text — let ProseMirror handle as paragraphs.
    return false;
  };
}

/**
 * Whether a plain-text string is actually HTML markup the user wants rendered.
 * Deliberately strict — a matched tag pair, a self-closing tag, or a known void
 * element — so ordinary prose containing a stray `<` or an `<email@x>`-style
 * angle bracket is not mistaken for HTML.
 */
export function looksLikeHtml(text: string): boolean {
  const t = text.trim();
  // Must begin with a tag (or comment/doctype) — genuine HTML source starts with
  // markup, whereas prose that merely contains a tag does not. This keeps
  // markdown with an inline `<br>` from being treated as HTML.
  if (!/^<(?:!|[a-z])/i.test(t)) return false;
  return (
    /<([a-z][\w-]*)\b[^>]*>[\s\S]*<\/\1\s*>/i.test(t) || // <tag>…</tag>
    /<[a-z][\w-]*\b[^>]*\/>/i.test(t) ||                  // <tag .../>
    /<(?:br|hr|img|source|col|input)\b[^>]*>/i.test(t)    // void element
  );
}

/**
 * Insert raw text as plain content, with leading/trailing blank lines trimmed.
 * In a code block the text (including newlines) is inserted verbatim; elsewhere
 * it becomes paragraphs (blank-line separated), with single newlines as breaks.
 */
export function insertPlainText(editor: Editor, raw: string): void {
  const text = trimBlankEdges(raw);
  if (!text) return;

  if (editor.isActive('codeBlock')) {
    const { state, view } = editor;
    view.focus();
    view.dispatch(state.tr.insertText(text));
    return;
  }

  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
  editor.chain().focus().insertContent(paragraphs).run();
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

/** Remove blank (whitespace-only) lines from the start and end of a string. */
export function trimBlankEdges(text: string): string {
  return text.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, '');
}

/**
 * Ensure any code block (`<pre>`) or `<blockquote>` in the pasted HTML has no
 * leading/trailing blank lines or empty edge paragraphs.
 */
export function normalizePastedBlocks(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="hd-paste-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('hd-paste-root');
  if (!root) return html;

  root.querySelectorAll('pre').forEach((pre) => {
    const codeEl = pre.querySelector('code') ?? pre;
    codeEl.textContent = trimBlankEdges(codeEl.textContent ?? '');
  });

  root.querySelectorAll('blockquote').forEach((bq) => {
    trimEmptyEdgeChildren(bq);
  });

  return root.innerHTML;
}

function trimEmptyEdgeChildren(container: Element): void {
  while (container.firstElementChild && isBlankBlock(container.firstElementChild)) {
    container.firstElementChild.remove();
  }
  while (container.lastElementChild && isBlankBlock(container.lastElementChild)) {
    container.lastElementChild.remove();
  }
}

function isBlankBlock(el: Element): boolean {
  const text = (el.textContent ?? '').replace(/ /g, ' ').trim();
  return text === '' && el.querySelector('img, svg') == null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
