import * as vscode from 'vscode';
import { generateId, isValidId } from './base62';

export { generateId, isValidId };

export type ReconcileResult =
  | { kind: 'ok' }
  | { kind: 'regenerate'; reason: 'missing' | 'invalid' | 'duplicate' }
  | { kind: 'moved'; from: vscode.Uri };

export class IdIndex {
  private idToUri = new Map<string, string>();

  async reconcile(uri: vscode.Uri, id: string | null | undefined): Promise<ReconcileResult> {
    if (!id) return { kind: 'regenerate', reason: 'missing' };
    if (!isValidId(id)) return { kind: 'regenerate', reason: 'invalid' };

    const uriStr = uri.toString();
    const existing = this.idToUri.get(id);

    if (!existing || existing === uriStr) {
      this.idToUri.set(id, uriStr);
      return { kind: 'ok' };
    }

    const existingUri = vscode.Uri.parse(existing);
    try {
      await vscode.workspace.fs.stat(existingUri);
      return { kind: 'regenerate', reason: 'duplicate' };
    } catch {
      this.idToUri.set(id, uriStr);
      return { kind: 'moved', from: existingUri };
    }
  }

  forget(uri: vscode.Uri): void {
    const uriStr = uri.toString();
    for (const [id, u] of this.idToUri) {
      if (u === uriStr) {
        this.idToUri.delete(id);
        return;
      }
    }
  }

  register(uri: vscode.Uri, id: string): void {
    this.idToUri.set(id, uri.toString());
  }
}
