import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: false
});

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** Render inline Markdown (no block wrapping) — used for control labels. */
export function markdownInlineToHtml(md: string): string {
  return marked.parseInline(md, { async: false }) as string;
}
