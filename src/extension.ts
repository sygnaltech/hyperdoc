import * as vscode from 'vscode';
import { HdEditorProvider } from './editor/provider';
import { registerClipboardCommands } from './conversion/clipboard';
import { registerMigrateCommand } from './assets/migrate';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(HdEditorProvider.register(context));
  for (const d of registerClipboardCommands()) {
    context.subscriptions.push(d);
  }
  context.subscriptions.push(registerMigrateCommand());
}

export function deactivate() {}
