import { Editor } from '@tiptap/core';
import { Fragment, Node as PMNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Bridge, getVsCodeApi } from './bridge';
import { setupToolbar } from './toolbar';
import { makePasteHandler } from './paste';
import { setupTableUI } from './tables';
import { setupCodeCopy } from './code-copy';
import { setupElementUI } from './element-ui';
import { setupShortcuts } from './shortcuts';
import { showLinkDialog } from './link-dialog';
import { HdImage } from './extensions/image';
import { Figure } from './extensions/figure';
import { Highlight } from './extensions/highlight';
import { HdTaskList, HdTaskItem } from './extensions/task';
import { RadioGroup, RadioItem } from './extensions/radio';
import { ControlGrouping } from './extensions/control-grouping';

const vscode = getVsCodeApi();
const bridge = new Bridge(vscode);

const editorEl = document.getElementById('editor')!;
const toolbarEl = document.getElementById('toolbar')!;

let editor: Editor | null = null;
let docMeta: Record<string, unknown> = {};
let assetBaseUrl = '';
let docBaseUrl = '';
let docFlavor: 'hd' | 'hd2' = 'hd';
let suppressChange = false;

async function handleImageFile(file: File): Promise<void> {
  if (!editor) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = file.type.split('/')[1] || 'png';
  try {
    const { filename, webviewUri } = await bridge.saveImage(bytes, ext);
    editor.chain().focus().setImage({ src: webviewUri, alt: filename }).run();
  } catch (err) {
    console.error('hd: image save failed', err);
  }
}

function createEditor(initialBody: string) {
  const isBlank = isBlankBody(initialBody);
  // Set up first so its ProseMirror DOM-event handlers can be wired below.
  const codeCopy = setupCodeCopy(editorEl);
  editor = new Editor({
    element: editorEl,
    autofocus: isBlank ? 'end' : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] }
      }),
      Underline,
      Subscript,
      Superscript,
      Highlight,
      Link.extend({
        addKeyboardShortcuts() {
          return {
            'Mod-k': () => {
              const ed = this.editor;
              const existing = ed.getAttributes('link') as { href?: string } | undefined;
              void showLinkDialog(bridge, { initialHref: existing?.href }).then((result) => {
                if (!result) return;
                ed.chain().focus().extendMarkRange('link').setLink({ href: result.href }).run();
              });
              return true;
            }
          };
        }
      }).configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } }),
      HdImage.configure({ allowBase64: false }),
      Figure,
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
      // Interactive checkboxes/radios are an HD2-only capability for now.
      ...(docFlavor === 'hd2'
        ? [HdTaskList, HdTaskItem.configure({ nested: false }), RadioGroup, RadioItem, ControlGrouping]
        : [])
    ],
    content: rewriteImgSrcs(initialBody, 'in'),
    onUpdate: ({ editor: ed }) => {
      if (suppressChange) return;
      const html = rewriteImgSrcs(ed.getHTML(), 'out');
      bridge.sendChange(docMeta, html);
    },
    editorProps: {
      handlePaste: makePasteHandler(() => editor, handleImageFile),
      handleDOMEvents: {
        // Ctrl/Cmd-click a code line to copy just that line. Handling it here
        // (returning true) suppresses ProseMirror's own caret/selection logic.
        mousedown: (_view, event) => codeCopy.handleMouseDown(event as MouseEvent),
        click: (_view, event) => codeCopy.handleClick(event as MouseEvent)
      }
    }
  });

  setupToolbar(toolbarEl, editor, { bridge });
  setupTableUI(editor, editorEl);
  setupElementUI(editor);
  setupShortcuts(editor);
  setupClickBelowToFocus(editor, editorEl, toolbarEl);
  trackToolbarHeight(toolbarEl);
}

function trackToolbarHeight(toolbar: HTMLElement): void {
  const apply = () => {
    const h = toolbar.offsetHeight;
    if (h > 0) document.body.style.setProperty('--hd-toolbar-height', `${h}px`);
  };
  apply();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(apply);
    ro.observe(toolbar);
  }
  window.addEventListener('resize', apply);
}

function isBlankBody(body: string): boolean {
  const stripped = body
    .replace(/<p[^>]*>\s*<\/p>/gi, '')
    .replace(/\s+/g, '')
    .trim();
  return stripped === '';
}

