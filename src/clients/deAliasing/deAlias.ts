import {readFileSync} from 'fs';
import {createRequire, builtinModules} from 'node:module';
import path from 'path';

import {AutoDepBase} from '../../inheritance/base';
import {TaskMessages} from '../../messages';

import {PackageAlias, PackageName, DeAliasingClientOptions} from './types';

interface DeAliasResult {
  output: string;
  method:
    | 'package-name-cache'
    | 'known-config-alias'
    | 'local-module-resolution'
    | 'third-party'
    | 'core-module'
    | 'passthrough';
}

export class DeAliasingClient extends AutoDepBase {
  private _filePath: string;
  private _rootDirName: string;
  private _rootDirPath: string;
  private _relativePath: string;
  private _packageNameMap: Record<PackageAlias, PackageName>;
  private _packageAliases: Set<PackageAlias>;

  constructor({filePath, rootDirName, config}: DeAliasingClientOptions) {
    super({config, name: 'DeAliasingClient'});

    this._filePath = filePath;
    this._rootDirName = rootDirName;

    const relativePathIndex = this._filePath.indexOf(this._rootDirName) + this._rootDirName.length;
    this._rootDirPath = this._filePath.substring(0, relativePathIndex);
    this._relativePath = this._filePath.substring(relativePathIndex + 1);

    const {aliases, map} = this.getPackageNameLookup(this._rootDirPath);
    this._packageNameMap = map;
    this._packageAliases = aliases;
  }

