import * as path from 'path';
import {readFileSync} from 'fs';
import precinct from 'precinct';
import {createRequire} from 'node:module';
import vscode from 'vscode';

import {DeAliasingClient} from '../clients/deAliasing/deAlias';
import {TaskStatusClient} from '../clients/taskStatus/task';
import {CONFIG_FILENAME, SUPPORTED_MODULE_EXTENSIONS} from '../common/const';
import {AutoDepConfig} from '../config/types';
import {AutoDepBase} from '../inheritance/base';
import {Logger} from '../logger/log';
import {TaskMessages} from '../messages';

import {CollectDepsDirective, ResolveAbsoluteImportPathsOptions} from './types';

interface DependencyResolverOptions {
  config: AutoDepConfig.Output.Schema;
}

export class DependencyResolver extends AutoDepBase {
  private _deAliasingClientCls: typeof DeAliasingClient;

  constructor(
    {config}: DependencyResolverOptions,
    deAliasingClientCls: typeof DeAliasingClient = DeAliasingClient,
    loggerCls: typeof Logger = Logger,
    taskStatusClientCls: typeof TaskStatusClient = TaskStatusClient
  ) {
    super({config, name: 'DependencyResolver'}, loggerCls, taskStatusClientCls);

    this._deAliasingClientCls = deAliasingClientCls;
  }

  /**
   * Resolves the closest plugin config file path to the given path, bubbling all the way up to the top of the
   * file system.  If no valid file is found, it returns `null`
   *
   * @param rootPath the path from which to bubble up
   * @returns the closest config file path, or `null`
   */
  readonly resolveClosestConfigFilePath = (rootPath: string) =>
    this.findFirstValidPath(rootPath, this.generateRequirePaths(rootPath, [CONFIG_FILENAME]));

  /**
   * Returns a unique set of import paths present at a given node module file path
   *
   * @param options
   * @param options.filePath the given file path (with file extension)
   * @param options.rootDir the name of the root directory, used to resolve the rest of the path for all imports
   * @returns a list of absolute import paths
   */
  resolveAbsoluteImportPaths = ({filePath, rootDir}: ResolveAbsoluteImportPathsOptions) => {
    const taskSatusClient = new this._taskStatusClientCls();
    taskSatusClient.nextEffect('processing');

    this._logger.trace({
      ctx: 'resolveAbsoluteImportPaths',
      message: TaskMessages.initialise.attempt('de-aliasing client'),
    });
    const deAliasingClient = new this._deAliasingClientCls({
      filePath,
      rootDirName: rootDir,
      config: this._config,
    });

    this._logger.trace({ctx: 'resolveAbsoluteImportPaths', message: TaskMessages.resolve.attempt(filePath)});
    const fileContent = readFileSync(filePath, {
      encoding: 'utf-8',
      flag: 'r',
    });

    this._logger.trace({
      ctx: 'resolveAbsoluteImportPaths',
      message: TaskMessages.collect.attempt('absolute import paths'),
    });
    const deps = this.collectImports(fileContent, [
      {
        condition: ['.js', '.jsx'].includes(path.extname(filePath)),
        collect: (file) => precinct(file, {type: 'es6', es6: {mixedImports: true}}),
      },
      {
        condition: path.extname(filePath) === '.ts',
        collect: (file) => precinct(file, {type: 'ts'}),
      },
      {
        condition: path.extname(filePath) === '.tsx',
        collect: (file) => precinct(file, {type: 'tsx'}),
      },
    ]);
    this._logger.trace({
      ctx: 'resolveAbsoluteImportPaths',
      message: TaskMessages.collect.success('absolute import paths'),
      details: JSON.stringify(deps, null, 2),
    });
    taskSatusClient.nextEffect('success');

    const failedAttempts: string[] = [];
    const uniqueDeps = deps.reduce<string[]>((acc, dep) => {
      const result = deAliasingClient.deAlias(dep, SUPPORTED_MODULE_EXTENSIONS);

      switch (result.method) {
        case 'package-name-cache':
        case 'known-config-alias':
        case 'local-module-resolution':
        case 'third-party':
          this._logger.trace({
            ctx: 'resolveAbsoluteImportPaths',
            message: TaskMessages.resolve.success(dep, 'dep'),
            details: JSON.stringify(result, null, 2),
          });
          // In the case an `outDir` path was found,
          // transform to the equivalent rootDir path:
          acc.push(this.transformOutDirPathToRootDirPath(result.output));
          taskSatusClient.nextEffect('success');
          return acc;
        case 'core-module':
          this._logger.trace({
            ctx: 'resolveAbsoluteImportPaths',
            message: TaskMessages.resolve.success(dep, 'dep'),
            details: JSON.stringify(result, null, 2),
          });
          // Skip collecting core modules; they never need to be in deps as they are bundled with NodeJS
          taskSatusClient.nextEffect('success');
          return acc;
        case 'passthrough':
        default:
          break;
      }

      const errorMessage = this._logger.error({
        ctx: 'resolveAbsoluteImportPaths',
        message: TaskMessages.failure('de-alias', dep),
        details: 'output: ' + result.output,
      });
      taskSatusClient.nextEffect('failed');

      failedAttempts.push(result.output);

      if (errorMessage) {
        vscode.window.showErrorMessage(errorMessage);
      }

      return acc;
    }, []);

    const taskState = taskSatusClient.getState();
    let successfulAttempts = uniqueDeps;

    if (this._config.excludeNodeModules) {
      this._logger.trace({
        ctx: 'resolveAbsoluteImportPaths',
        message: 'excluding **/node_modules/* from set of dependencies (requested via config)',
      });
      successfulAttempts = uniqueDeps.filter((dep) => !dep.includes('node_modules'));
    }

    return {
      status: taskState.status,
      reason: taskState.reason,
      successfulAttempts,
      failedAttempts,
    };
  };