function setupClickBelowToFocus(ed: Editor, editorRoot: HTMLElement, toolbar: HTMLElement): void {
  const editable = ed.view.dom;

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const target = e.target as Element | null;
    if (!target) return;

    if (toolbar.contains(target)) return;
    // Skip interactive widgets (dialogs, popovers, buttons) — but not the editor.
    if (target.closest(
      'button, input, textarea, select, ' +
      '.hd-context-menu, .hd-link-backdrop, .hd-link-dialog, .hd-code-copy, .hd-config-popover'
    )) return;

    let contentBottom: number | null = null;
    try {
      contentBottom = ed.view.coordsAtPos(ed.state.doc.content.size).bottom;
    } catch {
      contentBottom = null;
    }

    // Click below the last line: drop the cursor there, adding blank lines up to
    // the clicked position.
    if (contentBottom != null && e.clientY > contentBottom + 2) {
      e.preventDefault();
      fillToClick(ed, e.clientY, contentBottom);
      return;
    }

    // Otherwise only handle clicks outside the editor surface (e.g. side gutters);
    // clicks on real content are left to the editor.
    if (editable.contains(target)) return;
    e.preventDefault();
    ed.commands.focus('end');
  });
}

// Insert enough empty paragraphs after the content that the cursor lands at (or
// just above) the clicked Y, then focus the last line. Blank lines added this
// way are preserved on save as `<p></p>`.
function fillToClick(ed: Editor, clickY: number, contentBottom: number): void {
  const { state, view } = ed;
  const paragraph = state.schema.nodes.paragraph;
  if (!paragraph) {
    ed.commands.focus('end');
    return;
  }

  const perLine = emptyLineHeight(view.dom);
  const gap = clickY - contentBottom;
  let toAdd = gap > 0 ? Math.floor(gap / perLine) : 0;

  const lastNode = state.doc.lastChild;
  const lastIsEmptyParagraph =
    lastNode != null && lastNode.type.name === 'paragraph' && lastNode.content.size === 0;
  if (toAdd === 0 && !lastIsEmptyParagraph) toAdd = 1;

  if (toAdd > 0) {
    const nodes: PMNode[] = [];
    for (let i = 0; i < toAdd; i++) nodes.push(paragraph.create());
    const tr = state.tr.insert(state.doc.content.size, Fragment.fromArray(nodes));
    view.dispatch(tr);
  }
  ed.commands.focus('end');
}

// Approximate rendered height of one empty paragraph: its line box plus the
// (collapsed) 0.5em vertical margin from the editor stylesheet.
function emptyLineHeight(dom: HTMLElement): number {
  const cs = getComputedStyle(dom);
  const fontSize = parseFloat(cs.fontSize) || 14;
  let lineHeight = parseFloat(cs.lineHeight);
  if (!isFinite(lineHeight) || lineHeight <= 0) lineHeight = fontSize * 1.6;
  return lineHeight + fontSize * 0.5;
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg?.type) {
    case 'init': {
      docMeta = (msg.meta ?? {}) as Record<string, unknown>;
      assetBaseUrl = (msg.assetBaseUrl ?? '') as string;
      docBaseUrl = (msg.docBaseUrl ?? '') as string;
      docFlavor = (msg.flavor === 'hd2' ? 'hd2' : 'hd');
      const body = (msg.body ?? '') as string;
      if (!editor) {
        createEditor(body);
      } else {
        const incoming = rewriteImgSrcs(body, 'in');
        // A re-init can be triggered by a change the user didn't make in the
        // editor — most commonly VS Code normalizing the file on save (final
        // newline / trailing whitespace). setContent replaces the whole doc and
        // maps the selection to the end, which would jump the cursor. Skip the
        // reset when nothing actually changed, and otherwise restore the caret.
        if (editor.getHTML() !== incoming) {
          suppressChange = true;
          try {
            const { from, to } = editor.state.selection;
            const hadFocus = editor.isFocused;
            editor.commands.setContent(incoming);
            const size = editor.state.doc.content.size;
            editor.commands.setTextSelection({
              from: Math.min(from, size),
              to: Math.min(to, size)
            });
            if (hadFocus) editor.commands.focus();
          } finally {
            suppressChange = false;
          }
        }
      }
      break;
    }
    case 'imageSaveResult':
      bridge.resolveImageSave(msg);
      break;
    case 'linkOptionsResult':
      bridge.resolveLinkOptions(msg);
      break;
    case 'docInfoResult':
      bridge.resolveDocInfo(msg);
      break;
  }
});

