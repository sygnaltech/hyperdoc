import { EditorState, EditorSelection, RangeSetBuilder } from '@codemirror/state';
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  Decoration,
  WidgetType,
  ViewPlugin
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, HighlightStyle, syntaxTree } from '@codemirror/language';
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

// ---------------------------------------------------------------------------
// Inline image preview.
//
// A view-layer decoration only: the source `![](url)` is never changed. When the
// caret isn't on an image, its Markdown is replaced by a rendered <img>; moving
// the caret onto it reveals the source again for editing. Relative URLs resolve
// against the document's folder (imageBaseUri, supplied by the host).
// ---------------------------------------------------------------------------

let imageBaseUri = '';

function resolveImageSrc(url: string): string {
  if (/^[a-z]+:\/\//i.test(url) || url.startsWith('data:')) return url;
  // Encode any raw spaces (e.g. from an angle-bracket `<path with space>` link)
  // so the browser can load the file; already-encoded `%20` is unaffected.
  const encoded = url.replace(/ /g, '%20');
  if (!imageBaseUri) return encoded;
  return imageBaseUri.replace(/\/$/, '') + '/' + encoded.replace(/^\.?\//, '');
}

class ImageWidget extends WidgetType {
  constructor(readonly url: string, readonly alt: string) {
    super();
  }
  eq(other: ImageWidget): boolean {
    return other.url === this.url && other.alt === this.alt;
  }
  toDOM(): HTMLElement {
    const img = document.createElement('img');
    img.className = 'hd-md-img';
    img.src = resolveImageSrc(this.url);
    img.alt = this.alt;
    return img;
  }
  ignoreEvent(): boolean {
    return false; // let clicks through so the caret can land here and reveal source
  }
}

// alt = group 1; url = angle-bracketed group 2 (may contain spaces) or bare group 3.
const IMAGE_RE = /^!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)$/;
// A badge: a link whose entire content is an image — [![alt](img)](target).
const LINKED_IMAGE_RE = /^\[!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)\]\([^)]*\)$/;

function buildImageDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges = view.state.selection.ranges;
  const touches = (from: number, to: number) => ranges.some((r) => r.from <= to && r.to >= from);
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        // Badge: render the linked image as one unit and don't descend into the
        // inner image node.
        if (node.name === 'Link') {
          const text = view.state.doc.sliceString(node.from, node.to);
          const m = LINKED_IMAGE_RE.exec(text);
          if (!m) return; // ordinary link — descend as usual
          if (touches(node.from, node.to)) return false; // caret on it → show source
          const url = m[2] ?? m[3];
          if (!url) return false;
          builder.add(node.from, node.to, Decoration.replace({ widget: new ImageWidget(url, m[1]) }));
          return false;
        }
        if (node.name === 'Image') {
          if (touches(node.from, node.to)) return; // reveal source
          const text = view.state.doc.sliceString(node.from, node.to);
          const m = IMAGE_RE.exec(text);
          if (!m) return;
          const url = m[2] ?? m[3];
          if (!url) return;
          builder.add(node.from, node.to, Decoration.replace({ widget: new ImageWidget(url, m[1]) }));
        }
        return undefined;
      }
    });
  }
  return builder.finish();
}

const imagePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildImageDecorations(view);
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildImageDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// ---------------------------------------------------------------------------
// Image paste — save via the host, then insert a relative Markdown reference.
// ---------------------------------------------------------------------------

let imageRequestSeq = 0;
const pendingImageInserts = new Map<number, number>(); // requestId -> insert pos

const pasteImages = EditorView.domEventHandlers({
  paste(event) {
    const items = event.clipboardData?.items;
    if (!items) return false;
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          void savePastedImage(file);
          return true;
        }
      }
    }
    return false;
  }
});

async function savePastedImage(file: File): Promise<void> {
  if (!view) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = file.type.split('/')[1] || 'png';
  const requestId = ++imageRequestSeq;
  pendingImageInserts.set(requestId, view.state.selection.main.head);
  post({ type: 'saveImage', requestId, bytes: Array.from(bytes), ext });
}

function onImageSaved(msg: { requestId: number; src?: string; error?: string }): void {
  const pos = pendingImageInserts.get(msg.requestId);
  pendingImageInserts.delete(msg.requestId);
  if (!view || msg.error || !msg.src) {
    if (msg.error) console.error('hd-md: image save failed', msg.error);
    return;
  }
  const at = Math.min(pos ?? view.state.selection.main.head, view.state.doc.length);
  // Put the image on its own line and drop the caret on the line below, so the
  // widget renders immediately (the caret isn't touching it). Clicking the image
  // still reveals the source to edit.
  const atLineStart = at === view.state.doc.lineAt(at).from;
  const insert = `${atLineStart ? '' : '\n'}![](${msg.src})\n`;
  view.dispatch({
    changes: { from: at, insert },
    selection: EditorSelection.cursor(at + insert.length)
  });
  view.focus();
}

function createView(initialText: string): void {
  const state = EditorState.create({
    doc: initialText,
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      drawSelection(),
      highlightActiveLine(),
      // GFM base: tables, task lists, strikethrough, autolinks — what most
      // people mean by "Markdown" and what GitHub renders.
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(mdHighlight),
      imagePreview,
      pasteImages,
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
  if (msg?.type === 'init') {
    imageBaseUri = (msg.baseUri ?? '') as string;
    setText((msg.text ?? '') as string, false);
  } else if (msg?.type === 'external') {
    imageBaseUri = (msg.baseUri ?? imageBaseUri) as string;
    setText((msg.text ?? '') as string, true);
  } else if (msg?.type === 'imageSaved') {
    onImageSaved(msg);
  }
});

setupToolbar();
post({ type: 'ready' });
