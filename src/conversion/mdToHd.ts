import { marked } from 'marked';
import { splitCalloutBlockquote } from './callouts';

marked.setOptions({
  gfm: true,
  breaks: false
});

// GitHub-style alerts. GFM has no notion of them, so the marker would otherwise
// render as literal `[!NOTE]` text at the top of an ordinary blockquote; hoist
// it onto the blockquote as `data-callout` instead. Registered on the shared
// marked instance so every Markdown path — opening a document and pasting
// Markdown alike — produces callouts.
marked.use({
  renderer: {
    blockquote(quote: string): string {
      const callout = splitCalloutBlockquote(quote);
      if (!callout) return `<blockquote>\n${quote}</blockquote>\n`;
      return `<blockquote data-callout="${callout.type}">\n${callout.body}</blockquote>\n`;
    }
  }
});

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** Render inline Markdown (no block wrapping) — used for control labels. */
export function markdownInlineToHtml(md: string): string {
  return marked.parseInline(md, { async: false }) as string;
}
