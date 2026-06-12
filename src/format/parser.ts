import { parseFrontmatter, ParsedDoc } from './frontmatter';

export function parseDocument(text: string): ParsedDoc {
  return parseFrontmatter(text);
}

export type { ParsedDoc };
