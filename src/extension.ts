import * as vscode from 'vscode';
import { HdEditorProvider } from './editor/provider';
import { MdEditorProvider } from './editor/md-provider';
import { registerClipboardCommands } from './conversion/clipboard';
import { registerMigrateCommand } from './assets/migrate';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(HdEditorProvider.register(context));
  context.subscriptions.push(MdEditorProvider.register(context));
  for (const d of registerClipboardCommands()) {
    context.subscriptions.push(d);
  }
  context.subscriptions.push(registerMigrateCommand());

  // Palette access to the same "leave the WYSIWYG editor" action the toolbar
  // button performs, acting on the active tab's document.
  context.subscriptions.push(
    vscode.commands.registerCommand('hd.md.openRaw', async () => {
      const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      let uri: vscode.Uri | undefined;
      if (input instanceof vscode.TabInputCustom) uri = input.uri;
      else if (input instanceof vscode.TabInputText) uri = input.uri;
      if (uri) {
        await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
      }
    })
  );
}

export function deactivate() {}
