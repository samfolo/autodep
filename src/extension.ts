import * as vscode from 'vscode';
import path from 'path';
import {readFileSync, writeFileSync} from 'fs';

import {Tokeniser} from './language/tokeniser/tokenise';
import {Parser} from './language/parser/parse';
import {Dependency} from './models/dependency';
import {DependencyResolver} from './resolver/resolve';
import {DependencyUpdateVisitor} from './visitor/updateDeps';
import {initConfig} from './common/config';
import {DependencyBuilder} from './language/builder/build';
import {RuleInsertionVisitor} from './visitor/insertRule';
import {Logger} from './logger/log';
import {ConfigurationLoader} from './loader/load';
import {Messages} from './messages/message';

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
        const defaultConfig = initConfig();
        const logger = new Logger({namespace: 'AutoDep', config: defaultConfig});
        logger.info({ctx: 'process', message: 'begin'});

        const configLoader = new ConfigurationLoader(defaultConfig);
        configLoader.loadConfigFromWorkspace(textDocument.fileName);
        const config = configLoader.config;

        const depResolver = new DependencyResolver(config);

        logger.info({
          ctx: 'process',
          message: Messages.resolve.attempt(textDocument.fileName, 'absolute import paths'),
        });

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
          const buildRuleTargets = [];
          for (const dep in depToBuildFileMap) {
            const buildRuleTarget = depResolver.getBuildRuleName(dep, depToBuildFileMap[dep]);

            if (buildRuleTarget) {
              buildRuleTargets.push(
                new Dependency({
                  ruleName: buildRuleTarget,
                  buildFilePath: depToBuildFileMap[dep],
                  targetBuildFilePath,
                  rootDirName: 'core3',
                }).toBuildTarget()
              );
            } else {
              console.error(
                '[DependencyResolver::getBuildRuleName]: could not resolve ' +
                  dep +
                  ' in nearest `BUILD` file ' +
                  depToBuildFileMap[dep] +
                  '. Try saving that file to generate a valid rule.'
              );
            }
          }

          const sortedBuildRuleTargets = [...buildRuleTargets].sort((a, b) => {
            if (a[0] === ':' && b[0] === '/') {
              return -1;
            }

            if (a[0] === '/' && b[0] === ':') {
              return 1;
            }

            return a.localeCompare(b);
          });

          try {
            const targetBuildFile = readFileSync(targetBuildFilePath, {encoding: 'utf-8', flag: 'r'});
            const tokeniser = new Tokeniser(targetBuildFile, config);
            const tokens = tokeniser.tokenise();
            const parser = new Parser(tokens);
            const ast = parser.parse();

            const updatesVisitor = new DependencyUpdateVisitor({
              config,
              rootPath: textDocument.fileName,
              newDeps: sortedBuildRuleTargets,
            });
            const updatedAST = updatesVisitor.updateDeps(ast);
            const updatesVisitorResult = updatesVisitor.getResult();

            switch (updatesVisitorResult.status) {
              case 'success':
                writeFileSync(targetBuildFilePath, updatedAST.toString(), {encoding: 'utf-8', flag: 'w'});
                break;
              case 'failed':
                console.info(
                  `[DependencyUpdateVisitor::updateDeps]: Could not find a matching rule to update at ${targetBuildFilePath}. Creating a new rule in the file...`
                );

                const ruleInsertionVisitor = new RuleInsertionVisitor({
                  config,
                  rootPath: textDocument.fileName,
                  newDeps: sortedBuildRuleTargets,
                });
                const appendedAST = ruleInsertionVisitor.insertRule(ast);
                const ruleInsertionVisitorResult = ruleInsertionVisitor.getResult();

                switch (ruleInsertionVisitorResult.status) {
                  case 'success':
                    writeFileSync(targetBuildFilePath, appendedAST.toString(), {encoding: 'utf-8', flag: 'w'});
                    break;
                  case 'failed':
                    throw new Error(`[RuleInsertionVisitor::insertRule]: ${ruleInsertionVisitorResult.reason}`);
                  case 'passthrough':
                  case 'idle':
                    throw new Error(
                      `[RuleInsertionVisitor::insertRule]: Unexpected error: ${ruleInsertionVisitorResult.reason}`
                    );
                  default:
                    throw new Error(
                      `[RuleInsertionVisitor::insertRule]: Unexpected error: unknown status "${ruleInsertionVisitorResult.status}"`
                    );
                }
                break;
              case 'passthrough':
              case 'idle':
                throw new Error(
                  `[DependencyUpdateVisitor::updateDeps]: Unexpected error: ${updatesVisitorResult.reason}`
                );
              default:
                throw new Error(
                  `[DependencyUpdateVisitor::updateDeps]: Unexpected error: unknown status "${updatesVisitorResult.status}"`
                );
            }
          } catch (error) {
            console.warn(
              `[DependencyUpdateVisitor::updateDeps]: Could not find a file to update at ${targetBuildFilePath}. Creating a new file...`
            );

            const dependencyBuilder = new DependencyBuilder({
              config,
              rootPath: textDocument.fileName,
              newDeps: sortedBuildRuleTargets,
            });
            const builtAST = dependencyBuilder.buildNewFile();

            writeFileSync(targetBuildFilePath, builtAST.toString(), {encoding: 'utf-8', flag: 'w'});
          }
        } else {
          throw new Error(
            `[extension]: Could not find any \`BUILD\` or \`BUILD.plz\` files in the workspace. to create one at ${siblingBuildFilePath}, add \`enablePropagation: true\` to an \`.autodep.yaml\` file in either the target directory or a parent directory`
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
