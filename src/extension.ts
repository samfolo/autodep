import * as vscode from 'vscode';
import * as path from 'path';
import {readFileSync} from 'fs';

import {Tokeniser} from './language/tokeniser/tokenise';
import {Parser} from './language/parser/parse';
import {Dependency} from './models/dependency';
import {DependencyResolver} from './resolver/resolve';
import {DependencyUpdateVisitor} from './visitor/dependencyUpdates';
import {createConfig} from './common/config';
import {DependencyFileBuilder} from './language/builder/build';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const main = vscode.commands.registerCommand('node-please-build-file-auto-formatter.main', () => {
    // A way to format nearest BUILD file via command palette
    // do this later...
  });

  const formatOnSave = vscode.workspace.onDidSaveTextDocument((textDocument) => {
    if (['.ts', '.js', '.tsx', '.jsx'].includes(path.extname(textDocument.fileName))) {
      try {
        const depResolver = new DependencyResolver(createConfig());
        const config = depResolver.loadConfigFromWorkspace(textDocument.fileName);
        console.log(config);

        const uniqueDeps = depResolver.resolveAbsoluteImportPaths({
          filePath: textDocument.fileName,
          rootDir: 'core3',
        });

        const siblingBuildFilePath = path.resolve(path.dirname(textDocument.fileName), 'BUILD.plz');
        const targetBuildFilePath = config.enablePropagation
          ? depResolver.getNearestBuildFilePath(textDocument.fileName)
          : siblingBuildFilePath;

        const depToBuildFileMap = depResolver.getNearestBuildFilePaths(uniqueDeps);

        if (targetBuildFilePath) {
          const buildRuleNames = [];
          for (const dep in depToBuildFileMap) {
            const buildRuleName = depResolver.getBuildRuleName(dep, depToBuildFileMap[dep]);

            if (buildRuleName) {
              const dependencyObject = new Dependency({
                ruleName: buildRuleName,
                buildFilePath: depToBuildFileMap[dep],
                targetBuildFilePath,
                rootDirName: 'core3',
              });

              buildRuleNames.push(dependencyObject.toBuildDep());
            } else {
              console.error(
                '[addLoc..]: could not resolve ' +
                  dep +
                  ' in nearest BUILD file ' +
                  depToBuildFileMap[dep] +
                  '. Try saving that file to generate a valid rule.'
              );
            }
          }

          try {
            const targetBuildFile = readFileSync(targetBuildFilePath, {encoding: 'utf-8', flag: 'r'});

            const tokeniser = new Tokeniser(targetBuildFile, depResolver.config);
            const tokens = tokeniser.tokenise();

            const parser = new Parser(tokens);
            const ast = parser.parse();

            const updatesVisitor = new DependencyUpdateVisitor(
              path.basename(textDocument.fileName),
              buildRuleNames.sort()
            );
            const updatedAST = updatesVisitor.visit(ast);

            if (updatesVisitor.getResult().status === 'success') {
              const edit = new vscode.WorkspaceEdit();
              const buildFileUri = vscode.Uri.file(targetBuildFilePath);
              edit.createFile(buildFileUri, {overwrite: true});
              edit.insert(buildFileUri, new vscode.Position(0, 0), updatedAST.toString());
              vscode.workspace.applyEdit(edit);
              vscode.workspace.saveAll(true);
            } else {
              // create new rule in file
            }
          } catch {
            const fileBuilder = new DependencyFileBuilder({
              config,
              initialDeps: buildRuleNames,
              rootPath: textDocument.fileName,
            });

            const fileAST = fileBuilder.build();

            const edit = new vscode.WorkspaceEdit();
            const buildFileUri = vscode.Uri.file(targetBuildFilePath);
            edit.createFile(buildFileUri, {overwrite: true});
            edit.insert(buildFileUri, new vscode.Position(0, 0), fileAST.toString());
            vscode.workspace.applyEdit(edit);
            vscode.workspace.saveAll(true);
          }
        } else {
          throw new Error(
            `[extension]: Could not find any "BUILD" files in the workspace. to create one at ${siblingBuildFilePath}, add {"enablePropagation": true} in an .autodep.json file in a parent directory`
          );
        }
      } catch (error) {
        const err = error as any;

        if (err.stack) {
          vscode.window.showErrorMessage(String(err.stack));
        } else {
          vscode.window.showErrorMessage(String(error));
        }
        return false;
      }
    }
  });

  context.subscriptions.push(main);
  context.subscriptions.push(formatOnSave);
}

// this method is called when your extension is deactivated
export function deactivate() {}
