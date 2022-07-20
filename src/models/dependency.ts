import path from 'path';

interface DependencyOptions {
  ruleName: string;
  buildFilePath: string;
  targetBuildFilePath: string;
  rootDirName: string;
}

interface ToBuildDepOptions {
  canonicalise?: boolean;
}

export class Dependency {
  private ruleName: string;
  private buildFilePath: string;
  private targetBuildFilePath: string;
  private rootDirName: string;

  constructor({ruleName, buildFilePath, targetBuildFilePath, rootDirName}: DependencyOptions) {
    this.ruleName = ruleName;
    this.buildFilePath = buildFilePath;
    this.targetBuildFilePath = targetBuildFilePath;
    this.rootDirName = rootDirName;
  }

  toBuildTarget = (options: ToBuildDepOptions = {}) => {
    const buildFileDirPath = path.dirname(this.buildFilePath);

    if (this.buildFilePath === this.targetBuildFilePath) {
      return `:${this.ruleName}`;
    }

    const buildDepPath = buildFileDirPath.substring(
      buildFileDirPath.indexOf(this.rootDirName) + this.rootDirName.length
    );

    if (!options.canonicalise && buildDepPath.endsWith(this.ruleName)) {
      return `/${buildDepPath}`;
    }

    return `/${buildDepPath}:${this.ruleName}`;
  };
}
