import vscode from 'vscode';
import path from 'path';

import {ConfigUmarshaller} from './config/unmarshal';
import {AutoDepError, ErrorType} from './errors/error';
import {ConfigurationLoader} from './loader/load';
import {Logger} from './logger/log';
import {ErrorMessages, TaskMessages} from './messages';
import {Dependency} from './models/dependency';
import {DependencyResolver} from './resolver/resolve';
import {Writer} from './writer/write';
import {compareBuildTarget} from './common/utils';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const main = vscode.commands.registerCommand('node-please-build-file-auto-formatter.main', () => {
    // A way to format nearest BUILD file via command palette
    // do this later...
  });

  const formatOnSave = vscode.workspace.onDidSaveTextDocument((textDocument) => {
    if (['.ts', '.js', '.tsx', '.jsx'].includes(path.extname(textDocument.fileName))) {
      const preConfig = new ConfigUmarshaller().unmarshal({log: ['info', 'error']});
      const logger = new Logger({namespace: 'AutoDep', config: preConfig});

      try {
        const configLoader = new ConfigurationLoader(preConfig);
        const depResolver = new DependencyResolver(preConfig);

        logger.info({ctx: 'process', message: 'beginning update...'});
        const t1 = performance.now();

        const configLoaderResult = configLoader.loadConfigFromWorkspace(
          depResolver.resolveClosestConfigFilePath(textDocument.fileName)
        );

        switch (configLoaderResult.status) {
          case 'success':
            depResolver.setConfig(configLoaderResult.output);
            logger.setConfig(configLoaderResult.output);
            break;
          case 'failed':
          case 'passthrough':
            throw new AutoDepError(ErrorType.PROCESSING, configLoaderResult.reason);
        }

        const config = configLoaderResult.output;

        const dirPath = path.dirname(textDocument.fileName);
        const onCreateBuildFileName = `BUILD${config.onCreate.fileExtname ? `.${config.onCreate.fileExtname}` : ''}`;
        const onCreateBuildFilePath: string = path.resolve(dirPath, onCreateBuildFileName);

        let targetBuildFilePath: string | null;

        if (config.enablePropagation) {
          targetBuildFilePath = depResolver.getNearestBuildFilePath(textDocument.fileName);
        } else {
          targetBuildFilePath = depResolver.findFirstValidPath(
            textDocument.fileName,
            Array.from(
              new Set([path.resolve(dirPath, 'BUILD'), path.resolve(dirPath, 'BUILD.plz'), onCreateBuildFilePath])
            )
          );
        }

        if (!targetBuildFilePath) {
          throw new AutoDepError(
            ErrorType.FAILED_PRECONDITION,
            ErrorMessages.precondition.noBUILDFilesInWorkspace({proposedPath: onCreateBuildFilePath})
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
          message: TaskMessages.resolve.success(textDocument.fileName, 'absolute import paths'),
          details: JSON.stringify(uniqueDeps, null, 2),
        });

        logger.info({ctx: 'process', message: TaskMessages.collect.attempt(`nearest BUILD or BUILD.plz file paths`)});
        const depToBuildFileMap = depResolver.getNearestBuildFilePaths(uniqueDeps);
        logger.info({ctx: 'process', message: TaskMessages.collect.success(`nearest BUILD or BUILD.plz file paths`)});

        logger.info({ctx: 'process', message: TaskMessages.resolve.attempt(targetBuildFilePath, 'BUILD targets')});
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
        const sortedBuildRuleTargets = [...buildRuleTargets].sort(compareBuildTarget);
        logger.info({
          ctx: 'process',
          message: TaskMessages.resolve.success(targetBuildFilePath, 'BUILD targets'),
          details: `[\n    ${sortedBuildRuleTargets.join(',\n    ')}\n]`,
        });

        logger.info({
          ctx: 'process',
          message: TaskMessages.attempt('write', `BUILD targets to ${targetBuildFilePath}`),
        });
        new Writer({
          config,
          targetBuildFilePath,
          rootPath: textDocument.fileName,
          newDeps: sortedBuildRuleTargets,
        }).writeUpdatesToFileSystem();
        logger.info({
          ctx: 'process',
          message: TaskMessages.success('wrote', `BUILD targets to ${targetBuildFilePath}`),
        });

        const t2 = performance.now();
        logger.info({
          ctx: 'process',
          message: TaskMessages.update.success('BUILD rule targets'),
        });
        logger.info({ctx: 'process', message: `update took ${Number(t2 - t1).toFixed()}ms`});
        logger.info({ctx: 'process', message: 'exiting...'});
      } catch (error) {
        const err = error as any;

        if (err.stack) {
          vscode.window.showErrorMessage(String(err.stack));
        } else {
          vscode.window.showErrorMessage(String(error));
        }

        logger.error({ctx: 'process', message: 'something went wrong.', details: err.stack});
        logger.info({ctx: 'process', message: 'exiting...'});
      }
    }
  });

  context.subscriptions.push(main);
  context.subscriptions.push(formatOnSave);
}

// this method is called when your extension is deactivated (leaving empty for now)
export function deactivate() {}
