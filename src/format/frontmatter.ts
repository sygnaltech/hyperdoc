import * as yaml from 'js-yaml';

export interface ParsedDoc {
  meta: Record<string, unknown> | null;
  body: string;
}

const FENCE_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

export function parseFrontmatter(text: string): ParsedDoc {
  const m = text.match(FENCE_RE);
  if (!m) {
    return { meta: null, body: text };
  }
  let meta: Record<string, unknown> | null = null;
  try {
    const parsed = yaml.load(m[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      meta = parsed as Record<string, unknown>;
    }
  } catch {
    meta = null;
  }
  const remainder = text.slice(m[0].length);
  const body = remainder.replace(/^\r?\n/, '');
  return { meta, body };
}

export function serializeFrontmatter(
  meta: Record<string, unknown> | null,
  body: string
): string {
  if (!meta || Object.keys(meta).length === 0) {
    return body;
  }
  const yamlText = yaml.dump(meta, { lineWidth: 120, noRefs: true }).trimEnd();
  const sep = body.length > 0 ? '\n\n' : '\n';
  return `---\n${yamlText}\n---${sep}${body}`;
}
