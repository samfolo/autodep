import typescript from 'typescript';
import {
  EnablePropagation,
  ExcludeNodeModules,
  LogLevel,
  ManagedSchemaFieldEntry,
  ManagedSchemaFieldName,
  Paths,
} from '../common/types';

export namespace AutoDepConfig {
  export namespace Input {
    export interface ManagedSchemaField extends Record<ManagedSchemaFieldName, (string | ManagedSchemaFieldEntry)[]> {
      name: (string | ManagedSchemaFieldEntry<'string'>)[];
      srcs: (string | ManagedSchemaFieldEntry<'string' | 'array' | 'glob'>)[];
      deps: (string | ManagedSchemaFieldEntry<'array'>)[];
      visibility: (string | ManagedSchemaFieldEntry<'string' | 'array'>)[];
      testOnly: (string | ManagedSchemaFieldEntry<'bool'>)[];
    }

    export type ManagedSchema = Record<string, Partial<ManagedSchemaField>>;

    export interface Manage {
      rules?: string[];
      fields?: string[];
      schema?: ManagedSchema;
    }

    export interface Match {
      module?: string | string[];
      test?: string | string[];
    }

    export interface GlobMatchers {
      include?: string[];
      exclude?: string[];
    }

    interface BaseEventFields {
      omitEmptyFields?: boolean;
      subinclude?: string[];
    }

    interface BaseOnCreateFields extends BaseEventFields {
      name?: string;
      explicitDeps?: boolean;
      globMatchers?: GlobMatchers;
    }
    interface BaseOnUpdateFields extends BaseEventFields {}

    interface ExtraOnCreateFields {
      initialVisibility?: string[];
      testOnly?: boolean;
    }

    export interface OnCreate extends BaseOnCreateFields, ExtraOnCreateFields {
      fileExtname?: string;
      fileHeading?: string;
      module?: BaseOnCreateFields & ExtraOnCreateFields;
      test?: BaseOnCreateFields;
    }

    export interface OnUpdate extends BaseEventFields {
      fileHeading?: string;
      module?: BaseOnUpdateFields;
      test?: BaseOnUpdateFields;
    }

    export type Log = LogLevel[];

    export interface Schema {
      rootDir: string;
      outDir: string;
      manage?: Manage;
      match?: Match;
      log?: Log;
      extends?: string;
      excludeNodeModules?: ExcludeNodeModules;
      enablePropagation?: EnablePropagation;
      onCreate?: OnCreate;
      onUpdate?: OnUpdate;
    }
  }

  export namespace Output {
    export type ManagedSchema = Record<string, Record<ManagedSchemaFieldName, Set<ManagedSchemaFieldEntry>>>;

    export interface Manage {
      rules: Set<string>;
      fields: Set<string>;
      schema: Record<string, Record<ManagedSchemaFieldName, Set<ManagedSchemaFieldEntry>>>;
    }

    export interface Match {
      module: RegExp | Set<string>;
      isModule: (filePath: string) => boolean;
      test: RegExp | Set<string>;
      isTest: (filePath: string) => boolean;
    }

    export interface GlobMatchers {
      include: string[];
      exclude: string[];
    }

    interface BaseEventFields {
      fileHeading: string;
      omitEmptyFields: boolean;
      subinclude: string[] | null;
    }

    interface BaseOnCreateFields extends BaseEventFields {
      name: string;
      explicitDeps: boolean;
      globMatchers: GlobMatchers;
    }
    interface BaseOnUpdateFields extends BaseEventFields {}
    interface ExtraOnCreateFields {
      initialVisibility: readonly string[] | null;
      testOnly: boolean | null;
    }

    export interface OnCreate {
      fileExtname: string;
      module: BaseOnCreateFields & ExtraOnCreateFields;
      test: BaseOnCreateFields;
    }

    export interface OnUpdate {
      module: BaseOnUpdateFields;
      test: BaseOnUpdateFields;
    }

    export type Log = Set<LogLevel>;

    export interface Schema {
      rootDir: string;
      outDir: string;
      manage: Manage;
      match: Match;
      log: Log;
      paths: Paths;
      excludeNodeModules: ExcludeNodeModules;
      enablePropagation: EnablePropagation;
      onCreate: OnCreate;
      onUpdate: OnUpdate;
      _tsCompilerOptions: typescript.CompilerOptions;
      toString: () => string;
    }
  }
}
