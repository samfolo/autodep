import {readFileSync} from 'fs';
import {createRequire} from 'node:module';
import path from 'path';

import {WorkspacePluginConfig} from '../../common/types';

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
  private config: WorkspacePluginConfig;

  constructor({filePath, rootDirName, config}: DeAliasingClientOptions) {
    this.filePath = filePath;
    this.rootDirName = rootDirName;
    this.config = config;

    const relativePathIndex = this.filePath.indexOf(this.rootDirName) + this.rootDirName.length;
    this.rootDirPath = this.filePath.substring(0, relativePathIndex);
    this.relativePath = this.filePath.substring(relativePathIndex + 1);

    try {
      const packageJSONString = readFileSync(`${this.rootDirPath}/package.json`);
      this.packageJSON = JSON.parse(packageJSONString.toString('utf-8'));
    } catch (error) {
      console.error('[DeAliasingClient::init]: An error occured trying to parse $ROOT_DIR/package.json: ', error);
      this.packageJSON = {};
    }

    this.packageNameCache = {};
    this.packageAliases = new Set();

    if (this.packageJSON?.workspaces?.packages) {
      for (const packageName of this.packageJSON.workspaces.packages) {
        try {
          const file = readFileSync(`${this.rootDirPath}/${packageName}/package.json`);
          const packageAlias: string = JSON.parse(file.toString('utf-8')).name;
          this.packageNameCache[packageAlias] = packageName;
          this.packageAliases.add(packageAlias);
        } catch (error) {
          console.error(`[DeAliasingClient::init]: Could not find package.json at ${this.rootDirPath}/${packageName}`);
        }
      }
    } else {
      console.info('[DeAliasingClient::init]: No package names found at [$ROOT_DIR/package.json].workspaces.packages');
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

    if (!path.isAbsolute(dep)) {
      for (const extension of supportedExtensions) {
        const pathWithExtension = dep + extension;
        try {
          const resolveAttempt = relativeRequire.resolve(pathWithExtension);
          return {result: resolveAttempt, method: 'local-module-resolution'};
        } catch (error) {
          console.info(
            `[DeAliasingClient::deAlias]: Tried and failed to resolve local module path: ${pathWithExtension} - continuing...`
          );
        }
        console.info(
          `[DeAliasingClient::deAlias]: Could not resolve path: ${dep} with local module resolution method - continuing...`
        );
      }
    }

    for (const alias of this.packageAliases) {
      if (dep.startsWith(alias)) {
        return {
          result: dep.replace(alias, this.packageNameCache[alias]),
          method: 'package-name-cache',
        };
      }
    }

    if (this.config.paths) {
      for (const [alias, pathOptions] of Object.entries(this.config.paths)) {
        const sanitisedAlias = alias.replace(/\*$/, '');

        if (dep.startsWith(sanitisedAlias)) {
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
                const resolveAttempt = relativeRequire.resolve(pathWithExtension);
                return {result: resolveAttempt, method: 'known-config-alias'};
              } catch (error) {
                console.info(
                  `[DeAliasingClient::deAlias]: Tried and failed to de-alias and resolve path: ${pathWithExtension} - continuing...`
                );
              }
            }
          }

          console.info(
            `[DeAliasingClient::deAlias]: Could not de-alias path: ${dep} with alias "${sanitisedAlias}" - continuing...`
          );
        }
      }
    }

    console.warn(`[DeAliasingClient::deAlias]: Could not de-alias path: ${dep} - leaving as-is`);
    return {result: dep, method: 'passthrough'};
  };
}
