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
    content: rewriteImgSrcs(initialBody, assetBaseUrl, 'in'),
    onUpdate: ({ editor: ed }) => {
      if (suppressChange) return;
      const html = rewriteImgSrcs(ed.getHTML(), assetBaseUrl, 'out');
      bridge.sendChange(docMeta, html);
    },
    editorProps: {
      handlePaste: makePasteHandler(() => editor, handleImageFile)
    }
  });

  setupToolbar(toolbarEl, editor, { bridge });
  setupTableUI(editor, editorEl);
  setupElementUI(editor);
  setupShortcuts(editor);
  setupCodeCopy(editorEl);
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
      docFlavor = (msg.flavor === 'hd2' ? 'hd2' : 'hd');
      const body = (msg.body ?? '') as string;
      if (!editor) {
        createEditor(body);
      } else {
        const incoming = rewriteImgSrcs(body, assetBaseUrl, 'in');
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
  }
});

/**
 * On 'in' (host → webview): rewrite bare filenames to absolute webview URIs.
 * On 'out' (webview → host): strip the asset base URL back to bare filenames.
 */
function rewriteImgSrcs(html: string, base: string, dir: 'in' | 'out'): string {
  if (!base) return html;
  return html.replace(/<img\b([^>]*?)\bsrc=("|')([^"']+)\2/gi, (full, attrs, q, src) => {
    if (dir === 'in') {
      if (/^[a-z]+:\/\//i.test(src) || src.startsWith('data:') || src.startsWith(base)) {
        return full;
      }
      return `<img${attrs}src=${q}${base}/${src}${q}`;
    } else {
      if (src.startsWith(base)) {
        const stripped = src.slice(base.length).replace(/^\//, '');
        return `<img${attrs}src=${q}${stripped}${q}`;
      }
      return full;
    }
  });
}
