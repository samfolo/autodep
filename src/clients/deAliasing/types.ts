import {WorkspacePluginConfig} from '../../common/types';

export interface DeAliasingClientOptions {
  filePath: string;
  rootDirName: string;
  config: WorkspacePluginConfig;
}

export type PackageAlias = string;
export type PackageName = string;
