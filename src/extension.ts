import * as vscode from 'vscode';
import { HdEditorProvider } from './editor/provider';
import { registerClipboardCommands } from './conversion/clipboard';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(HdEditorProvider.register(context));
  for (const d of registerClipboardCommands()) {
    context.subscriptions.push(d);
  }
}

export function deactivate() {}
