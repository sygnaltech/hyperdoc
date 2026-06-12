import * as vscode from 'vscode';
import * as path from 'path';
import { parseDocument } from '../format/parser';
import { serializeDocument } from '../format/serializer';
import { generateId, IdIndex } from '../identity';
import { assetFolderFor } from '../assets/paths';
import { ensureAssetFolder, saveImageBytes, moveAssetFolder } from '../assets/manager';

interface InboundChange {
  type: 'change';
  meta: Record<string, unknown>;
  body: string;
}

interface InboundImageRequest {
  type: 'requestImageSave';
  requestId: number;
  bytes: number[];
  extension: string;
}

type Inbound = InboundChange | InboundImageRequest;

export class HdEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'sygnal.hd-editor';
  private readonly idIndex = new IdIndex();

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new HdEditorProvider(context);
    const reg = vscode.window.registerCustomEditorProvider(
      HdEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false
      }
    );
    const rename = vscode.workspace.onWillRenameFiles(async (e) => {
      for (const f of e.files) {
        if (!f.oldUri.path.toLowerCase().endsWith('.hd')) continue;
        await provider.handleRename(f.oldUri, f.newUri);
      }
    });
    return vscode.Disposable.from(reg, rename);
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: this.localResourceRoots()
    };
    webview.html = this.renderShell(webview);

    let writeGuard = false;

    const pushInit = async () => {
      const { meta, body } = parseDocument(document.getText());
      const m = (meta ?? {}) as Record<string, unknown>;
      const currentId = typeof m.id === 'string' ? m.id : undefined;
      const reconciled = await this.idIndex.reconcile(document.uri, currentId);

      if (reconciled.kind === 'regenerate') {
        m.id = generateId();
        writeGuard = true;
        try {
          await this.persist(document, m, body);
        } finally {
          writeGuard = false;
        }
        this.idIndex.register(document.uri, m.id as string);
      } else if (reconciled.kind === 'moved') {
        const root = this.workspaceRootFor(document.uri);
        if (root && typeof m.id === 'string') {
          await moveAssetFolder(reconciled.from, document.uri, m.id, root);
        }
      }

      const id = typeof m.id === 'string' ? m.id : undefined;
      const assetBaseUrl = this.computeAssetBaseUrl(webview, document.uri, id);

      webview.postMessage({
        type: 'init',
        meta: m,
        body,
        assetBaseUrl
      });
    };

    await pushInit();

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (writeGuard) return;
      pushInit();
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
    });

    webview.onDidReceiveMessage(async (msg: Inbound) => {
      switch (msg.type) {
        case 'change': {
          writeGuard = true;
          try {
            await this.persist(document, msg.meta, msg.body);
          } finally {
            writeGuard = false;
          }
          break;
        }
        case 'requestImageSave': {
          await this.handleImageSave(webview, document, msg);
          break;
        }
      }
    });
  }

  private async handleImageSave(
    webview: vscode.Webview,
    document: vscode.TextDocument,
    msg: InboundImageRequest
  ): Promise<void> {
    const root = this.workspaceRootFor(document.uri);
    const { meta } = parseDocument(document.getText());
    const id = (meta as Record<string, unknown> | null)?.id;

    if (!root || typeof id !== 'string') {
      webview.postMessage({
        type: 'imageSaveResult',
        requestId: msg.requestId,
        error: 'no-workspace-or-id'
      });
      return;
    }

    try {
      const folder = await ensureAssetFolder(document.uri, id, root);
      const bytes = new Uint8Array(msg.bytes);
      const saved = await saveImageBytes(folder, bytes, msg.extension || 'png');
      const filename = path.basename(saved.fsPath);
      const webviewUri = webview.asWebviewUri(saved).toString();
      webview.postMessage({
        type: 'imageSaveResult',
        requestId: msg.requestId,
        filename,
        webviewUri
      });
    } catch (err) {
      webview.postMessage({
        type: 'imageSaveResult',
        requestId: msg.requestId,
        error: String(err)
      });
    }
  }

  private async persist(
    document: vscode.TextDocument,
    meta: Record<string, unknown>,
    body: string
  ): Promise<void> {
    const next = serializeDocument(meta, body);
    if (next === document.getText()) return;
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, next);
    await vscode.workspace.applyEdit(edit);
  }

  private async handleRename(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    const root = this.workspaceRootFor(newUri);
    if (!root) return;
    try {
      const data = await vscode.workspace.fs.readFile(oldUri);
      const text = new TextDecoder().decode(data);
      const { meta } = parseDocument(text);
      const id = (meta as Record<string, unknown> | null)?.id;
      if (typeof id !== 'string') return;
      await moveAssetFolder(oldUri, newUri, id, root);
      this.idIndex.register(newUri, id);
    } catch {
      // ignore
    }
  }

  private localResourceRoots(): vscode.Uri[] {
    const roots: vscode.Uri[] = [this.context.extensionUri];
    for (const f of vscode.workspace.workspaceFolders ?? []) {
      roots.push(f.uri);
    }
    return roots;
  }

  private workspaceRootFor(uri: vscode.Uri): vscode.Uri | undefined {
    return vscode.workspace.getWorkspaceFolder(uri)?.uri;
  }

  private computeAssetBaseUrl(
    webview: vscode.Webview,
    docUri: vscode.Uri,
    id: string | undefined
  ): string {
    if (!id) return '';
    const root = this.workspaceRootFor(docUri);
    if (!root) return '';
    const folder = assetFolderFor(docUri, id, root);
    return webview.asWebviewUri(folder).toString();
  }

  private renderShell(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'styles.css')
    );
    const nonce = nonceStr();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}">
<title>HD Editor</title>
</head>
<body>
<div id="toolbar"></div>
<div id="editor"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function nonceStr(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
