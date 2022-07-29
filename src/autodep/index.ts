import {lstatSync, readdirSync, readFileSync} from 'fs';
import minimatch from 'minimatch';
import path from 'path';
import vscode from 'vscode';

import {ConfigUmarshaller} from '../config/unmarshal';
import {AutoDepError, ErrorType} from '../errors/error';
import {AutoDepBase} from '../inheritance/base';
import {RootNode} from '../language/ast/types';
import {ConfigurationLoader} from '../loader/load';
import {ErrorMessages} from '../messages/error';
import {TaskMessages} from '../messages/task';
import {BuildFile} from '../models/buildFile';
import {Dependency} from '../models/dependency';
import {DependencyResolver} from '../resolver/resolve';
import {SrcsFieldVisitor} from '../visitor/findSrcsField';
import {SrcsFieldReturn} from '../visitor/qualify';
import {Writer} from '../writer/write';

interface FileMatcherDeclaration {
  include: string[];
  exclude: string[];
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
  protected _unmarshaller: ConfigUmarshaller;
  protected _startTime: number | null;
  protected _endTime: number | null;

  constructor(
    buildFileModelCls: typeof BuildFile = BuildFile,
    configLoaderCls: typeof ConfigurationLoader = ConfigurationLoader,
    depResolverCls: typeof DependencyResolver = DependencyResolver,
    depModelCls: typeof Dependency = Dependency,
    unmarshallerCls: typeof ConfigUmarshaller = ConfigUmarshaller,
    writerCls: typeof Writer = Writer
  ) {
    /* Pass default config to superclass: */
    const unmarshaller = new unmarshallerCls();
    const _preConfig = unmarshaller.unmarshal({log: ['debug', 'info', 'warn', 'error'], rootDir: '', outDir: ''});
    super({config: _preConfig, name: 'AutoDep'});

    this._buildFileModelCls = buildFileModelCls;
    this._configLoaderCls = configLoaderCls;
    this._depModelCls = depModelCls;
    this._depResolverCls = depResolverCls;
    this._unmarshallerCls = unmarshallerCls;
    this._writerCls = writerCls;
    this._configLoader = new this._configLoaderCls({config: this._config});
    this._depResolver = new this._depResolverCls({config: this._config});
    this._unmarshaller = unmarshaller;
    this._startTime = null;
    this._endTime = null;
  }

  processUpdate = (rootPath: string) => {
    try {
      this.initialise(rootPath);

      const targetBuildFilePath = this.resolveTargetBuildFilePath(rootPath);
      const newDependencies = this.resolveDeps(rootPath);

      const dependencyToBuildFilePathLookup = this.getNearestBuildFilePaths(newDependencies);
      const buildRuleTargets = this.collectBuildRuleTargets(targetBuildFilePath, dependencyToBuildFilePathLookup);
      this.writeUpdatesToFilesystem(rootPath, targetBuildFilePath, buildRuleTargets);

      const descendantFileNames = this.getAllMatchingSrcsFileNames(rootPath, targetBuildFilePath);

      console.log({descendantFileNames});
      const result = [];
      for (const descendantFileName of descendantFileNames) {
        result.push(...this.resolveDeps(path.resolve(path.dirname(rootPath), descendantFileName)));
      }
      console.log({deps: Array.from(new Set(result))});
      this.handleSuccess();
    } catch (error) {
      this.handleFailure(error);
    } finally {
      this.handleCleanup();
    }
  };

  private getAllMatchingSrcsFileNames = (rootPath: string, targetBuildFilePath: string) => {
    let targetBuildFile: string;

    try {
      targetBuildFile = readFileSync(targetBuildFilePath, {encoding: 'utf-8', flag: 'r'});
    } catch {
      this._logger.error({
        ctx: 'getAllMatchingSrcsFiles',
        message: TaskMessages.resolve.failure(`\`BUILD\` or \`BUILD.plz\` file at ${targetBuildFilePath}.`),
      });

      throw new AutoDepError(
        ErrorType.PROCESSING,
        TaskMessages.resolve.failure(`\`BUILD\` or \`BUILD.plz\` file at ${targetBuildFilePath}`)
      );
    }

    const ast = new this._buildFileModelCls({
      path: targetBuildFilePath,
      file: targetBuildFile,
      config: this._config,
    }).toAST();

    const targetBuildFileSrcsField = this.getSiblingSrcsEntries(rootPath, ast);
    const srcsFileMatcherDeclaration = this.getSrcsFileMatcherDeclaration(targetBuildFileSrcsField);
    const descendantFileNames = this.collectAllOrphanDescendantFiles(path.dirname(rootPath));

    return descendantFileNames.filter((name) => this.matchesFileMatcherDeclaration(name, srcsFileMatcherDeclaration));
  };

