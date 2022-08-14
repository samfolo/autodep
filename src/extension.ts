import path from 'node:path';
import vscode from 'vscode';
import {AutoDep} from './autodep';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const autodepStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  autodepStatusBarItem.text = '$(pulse) Autodep';
  autodepStatusBarItem.show();

  const autodep = new AutoDep();

  const runOnSave = vscode.workspace.onDidSaveTextDocument((textDocument) => {
    autodepStatusBarItem.text = '$(loading~spin) Autodep';
    const workspaceConfig = vscode.workspace.getConfiguration('autodep');
    const shouldProcessUpdate = ['.js', '.ts', '.jsx', '.tsx', '.scss'].includes(path.extname(textDocument.fileName));

    if (workspaceConfig.runOnSave && shouldProcessUpdate) {
      autodep.processUpdate(textDocument.fileName);
    }
    autodepStatusBarItem.text = '$(pulse) Autodep';
  });

  context.subscriptions.push(runOnSave);
  context.subscriptions.push(autodepStatusBarItem);
}

// this method is called when your extension is deactivated (leaving empty for now)
export function deactivate() {}
