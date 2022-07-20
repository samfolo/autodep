export interface CollectDepsDirective {
  condition: boolean;
  collect: (content: string) => string[];
}

export interface ResolveAbsoluteImportPathsOptions {
  filePath: string;
  rootDir: string;
}
