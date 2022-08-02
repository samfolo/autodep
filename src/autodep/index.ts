import {lstatSync, readdirSync, readFileSync} from 'fs';
import minimatch from 'minimatch';
import path from 'path';
import vscode from 'vscode';

import {FileMatcherDeclaration} from '../common/types';
import {ConfigurationLoader} from '../config/load';
import {ConfigUmarshaller} from '../config/unmarshal';
import {AutoDepError, ErrorType} from '../errors/error';
import {AutoDepBase} from '../inheritance/base';
import {CallExpression, RootNode} from '../language/ast/types';
import {ErrorMessages} from '../messages/error';
import {TaskMessages} from '../messages/task';
import {BuildFile} from '../models/buildFile';
import {Dependency} from '../models/dependency';
import {DependencyResolver} from '../resolver/resolve';
import {RuleMetadataVisitor} from '../visitor/ruleMetadata';
import {NameFieldLiteral, SrcsFieldLiteral} from '../visitor/qualify';
import {Writer} from '../writer/write';
import {Logger} from '../logger/log';
import {TaskStatusClient} from '../clients/taskStatus/task';

export class AutoDep extends AutoDepBase {
  protected _buildFileModelCls: typeof BuildFile;
  protected _configLoaderCls: typeof ConfigurationLoader;
  protected _depResolverCls: typeof DependencyResolver;
  protected _depModelCls: typeof Dependency;
  protected _ruleMetadataVisitorCls: typeof RuleMetadataVisitor;
  protected _unmarshallerCls: typeof ConfigUmarshaller;
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
    loggerCls: typeof Logger = Logger,
    ruleMetadataVisitorCls: typeof RuleMetadataVisitor = RuleMetadataVisitor,
    taskStatusClientCls: typeof TaskStatusClient = TaskStatusClient,
    unmarshallerCls: typeof ConfigUmarshaller = ConfigUmarshaller,
    writerCls: typeof Writer = Writer
  ) {
    /* Pass default config to superclass: */
    const unmarshaller = new unmarshallerCls();
    const _preConfig = unmarshaller.unmarshal({log: ['debug', 'info', 'warn', 'error'], rootDir: '', outDir: ''});
    super({config: _preConfig, name: 'AutoDep'}, loggerCls, taskStatusClientCls);

    this._buildFileModelCls = buildFileModelCls;
    this._configLoaderCls = configLoaderCls;
    this._depModelCls = depModelCls;
    this._depResolverCls = depResolverCls;
    this._ruleMetadataVisitorCls = ruleMetadataVisitorCls;
    this._unmarshallerCls = unmarshallerCls;
    this._writerCls = writerCls;
    this._configLoader = new this._configLoaderCls({config: this._config});
    this._depResolver = new this._depResolverCls({config: this._config});
    this._unmarshaller = unmarshaller;
    this._startTime = null;
    this._endTime = null;
  }

  /**
   * Manages the entire update process for the file at the given path:
   * - Loads `autodep` and `typescript` configuration (if any),
   * - Gathers information about the target file, as well as its `BUILD` file (if it exists),
   * - Resolves direct dependencies,
   * - Discerns which dependencies are safe to prune (if any),
   * - Converts the dependencies into `BUILD` targets,
   * - Writes the update to the target `BUILD` file, or creates one if the conditions
   *   dictate as such.
   *
   * Logging and duration metrics are reported to the relevant output channels
   *
   * @param rootPath the path to the target file
   */
  processUpdate = (rootPath: string) => {
    try {
      this.initialise(rootPath);

      const {
        containsPreExistingBuildRule,
        targetBuildFilePath,
        buildFileAST: _buildFileAST,
        targetBuildRuleMetadata,
      } = this.probeTargetBuildFile(rootPath);

      // TODO: derive `defaultBuildRuleName` from config settings
      const baseName = path.basename(rootPath);
      const defaultBuildRuleName = baseName.slice(0, baseName.indexOf(path.extname(baseName)));
      const targetBuildRuleName = targetBuildRuleMetadata.name?.value ?? defaultBuildRuleName;

      const rootPathBuildTarget = new this._depModelCls({
        config: this._config,
        ruleName: targetBuildRuleName,
        buildFilePath: targetBuildFilePath,
        rootDirName: path.dirname(rootPath),
        targetBuildFilePath: targetBuildFilePath,
      }).toBuildTarget();

      const directDependencies = this.resolveDeps(rootPath);
      const persistedDependencies =
        containsPreExistingBuildRule && targetBuildRuleMetadata.srcs
          ? this.resolvePersistedDeps(targetBuildFilePath, targetBuildRuleMetadata.srcs)
          : [];
      const newDependencies = Array.from(new Set([...directDependencies, ...persistedDependencies]));

      const dependencyToBuildFilePathLookup = this.getNearestBuildFilePaths(newDependencies);
      const buildRuleTargets = this.collectBuildRuleTargets(targetBuildFilePath, dependencyToBuildFilePathLookup, [
        rootPathBuildTarget,
      ]);
      this.writeUpdatesToFilesystem(rootPath, targetBuildFilePath, buildRuleTargets);

      this.handleSuccess();
    } catch (error) {
      this.handleFailure(error);
    } finally {
      this.handleCleanup();
    }
  };

  private loadAutoDepConfig = (rootPath: string) => {
    this._logger.info({ctx: 'initialise', message: TaskMessages.attempt('load', 'autodep config from workspace...')});
    const result = this._configLoader.loadAutoDepConfigFromWorkspace(
      this._depResolver.resolveClosestConfigFilePath(rootPath)
    );

    switch (result.status) {
      case 'success':
        this._logger.info({
          ctx: 'initialise',
          message: TaskMessages.success('loaded', 'autodep config from workspace'),
          details: JSON.stringify(result.output, null, 2),
        });
        this._logger.debug({
          ctx: 'initialise',
          message: TaskMessages.using('the following autodep config'),
          details: JSON.stringify(result.output, null, 2),
        });
        this._depResolver.setConfig(result.output);
        this._logger.setConfig(result.output);
        this.setConfig(result.output);
        break;
      case 'passthrough':
        this._logger.info({
          ctx: 'initialise',
          message: TaskMessages.failure('load', 'autodep config from workspace'),
          details: result.reason,
        });
        return result.output;
      case 'failed':
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
      case 'passthrough':
        this._logger.info({
          ctx: 'initialise',
          message: TaskMessages.failure('load', 'typesript config from workspace'),
          details: result.reason,
        });
        return result.output;
      case 'failed':
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

  /**
   * Returns the following information about the file at the given path:
   * - `containsPreExistingBuildRule`: Whether it already has a `BUILD` rule in its nearest `BUILD` file
   * - `targetBuildFilePath`: One of the following paths:
   *   - The path to the nearest `BUILD` file, if:
   *       - it contains a pre-existing rule for the given module, or
   *       - it exists and `<autodepConfig>.enablePropagation` is set to `true`
   *   - The proposed path to a sibling `BUILD` file with the specified `<autodepConfig>.onCreate.fileExtname`, if
   *     `<autodepConfig>.enablePropagation` is set to `false`
   * - `buildFileAST`: An AST representation of the target BUILD file, if it exists
   * - `targetBuildRuleMetadata`: An object containing the following information about the target rule, if it exists:
   *   - the `name` of the rule
   *   - the `srcs` field value of the rule, both its `type` and literal value
   *   - a `node` field, i.e. the AST representation of the target rule
   * @param rootPath the path to the target module
   * @returns the aforementioned object of information about the file at the given path
   */
  private probeTargetBuildFile = (
    rootPath: string
  ): {
    containsPreExistingBuildRule: boolean;
    targetBuildFilePath: string;
    buildFileAST: RootNode | null;
    targetBuildRuleMetadata: {
      name: NameFieldLiteral | null;
      srcs: SrcsFieldLiteral | null;
      node: CallExpression | null;
    };
  } => {
    const dirPath = path.dirname(rootPath);
    const onCreateBuildFilePath: string = path.resolve(dirPath, this.getOnCreateBuildFileName());

    const nearestBuildFilePath = this._depResolver.getNearestBuildFilePath(rootPath);
    if (!nearestBuildFilePath) {
      this._logger.warn({
        ctx: 'probeTargetBuildFile',
        message: TaskMessages.locate.failure('any `BUILD` or `BUILD.plz` files in the workspace.'),
      });

      return {
        containsPreExistingBuildRule: false,
        targetBuildFilePath: onCreateBuildFilePath,
        targetBuildRuleMetadata: {
          name: null,
          srcs: null,
          node: null,
        },
        buildFileAST: null,
      };
    } else {
      const targetBuildFileAST = this.parseBuildFileIfExists(nearestBuildFilePath);
      if (!targetBuildFileAST) {
        // TODO: add more detail here; return a "status-reason-output" object.
        throw new AutoDepError(
          ErrorType.PROCESSING,
          TaskMessages.parse.failure(`BUILD file at ${nearestBuildFilePath}`)
        );
      }

      const ruleMetadataVisitor = new this._ruleMetadataVisitorCls({
        config: this._config,
        rootPath,
        targetBuildFilePath: nearestBuildFilePath,
      });
      ruleMetadataVisitor.collectMetadata(targetBuildFileAST);
      const ruleMetadataVisitorResult = ruleMetadataVisitor.getResult();
      switch (ruleMetadataVisitorResult.status) {
        case 'success':
        case 'partial-success':
          this._logger.trace({
            ctx: 'probeTargetBuildFile',
            message: TaskMessages.locate.success(`\`BUILD\` rule for ${rootPath} at ${nearestBuildFilePath}`),
            details: JSON.stringify(
              {
                name: ruleMetadataVisitorResult.output.name,
                srcs: ruleMetadataVisitorResult.output.srcs,
              },
              null,
              2
            ),
          });
          return {
            containsPreExistingBuildRule: true,
            buildFileAST: targetBuildFileAST,
            targetBuildRuleMetadata: ruleMetadataVisitorResult.output,
            targetBuildFilePath: nearestBuildFilePath,
          };
        case 'failed':
          this._logger.error({
            ctx: 'probeTargetBuildFile',
            message: ruleMetadataVisitorResult.reason,
          });
          return {
            containsPreExistingBuildRule: false,
            buildFileAST: targetBuildFileAST,
            targetBuildRuleMetadata: ruleMetadataVisitorResult.output,
            targetBuildFilePath: this._config.enablePropagation ? nearestBuildFilePath : onCreateBuildFilePath,
          };
        case 'idle':
        case 'passthrough':
        case 'processing':
        default:
          this._logger.error({
            ctx: 'probeTargetBuildFile',
            message: ruleMetadataVisitorResult.reason,
          });
          throw new AutoDepError(ErrorType.UNEXPECTED, ruleMetadataVisitorResult.reason);
      }
    }
  };

  private resolveDeps = (rootPath: string) => {
    this._logger.trace({
      ctx: 'process',
      message: TaskMessages.resolve.attempt(rootPath, 'direct dependencies'),
    });
    const result = this._depResolver.resolveAbsoluteImportPaths({
      filePath: rootPath,
      rootDir: 'core3',
    });

    switch (result.status) {
      case 'success':
        this._logger.trace({
          ctx: 'process',
          message: TaskMessages.resolve.success(rootPath, 'direct dependencies'),
          details: JSON.stringify(result.successfulAttempts, null, 2),
        });
        return result.successfulAttempts;
      case 'partial-success':
        this._logger.trace({
          ctx: 'process',
          message: TaskMessages.resolve.success(rootPath, 'direct dependencies') + ' - with some failures',
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
          TaskMessages.resolve.failure(rootPath, 'direct dependencies')
        );
    }
  };

  private getNearestBuildFilePaths = (deps: string[]) => {
    this._logger.trace({
      ctx: 'process',
      message: TaskMessages.collect.attempt(`nearest BUILD and/or BUILD.plz file paths`),
    });
    const result = this._depResolver.getNearestBuildFilePaths(deps);
    this._logger.trace({
      ctx: 'process',
      message: TaskMessages.collect.success(`nearest BUILD and/or BUILD.plz file paths`),
    });

    return result;
  };

  private collectBuildRuleTargets = (
    targetBuildFilePath: string,
    depToBuildFilePathMap: Record<string, string>,
    targetsToExclude: string[] = []
  ) => {
    this._logger.trace({
      ctx: 'process',
      message: TaskMessages.attempt('resolve', `BUILD targets for ${targetBuildFilePath}`),
    });
    const uniqueBuildTargets = new Set<string>();

    for (const dep in depToBuildFilePathMap) {
      const buildFilePath = depToBuildFilePathMap[dep];
      const buildFileAST = this.parseBuildFileIfExists(buildFilePath);
      if (buildFileAST) {
        const ruleMetadataVisitor = new this._ruleMetadataVisitorCls({
          config: this._config,
          rootPath: dep,
          targetBuildFilePath: buildFilePath,
        });
        ruleMetadataVisitor.collectMetadata(buildFileAST);
        const ruleMetadataVisitorResult = ruleMetadataVisitor.getResult();

        switch (ruleMetadataVisitorResult.status) {
          case 'success':
            this._logger.trace({
              ctx: 'collectBuildRuleTargets',
              message: TaskMessages.locate.success(`metadata for ${dep}`),
              details: JSON.stringify(
                {name: ruleMetadataVisitorResult.output.name, srcs: ruleMetadataVisitorResult.output.srcs},
                null,
                2
              ),
            });
            this._logger.debug({
              ctx: 'collectBuildRuleTargets',
              message: TaskMessages.locate.success(`metadata for ${dep}`),
              details: ruleMetadataVisitorResult.output.node?.toString() ?? '<none>',
            });
            break;
          case 'failed':
            throw new AutoDepError(
              ErrorType.FAILED_PRECONDITION,
              ErrorMessages.precondition.noRuleFoundForDependency({dep, nearestBUILDFile: buildFilePath})
            );
          case 'idle':
          case 'passthrough':
            throw new AutoDepError(
              ErrorType.UNEXPECTED,
              ErrorMessages.precondition.noRuleFoundForDependency({dep, nearestBUILDFile: buildFilePath})
            );
          default:
            throw new AutoDepError(
              ErrorType.UNEXPECTED,
              TaskMessages.unknown(ruleMetadataVisitorResult.status, 'status')
            );
        }

        const buildRuleName = ruleMetadataVisitorResult.output.name?.value;

        if (buildRuleName) {
          const buildTarget = new Dependency({
            buildFilePath,
            rootDirName: this._config.rootDir,
            ruleName: buildRuleName,
            targetBuildFilePath,
            config: this._config,
          }).toBuildTarget();

          if (!targetsToExclude.includes(buildTarget)) {
            uniqueBuildTargets.add(buildTarget);
          }
          continue;
        }
      }

      throw new AutoDepError(
        ErrorType.FAILED_PRECONDITION,
        ErrorMessages.precondition.noRuleFoundForDependency({dep, nearestBUILDFile: buildFilePath})
      );
    }

    const sortedUniqueBuildTargets = Array.from(uniqueBuildTargets).sort(this.byBuildTarget);

    this._logger.trace({
      ctx: 'process',
      message: TaskMessages.resolve.success(targetBuildFilePath, 'BUILD targets'),
      details: `[\n  ${sortedUniqueBuildTargets.join(',\n  ')}\n]`,
    });
    return sortedUniqueBuildTargets;
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
      details: JSON.stringify(newDeps, null, 2),
    });
  };

  /**
   * Returns a list of dependencies which would otherwise exist in the `deps` array if the target
   * file did not exist.  This is important to know, as we want to avoid removing dependencies which
   * are used by modules included in the same `srcs` array, or captured by the same `srcs:glob`
   * declaration.
   *
   * @param rootPath the absolute path of the trigger file
   * @param srcsField the literal `srcs` field value of the given trigger file's `BUILD` rule
   * @returns a list of absolute dependencies to persist when updating the `deps` of the target BUILD rule,
   * primed to be processed into BUILD targets
   */
  private resolvePersistedDeps = (rootPath: string, srcsField: SrcsFieldLiteral) => {
    const descendantFileNames = this.getAllMatchingDescendantFileNames(rootPath, srcsField);

    const rootDirPath = path.dirname(rootPath);
    const aggregateAbsoluteDepPaths = [];

    for (const descendantFileName of descendantFileNames) {
      const descendantFilePath = path.resolve(rootDirPath, descendantFileName);
      aggregateAbsoluteDepPaths.push(...this.resolveDeps(descendantFilePath));
    }

    const uniqueAggregateAbsoluteDepPaths = Array.from(new Set(aggregateAbsoluteDepPaths));

    // Avoid including cross-imports, as these files are already caught by the `srcs` field:
    return uniqueAggregateAbsoluteDepPaths.filter((dep) => !descendantFileNames.has(path.relative(rootDirPath, dep)));
  };

  /**
   * Parses and returns the `BUILD` file at the given path if it exists, else returns `null`
   *
   * @param targetBuildFilePath the path of the `BUILD` file you want to parse
   * @returns an AST representation of the file
   */
  private parseBuildFileIfExists = (targetBuildFilePath: string): RootNode | null => {
    let targetBuildFile: string;

    try {
      targetBuildFile = readFileSync(targetBuildFilePath, {encoding: 'utf-8', flag: 'r'});

      return new this._buildFileModelCls({
        path: targetBuildFilePath,
        file: targetBuildFile,
        config: this._config,
      }).toAST();
    } catch (error) {
      const err = error as Error;
      switch (err.constructor) {
        case TypeError:
          this._logger.error({
            ctx: 'parseBuildFileIfExists',
            message: TaskMessages.resolve.failure(`\`BUILD\` or \`BUILD.plz\` file at ${targetBuildFilePath}`),
            details: String(err),
          });
        default:
          this._logger.trace({
            ctx: 'parseBuildFileIfExists',
            message: TaskMessages.resolve.failure(`\`BUILD\` or \`BUILD.plz\` file at ${targetBuildFilePath}`),
            details: String(err),
          });
      }
      return null;
    }
  };

  /**
   * Returns
   * @param targetBuildFilePath the `BUILD` file at the location you would like to begin your search
   * @param srcsField the srcs field literal present on the target `BUILD` rule
   * @returns a unique set of descendant file names which match the given `srcs` expression, normalised
   * with prefixes to represent their relative path to the target `BUILD` rule
   */
  private getAllMatchingDescendantFileNames = (targetBuildFilePath: string, srcsField: SrcsFieldLiteral) => {
    this._logger.trace({
      ctx: 'getAllMatchingDescendantFileNames',
      message: TaskMessages.collect.attempt(`names of files descendant of or adjacent to ${targetBuildFilePath}`),
    });
    const srcsFileMatcherDeclaration = this.getSrcsFileMatcherDeclaration(srcsField);
    const descendantFileNames = this.collectAllOrphanDescendantFiles(path.dirname(targetBuildFilePath));
    const result = new Set(
      descendantFileNames.filter((name) => this.matchesFileMatcherDeclaration(name, srcsFileMatcherDeclaration))
    );
    this._logger.trace({
      ctx: 'getAllMatchingDescendantFileNames',
      message: TaskMessages.collect.success(`names of files descendant of or adjacent to ${targetBuildFilePath}`),
      details: JSON.stringify([...result], null, 2),
    });

    return result;
  };

  private getSrcsFileMatcherDeclaration = (srcsField: SrcsFieldLiteral): FileMatcherDeclaration => {
    switch (srcsField.type) {
      case 'string':
        return {
          include: [srcsField.value],
          exclude: [],
        };
      case 'array':
        return {
          include: srcsField.value,
          exclude: [],
        };
      case 'glob':
        return srcsField.value;
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
        const possibleBuildFileNames = Array.from(
          new Set([
            `./${fileOrFolderName}/BUILD`,
            `./${fileOrFolderName}/BUILD.plz`,
            `./${fileOrFolderName}/${this.getOnCreateBuildFileName()}`,
          ])
        );
        const buildFilePath = this._depResolver.findFirstValidPath(pathToFileOrFolder, possibleBuildFileNames);

        // if there is no `BUILD` file in the directory, skip this branch of traversal:
        if (buildFilePath) {
          this._logger.trace({
            ctx: 'collectAllOrphanDescendantFiles',
            message:
              TaskMessages.identified(`the BUILD file for ${fileOrFolderName}`, buildFilePath) + ' - skipping...',
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
   * file matcher declaration, typically whether it matches at least one `include` and at most zero
   * `exclude` entries in the given declaration.
   *
   * @param path the path you are trying to match
   * @param fileMatcherDeclaration an object containing an `include` and `exclude` array pair
   * @returns a boolean indicating whether the path matches at least one `include` and at most
   * zero `exclude` entries in the given declaration.
   */
  private matchesFileMatcherDeclaration = (path: string, fileMatcherDeclaration: FileMatcherDeclaration) =>
    fileMatcherDeclaration.include.length > 0 &&
    fileMatcherDeclaration.include.some((matcher) => minimatch(path, matcher)) &&
    (fileMatcherDeclaration.exclude.length === 0 ||
      fileMatcherDeclaration.exclude.every((matcher) => !minimatch(path, matcher)));

  // Terminating actions:

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
