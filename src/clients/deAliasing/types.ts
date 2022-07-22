import {AutodepConfig} from '../../common/types';

export interface DeAliasingClientOptions {
  filePath: string;
  rootDirName: string;
  config: AutodepConfig;
}

export type PackageAlias = string;
export type PackageName = string;
