import * as vscode from 'vscode';
import path from 'path';

import {Dependency} from './models/dependency';
import {DependencyResolver} from './resolver/resolve';
import {initConfig} from './common/config';
import {Logger} from './logger/log';
import {ConfigurationLoader} from './loader/load';
import {ErrorMessages, TaskMessages} from './messages';
import {AutoDepError, ErrorType} from './errors/error';
import {Writer} from './writer/write';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const defaultConfig = initConfig();
  const logger = new Logger({namespace: 'AutoDep', config: defaultConfig});

  const main = vscode.commands.registerCommand('node-please-build-file-auto-formatter.main', () => {
    // A way to format nearest BUILD file via command palette
    // do this later...
  });

  const formatOnSave = vscode.workspace.onDidSaveTextDocument((textDocument) => {
    if (['.ts', '.js', '.tsx', '.jsx'].includes(path.extname(textDocument.fileName))) {
      try {
        logger.info({ctx: 'process', message: 'begin'});

        const configLoader = new ConfigurationLoader(defaultConfig);
        configLoader.loadConfigFromWorkspace(textDocument.fileName);

        const config = configLoader.config;

        const depResolver = new DependencyResolver(config);

        const siblingBuildFilePath = path.resolve(path.dirname(textDocument.fileName), 'BUILD.plz');
        const targetBuildFilePath = config.enablePropagation
          ? depResolver.getNearestBuildFilePath(textDocument.fileName)
          : siblingBuildFilePath;

        if (!targetBuildFilePath) {
          throw new AutoDepError(
            ErrorType.FAILED_PRECONDITION,
            ErrorMessages.precondition.noBUILDFilesInWorkspace({proposedPath: siblingBuildFilePath})
          );
        }

        logger.info({
          ctx: 'process',
          message: TaskMessages.resolve.attempt(textDocument.fileName, 'absolute import paths'),
        });
        const uniqueDeps = depResolver.resolveAbsoluteImportPaths({
          filePath: textDocument.fileName,
          rootDir: 'core3',
        });

        logger.info({
          ctx: 'process',
          message: TaskMessages.collect.attempt(`nearest BUILD or BUILD.plz file paths`),
        });
        const depToBuildFileMap = depResolver.getNearestBuildFilePaths(uniqueDeps);

        logger.info({
          ctx: 'process',
          message: TaskMessages.resolve.attempt(textDocument.fileName, 'BUILD rule targets'),
        });
        const buildRuleTargets = [];
        for (const dep in depToBuildFileMap) {
          const buildRuleTarget = depResolver.getBuildRuleName(dep, depToBuildFileMap[dep]);

          if (buildRuleTarget) {
            const dependencyObject = new Dependency({
              ruleName: buildRuleTarget,
              buildFilePath: depToBuildFileMap[dep],
              targetBuildFilePath,
              rootDirName: 'core3',
            });
            buildRuleTargets.push(dependencyObject.toBuildTarget());
          } else {
            throw new AutoDepError(
              ErrorType.FAILED_PRECONDITION,
              ErrorMessages.precondition.noRuleFoundForDependency({dep, nearestBUILDFile: depToBuildFileMap[dep]})
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
        logger.trace({
          ctx: 'process',
          message: TaskMessages.resolve.success(textDocument.fileName, 'BUILD rule targets'),
          details: `[\n    ${sortedBuildRuleTargets.join(',\n    ')}\n]`,
        });

        logger.info({
          ctx: 'process',
          message: TaskMessages.update.attempt('BUILD rule targets'),
        });
        new Writer({
          config,
          targetBuildFilePath,
          rootPath: textDocument.fileName,
          newDeps: sortedBuildRuleTargets,
        }).writeUpdatesToFileSystem();
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