  private getSiblingSrcsEntries = (rootPath: string, buildFileAST: RootNode) => {
    const srcsFieldVisitor = new SrcsFieldVisitor({config: this._config, rootPath});

    srcsFieldVisitor.locateSrcsField(buildFileAST);
    const result = srcsFieldVisitor.getResult();
    switch (result.status) {
      case 'success':
        if (result.srcsField) {
          this._logger.info({
            ctx: 'initialise',
            message: TaskMessages.locate.success(`\`srcs\` field value in target BUILD rule`),
            details: JSON.stringify(result.srcsField, null, 2),
          });
          return result.srcsField;
        }
        throw new AutoDepError(
          ErrorType.UNEXPECTED,
          'SrcsFieldVisitor::locateSrcsField returned `success` status, but result was `null`'
        );
      case 'failed':
      case 'idle':
      case 'passthrough':
      case 'processing':
        throw new AutoDepError(ErrorType.PROCESSING, result.reason);
    }
  };

  private getSrcsFileMatcherDeclaration = (srcsFieldReturn: SrcsFieldReturn): FileMatcherDeclaration => {
    switch (srcsFieldReturn.type) {
      case 'string':
        return {
          include: [srcsFieldReturn.value],
          exclude: [],
        };
      case 'array':
        return {
          include: srcsFieldReturn.value,
          exclude: [],
        };
      case 'glob':
        return srcsFieldReturn.value;
      default:
        throw new AutoDepError(ErrorType.UNEXPECTED, `unexpected type... should not happen.`);
    }
  };

  /**
   * Recursively collects the names of all descendant files which are not already
   * indexed by a BUILD file in a lower directory.
   *
   * @param rootDirPath the path to the directory where the search should begin
   * @param pathDepthPrefix the prefix to append to the path if it is found in a descendant directory
   * @returns a flat list of file names descendant from the target directory
   */
  private collectAllOrphanDescendantFiles = (rootDirPath: string, pathDepthPrefix: string[] = []) => {
    const result: string[] = [];

    const siblingFileOrFolderNames = readdirSync(rootDirPath, {encoding: 'utf-8'});
    for (const fileOrFolderName of siblingFileOrFolderNames) {
      const pathToFileOrFolder = path.resolve(rootDirPath, fileOrFolderName);
      const statSyncResult = lstatSync(pathToFileOrFolder);

      if (statSyncResult.isDirectory()) {
        this._logger.trace({
          ctx: 'collectAllOrphanDescendantFiles',
          message: TaskMessages.identified(`a directory`, pathToFileOrFolder),
        });
        // check whether there is a buildFile in the directory; if so, skip this branch of traversal:
        const possibleBuildFileNames = Array.from(
          new Set([
            `./${fileOrFolderName}/BUILD`,
            `./${fileOrFolderName}/BUILD.plz`,
            `./${fileOrFolderName}/${this.getOnCreateBuildFileName()}`,
          ])
        );
        const buildFilePath = this._depResolver.findFirstValidPath(pathToFileOrFolder, possibleBuildFileNames);

        if (buildFilePath) {
          this._logger.trace({
            ctx: 'collectAllOrphanDescendantFiles',
            message:
              TaskMessages.identified(`the BUILD file for ${fileOrFolderName}`, buildFilePath) + ' - skipping...',
            details: JSON.stringify(statSyncResult, null, 2),
          });
          continue;
        }

        result.push(
          ...this.collectAllOrphanDescendantFiles(pathToFileOrFolder, [...pathDepthPrefix, fileOrFolderName])
        );
      } else if (statSyncResult.isFile()) {
        this._logger.trace({
          ctx: 'collectAllOrphanDescendantFiles',
          message: TaskMessages.identified(`a file`, pathToFileOrFolder),
        });
        result.push(path.join(...pathDepthPrefix, fileOrFolderName));
      } else {
        this._logger.warn({
          ctx: 'collectAllOrphanDescendantFiles',
          message: TaskMessages.identify.failure('either a file or folder', fileOrFolderName),
          details: JSON.stringify(statSyncResult, null, 2),
        });
      }
    }

    return result;
  };

  /**
   * A boolean predicate to check whether a path matches the `include` and `exclude` conditions of a
   * file matcher declaration
   *
   * @param path the path you are trying to match
   * @param fileMatcherDeclaration an object containing an `include` and `exclude` array pair
   * @returns a boolean indicating whether the path is matched the declaration
   */
  private matchesFileMatcherDeclaration = (path: string, fileMatcherDeclaration: FileMatcherDeclaration) =>
    fileMatcherDeclaration.include.length > 0 &&
    fileMatcherDeclaration.include.some((matcher) => minimatch(path, matcher)) &&
    (fileMatcherDeclaration.exclude.length === 0 ||
      fileMatcherDeclaration.exclude.every((matcher) => !minimatch(path, matcher)));

