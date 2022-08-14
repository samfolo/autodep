/* eslint-disable @typescript-eslint/naming-convention */
import {ManagedBuiltin, ManagedSchemaFieldEntry, ManagedSchemaFieldType} from './types';

export const CONFIG_FILENAME = '.autodep.yaml';

export const SUPPORTED_MODULE_EXTENSIONS = [
  '',
  '.ts',
  '.d.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.d.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
  '/.scss',
  '/.css',
  '/.md',
];

type SupportedManagedSchemaFieldEntryKey = 'NAME' | 'SRCS' | 'DEPS' | 'VISIBILITY' | 'TEST_ONLY';

export const SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES: Record<
  SupportedManagedSchemaFieldEntryKey,
  ManagedSchemaFieldEntry
> = {
  NAME: {value: 'name', as: 'string'},
  SRCS: {value: 'srcs', as: 'array'},
  DEPS: {value: 'deps', as: 'array'},
  VISIBILITY: {value: 'visibility', as: 'array'},
  TEST_ONLY: {value: 'test_only', as: 'bool'},
};

export const SUPPORTED_MANAGED_BUILTINS = ['subinclude', 'glob'] as const;
export const SUPPORTED_MANAGED_BUILTINS_LOOKUP = Object.seal(
  SUPPORTED_MANAGED_BUILTINS.reduce<{[K in ManagedBuiltin]: K}>(
    (acc, builtin) => ({...acc, [builtin]: builtin}),
    {} as {[K in ManagedBuiltin]: K}
  )
);

export const DEFAULT_MODULE_FILENAME_MATCHER = new RegExp('.*?\\.(js|jsx|ts|tsx)$');
export const DEFAULT_FIXTURE_FILENAME_MATCHER = new RegExp('[]');
export const DEFAULT_TEST_FILENAME_MATCHER = new RegExp('.*?\\.(spec|test)\\.(js|jsx|ts|tsx)$');
export const DEFAULT_MODULE_RULE_NAME = 'filegroup';
export const DEFAULT_FIXTURE_RULE_NAME = 'filegroup';
export const DEFAULT_TEST_RULE_NAME = 'filegroup';
export const DEFAULT_INITIAL_VISIBILITY = ['PUBLIC'] as const;
export const DEFAULT_TARGET_FORMAT_STRING = '<filename>';

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;

export const DEFAULT_BINARY_OUT_DIR = 'plz-out/bin';
export const DEFAULT_NON_BINARY_OUT_DIR = 'plz-out/gen';

export const WHITESPACE_SIZE = 4;
