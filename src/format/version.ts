import type { HdExt } from './flavor';

/**
 * HD format versions.
 *
 *  - version 1 — body-only HTML is authoritative (legacy). The file stores HTML
 *                verbatim and the webview loads/saves it without conversion.
 *  - version 2 — Markdown-primary: the body is Markdown with raw-HTML islands.
 *                The provider converts Markdown → HTML on load and HTML →
 *                Markdown on save. This is the DEFAULT for new documents and the
 *                format every edit is saved in.
 *
 * The frontmatter field — NOT the file extension — is the source of truth for
 * how a document's body is stored. A `.hd` file may hold either version. A
 * legacy v1 file opens as HTML and is re-saved as v2 on first edit. The `.hd2`
 * extension is a deprecated alias that still opens and still implies version 2;
 * it is no longer needed (a `.hd` with `format-version: 2` is identical on disk)
 * and no longer promoted.
 */
export const HD_V1 = 1;
export const HD_V2 = 2;

/** The version new documents are created in and every edit is saved as. */
export const LATEST_FORMAT_VERSION = HD_V2;

/**
 * The canonical frontmatter key naming the HD format version.
 *
 * Renamed from `version` because the old name was catastrophically ambiguous:
 * every agent that touched a document read `version: 2` as the DOCUMENT's
 * revision number and dutifully incremented it, silently reclassifying a
 * perfectly good v2 file as a nonexistent v3 (or, worse, rewriting it as v1).
 * `format-version` cannot be misread as a document revision, which is the whole
 * point of the rename.
 */
export const FORMAT_VERSION_KEY = 'format-version';

/**
 * The pre-rename key. Still READ as a fallback so every existing document keeps
 * opening correctly, but never written: the save path rewrites it to
 * `format-version` and deletes it (see `normalizeFormatVersion`).
 */
export const LEGACY_VERSION_KEY = 'version';

function numeric(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Read the declared format version out of frontmatter.
 *
 * `format-version` is canonical and wins outright; `version` is consulted only
 * as a fallback for documents written before the rename. When a document
 * carries BOTH (the inconsistency the save path exists to clean up), the
 * canonical key is authoritative and the legacy one is ignored — never
 * averaged, never max'd, never treated as a conflict to report.
 *
 * Returns `undefined` when neither key declares anything usable, which callers
 * read as "unstated, therefore latest".
 */
export function declaredFormatVersion(
  meta: Record<string, unknown> | null | undefined
): number | undefined {
  const m = meta ?? {};
  return numeric(m[FORMAT_VERSION_KEY]) ?? numeric(m[LEGACY_VERSION_KEY]);
}

/**
 * Decide how a document's body is stored on disk right now.
 *
 * Version 2 is THE format; version 1 is legacy-only. So the rule is: a document
 * is v1 **only when it explicitly declares version 1** (under either key).
 * Everything else — any other declared version, the `.hd2` alias, and crucially
 * a `.hd` with NO version field at all — is treated as current v2/Markdown.
 *
 * This is deliberately the opposite of "guess v1 for un-versioned non-empty
 * bodies": a new doc authored without the field must open as v2, not be
 * misread as HTML and rendered as literal text. The only cost is that a
 * genuinely-legacy v1 HTML file that was never stamped will now open through
 * the Markdown path — raw HTML passes through GFM largely intact, and the
 * first edit migrates it to real v2. Stamp such files with an explicit
 * `format-version: 1` (see scripts/stamp-legacy-versions.mjs) if you need them
 * to keep rendering as body-only HTML.
 *
 * `ext`/`body` are retained for signature stability and are no longer needed
 * for the decision.
 */
export function effectiveVersion(
  meta: Record<string, unknown> | null | undefined,
  _ext?: HdExt,
  _body?: string
): typeof HD_V1 | typeof HD_V2 {
  return declaredFormatVersion(meta) === HD_V1 ? HD_V1 : HD_V2;
}

/**
 * Bring a document's version fields in line with the canon, in place of
 * whatever mix of keys it arrived with:
 *
 *  - `format-version` is set to `version` (v2 on every save from the editor).
 *  - the legacy `version` key is REMOVED entirely, so nothing downstream can
 *    read a stale value and nothing can mistake it for a revision counter.
 *
 * Key ORDER is preserved, and a legacy `version` is replaced *in its own slot*
 * rather than being dropped and re-appended — the frontmatter of an edited
 * document should diff as a one-line rename, not as a reshuffle.
 *
 * Returns a new object; the input is not mutated.
 */
export function normalizeFormatVersion(
  meta: Record<string, unknown> | null | undefined,
  version: number = LATEST_FORMAT_VERSION
): Record<string, unknown> {
  const m = meta ?? {};
  const out: Record<string, unknown> = {};
  let placed = false;

  for (const [key, value] of Object.entries(m)) {
    if (key === FORMAT_VERSION_KEY) {
      if (!placed) {
        out[FORMAT_VERSION_KEY] = version;
        placed = true;
      }
      continue;
    }
    if (key === LEGACY_VERSION_KEY) {
      // Reuse the legacy key's position for the canonical one so the rename is
      // a single changed line in the diff.
      if (!placed) {
        out[FORMAT_VERSION_KEY] = version;
        placed = true;
      }
      continue;
    }
    out[key] = value;
  }

  if (!placed) out[FORMAT_VERSION_KEY] = version;
  return out;
}

/** Does this frontmatter still carry the pre-rename `version` key? */
export function hasLegacyVersionKey(
  meta: Record<string, unknown> | null | undefined
): boolean {
  return Object.prototype.hasOwnProperty.call(meta ?? {}, LEGACY_VERSION_KEY);
}
