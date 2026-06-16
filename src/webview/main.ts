import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
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

const vscode = getVsCodeApi();
const bridge = new Bridge(vscode);

const editorEl = document.getElementById('editor')!;
const toolbarEl = document.getElementById('toolbar')!;

let editor: Editor | null = null;
let docMeta: Record<string, unknown> = {};
let assetBaseUrl = '';
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
  editor = new Editor({
    element: editorEl,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] }
      }),
      Underline,
      Subscript,
      Superscript,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } }),
      Image.configure({ allowBase64: false }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell
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
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg?.type) {
    case 'init': {
      docMeta = (msg.meta ?? {}) as Record<string, unknown>;
      assetBaseUrl = (msg.assetBaseUrl ?? '') as string;
      const body = (msg.body ?? '') as string;
      if (!editor) {
        createEditor(body);
      } else {
        suppressChange = true;
        try {
          editor.commands.setContent(rewriteImgSrcs(body, assetBaseUrl, 'in'));
        } finally {
          suppressChange = false;
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
