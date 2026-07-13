import * as vscode from 'vscode';
import * as path from 'path';
import { parseDocument } from '../format/parser';
import { serializeDocument } from '../format/serializer';
import { defaultVersionForFlavor } from '../format/version';
import { flavorForUri, HdFlavor } from '../format/flavor';
import { hd2BodyToEditorHtml, editorHtmlToHd2Body } from '../conversion/hd2';
import { generateId, IdIndex } from '../identity';
import { resolveExistingAssetFolder } from '../assets/paths';
import { ensureAssetFolder, saveImageBytes } from '../assets/manager';

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

interface InboundLinkOptionsRequest {
  type: 'requestLinkOptions';
  requestId: number;
}

type Inbound = InboundChange | InboundImageRequest | InboundLinkOptionsRequest;

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
    return reg;
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const flavor = flavorForUri(document.uri);
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

      let needsPersist = false;
      if (reconciled.kind === 'regenerate') {
        m.id = generateId();
        needsPersist = true;
      }
      // 'moved' is a no-op under the flat asset layout — the folder is keyed
      // only by id, so renaming or moving the doc does not require touching
      // the file system.

      if (m.version === undefined || m.version === null) {
        m.version = defaultVersionForFlavor(flavor);
        needsPersist = true;
      }

      if (needsPersist) {
        writeGuard = true;
        try {
          await this.persist(document, m, body);
          // The id/version injection above is an editor-initiated change the
          // user never made. Leaving it as an unsaved edit is the root of two
          // problems: (1) the doc shows a mystery "dirty" state the user can't
          // account for, and (2) a dirty doc blocks VS Code from auto-reverting
          // when an agent rewrites the file on disk, so the editor silently
          // desyncs. Save it straight to disk so memory and disk stay in sync.
          if (document.isDirty) {
            await document.save();
          }
        } catch {
          // Best effort — if the save fails the doc simply stays dirty (the
          // previous behavior); nothing is lost.
        } finally {
          writeGuard = false;
        }
        if (reconciled.kind === 'regenerate' && typeof m.id === 'string') {
          this.idIndex.register(document.uri, m.id);
        }
      }

      const id = typeof m.id === 'string' ? m.id : undefined;
      const assetBaseUrl = await this.computeAssetBaseUrl(webview, document.uri, id);

      // For hd2 the on-disk body is Markdown; the webview only understands HTML,
      // so convert on the way in. hd1 bodies are already HTML — pass through.
      const editorBody = flavor === 'hd2' ? hd2BodyToEditorHtml(body) : body;

      webview.postMessage({
        type: 'init',
        meta: m,
        body: editorBody,
        assetBaseUrl,
        flavor
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
          // The webview emits HTML for both flavors. For hd2, serialize it back
          // to Markdown-primary before it hits disk; hd1 stores the HTML as-is.
          const diskBody = flavor === 'hd2' ? editorHtmlToHd2Body(msg.body) : msg.body;
          writeGuard = true;
          try {
            await this.persist(document, msg.meta, diskBody);
          } finally {
            writeGuard = false;
          }
          break;
        }
        case 'requestImageSave': {
          await this.handleImageSave(webview, document, msg);
          break;
        }
        case 'requestLinkOptions': {
          await this.handleLinkOptions(webview, document, msg);
          break;
        }
      }
    });
  }

  private async handleLinkOptions(
    webview: vscode.Webview,
    document: vscode.TextDocument,
    msg: InboundLinkOptionsRequest
  ): Promise<void> {
    try {
      const publishRoot = await findPublishRoot(document.uri);
      if (!publishRoot) {
        webview.postMessage({
          type: 'linkOptionsResult',
          requestId: msg.requestId,
          options: [],
          publishRoot: null
        });
        return;
      }

      const files = await listHdFiles(publishRoot);
      const docDir = vscode.Uri.joinPath(document.uri, '..');
      const docDirFs = docDir.fsPath;
      const docFs = document.uri.fsPath;

      const options = await Promise.all(
        files
          .filter((f) => f.fsPath !== docFs)
          .map(async (f) => {
            let rel = path.relative(docDirFs, f.fsPath).replace(/\\/g, '/');
            if (!rel.startsWith('.') && !rel.startsWith('/')) rel = './' + rel;
            const title = await readDocTitle(f);
            return { relativePath: rel, title, fileName: path.basename(f.fsPath) };
          })
      );

      options.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

      webview.postMessage({
        type: 'linkOptionsResult',
        requestId: msg.requestId,
        options,
        publishRoot: publishRoot.fsPath
      });
    } catch (err) {
      webview.postMessage({
        type: 'linkOptionsResult',
        requestId: msg.requestId,
        options: [],
        publishRoot: null,
        error: String(err)
      });
    }
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

  private async computeAssetBaseUrl(
    webview: vscode.Webview,
    docUri: vscode.Uri,
    id: string | undefined
  ): Promise<string> {
    if (!id) return '';
    const root = this.workspaceRootFor(docUri);
    if (!root) return '';
    const folder = await resolveExistingAssetFolder(docUri, id, root);
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

async function findPublishRoot(docUri: vscode.Uri): Promise<vscode.Uri | null> {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(docUri);
  const stopAt = workspaceFolder?.uri.fsPath ?? path.parse(docUri.fsPath).root;

  let dir = path.dirname(docUri.fsPath);
  while (true) {
    const marker = vscode.Uri.file(path.join(dir, 'hd-sync.json'));
    try {
      await vscode.workspace.fs.stat(marker);
      return vscode.Uri.file(dir);
    } catch {
      // not found at this level
    }
    if (dir === stopAt) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function listHdFiles(root: vscode.Uri): Promise<vscode.Uri[]> {
  const out: vscode.Uri[] = [];
  const SKIP = new Set(['node_modules', '.git', '.hd', 'dist', 'build', '.next', 'out']);
  async function walk(dir: vscode.Uri): Promise<void> {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      return;
    }
    for (const [name, type] of entries) {
      if (type & vscode.FileType.Directory) {
        if (SKIP.has(name) || name.startsWith('.')) continue;
        await walk(vscode.Uri.joinPath(dir, name));
      } else if (type & vscode.FileType.File) {
        if (name.toLowerCase().endsWith('.hd')) {
          out.push(vscode.Uri.joinPath(dir, name));
        }
      }
    }
  }
  await walk(root);
  return out;
}

async function readDocTitle(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(bytes);
    const { meta, body } = parseDocument(text);
    const metaTitle = meta && typeof (meta as Record<string, unknown>).title === 'string'
      ? ((meta as Record<string, unknown>).title as string)
      : undefined;
    if (metaTitle) return metaTitle;
    const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) return h1[1].replace(/<[^>]+>/g, '').trim() || undefined;
    return undefined;
  } catch {
    return undefined;
  }
}
