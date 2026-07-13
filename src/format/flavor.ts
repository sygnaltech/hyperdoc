import type * as vscode from 'vscode';

/**
 * The two on-disk representations the editor supports:
 *
 *  - `hd`  — body-only HTML (authoritative). The file stores HTML verbatim;
 *            the webview loads and saves it without conversion.
 *  - `hd2` — Markdown-primary. The file stores Markdown with raw-HTML islands;
 *            the provider converts Markdown → HTML on load and HTML → Markdown
 *            on save. The webview/TipTap layer is identical for both flavors
 *            and never sees Markdown.
 *
 * This is a temporary split: hd2 exists so the Markdown-primary format can be
 * exercised end-to-end alongside the stable hd format. Once verified, the two
 * are intended to consolidate.
 */
export type HdFlavor = 'hd' | 'hd2';

export function flavorForPath(fsPath: string): HdFlavor {
  return fsPath.toLowerCase().endsWith('.hd2') ? 'hd2' : 'hd';
}

export function flavorForUri(uri: vscode.Uri): HdFlavor {
  return flavorForPath(uri.fsPath);
}
