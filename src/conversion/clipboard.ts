import * as vscode from 'vscode';
import { parseDocument } from '../format/parser';
import { htmlToMarkdown } from './hdToMd';

export function registerClipboardCommands(): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand('hd.copyAsMarkdown', async () => {
      const active = vscode.window.activeTextEditor?.document
        ?? vscode.workspace.textDocuments.find((d) => d.fileName.toLowerCase().endsWith('.hd'));

      if (!active || !active.fileName.toLowerCase().endsWith('.hd')) {
        vscode.window.showInformationMessage('Open an .hd file to copy as Markdown.');
        return;
      }

      const { body } = parseDocument(active.getText());
      const md = htmlToMarkdown(body);
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
