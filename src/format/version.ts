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
 * The `version:` frontmatter field — NOT the file extension — is the source of
 * truth for how a document's body is stored. A `.hd` file may hold either
 * version. A legacy v1 file opens as HTML and is re-saved as v2 on first edit.
 * The `.hd2` extension is a deprecated alias that still opens and still implies
 * version 2; it is no longer needed (a `.hd` with `version: 2` is identical on
 * disk) and no longer promoted.
 */
export const HD_V1 = 1;
export const HD_V2 = 2;

/** The version new documents are created in and every edit is saved as. */
export const LATEST_FORMAT_VERSION = HD_V2;

/**
 * Decide how a document's body is stored on disk right now.
 *
 * Version 2 is THE format; version 1 is legacy-only. So the rule is: a document
 * is v1 **only when it explicitly declares `version: 1`**. Everything else —
 * any other declared version, the `.hd2` alias, and crucially a `.hd` with NO
 * `version:` field (empty or not) — is treated as current v2/Markdown.
 *
 * This is deliberately the opposite of "guess v1 for un-versioned non-empty
 * bodies": a new doc authored without the field must open as v2, not be
 * misread as HTML and rendered as literal text. The only cost is that a
 * genuinely-legacy v1 HTML file that was never stamped will now open through
 * the Markdown path — raw HTML passes through GFM largely intact, and the
 * first edit migrates it to real v2. Stamp such files with an explicit
 * `version: 1` (see scripts/stamp-legacy-versions.mjs) if you need them to keep
 * rendering as body-only HTML.
 *
 * `ext`/`body` are retained for signature stability and are no longer needed
 * for the decision.
 */
export function effectiveVersion(
  meta: Record<string, unknown> | null | undefined,
  _ext: HdExt,
  _body: string
): typeof HD_V1 | typeof HD_V2 {
  return Number((meta ?? {}).version) === HD_V1 ? HD_V1 : HD_V2;
}
