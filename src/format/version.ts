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
 * The declared `version:` wins. When a document doesn't declare one, fall back
 * to: the `.hd2` extension (always meant v2); an empty/new `.hd` body (v2, the
 * default); or a non-empty `.hd` body, which is treated as legacy v1 HTML so
 * existing content is never misparsed as Markdown. Either way, the first save
 * rewrites the body as v2.
 */
export function effectiveVersion(
  meta: Record<string, unknown> | null | undefined,
  ext: HdExt,
  body: string
): typeof HD_V1 | typeof HD_V2 {
  const declared = Number((meta ?? {}).version);
  if (declared === HD_V1) return HD_V1;
  if (declared >= HD_V2) return HD_V2;
  if (ext === 'hd2') return HD_V2;
  return body.trim() === '' ? HD_V2 : HD_V1;
}