  deAlias = (dep: string, supportedExtensions: string[]): DeAliasResult => {
    const cachedResult = this.getCachedProcessingResultIfExists(dep);
    if (cachedResult) {
      return cachedResult;
    }

    const relativeRequire = createRequire(this._filePath);

    if (this.isCoreModule(dep)) {
      this._logger.trace({
        ctx: 'deAlias',
        message: TaskMessages.resolve.attempt(dep, 'core module'),
      });
      const resolveAttempt = relativeRequire.resolve(dep);
      const result: DeAliasResult = {output: resolveAttempt, method: 'core-module'};
      this._logger.trace({
        ctx: 'deAlias',
        message: TaskMessages.resolve.success(dep, 'core module'),
        details: JSON.stringify(result, null, 2),
      });

      this.addDeAliasingResultToCache(dep, result);
      return result;
    } else if (!this.isRelative(dep)) {
      this._logger.trace({ctx: 'deAlias', message: TaskMessages.identify.failure('a relative path', dep)});
    } else {
      for (const extension of supportedExtensions) {
        const pathWithExtension = dep + extension;
        try {
          this._logger.trace({
            ctx: 'deAlias',
            message: TaskMessages.resolve.attempt(pathWithExtension, 'local module'),
          });
          const resolveAttempt = relativeRequire.resolve(pathWithExtension);
          const result: DeAliasResult = {output: resolveAttempt, method: 'local-module-resolution'};
          this._logger.trace({
            ctx: 'deAlias',
            message: TaskMessages.resolve.success(pathWithExtension, 'local module'),
            details: JSON.stringify(result, null, 2),
          });

          this.addDeAliasingResultToCache(dep, result);
          return result;
        } catch (error) {
          this._logger.trace({
            ctx: 'deAlias',
            message: TaskMessages.resolve.failure(pathWithExtension, 'local module') + ' - continuing...',
          });
        }
      }
    }

    for (const alias of this._packageAliases) {
      if (dep.startsWith(alias)) {
        this._logger.trace({
          ctx: 'deAlias',
          message: TaskMessages.identified('a workspace-defined aliased path', dep),
        });
        const deAliasedDep = dep.replace(alias, this._packageNameMap[alias]);
        const pathToAttempt = path.resolve(this._rootDirPath, deAliasedDep);

        for (const extension of supportedExtensions) {
          const pathWithExtension = pathToAttempt + extension;
          try {
            this._logger.trace({
              ctx: 'deAlias',
              message: TaskMessages.resolve.attempt(pathWithExtension, 'module'),
            });
            const resolveAttempt = relativeRequire.resolve(pathWithExtension);
            const result: DeAliasResult = {output: resolveAttempt, method: 'package-name-cache'};
            this._logger.trace({
              ctx: 'deAlias',
              message: TaskMessages.resolve.success(pathWithExtension, 'module'),
              details: JSON.stringify(result, null, 2),
            });

            this.addDeAliasingResultToCache(dep, result);
            return result;
          } catch (error) {
            this._logger.trace({
              ctx: 'deAlias',
              message: TaskMessages.resolve.failure(pathWithExtension, 'module') + ' - continuing...',
            });
          }
        }
      }
    }

    if (this._config.paths) {
      for (const [alias, pathOptions] of Object.entries(this._config.paths)) {
        const sanitisedAlias = alias.replace(/\*$/, '');

        if (dep.startsWith(sanitisedAlias)) {
          this._logger.trace({ctx: 'deAlias', message: TaskMessages.identified('a user-defined aliased path', dep)});
          this._logger.trace({
            ctx: 'deAlias',
            message: TaskMessages.attempt('de-alias', dep),
          });
          for (const pathOption of pathOptions) {
            const sanitisedPathOption = pathOption.replace(/\*$/, '');
            const deAliasedDep = dep.replace(sanitisedAlias, sanitisedPathOption);
            const pathToAttempt = path.relative(
              path.resolve(this._rootDirPath, path.dirname(this._relativePath)),
              path.resolve(this._config._tsCompilerOptions.baseUrl ?? '.', deAliasedDep)
            );

            for (const extension of supportedExtensions) {
              const pathWithExtension = pathToAttempt + extension;
              try {
                this._logger.trace({
                  ctx: 'deAlias',
                  message: TaskMessages.resolve.attempt(pathWithExtension, 'module'),
                });
                const resolveAttempt = relativeRequire.resolve(pathWithExtension);
                const result: DeAliasResult = {output: resolveAttempt, method: 'known-config-alias'};
                this._logger.trace({
                  ctx: 'deAlias',
                  message: TaskMessages.resolve.success(pathWithExtension, 'module'),
                  details: JSON.stringify(result, null, 2),
                });

                this.addDeAliasingResultToCache(dep, result);
                return result;
              } catch (error) {
                this._logger.trace({
                  ctx: 'deAlias',
                  message: TaskMessages.resolve.failure(pathWithExtension, 'module') + ' - continuing...',
                });
              }
            }
          }

          this._logger.trace({
            ctx: 'deAlias',
            message: TaskMessages.failure('de-alias', `${dep} with alias "${sanitisedAlias}"`) + ' - continuing...',
          });
        }
      }
    }

    try {
      const result: DeAliasResult = {
        output: relativeRequire.resolve(dep),
        method: 'third-party',
      };
      this._logger.trace({
        ctx: 'deAlias',
        message: TaskMessages.identified('a third-party import', dep),
        details: JSON.stringify(result, null, 2),
      });
      this.addDeAliasingResultToCache(dep, result);
      return result;
    } catch {
      const result: DeAliasResult = {output: dep, method: 'passthrough'};
      this._logger.trace({
        ctx: 'deAlias',
        message: TaskMessages.failure('de-alias', dep) + ' - leaving as-is.',
        details: JSON.stringify(result, null, 2),
      });
      this.addDeAliasingResultToCache(dep, result);
      return result;
    }
  };

  private isRelative = (path: string) => ['/', './', '../'].some((start) => path.startsWith(start));
  private isCoreModule = (path: string) => DeAliasingClient.coreModules.has(path);

  /**
   * Returns a boolean indicating whether there is already a cached result for the
   * given dependency in juxtaposition to the importing file's directory path.
   * Results are cached against the directory path, as the import paths of sibling
   * files importing the same dependencies will be identical:
   *
   * ```typescript
   * // file path/to/a.ts
   * import dep from '../../same/place'
   *
   * // file path/to/b.ts
   * import dep from '../../same/place'
   * ```
   *
   * @param dep the target dependency to query a cached result for
   * @returns a boolean indicating the presence of an existing cached result
   */
  private getCachedProcessingResultIfExists = (dep: string): DeAliasResult | null => {
    const fileDirPath = path.dirname(this._filePath);
    const result = DeAliasingClient.deAliasingCache[fileDirPath]?.[dep] ?? null;

    if (result) {
      this._logger.trace({
        ctx: 'getCachedProcessingResultIfExists',
        message: TaskMessages.using(`cached value for ${dep}`),
        details: JSON.stringify(result, null, 2),
      });
    }

    return result;
  };

