import Image from '@tiptap/extension-image';
import { mergeAttributes } from '@tiptap/core';
import { parseAlign, deriveImageAlign, imageAlignStyle, joinStyle, stripAlignProps } from './media-style';

/**
 * HD's image node.
 *
 * The stock TipTap Image node only models `src`, `alt`, and `title`, so any
 * other attribute — including the sizing and alignment we care about — is
 * silently dropped when ProseMirror re-serializes the document on every edit.
 * We add the attributes the HD allowlist permits on `<img>` so they survive the
 * round trip, and take over `renderHTML` to compose the final markup.
 *
 * Sizing is freeform CSS in `style` (`width`/`max-width`/`max-height` — only CSS
 * expresses *max* constraints). Alignment is a separate `align` attribute that
 * renders to `display:block` + auto margins and is derived back from those
 * margins on parse. The `width`/`height`/`loading` passthroughs preserve
 * author-provided values; the in-editor configurator drives sizing via `style`.
 */
export const HdImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (el) => stripAlignProps(el.getAttribute('style'))
      },
      align: {
        default: null,
        parseHTML: (el) => deriveImageAlign(el as HTMLElement)
      },
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute('width') || null
      },
      height: {
        default: null,
        parseHTML: (el) => el.getAttribute('height') || null
      },
      loading: {
        default: null,
        parseHTML: (el) => el.getAttribute('loading') || null
      },
      // Transient: the original authored path of an in-place image (`./x.png`),
      // stashed on the way in so it can be restored verbatim on the way out.
      // Never reaches disk — the save-side rewrite strips it.
      dataHdSrc: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-hd-src') || null
      }
    };
  },

  renderHTML({ node }) {
    const a = node.attrs as Record<string, string | null>;
    const align = parseAlign(a.align);

    const attrs: Record<string, string> = {};
    if (a.src != null) attrs.src = a.src;
    if (a.alt != null) attrs.alt = a.alt;
    if (a.title != null) attrs.title = a.title;
    if (a.width) attrs.width = a.width;
    if (a.height) attrs.height = a.height;
    if (a.loading) attrs.loading = a.loading;
    if (a.dataHdSrc != null) attrs['data-hd-src'] = a.dataHdSrc;

    const style = joinStyle(a.style, align ? imageAlignStyle(align) : null);
    if (style) attrs.style = style;

    return ['img', mergeAttributes(this.options.HTMLAttributes, attrs)];
  }
});
