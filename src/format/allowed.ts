export const ALLOWED_ELEMENTS = new Set<string>([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'blockquote', 'pre', 'hr', 'div',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
  'a', 'strong', 'em', 'b', 'i', 'u', 's',
  'code', 'kbd', 'samp', 'var',
  'mark', 'sub', 'sup',
  'abbr', 'cite', 'q', 'small',
  'span', 'br',
  'img', 'figure', 'figcaption', 'svg',
  'section', 'article', 'aside',
  'header', 'footer', 'nav', 'main',
  'details', 'summary'
]);

export const UNIVERSAL_ATTRS = new Set<string>([
  'id', 'class', 'title', 'lang', 'dir', 'style'
]);

export const ELEMENT_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'download']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan', 'scope', 'headers']),
  th: new Set(['colspan', 'rowspan', 'scope', 'headers']),
  ol: new Set(['start', 'type', 'reversed']),
  details: new Set(['open']),
  col: new Set(['span']),
  colgroup: new Set(['span'])
};

export function isElementAllowed(tag: string): boolean {
  return ALLOWED_ELEMENTS.has(tag.toLowerCase());
}

export function isAttrAllowed(tag: string, attr: string): boolean {
  const t = tag.toLowerCase();
  const a = attr.toLowerCase();
  if (a.startsWith('on')) return false;
  if (a.startsWith('data-')) return true;
  if (UNIVERSAL_ATTRS.has(a)) return true;
  return ELEMENT_ATTRS[t]?.has(a) ?? false;
}

export type MdTranslation = 'lossless' | 'lossy' | 'raw-html';

export const MD_STATUS: Record<string, MdTranslation> = {
  h1: 'lossless', h2: 'lossless', h3: 'lossless',
  h4: 'lossless', h5: 'lossless', h6: 'lossless',
  p: 'lossless',
  strong: 'lossless', b: 'lossless',
  em: 'lossless', i: 'lossless',
  code: 'lossless', pre: 'lossless',
  blockquote: 'lossless',
  ul: 'lossless', ol: 'lossless', li: 'lossless',
  a: 'lossless', hr: 'lossless', br: 'lossless',
  img: 'lossy',
  table: 'lossy', thead: 'lossy', tbody: 'lossy', tfoot: 'lossy',
  tr: 'lossy', th: 'lossy', td: 'lossy', caption: 'lossy', colgroup: 'lossy', col: 'lossy',
  u: 'raw-html', s: 'raw-html',
  div: 'raw-html', span: 'raw-html',
  section: 'raw-html', article: 'raw-html', aside: 'raw-html',
  header: 'raw-html', footer: 'raw-html', nav: 'raw-html', main: 'raw-html',
  figure: 'raw-html', figcaption: 'raw-html',
  mark: 'raw-html', sub: 'raw-html', sup: 'raw-html',
  kbd: 'raw-html', samp: 'raw-html', var: 'raw-html',
  abbr: 'raw-html', cite: 'raw-html', q: 'raw-html', small: 'raw-html',
  dl: 'raw-html', dt: 'raw-html', dd: 'raw-html',
  details: 'raw-html', summary: 'raw-html',
  svg: 'raw-html'
};