  private getExactSubPathMatcher = (exactSubPath: string) => new RegExp(`(?<=/|^)${exactSubPath}(?=/|$)`, 'gi');

  private transformOutDirPathToRootDirPath = (targetPath: string) => {
    const regexMatcher = this.getExactSubPathMatcher(this._config.outDir);

    if (regexMatcher.test(targetPath)) {
      const equivalentRootDirPath = targetPath.replace(
        this.getExactSubPathMatcher(this._config.outDir),
        this._config.rootDir
      );
      this._logger.trace({
        ctx: 'transformOutDirPathToRootDirPath',
        message:
          TaskMessages.identified('a generated file', targetPath) +
          ' - converted to its equivalent root directory path...',
        details: equivalentRootDirPath,
      });
      return equivalentRootDirPath;
    }

    return targetPath;
  };

  /**
   * Collects all the import paths in a given Node.js-compatible file
   *
   * @param file the file from which to collect imports
   * @param directives a list of directives to iterate over, each with a condition and a `collect` action
   * @param directives.condition the condition which should be met for the action to be taken
   * @param directives.collect the action to be taken if the condition is met
   * @returns a list of unique import path strings
   */
  private collectImports = (file: string, directives: CollectDepsDirective[]) => {
    let deps: string[] = [];

    for (const {condition, collect} of directives) {
      if (condition) {
        deps = deps.concat(collect(file));
      }
    }

    return Array.from(new Set(deps));
  };

  /**
   * Takes a given root path and attempts to `require.resolve()` with each given path.
   * If it does not successfully resolve any given path, it returns `null`
   *
   * @param rootPath the given require root path
   * @param filePaths a list of paths to attempt
   * @returns the first valid path of the given paths, or `null`
   */
  readonly findFirstValidPath = (rootPath: string, filePaths: string[]) => {
    const relativeRequire = createRequire(rootPath);

    for (const filePath of filePaths) {
      try {
        this._logger.trace({ctx: 'findFirstValidPath', message: TaskMessages.resolve.attempt(filePath)});
        const targetBuildFile = relativeRequire.resolve(filePath);
        return targetBuildFile;
      } catch (error) {
        this._logger.trace({
          ctx: 'findFirstValidPath',
          message: TaskMessages.resolve.failure(filePath),
        });
      }
    }

    this._logger.error({
      ctx: 'findFirstValidPath',
      message: `No valid path found for ${rootPath}`,
    });
    return null;
  };

  /**
   * Works similar to node's module resolution algorithm, it generates a list
   * of possible module locations from a given path and a list of module names.
   * @example
   * ```typescript
   * this.generateRequirePaths('a/b/c', ['x.ts', 'y.json']);
   *
   * // returns
   * [
   *   'a/b/c/x.ts',
   *   'a/b/c/y.json',
   *   'a/b/x.ts',
   *   'a/b/y.json',
   *   'a/x.ts',
   *   'a/y.json',
   *   '/x.ts',
   *   '/y.json',
   * ]
   * ```
   * @param filePath the given base module names to derive require paths with
   * @param moduleNames a list of module names to append at each path depth
   * @returns a complete list of derived require paths
   */
  generateRequirePaths = (filePath: string, moduleNames: string[]) => {
    const pathParts = filePath.split('/');
    const generatedPaths = [];

    for (let i = 1; i <= pathParts.length; i++) {
      for (const moduleName of moduleNames) {
        generatedPaths.unshift([...pathParts.slice(0, i), moduleName].join('/'));
      }
    }

    return generatedPaths;
  };

  /**
   * Takes a given root path and generates a list of path extensions
   * @example
   * ```typescript
   * this.generatePathExtensions('some/path/to/file', [
   *   '.ts',
   *   '.spec.tsx',
   *   '/index.xyz'
   * ]);
   *
   * // returns
   * [
   *   'some/path/to/file.ts',
   *   'some/path/to/file.spec.tsx',
   *   'some/path/to/file/index.xyz',
   * ]
   * ```
   * @param path the given base path
   * @param extensions a list of extensions to append
   * @returns a list of paths with extensions appended
   */
  generatePathExtensions = (path: string, extensions: string[]) => {
    const generatedPaths = [];

    for (const extension of extensions) {
      generatedPaths.push(path + extension);
    }

    return generatedPaths;
  };

  getNearestBuildFilePath = (rootPath: string) =>
    this.findFirstValidPath(rootPath, this.generateRequirePaths(rootPath, ['BUILD', 'BUILD.plz']));

  /**
   * Returns a map of the nearest given dependencies to their nearest `BUILD` or `BUILD.plz` file.
   * If a `BUILD` file and `BUILD.plz` file both live in the same directory, the `BUILD` file path will
   * be returned.
   *
   * Dependency paths must be valid.
   * @param deps a list of dependency paths to use as a starting location
   * @returns a map of the nearest given dependencies to their nearest `BUILD` or `BUILD.plz` file
   */
  getNearestBuildFilePaths = (deps: string[]) => {
    const nearestBuildFilePaths: Record<string, string> = {};

    for (const dep of deps) {
      const buildFilePath = this.getNearestBuildFilePath(dep);

      if (buildFilePath) {
        nearestBuildFilePaths[dep] = buildFilePath;
      }
    }

    return nearestBuildFilePaths;
  };
}
