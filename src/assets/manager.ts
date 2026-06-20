import * as vscode from 'vscode';
import { assetFolderFor, resolveExistingAssetFolder } from './paths';

export async function ensureAssetFolder(
  docUri: vscode.Uri,
  id: string,
  workspaceRoot: vscode.Uri
): Promise<vscode.Uri> {
  const folder = assetFolderFor(docUri, id, workspaceRoot);
  await vscode.workspace.fs.createDirectory(folder);
  return folder;
}

/**
 * Resolve the URI the editor should point at when rendering existing assets.
 * Prefers the flat location; falls back to the legacy mirrored location during
 * the transition window so docs in un-migrated workspaces still render.
 */
export async function resolveAssetFolderForRead(
  docUri: vscode.Uri,
  id: string,
  workspaceRoot: vscode.Uri
): Promise<vscode.Uri> {
  return resolveExistingAssetFolder(docUri, id, workspaceRoot);
}

export async function saveImageBytes(
  folder: vscode.Uri,
  bytes: Uint8Array,
  extension: string
): Promise<vscode.Uri> {
  const ext = sanitizeExt(extension);
  let i = 1;
  while (true) {
    const target = vscode.Uri.joinPath(folder, `image-${i}.${ext}`);
    try {
      await vscode.workspace.fs.stat(target);
      i++;
    } catch {
      await vscode.workspace.fs.writeFile(target, bytes);
      return target;
    }
  }
}

function sanitizeExt(ext: string): string {
  const cleaned = ext.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (!cleaned) return 'png';
  if (cleaned === 'jpeg') return 'jpg';
  return cleaned;
}
