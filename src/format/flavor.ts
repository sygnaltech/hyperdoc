import type * as vscode from 'vscode';

/**
 * The file-extension kind. This is NO LONGER the source of truth for how a
 * document's body is stored — the `version:` frontmatter field is (see
 * ./version.ts, `effectiveVersion`). It only records which extension was used:
 *
 *  - `hd`  — the `.hd` extension. Holds any version: version 2 (Markdown) for
 *            new documents, version 1 (HTML) for un-migrated legacy files.
 *  - `hd2` — the deprecated `.hd2` alias. Still opens and still implies version
 *            2, but is no longer needed: a `.hd` file with `version: 2` is
 *            identical on disk. Retained for backward compatibility only, and
 *            no longer promoted anywhere.
 */
export type HdExt = 'hd' | 'hd2';

export function extForPath(fsPath: string): HdExt {
  return fsPath.toLowerCase().endsWith('.hd2') ? 'hd2' : 'hd';
}

export function extForUri(uri: vscode.Uri): HdExt {
  return extForPath(uri.fsPath);
}