  /**
   * Adds the result of a de-aliasing attempt to a singleton cache instance defined
   * within the class.  Results are cached against the directory path, as the import
   * paths of sibling files importing the same dependencies will be identical:
   *
   * ```typescript
   * // file path/to/a.ts
   * import dep from '../../same/place'
   *
   * // file path/to/b.ts
   * import dep from '../../same/place'
   * ```
   *
   * @param dep the absolute path processed by the de-aliasing client
   * @param result the result of processing
   * @returns `true` - to confirm the result has been cached.  Caching cannot fail.
   */
  private addDeAliasingResultToCache = (dep: string, result: DeAliasResult) => {
    const fileDirPath = path.dirname(this._filePath);
    if (!DeAliasingClient.deAliasingCache[fileDirPath]) {
      DeAliasingClient.deAliasingCache[fileDirPath] = {};
    }

    DeAliasingClient.deAliasingCache[fileDirPath][dep] = result;
    this._logger.trace({
      ctx: 'addDeAliasingResultToCache',
      message: TaskMessages.success('cached', `result for ${dep}`),
    });
    return true;
  };

  private getPackageNameLookup = (rootDirPath: string) => {
    if (DeAliasingClient.packageNameMapCache[rootDirPath]) {
      this._logger.trace({
        ctx: 'getPackageNameLookup',
        message: TaskMessages.using(`cached value of ${rootDirPath}/package.json`),
      });
      return DeAliasingClient.packageNameMapCache[rootDirPath];
    }

    let packageJSON: any;

    try {
      this._logger.trace({
        ctx: 'getPackageNameLookup',
        message: TaskMessages.parse.attempt(`${rootDirPath}/package.json`),
      });
      const packageJSONString = readFileSync(`${rootDirPath}/package.json`);
      packageJSON = JSON.parse(packageJSONString.toString('utf-8'));
      this._logger.trace({
        ctx: 'getPackageNameLookup',
        message: TaskMessages.parse.success(`${rootDirPath}/package.json`),
        details: JSON.stringify(packageJSON, null, 2),
      });
    } catch (error) {
      this._logger.error({
        ctx: 'getPackageNameLookup',
        message: TaskMessages.parse.failure(`${rootDirPath}/package.json`),
        details: JSON.stringify(error, null, 2),
      });
    }

    const packageAliases: Set<PackageAlias> = new Set<PackageAlias>();
    const packageNameMap: Record<PackageAlias, PackageName> = {};

    if (packageJSON?.workspaces?.packages) {
      const packageNames = new Set<string>(packageJSON.workspaces.packages);

      for (const packageName of packageNames) {
        try {
          this._logger.trace({
            ctx: 'getPackageNameLookup',
            message: TaskMessages.resolve.attempt(`${rootDirPath}/${packageName}/package.json`, 'package alias'),
          });
          const file = readFileSync(`${rootDirPath}/${packageName}/package.json`);
          const packageAlias: string = JSON.parse(file.toString('utf-8')).name;
          packageNameMap[packageAlias] = packageName;
          packageAliases.add(packageAlias);
          this._logger.trace({
            ctx: 'getPackageNameLookup',
            message: TaskMessages.resolve.success(
              `${rootDirPath}/${packageName}/package.json`,
              `package alias "${packageAlias}"`
            ),
          });
        } catch (error) {
          this._logger.error({
            ctx: 'getPackageNameLookup',
            message: TaskMessages.resolve.failure(`${rootDirPath}/${packageName}/package.json`, 'package alias'),
            details: JSON.stringify(error, null, 2),
          });
        }
      }
    } else {
      this._logger.info({
        ctx: 'getPackageNameLookup',
        message: TaskMessages.failure(`package names at [${rootDirPath}/package.json].workspaces.packages`, 'find'),
      });
    }

    this._logger.trace({
      ctx: 'getPackageNameLookup',
      message: TaskMessages.using('the following package name cache:'),
      details: JSON.stringify(packageNameMap, null, 2),
    });
    const result = {aliases: packageAliases, map: packageNameMap};
    DeAliasingClient.packageNameMapCache[rootDirPath] = result;
    return result;
  };

  private static coreModules = new Set(builtinModules);
  private static deAliasingCache: Record<string, Record<string, DeAliasResult>> = {};
  private static packageNameMapCache: Record<
    string,
    {map: Record<PackageAlias, PackageName>; aliases: Set<PackageAlias>}
  > = {};

  static readonly flushDeAliasingCache = () => {
    DeAliasingClient.deAliasingCache = {};
  };

  static readonly flushPackageNameMapCache = () => {
    DeAliasingClient.packageNameMapCache = {};
  };
}
