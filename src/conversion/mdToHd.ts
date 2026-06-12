import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: false
});

export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}
