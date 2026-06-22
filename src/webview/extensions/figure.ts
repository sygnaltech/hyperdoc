import { Node, mergeAttributes } from '@tiptap/core';
import { parseAlign, deriveFigureAlign, figureAlignStyle, stripAlignProps } from './media-style';

/**
 * A `<figure>` containing a single `<img>` plus an editable `<figcaption>`.
 *
 * The image is rendered from node attributes (not a nested node), so the figure
 * behaves as one selectable block; the caption is the node's editable inline
 * content. Image sizing lives on the figure's `style` attribute and renders onto
 * the inner `<img>`. Alignment is a separate `align` attribute that renders as
 * `text-align` on the `<figure>` itself, so the image and its caption move
 * together; it is derived back from that `text-align` on parse.
 *
 * Only image-bearing figures are modelled. A `<figure>` without an `<img>`
 * falls through to the sanitizer's generic handling.
 */
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'inline*',
  draggable: true,
  isolating: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} as Record<string, unknown> };
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      style: { default: null },
      align: { default: null },
      width: { default: null },
      height: { default: null },
      loading: { default: null }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure',
        contentElement: 'figcaption',
        getAttrs: (node) => {
          const figure = node as HTMLElement;
          const img = figure.querySelector('img');
          if (!img) return false;
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            style: stripAlignProps(img.getAttribute('style')),
            width: img.getAttribute('width'),
            height: img.getAttribute('height'),
            loading: img.getAttribute('loading'),
            align: deriveFigureAlign(figure)
          };
        }
      }
    ];
  },

  renderHTML({ node }) {
    const a = node.attrs as Record<string, string | null>;
    const align = parseAlign(a.align);

    const imgAttrs: Record<string, string> = {};
    if (a.src != null) imgAttrs.src = a.src;
    if (a.alt != null) imgAttrs.alt = a.alt;
    if (a.style) imgAttrs.style = a.style;
    if (a.width) imgAttrs.width = a.width;
    if (a.height) imgAttrs.height = a.height;
    if (a.loading) imgAttrs.loading = a.loading;

    const figAttrs: Record<string, string> = {};
    if (align) figAttrs.style = figureAlignStyle(align);

    return [
      'figure',
      mergeAttributes(this.options.HTMLAttributes, figAttrs),
      ['img', imgAttrs],
      ['figcaption', 0]
    ];
  }
});
