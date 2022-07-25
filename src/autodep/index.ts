import path from 'path';
import vscode from 'vscode';

import {ConfigUmarshaller} from '../config/unmarshal';
import {AutoDepError, ErrorType} from '../errors/error';
import {AutoDepBase} from '../inheritance/base';
import {ConfigurationLoader} from '../loader/load';
import {ErrorMessages} from '../messages/error';
import {TaskMessages} from '../messages/task';
import {BuildFile} from '../models/buildFile';
import {Dependency} from '../models/dependency';
import {DependencyResolver} from '../resolver/resolve';
import {Writer} from '../writer/write';

interface AutoDepOptions {
  rootPath: string;
}

export class AutoDep extends AutoDepBase {
  protected _configLoaderCls: typeof ConfigurationLoader;
  protected _depResolverCls: typeof DependencyResolver;
  protected _unmarshallerCls: typeof ConfigUmarshaller;
  protected _depModelCls: typeof Dependency;
  protected _buildFileModelCls: typeof BuildFile;
  protected _writerCls: typeof Writer;
  protected _configLoader: ConfigurationLoader;
  protected _depResolver: DependencyResolver;
  protected _rootPath: string;
  protected _unmarshaller: ConfigUmarshaller;
  protected _startTime: number | null;
  protected _endTime: number | null;

  constructor(
    {rootPath}: AutoDepOptions,
    buildFileModelCls: typeof BuildFile = BuildFile,
    configLoaderCls: typeof ConfigurationLoader = ConfigurationLoader,
    depResolverCls: typeof DependencyResolver = DependencyResolver,
    depModelCls: typeof Dependency = Dependency,
    unmarshallerCls: typeof ConfigUmarshaller = ConfigUmarshaller,
    writerCls: typeof Writer = Writer
  ) {
    /* Pass default config to superclass: */
    const unmarshaller = new unmarshallerCls();
    const _preConfig = unmarshaller.unmarshal({log: ['info', 'error']});
    super({config: _preConfig, name: 'AutoDep'});

    this._buildFileModelCls = buildFileModelCls;
    this._configLoaderCls = configLoaderCls;
    this._depModelCls = depModelCls;
    this._depResolverCls = depResolverCls;
    this._unmarshallerCls = unmarshallerCls;
    this._writerCls = writerCls;
    this._configLoader = new this._configLoaderCls({config: this._config});
    this._depResolver = new this._depResolverCls({config: this._config});
    this._rootPath = rootPath;
    this._unmarshaller = unmarshaller;
    this._startTime = null;
    this._endTime = null;
  }

  processUpdate = () => {
    try {
      this.initialise();

      const targetBuildFilePath = this.resolveTargetBuildFilePath();
      const newDependencies = this.resolveDeps();
      const dependencyToBuildFilePathLookup = this.getNearestBuildFilePaths(newDependencies);

      this.writeUpdatesToFilesystem(
        targetBuildFilePath,
        this.collectBuildRuleTargets(targetBuildFilePath, dependencyToBuildFilePathLookup)
      );

      this.handleSuccess();
    } catch (error) {
      this.handleFailure(error);
    }
  };

  private initialise = () => {
    this._logger.info({ctx: 'initialise', message: 'beginning update...'});
    this._startTime = performance.now();

    this._logger.info({ctx: 'initialise', message: TaskMessages.attempt('load', 'config from workspace...')});
    const result = this._configLoader.loadConfigFromWorkspace(
      this._depResolver.resolveClosestConfigFilePath(this._rootPath)
    );

    switch (result.status) {
      case 'success':
        this._depResolver.setConfig(result.output);
        this._logger.setConfig(result.output);
        this.setConfig(result.output);
        break;
      case 'failed':
      case 'passthrough':
        throw new AutoDepError(ErrorType.PROCESSING, result.reason);
    }

    return result.output;
  };

  private resolveTargetBuildFilePath = () => {
    const dirPath = path.dirname(this._rootPath);
    const onCreateBuildFilePath: string = path.resolve(dirPath, this.getOnCreateBuildFileName());

    let result: string | null;

    if (this._config.enablePropagation) {
      result = this._depResolver.getNearestBuildFilePath(this._rootPath);
    } else {
      result = this._depResolver.findFirstValidPath(
        this._rootPath,
        Array.from(new Set([path.resolve(dirPath, 'BUILD'), path.resolve(dirPath, 'BUILD.plz'), onCreateBuildFilePath]))
      );
    }

    if (!result) {
      throw new AutoDepError(
        ErrorType.FAILED_PRECONDITION,
        ErrorMessages.precondition.noBUILDFilesInWorkspace({proposedPath: onCreateBuildFilePath})
      );
    }

    return result;
  };

