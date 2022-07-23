import {SUPPORTED_MANAGED_BUILTINS, KNOWN_RULE_FIELD_NAMES, LOG_LEVELS} from './const';

export type KnownRuleFieldName = typeof KNOWN_RULE_FIELD_NAMES[number];

export type LogLevel = typeof LOG_LEVELS[number];

export type ManagedBuiltin = typeof SUPPORTED_MANAGED_BUILTINS[number];
export type ManagedSchemaField = 'name' | 'srcs' | 'deps' | 'visibility' | 'testOnly';
export type ManagedSchemaFieldType = 'string' | 'array' | 'bool' | 'number';
export type ManagedSchemaFieldEntry = {value: string; as: ManagedSchemaFieldType};

export interface AutodepConfigInput {
  manage?: {
    rules?: string[];
    fields?: string[];
    schema?: Record<string, Partial<Record<ManagedSchemaField, (string | ManagedSchemaFieldEntry)[]>>>;
  };
  match?: {
    module?: string | string[];
    test?: string | string[];
  };
  log?: LogLevel[];
  paths?: Record<string, string[]>;
  excludeNodeModules?: boolean;
  enablePropagation?: boolean;
  onCreate?: {
    name?: string;
    fileHeading?: string;
    explicitDeps?: boolean;
    omitEmptyFields?: boolean;
    initialVisibility?: string[];
    fileExtname?: string;
    subinclude?: string[];
    testOnly?: boolean;
    module?: {
      name?: string;
      fileHeading?: string;
      explicitDeps?: boolean;
      omitEmptyFields?: boolean;
      initialVisibility?: string[];
      subinclude?: string[];
      testOnly?: boolean;
    };
    test?: {
      name?: string;
      fileHeading?: string;
      explicitDeps?: boolean;
      omitEmptyFields?: boolean;
      subinclude?: string[];
    };
  };
  onUpdate?: {
    fileHeading?: string;
    omitEmptyFields?: boolean;
    subinclude?: string[];
    module?: {
      fileHeading?: string;
      omitEmptyFields?: boolean;
      subinclude?: string[];
    };
    test?: {
      fileHeading?: string;
      omitEmptyFields?: boolean;
      subinclude?: string[];
    };
  };
}

export interface AutoDepConfig {
  manage: {
    rules: Set<string>;
    fields: Set<string>;
    schema: Record<string, Record<ManagedSchemaField, Set<ManagedSchemaFieldEntry>>>;
  };
  match: {
    module: RegExp | Set<string>;
    isModule: (filePath: string) => boolean;
    test: RegExp | Set<string>;
    isTest: (filePath: string) => boolean;
  };
  log: Set<LogLevel>;
  paths: Record<string, string[]>;
  excludeNodeModules: boolean;
  enablePropagation: boolean;
  onCreate: {
    fileExtname: string;
    module: {
      name: string;
      fileHeading: string;
      explicitDeps: boolean;
      omitEmptyFields: boolean;
      initialVisibility: readonly string[] | null;
      subinclude: string[] | null;
      testOnly: boolean | null;
    };
    test: {
      name: string;
      fileHeading: string;
      explicitDeps: boolean;
      omitEmptyFields: boolean;
      subinclude: string[] | null;
    };
  };
  onUpdate: {
    module: {
      fileHeading: string;
      omitEmptyFields: boolean;
      subinclude: string[] | null;
    };
    test: {
      fileHeading: string;
      omitEmptyFields: boolean;
      subinclude: string[] | null;
    };
  };
  toString: () => string;
}
