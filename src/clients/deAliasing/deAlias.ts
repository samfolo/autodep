import {readFileSync} from 'fs';
import {createRequire} from 'node:module';
import path from 'path';

import {AutodepConfig} from '../../common/types';
import {Logger} from '../../logger/log';
import {Messages} from '../../messages/message';

import {PackageAlias, PackageName, DeAliasingClientOptions} from './types';

interface DeAliasResult {
  result: string;
  method: 'package-name-cache' | 'known-config-alias' | 'local-module-resolution' | 'passthrough';
}

export class DeAliasingClient {
  private filePath: string;
  private rootDirName: string;
  private rootDirPath: string;
  private relativePath: string;
  private packageJSON: Record<string, any>;
  private packageNameCache: Record<PackageAlias, PackageName>;
  private packageAliases: Set<PackageAlias>;
  private config: AutodepConfig;
  private _logger: Logger;

  constructor({filePath, rootDirName, config}: DeAliasingClientOptions) {
    this.filePath = filePath;
    this.rootDirName = rootDirName;
    this.config = config;
    this._logger = new Logger({namespace: 'DeAliasingClient', config: this.config});

    const relativePathIndex = this.filePath.indexOf(this.rootDirName) + this.rootDirName.length;
    this.rootDirPath = this.filePath.substring(0, relativePathIndex);
    this.relativePath = this.filePath.substring(relativePathIndex + 1);

    try {
      this._logger.trace({ctx: 'init', message: Messages.parse.attempt(`${this.rootDirPath}/package.json`)});
      const packageJSONString = readFileSync(`${this.rootDirPath}/package.json`);
      this.packageJSON = JSON.parse(packageJSONString.toString('utf-8'));
      this._logger.trace({
        ctx: 'init',
        message: Messages.parse.success(`${this.rootDirPath}/package.json`),
        details: JSON.stringify(this.packageJSON, null, 2),
      });
    } catch (error) {
      this._logger.error({
        ctx: 'init',
        message: Messages.parse.failure(`${this.rootDirPath}/package.json`),
        details: error,
      });
      this.packageJSON = {};
    }

    this.packageNameCache = {};
    this.packageAliases = new Set();

    if (this.packageJSON?.workspaces?.packages) {
      for (const packageName of this.packageJSON.workspaces.packages) {
        try {
          this._logger.trace({
            ctx: 'init',
            message: Messages.resolve.attempt(`${this.rootDirPath}/${packageName}/package.json`, 'package alias'),
          });
          const file = readFileSync(`${this.rootDirPath}/${packageName}/package.json`);
          const packageAlias: string = JSON.parse(file.toString('utf-8')).name;
          this.packageNameCache[packageAlias] = packageName;
          this.packageAliases.add(packageAlias);
          this._logger.trace({
            ctx: 'init',
            message: Messages.resolve.success(`${this.rootDirPath}/${packageName}/package.json`, 'package alias'),
          });
        } catch (error) {
          this._logger.error({
            ctx: 'init',
            message: Messages.resolve.failure(`${this.rootDirPath}/${packageName}/package.json`, 'package alias'),
            details: error,
          });
        }
      }
    } else {
      this._logger.info({
        ctx: 'init',
        message: Messages.failure(`package names at [${this.rootDirPath}/package.json].workspaces.packages`, 'find'),
      });
    }
  }

  get packageNames(): string[] {
    return this.packageJSON?.workspaces?.packages ?? [];
  }

  get cache(): Record<PackageAlias, PackageName> {
    return this.packageNameCache;
  }

  get aliases(): Set<PackageAlias> {
    return this.packageAliases;
  }

  deAlias = (dep: string, supportedExtensions: string[]): DeAliasResult => {
    const relativeRequire = createRequire(this.filePath);

    if (path.isAbsolute(dep)) {
      this._logger.trace({ctx: 'deAlias', message: Messages.identified('an absolute path', dep)});
    } else {
      for (const extension of supportedExtensions) {
        const pathWithExtension = dep + extension;
        try {
          this._logger.trace({
            ctx: 'deAlias',
            message: Messages.resolve.attempt(pathWithExtension, 'local module'),
          });
          const resolveAttempt = relativeRequire.resolve(pathWithExtension);
          const result: DeAliasResult = {result: resolveAttempt, method: 'local-module-resolution'};
          this._logger.trace({
            ctx: 'deAlias',
            message: Messages.resolve.success(pathWithExtension, 'local module'),
            details: JSON.stringify(result, null, 2),
          });

          return result;
        } catch (error) {
          this._logger.trace({
            ctx: 'deAlias',
            message: Messages.resolve.failure(pathWithExtension, 'local module') + ' - continuing...',
          });
        }
      }
    }

    for (const alias of this.packageAliases) {
      if (dep.startsWith(alias)) {
        const result: DeAliasResult = {
          result: dep.replace(alias, this.packageNameCache[alias]),
          method: 'package-name-cache',
        };
        this._logger.trace({
          ctx: 'deAlias',
          message: Messages.identified('a workspace-defined aliased path', dep),
          details: JSON.stringify(result, null, 2),
        });
        this._logger.trace({
          ctx: 'deAlias',
          message: Messages.success('de-aliased', dep),
        });

        return result;
      }
    }

    if (this.config.paths) {
      for (const [alias, pathOptions] of Object.entries(this.config.paths)) {
        const sanitisedAlias = alias.replace(/\*$/, '');

        if (dep.startsWith(sanitisedAlias)) {
          this._logger.trace({ctx: 'deAlias', message: Messages.identified('a user-defined aliased path', dep)});
          this._logger.trace({
            ctx: 'deAlias',
            message: Messages.attempt('de-alias', dep),
          });
          for (const pathOption of pathOptions) {
            const sanitisedPathOption = pathOption.replace(/\*$/, '');
            const deAliasedDep = dep.replace(sanitisedAlias, sanitisedPathOption);
            const pathToAttempt = path.relative(
              path.resolve(this.rootDirPath, path.dirname(this.relativePath)),
              path.resolve(this.rootDirPath, deAliasedDep)
            );

            for (const extension of supportedExtensions) {
              const pathWithExtension = pathToAttempt + extension;
              try {
                this._logger.trace({ctx: 'deAlias', message: Messages.resolve.attempt(pathWithExtension, 'module')});
                const resolveAttempt = relativeRequire.resolve(pathWithExtension);
                const result: DeAliasResult = {result: resolveAttempt, method: 'known-config-alias'};
                this._logger.trace({
                  ctx: 'deAlias',
                  message: Messages.resolve.success(pathWithExtension, 'module'),
                  details: JSON.stringify(result, null, 2),
                });

                return result;
              } catch (error) {
                this._logger.trace({
                  ctx: 'deAlias',
                  message: Messages.resolve.failure(pathWithExtension, 'module') + ' - continuing...',
                });
              }
            }
          }

          this._logger.trace({
            ctx: 'deAlias',
            message: Messages.failure('de-alias', `${dep} with alias "${sanitisedAlias}"`) + ' - continuing...',
          });
        }
      }
    }

    const result: DeAliasResult = {result: dep, method: 'passthrough'};
    this._logger.trace({
      ctx: 'deAlias',
      message: Messages.failure('de-alias', dep) + ' - leaving as-is.',
      details: JSON.stringify(result, null, 2),
    });

    return result;
  };
}
