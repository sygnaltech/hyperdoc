import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

const editorEl = document.getElementById('editor')!;
const toolbarEl = document.getElementById('toolbar')!;

let view: EditorView | null = null;
// True while we apply content pushed from the host, so those edits aren't
// echoed straight back as a change.
let applyingHostText = false;

function post(msg: unknown): void {
  vscode.postMessage(msg);
}

// Live-preview-lite: render the *look* of Markdown (heading sizes, real bold /
// italic, code, links) by styling the syntax tokens. Marker-hiding and inline
// widgets (images, task checkboxes) are the next layer.
const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.8em', fontWeight: '700', lineHeight: '1.4' },
  { tag: t.heading2, fontSize: '1.5em', fontWeight: '700', lineHeight: '1.4' },
  { tag: t.heading3, fontSize: '1.25em', fontWeight: '700' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--vscode-textLink-foreground)' },
  { tag: t.url, color: 'var(--vscode-textLink-foreground)', opacity: '0.75' },
  {
    tag: t.monospace,
    fontFamily: 'var(--vscode-editor-font-family, monospace)',
    backgroundColor: 'var(--vscode-textCodeBlock-background, rgba(127,127,127,0.15))'
  },
  { tag: t.quote, color: 'var(--vscode-textBlockQuote-foreground, inherit)', fontStyle: 'italic' },
  // NB: do NOT style t.list — the markdown grammar tags the whole list node with
  // it, so any colour here bleeds into every list item's text. List markers are
  // covered by the mark tags below.
  { tag: t.contentSeparator, color: 'var(--vscode-descriptionForeground)', fontWeight: '700' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--vscode-descriptionForeground)' }
]);

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--vscode-foreground)' },
  '.cm-scroller': { fontFamily: 'var(--vscode-editor-font-family, monospace)', lineHeight: '1.6' },
  '.cm-content': { padding: '14px 18px', caretColor: 'var(--vscode-editorCursor-foreground)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--vscode-editorCursor-foreground)' },
  '.cm-activeLine': { backgroundColor: 'var(--vscode-editor-lineHighlightBackground, transparent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--vscode-editor-selectionBackground)'
  },
  '.cm-gutters': { display: 'none' }
});

function createView(initialText: string): void {
  const state = EditorState.create({
    doc: initialText,
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      drawSelection(),
      highlightActiveLine(),
      markdown(),
      syntaxHighlighting(mdHighlight),
      theme,
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !applyingHostText) {
          post({ type: 'change', text: u.state.doc.toString() });
        }
      })
    ]
  });
  view = new EditorView({ state, parent: editorEl });
}

// Replace the whole document with host content. For an external resync the
// caret is preserved (clamped); for the initial load it isn't needed.
function setText(text: string, preserveSelection: boolean): void {
  if (!view) {
    createView(text);
    return;
  }
  if (view.state.doc.toString() === text) return; // our own echo, or unchanged

  const selection = preserveSelection ? clampSelection(view.state.selection, text.length) : undefined;
  applyingHostText = true;
  try {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection
    });
  } finally {
    applyingHostText = false;
  }
}

function clampSelection(sel: EditorSelection, max: number): EditorSelection {
  const ranges = sel.ranges.map((r) =>
    EditorSelection.range(Math.min(r.anchor, max), Math.min(r.head, max))
  );
  return EditorSelection.create(ranges, sel.mainIndex);
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function wrapSelection(before: string, after: string): void {
  if (!view) return;
  view.dispatch(
    view.state.changeByRange((range) => {
      const inner = view!.state.sliceDoc(range.from, range.to);
      return {
        changes: { from: range.from, to: range.to, insert: before + inner + after },
        range: EditorSelection.range(range.from + before.length, range.from + before.length + inner.length)
      };
    })
  );
  view.focus();
}

function prefixLine(prefix: string): void {
  if (!view) return;
  view.dispatch(
    view.state.changeByRange((range) => {
      const line = view!.state.doc.lineAt(range.head);
      return {
        changes: { from: line.from, insert: prefix },
        range: EditorSelection.cursor(range.head + prefix.length)
      };
    })
  );
  view.focus();
}

function button(label: string, title: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title;
  if (extraClass) b.className = extraClass;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

function setupToolbar(): void {
  toolbarEl.append(
    button('B', 'Bold', () => wrapSelection('**', '**'), 'hd-md-bold'),
    button('I', 'Italic', () => wrapSelection('*', '*'), 'hd-md-italic'),
    button('</>', 'Inline code', () => wrapSelection('`', '`')),
    button('H', 'Heading', () => prefixLine('# ')),
    button('•', 'Bullet list item', () => prefixLine('- ')),
    button('“”', 'Quote', () => prefixLine('> ')),
    button('🔗', 'Link', () => wrapSelection('[', '](url)'))
  );

  const spacer = document.createElement('span');
  spacer.className = 'hd-md-spacer';
  toolbarEl.append(spacer);

  // The one required control: leave the WYSIWYG editor and open the file in VS
  // Code's built-in text editor, closing this tab.
  toolbarEl.append(
    button('Edit raw', 'Open in VS Code’s built-in text editor', () => post({ type: 'openRaw' }), 'hd-md-raw')
  );
}

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg?.type === 'init') setText((msg.text ?? '') as string, false);
  else if (msg?.type === 'external') setText((msg.text ?? '') as string, true);
});

setupToolbar();
post({ type: 'ready' });
