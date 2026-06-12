import * as vscode from 'vscode';
import { assetFolderFor, parentOf } from './paths';

export async function ensureAssetFolder(
  docUri: vscode.Uri,
  id: string,
  workspaceRoot: vscode.Uri
): Promise<vscode.Uri> {
  const folder = assetFolderFor(docUri, id, workspaceRoot);
  await vscode.workspace.fs.createDirectory(folder);
  return folder;
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

export async function moveAssetFolder(
  oldDocUri: vscode.Uri,
  newDocUri: vscode.Uri,
  id: string,
  workspaceRoot: vscode.Uri
): Promise<void> {
  const oldFolder = assetFolderFor(oldDocUri, id, workspaceRoot);
  const newFolder = assetFolderFor(newDocUri, id, workspaceRoot);
  if (oldFolder.toString() === newFolder.toString()) return;

  try {
    await vscode.workspace.fs.stat(oldFolder);
  } catch {
    return;
  }

  await vscode.workspace.fs.createDirectory(parentOf(newFolder));
  try {
    await vscode.workspace.fs.rename(oldFolder, newFolder, { overwrite: false });
  } catch (e) {
    console.error('hd: failed to move asset folder', e);
  }
}
