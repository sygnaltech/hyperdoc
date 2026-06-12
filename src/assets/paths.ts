import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Asset folder for a document:
 *
 *   doc:    <workspace>/docs/api/auth.hd  with id "abc123…"
 *   assets: <workspace>/.hd/docs/api/abc123…/
 */
export function assetFolderFor(
  docUri: vscode.Uri,
  id: string,
  workspaceRoot: vscode.Uri
): vscode.Uri {
  const rel = path.relative(workspaceRoot.fsPath, docUri.fsPath);
  const docDir = path.dirname(rel);
  const segments = docDir === '.' || docDir === '' ? [] : docDir.split(path.sep);
  const assetPath = path.join(workspaceRoot.fsPath, '.hd', ...segments, id);
  return vscode.Uri.file(assetPath);
}

export function parentOf(uri: vscode.Uri): vscode.Uri {
  return vscode.Uri.file(path.dirname(uri.fsPath));
}
