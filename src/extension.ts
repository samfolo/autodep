import path from 'node:path';
import vscode from 'vscode';
import {AutoDep} from './autodep';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const autodep = new AutoDep();

  const main = vscode.commands.registerCommand('node-please-build-file-auto-formatter.main', () => {
    // A way to format nearest BUILD file via command palette
    // do this later...
  });

  const formatOnSave = vscode.workspace.onDidSaveTextDocument((textDocument) => {
    if (['.js', '.ts', '.jsx', '.tsx', '.scss'].includes(path.extname(textDocument.fileName))) {
      autodep.processUpdate(textDocument.fileName);
    }
  });

  context.subscriptions.push(main);
  context.subscriptions.push(formatOnSave);
}

// this method is called when your extension is deactivated (leaving empty for now)
export function deactivate() {}
