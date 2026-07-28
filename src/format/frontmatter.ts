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

function scalarize(value: string | number): string {
  if (typeof value === 'number') return String(value);
  // base62 ids / small tokens are safe bare; quote anything that isn't.
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? value : JSON.stringify(value);
}

/**
 * Append new top-level scalar keys to an existing frontmatter block by textual
 * insertion — WITHOUT re-serializing the keys already present. Used for
 * editor-initiated stamps (`id`, `version`) so that opening a doc to mint a
 * missing id doesn't also churn unrelated fields: a full `yaml.dump` round-trip
 * normalizes bare dates to ISO timestamps, expands flow lists (`[a, b]`) to
 * block lists, and folds long strings — none of which the user changed.
 *
 * Returns the rewritten text, or `null` if the input has no frontmatter fence
 * (the caller should fall back to full serialization to create one).
 */
export function stampFrontmatterKeys(
  text: string,
  additions: Record<string, string | number>
): string | null {
  const m = text.match(FENCE_RE);
  if (!m) return null;
  const keys = Object.keys(additions);
  if (keys.length === 0) return text;

  const nl = /\r\n/.test(m[0]) ? '\r\n' : '\n';
  const inner = m[1].replace(/[\r\n]+$/, '');
  const addLines = keys.map((k) => `${k}: ${scalarize(additions[k])}`).join(nl);
  // Preserve the exact whitespace/newline that trailed the original closing
  // fence, and the body bytes after it, untouched.
  const closeTrailing = m[0].slice(m[0].lastIndexOf('---') + 3);
  const rebuiltFence = `---${nl}${inner}${nl}${addLines}${nl}---${closeTrailing}`;
  return rebuiltFence + text.slice(m[0].length);
}
