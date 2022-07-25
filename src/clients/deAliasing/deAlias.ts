import {readFileSync} from 'fs';
import {createRequire} from 'node:module';
import path from 'path';

import {AutoDepBase} from '../../inheritance/base';
import {TaskMessages} from '../../messages';

import {PackageAlias, PackageName, DeAliasingClientOptions} from './types';

interface DeAliasResult {
  output: string;
  method: 'package-name-cache' | 'known-config-alias' | 'local-module-resolution' | 'passthrough';
}

export class DeAliasingClient extends AutoDepBase {
  private _filePath: string;
  private _rootDirName: string;
  private _rootDirPath: string;
  private _relativePath: string;
  private _packageJSON: Record<string, any>;
  private _packageNameCache: Record<PackageAlias, PackageName>;
  private _packageAliases: Set<PackageAlias>;

  constructor({filePath, rootDirName, config}: DeAliasingClientOptions) {
    super({config, name: 'DeAliasingClient'});

    this._filePath = filePath;
    this._rootDirName = rootDirName;

    const relativePathIndex = this._filePath.indexOf(this._rootDirName) + this._rootDirName.length;
    this._rootDirPath = this._filePath.substring(0, relativePathIndex);
    this._relativePath = this._filePath.substring(relativePathIndex + 1);

    try {
      this._logger.trace({ctx: 'init', message: TaskMessages.parse.attempt(`${this._rootDirPath}/package.json`)});
      const packageJSONString = readFileSync(`${this._rootDirPath}/package.json`);
      this._packageJSON = JSON.parse(packageJSONString.toString('utf-8'));
      this._logger.trace({
        ctx: 'init',
        message: TaskMessages.parse.success(`${this._rootDirPath}/package.json`),
        details: JSON.stringify(this._packageJSON, null, 2),
      });
    } catch (error) {
      this._logger.error({
        ctx: 'init',
        message: TaskMessages.parse.failure(`${this._rootDirPath}/package.json`),
        details: JSON.stringify(error, null, 2),
      });
      this._packageJSON = {};
    }

    this._packageNameCache = {};
    this._packageAliases = new Set();

    if (this._packageJSON?.workspaces?.packages) {
      for (const packageName of this._packageJSON.workspaces.packages) {
        try {
          this._logger.trace({
            ctx: 'init',
            message: TaskMessages.resolve.attempt(`${this._rootDirPath}/${packageName}/package.json`, 'package alias'),
          });
          const file = readFileSync(`${this._rootDirPath}/${packageName}/package.json`);
          const packageAlias: string = JSON.parse(file.toString('utf-8')).name;
          this._packageNameCache[packageAlias] = packageName;
          this._packageAliases.add(packageAlias);
          this._logger.trace({
            ctx: 'init',
            message: TaskMessages.resolve.success(
              `${this._rootDirPath}/${packageName}/package.json`,
              `package alias "${packageAlias}"`
            ),
          });
        } catch (error) {
          this._logger.error({
            ctx: 'init',
            message: TaskMessages.resolve.failure(`${this._rootDirPath}/${packageName}/package.json`, 'package alias'),
            details: JSON.stringify(error, null, 2),
          });
        }
      }
    } else {
      this._logger.info({
        ctx: 'init',
        message: TaskMessages.failure(
          `package names at [${this._rootDirPath}/package.json].workspaces.packages`,
          'find'
        ),
      });
    }
  }

  get packageNames(): string[] {
    return this._packageJSON?.workspaces?.packages ?? [];
  }

  get cache(): Record<PackageAlias, PackageName> {
    return this._packageNameCache;
  }

  get aliases(): Set<PackageAlias> {
    return this._packageAliases;
  }

  deAlias = (dep: string, supportedExtensions: string[]): DeAliasResult => {
    const relativeRequire = createRequire(this._filePath);

    if (path.isAbsolute(dep)) {
      this._logger.trace({ctx: 'deAlias', message: TaskMessages.identified('an absolute path', dep)});
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
        const result: DeAliasResult = {
          output: dep.replace(alias, this._packageNameCache[alias]),
          method: 'package-name-cache',
        };
        this._logger.trace({
          ctx: 'deAlias',
          message: TaskMessages.identified('a workspace-defined aliased path', dep),
          details: JSON.stringify(result, null, 2),
        });
        this._logger.trace({
          ctx: 'deAlias',
          message: TaskMessages.success('de-aliased', dep),
        });

        return result;
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
              path.resolve(this._rootDirPath, deAliasedDep)
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

    const result: DeAliasResult = {output: dep, method: 'passthrough'};
    this._logger.trace({
      ctx: 'deAlias',
      message: TaskMessages.failure('de-alias', dep) + ' - leaving as-is.',
      details: JSON.stringify(result, null, 2),
    });

    return result;
  };
}
