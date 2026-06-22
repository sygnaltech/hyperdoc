import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { showContextMenu, type MenuItem } from './context-menu';
import { showConfigurator } from './configurator';

/**
 * Right-click UI for images and figures: a context menu whose primary action
 * opens the shared element configurator for sizing & constraints, plus
 * caption (figure) wrap/unwrap.
 */
export function setupElementUI(editor: Editor): void {
  editor.view.dom.addEventListener('contextmenu', (e) => {
    const target = e.target as Element | null;
    if (!target) return;

    // Check figure first: an <img> inside a figure should act on the figure.
    const figureEl = target.closest('figure');
    if (figureEl && editor.view.dom.contains(figureEl)) {
      if (!selectNode(editor, figureEl, ['figure'])) return;
      e.preventDefault();
      showElementMenu(editor, e.clientX, e.clientY, 'figure');
      return;
    }

    const imgEl = target.closest('img');
    if (imgEl && editor.view.dom.contains(imgEl)) {
      if (!selectNode(editor, imgEl, ['image'])) return;
      e.preventDefault();
      showElementMenu(editor, e.clientX, e.clientY, 'image');
    }
  });
}

type ElementKind = 'image' | 'figure';

function showElementMenu(editor: Editor, x: number, y: number, kind: ElementKind): void {
  const items: MenuItem[] = [
    {
      label: kind === 'figure' ? 'Figure settings…' : 'Image settings…',
      action: () => openElementConfigurator(editor, kind, x, y)
    }
  ];

  if (kind === 'image') {
    items.push({ label: 'Add caption (wrap in figure)', action: () => wrapImageInFigure(editor) });
  } else {
    items.push({ label: 'Remove caption (unwrap figure)', action: () => unwrapFigure(editor) });
  }

  items.push({ label: '---' });
  items.push({
    label: kind === 'figure' ? 'Delete figure' : 'Delete image',
    action: () => editor.chain().focus().deleteSelection().run()
  });

  showContextMenu(x, y, items);
}

const SIZE_PROPS = ['width', 'max-width', 'max-height'] as const;

const ALIGN_OPTIONS = [
  { label: 'None', value: '' },
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' }
];

function openElementConfigurator(editor: Editor, kind: ElementKind, x: number, y: number): void {
  const attrs = editor.getAttributes(kind);
  const styleMap = parseStyle((attrs.style as string | null) ?? null);
  showConfigurator({
    title: kind === 'figure' ? 'Figure' : 'Image',
    anchor: { x, y },
    values: {
      alt: (attrs.alt as string | null) ?? '',
      width: styleMap['width'] ?? '',
      'max-width': styleMap['max-width'] ?? '',
      'max-height': styleMap['max-height'] ?? '',
      align: (attrs.align as string | null) ?? ''
    },
    fields: [
      {
        key: 'alt',
        label: 'Alt text',
        type: 'text',
        placeholder: 'description for screen readers',
        hint: 'describe the image; leave blank only if purely decorative'
      },
      { key: 'width', label: 'Width', type: 'text', placeholder: 'auto', hint: 'e.g. 480px or 60%' },
      { key: 'max-width', label: 'Max width', type: 'text', placeholder: 'none' },
      { key: 'max-height', label: 'Max height', type: 'text', placeholder: 'none', hint: 'caps tall mobile screenshots' },
      { key: 'align', label: 'Alignment', type: 'select', options: ALIGN_OPTIONS }
    ],
    onChange: (vals) => applyConfig(editor, kind, vals)
  });
}

function applyConfig(editor: Editor, kind: ElementKind, vals: Record<string, string>): void {
  const styleMap = parseStyle(currentStyle(editor, kind));
  for (const prop of SIZE_PROPS) {
    const norm = normalizeDimension(vals[prop] ?? '');
    if (norm) styleMap[prop] = norm;
    else delete styleMap[prop];
  }
  const style = serializeStyle(styleMap);

  editor
    .chain()
    .updateAttributes(kind, {
      style: style || null,
      align: vals.align || null,
      alt: vals.alt || null
    })
    .run();
}

// ---------- figure wrap / unwrap -----------------------------------------

function wrapImageInFigure(editor: Editor): void {
  const sel = editor.state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'image') return;
  const a = sel.node.attrs;
  editor
    .chain()
    .insertContentAt(
      { from: sel.from, to: sel.to },
      {
        type: 'figure',
        attrs: { src: a.src, alt: a.alt, style: a.style, width: a.width, height: a.height, loading: a.loading }
      }
    )
    .run();
}

function unwrapFigure(editor: Editor): void {
  const sel = editor.state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'figure') return;
  const a = sel.node.attrs;
  editor
    .chain()
    .insertContentAt(
      { from: sel.from, to: sel.to },
      {
        type: 'image',
        attrs: { src: a.src, alt: a.alt, style: a.style, width: a.width, height: a.height, loading: a.loading }
      }
    )
    .run();
}

// ---------- helpers -------------------------------------------------------

function currentStyle(editor: Editor, kind: ElementKind): string | null {
  return (editor.getAttributes(kind).style as string | null) ?? null;
}

/** Find the ProseMirror position before the nearest node of a wanted type. */
function selectNode(editor: Editor, dom: Element, wantTypes: string[]): boolean {
  const view = editor.view;
  let pos: number;
  try {
    pos = view.posAtDOM(dom, 0);
  } catch {
    return false;
  }
  const doc = view.state.doc;
  const size = doc.content.size;

  const found = (() => {
    for (const p of [pos, pos - 1, pos + 1]) {
      if (p < 0 || p > size) continue;
      const node = doc.nodeAt(p);
      if (node && wantTypes.includes(node.type.name)) return p;
    }
    const $pos = doc.resolve(Math.min(Math.max(pos, 0), size));
    if ($pos.nodeAfter && wantTypes.includes($pos.nodeAfter.type.name)) return $pos.pos;
    if ($pos.nodeBefore && wantTypes.includes($pos.nodeBefore.type.name)) {
      return $pos.pos - $pos.nodeBefore.nodeSize;
    }
    for (let d = $pos.depth; d >= 1; d--) {
      if (wantTypes.includes($pos.node(d).type.name)) return $pos.before(d);
    }
    return null;
  })();

  if (found == null) return false;
  editor.chain().setNodeSelection(found).run();
  return true;
}

function parseStyle(style: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!style) return map;
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i === -1) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (prop && val) map[prop] = val;
  }
  return map;
}

function serializeStyle(map: Record<string, string>): string {
  return Object.entries(map)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

/** Bare numbers become px; everything else is passed through as-is. */
function normalizeDimension(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return `${s}px`;
  return s;
}
