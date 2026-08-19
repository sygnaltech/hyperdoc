import TurndownService from 'turndown';
import { addCalloutTurndownRule } from './callouts';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*'
});

// A typed blockquote goes back to Markdown as its `> [!NOTE]` marker line.
addCalloutTurndownRule(turndown);

// Preserve raw HTML for elements that don't round-trip cleanly.
turndown.keep([
  'div', 'span', 'section', 'article', 'aside',
  'header', 'footer', 'nav', 'main',
  'figure', 'figcaption',
  'mark', 'sub', 'sup',
  'kbd', 'samp', 'var',
  'abbr', 'cite', 'q', 'small',
  'dl', 'dt', 'dd',
  'details', 'summary',
  'svg'
] as unknown as TurndownService.Filter);

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}