/**
 * Two image-source namespaces, distinguished by the *shape* of the authored src:
 *
 *  - **Managed** — a bare filename (`hero.png`, no path separator, no leading
 *    dot). Lives in the doc's `.hd/<id>/` sidecar folder; the editor owns it
 *    (paste target). Resolves against `assetBaseUrl`.
 *  - **In-place** — a relative/dotted path (`./x.png`, `../assets/x.png`,
 *    `sub/x.png`). References a file that already exists on disk next to the
 *    doc, managed *outside* hd. Resolves against `docBaseUrl` (the doc's own
 *    folder) and is never copied.
 *
 * URLs (`https://…`) and `data:` are left untouched in both directions.
 *
 * On 'in' (host → webview) a managed name is prefixed with the asset base; an
 * in-place path is resolved to a loadable webview URI while its ORIGINAL
 * authored path is stashed in `data-hd-src`. On 'out' (webview → host) the
 * managed prefix is stripped back to a bare name, and an in-place image is
 * restored verbatim from `data-hd-src` (which is dropped) — resolution is not
 * reversible by string-stripping once the browser has normalized the URI, so
 * the stash is the source of truth.
 */
function rewriteImgSrcs(html: string, dir: 'in' | 'out'): string {
  // Capture attributes without any self-closing slash so attribute injection
  // can't land after it. `img` is a void element, so re-emitting as `<img …>`
  // (no slash) is valid and re-parses identically.
  return html.replace(/<img\b([^>]*?)\s*\/?>/gi, (full, attrs: string) => {
    return dir === 'in' ? rewriteImgIn(full, attrs) : rewriteImgOut(full, attrs);
  });
}

function getAttr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\b${name}=("|')([^"']*)\\1`, 'i'));
  return m ? m[2] : null;
}

/** A bare filename — no path separator and no leading dot — is hd-managed. */
function isManagedName(src: string): boolean {
  return !/[/\\]/.test(src) && !src.startsWith('.');
}

function rewriteImgIn(full: string, attrs: string): string {
  const src = getAttr(attrs, 'src');
  if (src == null) return full;
  if (/^[a-z]+:\/\//i.test(src) || src.startsWith('data:')) return full;
  if (assetBaseUrl && src.startsWith(assetBaseUrl)) return full;
  if (docBaseUrl && src.startsWith(docBaseUrl)) return full;

  if (isManagedName(src)) {
    if (!assetBaseUrl) return full;
    return `<img${setAttr(attrs, 'src', `${assetBaseUrl}/${src}`)}>`;
  }

  // In-place: resolve against the doc's folder for display, remember the
  // authored path so 'out' can restore it exactly.
  if (!docBaseUrl) return full;
  let resolved: string;
  try {
    resolved = new URL(src, docBaseUrl.replace(/\/?$/, '/')).toString();
  } catch {
    return full;
  }
  const withSrc = setAttr(attrs, 'src', resolved);
  return `<img${setAttr(withSrc, 'data-hd-src', src)}>`;
}

function rewriteImgOut(full: string, attrs: string): string {
  const authored = getAttr(attrs, 'data-hd-src');
  if (authored != null) {
    // Restore the in-place path and drop the transient stash.
    const restored = setAttr(attrs, 'src', authored);
    return `<img${removeAttr(restored, 'data-hd-src')}>`;
  }
  const src = getAttr(attrs, 'src');
  if (src != null && assetBaseUrl && src.startsWith(assetBaseUrl)) {
    const bare = src.slice(assetBaseUrl.length).replace(/^\//, '');
    return `<img${setAttr(attrs, 'src', bare)}>`;
  }
  return full;
}

/** Set or replace an attribute in a raw `<img>` attribute string. */
function setAttr(attrs: string, name: string, value: string): string {
  const re = new RegExp(`\\s*\\b${name}=("|')[^"']*\\1`, 'i');
  const decl = ` ${name}="${value}"`;
  return re.test(attrs) ? attrs.replace(re, decl) : attrs + decl;
}

function removeAttr(attrs: string, name: string): string {
  return attrs.replace(new RegExp(`\\s*\\b${name}=("|')[^"']*\\1`, 'i'), '');
}
