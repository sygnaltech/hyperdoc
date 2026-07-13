import * as vscode from 'vscode';
import { parseDocument } from '../format/parser';
import { htmlToMarkdown } from './hdToMd';
import { flavorForPath } from '../format/flavor';

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

      const { body } = parseDocument(active.getText());
      // hd2 bodies are already Markdown; hd1 bodies are HTML and need converting.
      const md = flavorForPath(active.fileName) === 'hd2' ? body : htmlToMarkdown(body);
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
