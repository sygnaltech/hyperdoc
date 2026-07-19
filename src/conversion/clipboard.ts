import * as vscode from 'vscode';
import { parseDocument } from '../format/parser';
import { htmlToMarkdown } from './hdToMd';
import { extForPath } from '../format/flavor';
import { effectiveVersion } from '../format/version';

function isHdLike(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith('.hd') || n.endsWith('.hd2');
}

export function registerClipboardCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('hd.copyAsMarkdown', async () => {
      const active = vscode.window.activeTextEditor?.document
        ?? vscode.workspace.textDocuments.find((d) => isHdLike(d.fileName));

      if (!active || !isHdLike(active.fileName)) {
        vscode.window.showInformationMessage('Open an .hd or .hd2 file to copy as Markdown.');
        return;
      }

      const { meta, body } = parseDocument(active.getText());
      // v2 bodies are already Markdown; legacy v1 bodies are HTML and need
      // converting. The version field is the source of truth, not the extension.
      const version = effectiveVersion(meta, extForPath(active.fileName), body);
      const md = version >= 2 ? body : htmlToMarkdown(body);
      await vscode.env.clipboard.writeText(md);
      vscode.window.showInformationMessage('Copied as Markdown.');
    }),

    vscode.commands.registerCommand('hd.regenerateId', async () => {
      vscode.window.showInformationMessage(
        'To regenerate the document ID, clear the `id:` line in the frontmatter and reopen the file.'
      );
    })
  ];
}