  private loadAutoDepConfig = (rootPath: string) => {
    this._logger.info({ctx: 'initialise', message: TaskMessages.attempt('load', 'config from workspace...')});
    const result = this._configLoader.loadAutoDepConfigFromWorkspace(
      this._depResolver.resolveClosestConfigFilePath(rootPath)
    );

    switch (result.status) {
      case 'success':
        this._depResolver.setConfig(result.output);
        this._logger.setConfig(result.output);
        this.setConfig(result.output);
        break;
      case 'failed':
      case 'passthrough':
      default:
        throw new AutoDepError(ErrorType.PROCESSING, result.reason);
    }

    return result.output;
  };

  private loadTSConfig = (rootPath: string) => {
    this._logger.info({
      ctx: 'initialise',
      message: TaskMessages.attempt('load', 'TypeScript config from workspace...'),
    });
    const result = this._configLoader.loadTsConfigFromWorkspace(rootPath);

    switch (result.status) {
      case 'success':
        this._logger.info({
          ctx: 'initialise',
          message: TaskMessages.success('loaded', 'typesript config from workspace'),
          details: JSON.stringify(result.output, null, 2),
        });
        this._logger.debug({
          ctx: 'initialise',
          message: TaskMessages.using('the following typesript config'),
          details: JSON.stringify(result.output, null, 2),
        });
        return result.output;
      case 'failed':
      case 'passthrough':
      default:
        throw new AutoDepError(ErrorType.FAILED_PRECONDITION, result.reason);
    }
  };

  private initialise = (rootPath: string) => {
    this._logger.info({ctx: 'initialise', message: 'beginning update...'});
    this._startTime = performance.now();

    this.loadTSConfig(rootPath);
    this.loadAutoDepConfig(rootPath);
  };

  private resolveTargetBuildFilePath = (rootPath: string) => {
    const dirPath = path.dirname(rootPath);
    const onCreateBuildFilePath: string = path.resolve(dirPath, this.getOnCreateBuildFileName());

    let result: string | null;

    if (this._config.enablePropagation) {
      result = this._depResolver.getNearestBuildFilePath(rootPath);
      if (!result) {
        throw new AutoDepError(
          ErrorType.FAILED_PRECONDITION,
          ErrorMessages.precondition.noBUILDFilesInWorkspace({proposedPath: onCreateBuildFilePath})
        );
      }
    } else {
      result =
        this._depResolver.findFirstValidPath(
          rootPath,
          Array.from(
            new Set([path.resolve(dirPath, 'BUILD'), path.resolve(dirPath, 'BUILD.plz'), onCreateBuildFilePath])
          )
        ) ?? onCreateBuildFilePath;
    }

    return result;
  };

  private resolveDeps = (rootPath: string) => {
    this._logger.info({
      ctx: 'process',
      message: TaskMessages.resolve.attempt(rootPath, 'absolute import paths'),
    });
    const result = this._depResolver.resolveAbsoluteImportPaths({
      filePath: rootPath,
      rootDir: 'core3',
    });

    switch (result.status) {
      case 'success':
        this._logger.info({
          ctx: 'process',
          message: TaskMessages.resolve.success(rootPath, 'absolute import paths'),
          details: JSON.stringify(result.successfulAttempts, null, 2),
        });
        return result.successfulAttempts;
      case 'partial-success':
        this._logger.info({
          ctx: 'process',
          message: TaskMessages.resolve.success(rootPath, 'absolute import paths') + ' - with some failures',
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
          TaskMessages.resolve.failure(rootPath, 'absolute import paths')
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
      const buildRuleName = this._depResolver.getBuildRuleName(dep, buildFilePath);
      if (buildRuleName) {
        const dependencyObject = new Dependency({
          buildFilePath,
          rootDirName: 'core3',
          ruleName: buildRuleName,
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

  private writeUpdatesToFilesystem = (rootPath: string, targetBuildFilePath: string, newDeps: string[]) => {
    this._logger.info({
      ctx: 'process',
      message: TaskMessages.attempt('write', `BUILD targets to ${targetBuildFilePath}`),
    });

    const writer = new this._writerCls({
      config: this._config,
      targetBuildFilePath,
      rootPath,
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

  private handleCleanup = () => {
    this._logger.trace({ctx: 'handleCleanup', message: 'Flushing AST cache...'});
    this._buildFileModelCls.flushASTCache();
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