  private resolveDeps = () => {
    this._logger.info({
      ctx: 'process',
      message: TaskMessages.resolve.attempt(this._rootPath, 'absolute import paths'),
    });
    const result = this._depResolver.resolveAbsoluteImportPaths({
      filePath: this._rootPath,
      rootDir: 'core3',
    });

    switch (result.status) {
      case 'success':
        this._logger.info({
          ctx: 'process',
          message: TaskMessages.resolve.success(this._rootPath, 'absolute import paths'),
          details: JSON.stringify(result.successfulAttempts, null, 2),
        });
        return result.successfulAttempts;
      case 'partial-success':
        this._logger.info({
          ctx: 'process',
          message: TaskMessages.resolve.success(this._rootPath, 'absolute import paths') + ' - with some failures',
          details: JSON.stringify(
            {
              succesfulAttempts: result.successfulAttempts,
              failedAttempts: result.failedAttempts,
            },
            null,
            2
          ),
        });
        return result.successfulAttempts;
      default:
        throw new AutoDepError(
          ErrorType.FAILED_PRECONDITION,
          TaskMessages.resolve.failure(this._rootPath, 'absolute import paths')
        );
    }
  };

  private getNearestBuildFilePaths = (deps: string[]) => {
    this._logger.info({
      ctx: 'process',
      message: TaskMessages.collect.attempt(`nearest BUILD and/or BUILD.plz file paths`),
    });
    const result = this._depResolver.getNearestBuildFilePaths(deps);
    this._logger.info({
      ctx: 'process',
      message: TaskMessages.collect.success(`nearest BUILD and/or BUILD.plz file paths`),
    });

    return result;
  };

  private collectBuildRuleTargets = (targetBuildFilePath: string, depToBuildFilePathMap: Record<string, string>) => {
    this._logger.info({
      ctx: 'process',
      message: TaskMessages.attempt('resolve', `BUILD targets for ${targetBuildFilePath}`),
    });
    const result = [];

    for (const dep in depToBuildFilePathMap) {
      const buildFilePath = depToBuildFilePathMap[dep];
      const buildRuleTarget = this._depResolver.getBuildRuleName(dep, buildFilePath);
      if (buildRuleTarget) {
        const dependencyObject = new Dependency({
          buildFilePath,
          rootDirName: 'core3',
          ruleName: buildRuleTarget,
          targetBuildFilePath,
          config: this._config,
        });
        result.push(dependencyObject.toBuildTarget());
      } else {
        throw new AutoDepError(
          ErrorType.FAILED_PRECONDITION,
          ErrorMessages.precondition.noRuleFoundForDependency({dep, nearestBUILDFile: buildFilePath})
        );
      }
    }

    result.sort(this.byBuildTarget);

    this._logger.info({
      ctx: 'process',
      message: TaskMessages.resolve.success(targetBuildFilePath, 'BUILD targets'),
      details: `[\n  ${result.join(',\n  ')}\n]`,
    });
    return result;
  };

  private writeUpdatesToFilesystem = (targetBuildFilePath: string, newDeps: string[]) => {
    this._logger.info({
      ctx: 'process',
      message: TaskMessages.attempt('write', `BUILD targets to ${targetBuildFilePath}`),
    });

    const writer = new this._writerCls({
      config: this._config,
      targetBuildFilePath,
      rootPath: this._rootPath,
      newDeps,
    });
    writer.writeUpdatesToFileSystem();

    this._logger.info({
      ctx: 'process',
      message: TaskMessages.success('wrote', `BUILD targets to ${targetBuildFilePath}`),
    });
  };

  private handleSuccess = () => {
    this._endTime = performance.now();
    this._logger.info({
      ctx: 'process',
      message: TaskMessages.update.success('BUILD rule targets'),
    });

    if (this._endTime && this._startTime) {
      this._logger.info({
        ctx: 'process',
        message: `update took ${Number(this._endTime - this._startTime).toFixed()}ms`,
      });
    } else {
      throw new AutoDepError(ErrorType.UNEXPECTED, ErrorMessages.unexpected.noStartTimeSetForProcess());
    }

    this._logger.info({ctx: 'process', message: 'success!'});
    this._logger.info({ctx: 'process', message: 'exiting...'});
  };

  private handleFailure = (error: any) => {
    const errorMessage = String(error.stack ?? error);

    vscode.window.showErrorMessage(errorMessage);

    this._logger.info({ctx: 'process', message: 'update failed.', details: errorMessage});
    this._logger.info({ctx: 'process', message: 'exiting...'});
  };

  // Utility:

  private getOnCreateBuildFileName = () =>
    `BUILD${this._config.onCreate.fileExtname ? `.${this._config.onCreate.fileExtname}` : ''}`;

  private byBuildTarget = (a: string, b: string) => {
    if (a[0] === ':' && b[0] === '/') {
      return -1;
    }
    if (a[0] === '/' && b[0] === ':') {
      return 1;
    }
    return a.localeCompare(b);
  };
}
