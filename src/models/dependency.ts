import path from 'path';

import {AutoDepConfig} from '../config/types';
import {AutoDepBase} from '../inheritance/base';

interface DependencyOptions {
  ruleName: string;
  buildFilePath: string;
  targetBuildFilePath: string;
  rootDirName: string;
  config: AutoDepConfig.Output.Schema;
}

interface ToBuildDepOptions {
  canonicalise?: boolean;
}

export class Dependency extends AutoDepBase {
  private _buildFilePath: string;
  private _rootDirName: string;
  private _ruleName: string;
  private _targetBuildFilePath: string;

  constructor({config, buildFilePath, rootDirName, ruleName, targetBuildFilePath}: DependencyOptions) {
    super({config, name: 'Dependency'});

    this._buildFilePath = buildFilePath;
    this._rootDirName = rootDirName;
    this._ruleName = ruleName;
    this._targetBuildFilePath = targetBuildFilePath;
  }

  toBuildTarget = (options: ToBuildDepOptions = {}) => {
    const buildFileDirPath = path.dirname(this._buildFilePath);

    if (this._buildFilePath === this._targetBuildFilePath) {
      return `:${this._ruleName}`;
    }

    const buildDepPath = buildFileDirPath.substring(
      buildFileDirPath.indexOf(this._rootDirName) + this._rootDirName.length
    );

    if (!options.canonicalise && buildDepPath.endsWith(this._ruleName)) {
      return `/${buildDepPath}`;
    }

    return `/${buildDepPath}:${this._ruleName}`;
  };
}
