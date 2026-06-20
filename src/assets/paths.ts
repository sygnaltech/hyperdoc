import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Asset folder for a document:
 *
 *   doc:    <workspace>/docs/api/auth.hd  with id "abc123…"
 *   assets: <workspace>/.hd/abc123…/
 *
 * Flat: the id alone is the lookup key. Document path is not encoded.
 */
export function assetFolderFor(
  _docUri: vscode.Uri,
  id: string,
  workspaceRoot: vscode.Uri
): vscode.Uri {
  return vscode.Uri.file(path.join(workspaceRoot.fsPath, '.hd', id));
}

/**
 * Legacy mirrored-path location for documents authored before the flat layout.
 * Used as a read-only fallback by resolveExistingAssetFolder.
 *
 *   <workspace>/.hd/docs/api/abc123…/
 */
export function legacyMirroredAssetFolderFor(
  docUri: vscode.Uri,
  id: string,
  workspaceRoot: vscode.Uri
): vscode.Uri {
  const rel = path.relative(workspaceRoot.fsPath, docUri.fsPath);
  const docDir = path.dirname(rel);
  const segments = docDir === '.' || docDir === '' ? [] : docDir.split(path.sep);
  return vscode.Uri.file(path.join(workspaceRoot.fsPath, '.hd', ...segments, id));
}

/**
 * Resolve the asset folder for a doc: prefer flat (the canonical location);
 * fall back to the legacy mirrored path if flat does not yet exist on disk.
 * Returns the flat URI when neither exists, since that is where future writes
 * will land.
 */
export async function resolveExistingAssetFolder(
  docUri: vscode.Uri,
  id: string,
  workspaceRoot: vscode.Uri
): Promise<vscode.Uri> {
  const flat = assetFolderFor(docUri, id, workspaceRoot);
  if (await exists(flat)) return flat;
  const legacy = legacyMirroredAssetFolderFor(docUri, id, workspaceRoot);
  if (await exists(legacy)) return legacy;
  return flat;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export function parentOf(uri: vscode.Uri): vscode.Uri {
  return vscode.Uri.file(path.dirname(uri.fsPath));
}
