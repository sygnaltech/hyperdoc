import { serializeFrontmatter } from './frontmatter';

export function serializeDocument(
  meta: Record<string, unknown> | null,
  body: string
): string {
  return serializeFrontmatter(meta, body);
}
