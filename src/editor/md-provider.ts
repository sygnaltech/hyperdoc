import * as vscode from 'vscode';
import * as path from 'path';
import { saveImageBytes } from '../assets/manager';
import { pickBadge } from './md-badges';

interface InboundChange {
  type: 'change';
  text: string;
}
interface InboundOpenRaw {
  type: 'openRaw';
}
interface InboundReady {
  type: 'ready';
}
interface InboundSaveImage {
  type: 'saveImage';
  requestId: number;
  bytes: number[];
  ext: string;
}
interface InboundInsertBadge {
  type: 'insertBadge';
}
type Inbound =
  | InboundChange
  | InboundOpenRaw
  | InboundReady
  | InboundSaveImage
  | InboundInsertBadge;

/**
 * WYSIWYG-ish editor for plain Markdown (`.md`).
 *
 * Unlike the HD editor (which owns an HTML model and serialises to/from it), the
 * Markdown editor keeps the **Markdown source as the single source of truth**:
 * the webview holds the exact file text in CodeMirror and renders it live. Sync
 * is therefore text-to-text with no conversion, so the round-trip is the
 * identity function — nothing outside an edit is ever reformatted.
 *
 * Whether this editor handles `.md` at all is governed by `hd.markdown.enabled`
 * (default on). When off, opening a `.md` immediately falls back to VS Code's
 * built-in text editor — the same path as the toolbar's "raw" button.
 */
export class MdEditorProvider implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'sygnal.md-editor';

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MdEditorProvider(context);
    return vscode.window.registerCustomEditorProvider(
      MdEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false
      }
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Respect the opt-out: hand the file to the built-in text editor and stop.
    if (!this.isEnabledFor(document.uri)) {
      webviewPanel.webview.html = '<!DOCTYPE html><html><body></body></html>';
      await openAsRawText(document.uri);
      return;
    }

    const webview = webviewPanel.webview;
    webview.options = { enableScripts: true, localResourceRoots: this.localResourceRoots(document.uri) };
    webview.html = this.renderShell(webview);

    // Webview URI of the document's own folder, so relative image links resolve.
    const baseUri = webview
      .asWebviewUri(vscode.Uri.joinPath(document.uri, '..'))
      .toString();

    let writeGuard = false;

    const pushInit = () => {
      webview.postMessage({ type: 'init', text: document.getText(), baseUri });
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (writeGuard) return;
      // External edit (agent, git, format-on-save): resync while the webview
      // preserves the caret.
      webview.postMessage({ type: 'external', text: document.getText(), baseUri });
    });

    webviewPanel.onDidDispose(() => changeSub.dispose());

    webview.onDidReceiveMessage(async (msg: Inbound) => {
      switch (msg.type) {
        case 'ready': {
          // The webview posts this once its script is listening; pushing content
          // only now avoids a race where init lands before the editor exists.
          pushInit();
          break;
        }
        case 'change': {
          writeGuard = true;
          try {
            await this.persist(document, msg.text);
          } finally {
            writeGuard = false;
          }
          break;
        }
        case 'openRaw': {
          await openAsRawText(document.uri);
          break;
        }
        case 'saveImage': {
          await this.handleSaveImage(webview, document, msg);
          break;
        }
        case 'insertBadge': {
          const md = await pickBadge();
          if (md) webview.postMessage({ type: 'insertText', text: md });
          break;
        }
      }
    });
  }

  private async handleSaveImage(
    webview: vscode.Webview,
    document: vscode.TextDocument,
    msg: InboundSaveImage
  ): Promise<void> {
    try {
      const template = vscode.workspace
        .getConfiguration('hd.markdown', document.uri)
        .get<string>('assetFolder', '${name}.assets');
      const folder = resolveAssetFolder(document.uri, template);
      await vscode.workspace.fs.createDirectory(folder);

      const saved = await saveImageBytes(folder, new Uint8Array(msg.bytes), msg.ext || 'png');

      const docDir = path.dirname(document.uri.fsPath);
      const rel = path.relative(docDir, saved.fsPath).replace(/\\/g, '/');
      // URL-encode each segment so spaces (e.g. from a doc named "My File.md" →
      // "My File.assets") and other special characters produce a valid Markdown
      // image link that actually parses as an image.
      const src = rel.split('/').map((seg) => (seg === '..' ? seg : encodeURIComponent(seg))).join('/');
      webview.postMessage({ type: 'imageSaved', requestId: msg.requestId, src });
    } catch (err) {
      webview.postMessage({ type: 'imageSaved', requestId: msg.requestId, error: String(err) });
    }
  }

  private localResourceRoots(docUri: vscode.Uri): vscode.Uri[] {
    const roots: vscode.Uri[] = [this.context.extensionUri];
    for (const f of vscode.workspace.workspaceFolders ?? []) roots.push(f.uri);
    roots.push(vscode.Uri.joinPath(docUri, '..'));
    return roots;
  }

  private isEnabledFor(uri: vscode.Uri): boolean {
    return vscode.workspace.getConfiguration('hd.markdown', uri).get<boolean>('enabled', true);
  }

  private async persist(document: vscode.TextDocument, text: string): Promise<void> {
    if (text === document.getText()) return;
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    edit.replace(document.uri, fullRange, text);
    await vscode.workspace.applyEdit(edit);
  }

  private renderShell(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview-md.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'styles-md.css')
    );
    const nonce = nonceStr();
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}">
<title>Markdown</title>
</head>
<body>
<div id="toolbar"></div>
<div id="editor"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/** Reopen the document in VS Code's built-in text editor, replacing this tab. */
async function openAsRawText(uri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
}

/**
 * Expand the asset-folder template (`${name}` / `${dir}` / `${workspaceFolder}`)
 * for a document into an absolute folder. A relative result is resolved against
 * the document's own folder, so the default `${name}.assets` sits beside the
 * document and can't collide with a project-wide `assets/`.
 */
function resolveAssetFolder(docUri: vscode.Uri, template: string): vscode.Uri {
  const docFs = docUri.fsPath;
  const dir = path.dirname(docFs);
  const name = path.basename(docFs, path.extname(docFs));
  const ws = vscode.workspace.getWorkspaceFolder(docUri)?.uri.fsPath ?? dir;

  let out = (template || '${name}.assets')
    .replace(/\$\{name\}/g, name)
    .replace(/\$\{dir\}/g, dir)
    .replace(/\$\{workspaceFolder\}/g, ws);

  if (!path.isAbsolute(out)) out = path.join(dir, out);
  return vscode.Uri.file(out);
}

function nonceStr(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
