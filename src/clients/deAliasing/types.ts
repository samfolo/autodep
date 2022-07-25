import type {AutoDepConfig} from '../../config/types';

export interface DeAliasingClientOptions {
  filePath: string;
  rootDirName: string;
  config: AutoDepConfig.Output.Schema;
}

export type PackageAlias = string;
export type PackageName = string;
