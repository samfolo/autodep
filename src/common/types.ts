import {SUPPORTED_MANAGED_BUILTINS, KNOWN_RULE_FIELD_NAMES, LOG_LEVELS} from './const';

export type KnownRuleFieldName = typeof KNOWN_RULE_FIELD_NAMES[number];

export type LogLevel = typeof LOG_LEVELS[number];

export type ManagedBuiltin = typeof SUPPORTED_MANAGED_BUILTINS[number];
export type ManagedSchemaFieldName = 'name' | 'srcs' | 'deps' | 'visibility' | 'testOnly';
export type ManagedSchemaFieldType = 'string' | 'array' | 'bool' | 'number' | 'glob';
export type ManagedSchemaFieldEntry<As extends ManagedSchemaFieldType = ManagedSchemaFieldType> = {
  value: string;
  as: As;
};

export type Paths = Record<string, string[]>;
export type ExcludeNodeModules = boolean;
export type EnablePropagation = boolean;

export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends object
    ? RecursivePartial<T[P]>
    : T[P];
};

export type TaskStatus = 'idle' | 'passthrough' | 'success' | 'failed' | 'processing' | 'partial-success';

export interface FileMatcherDeclaration {
  include: string[];
  exclude: string[];
}
