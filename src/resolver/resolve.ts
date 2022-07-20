import * as path from 'path';
import {readFileSync} from 'fs';
import precinct from 'precinct';
import {createRequire} from 'node:module';
import {parse} from 'yaml';

import {DeAliasingClient} from '../clients/deAliasing/deAlias';
import {createConfig} from '../common/config';
import {SUPPORTED_MODULE_EXTENSIONS} from '../common/const';
import {WorkspacePluginConfig, WorkspacePluginConfigInput} from '../common/types';

import {CollectDepsDirective, ResolveAbsoluteImportPathsOptions} from './types';
import {Tokeniser} from '../language/tokeniser/tokenise';
import {Parser} from '../language/parser/parse';
import {BuildRuleNameVisitor} from '../visitor/ruleName';

export class DependencyResolver {
  private _config: WorkspacePluginConfig;

  constructor(config: WorkspacePluginConfig) {
    this._config = config;
  }

  get config(): WorkspacePluginConfig {
    return Object.seal(this._config);
  }

  loadConfigFromWorkspace = (rootPath: string) => {
    const configPath = this.findFirstValidPath(rootPath, this.generateRequirePaths(rootPath, ['.autodep.yaml']));
    if (configPath) {
      try {
        const configInputFile = readFileSync(configPath, {
          encoding: 'utf-8',
          flag: 'r',
        });
        const configInput: WorkspacePluginConfigInput = parse(configInputFile);
        console.log(configInput);
        this._config = createConfig(configInput);
        return this._config;
      } catch (error) {
        console.warn(
          `[DependencyResolver::loadConfigFromWorkspace]: could not resolve config file at ${configPath}: ${error}`
        );
      }
    }

    this._config = createConfig();
    return this._config;
  };

  /**
   * Returns a unique set of import paths present at a given node module file path
   * @param options
   * @param options.filePath the given file path (with file extension)
   * @param options.rootDir the name of the root directory, used to resolve the rest of the path for all imports
   * @returns a list of absolute import paths
   */
  resolveAbsoluteImportPaths = ({filePath, rootDir}: ResolveAbsoluteImportPathsOptions) => {
    const relativeRequire = createRequire(filePath);
    const deAliasingClient = new DeAliasingClient({
      filePath,
      rootDirName: rootDir,
      config: this.config,
    });
    const fileContent = readFileSync(filePath, {
      encoding: 'utf-8',
      flag: 'r',
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

    const uniqueDeps = deps.reduce<string[]>((acc, dep) => {
      const deAliasedDep = deAliasingClient.deAlias(dep, SUPPORTED_MODULE_EXTENSIONS);

      switch (deAliasedDep.method) {
        case 'package-name-cache':
        case 'known-config-alias':
        case 'local-module-resolution':
          acc.push(deAliasedDep.result);
          return acc;
        case 'passthrough':
        default:
          break;
      }

      console.error(`[DependencyResolver::resolveAbsoluteImportPaths]: Could not resolve dep: ${dep}`);
      return acc;
    }, []);

    if (this.config.excludeNodeModules) {
      return uniqueDeps.filter((dep) => !dep.includes('node_modules'));
    }

    return uniqueDeps;
  };

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
   * Takes a given root path and attempts to `require.resolve()` with each given path
   * If it does not successfully resolve any given path, it returns `null`
   * @param rootPath the given require root path
   * @param filePaths a list of paths to attempt
   * @returns the first valid path of the given paths, or null
   */
  findFirstValidPath = (rootPath: string, filePaths: string[]) => {
    const relativeRequire = createRequire(rootPath);

    for (const path of filePaths) {
      try {
        const targetBuildFile = relativeRequire.resolve(path);
        return targetBuildFile;
      } catch (error) {
        console.info(`[DependencyResolver::findFirstValidPath]: file ${path} does not exist - bubbling up...`);
      }
    }

    console.error(`[DependencyResolver::findFirstValidPath]: No valid path found for root: ${rootPath}`);
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

  getBuildRuleName = (dep: string, buildFilePath: string) => {
    try {
      const buildFile = readFileSync(buildFilePath, 'utf-8');

      const tokeniser = new Tokeniser(buildFile, this.config);
      const tokens = tokeniser.tokenise();

      const parser = new Parser(tokens);
      const ast = parser.parse();

      const fileName = path.basename(dep);
      const ruleNameVisitor = new BuildRuleNameVisitor(fileName);
      ruleNameVisitor.visit(ast);

      return ruleNameVisitor.ruleName;
    } catch (error) {
      console.error('[DependencyResolver::getBuildRuleName]: ', error);
      return null;
    }
  };
}
