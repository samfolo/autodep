import type {AutoDepConfig} from '../../common/types';

export interface DeAliasingClientOptions {
  filePath: string;
  rootDirName: string;
  config: AutoDepConfig;
}

export type PackageAlias = string;
export type PackageName = string;
