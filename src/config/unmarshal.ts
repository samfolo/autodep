import path from 'node:path';
import {CompilerOptions} from 'typescript';
import {
  DEFAULT_INITIAL_VISIBILITY,
  SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES,
  DEFAULT_MODULE_FILENAME_MATCHER,
  DEFAULT_MODULE_RULE_NAME,
  DEFAULT_TEST_FILENAME_MATCHER,
  DEFAULT_TEST_RULE_NAME,
  DEFAULT_NON_BINARY_OUT_DIR,
  DEFAULT_TARGET_FORMAT_STRING,
  DEFAULT_FIXTURE_FILENAME_MATCHER,
  DEFAULT_FIXTURE_RULE_NAME,
} from '../common/const';
import {
  ManagedSchemaFieldEntry,
  ManagedSchemaFieldName,
  Paths,
  ExcludeNodeModules,
  EnablePropagation,
  RecursivePartial,
} from '../common/types';
import {AutoDepConfig} from '../config/types';

export class ConfigUmarshaller {
  unmarshal = (
    input?: AutoDepConfig.Input.Schema,
    tsCompilerOptions: CompilerOptions = {}
  ): AutoDepConfig.Output.Schema => ({
    rootDir: this.unmarshalStandardField('.', input?.rootDir),
    outDir: this.unmarshalStandardField(`${input?.rootDir || '.'}/${DEFAULT_NON_BINARY_OUT_DIR}`, input?.outDir),
    manage: this.unmarshalManage(input?.manage),
    match: this.unmarshalMatch(input?.match),
    log: this.unmarshalLogLevels(input?.log),
    paths: this.unmarshalPathsSection(tsCompilerOptions.paths),
    excludeNodeModules: this.unmarshalExcludeNodeModules(input?.excludeNodeModules),
    enablePropagation: this.unmarshalEnablePropagation(input?.enablePropagation),
    onCreate: this.unmarshalOnCreate(input?.onCreate),
    onUpdate: this.unmarshalOnUpdate(input?.onUpdate),
    ignore: this.unmarshalIgnore(input?.ignore),
    _tsCompilerOptions: tsCompilerOptions,
    toString: function () {
      return JSON.stringify(
        this,
        (_key, value) => {
          switch (true) {
            case value instanceof Set:
              return [...value];
            case value instanceof RegExp:
              return value.toString();
            default:
              return value;
          }
        },
        2
      );
    },
  });

  private unmarshalManage = (input?: RecursivePartial<AutoDepConfig.Input.Manage>): AutoDepConfig.Output.Manage => ({
    schema: this.unmarshalManagedSchema(input?.schema),
    knownTargets: input?.knownTargets ?? {},
  });

  private unmarshalManagedSchema = (
    input?: RecursivePartial<AutoDepConfig.Input.Manage['schema']>
  ): AutoDepConfig.Output.Manage['schema'] =>
    Object.entries(input ?? {}).reduce(
      (acc, [key, entry]) => ({
        ...acc,
        [key]: this.unmarshalManagedSchemaField(entry),
      }),
      {}
    );

  private unmarshalManagedSchemaField = (
    input?: RecursivePartial<AutoDepConfig.Input.ManagedSchema[string]>
  ): AutoDepConfig.Output.ManagedSchema[string] => ({
    name: this.unmarshalManagedSchemaFieldEntry(SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.NAME, input?.name),
    srcs: this.unmarshalManagedSchemaFieldEntry(SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.SRCS, input?.srcs),
    deps: this.unmarshalManagedSchemaFieldEntry(SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.DEPS, input?.deps),
    visibility: this.unmarshalManagedSchemaFieldEntry(
      SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.VISIBILITY,
      input?.visibility
    ),
    testOnly: this.unmarshalManagedSchemaFieldEntry(SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.TEST_ONLY, input?.testOnly),
  });

  private unmarshalManagedSchemaFieldEntry = (
    defaultValue: ManagedSchemaFieldEntry,
    input?: AutoDepConfig.Input.ManagedSchema[string][ManagedSchemaFieldName]
  ): AutoDepConfig.Output.ManagedSchema[string][ManagedSchemaFieldName] =>
    new Set(
      input?.length && input.length > 0
        ? input.map((el) => getManagedSchemaFieldEntry(el, defaultValue))
        : [defaultValue]
    );

  private unmarshalMatch = (input?: RecursivePartial<AutoDepConfig.Input.Match>): AutoDepConfig.Output.Match => ({
    module: this.unmarshalMatcher(DEFAULT_MODULE_FILENAME_MATCHER, input?.module),
    isModule: function (filePath: string) {
      return qualifyFilePath(this.module, filePath);
    },
    fixture: this.unmarshalMatcher(DEFAULT_FIXTURE_FILENAME_MATCHER, input?.fixture),
    isFixture: function (filePath: string) {
      return qualifyFilePath(this.fixture, filePath);
    },
    test: this.unmarshalMatcher(DEFAULT_TEST_FILENAME_MATCHER, input?.test),
    isTest: function (filePath: string) {
      return qualifyFilePath(this.test, filePath);
    },
  });

  private unmarshalMatcher = (
    defaultValue: RegExp,
    input?: AutoDepConfig.Input.Match['test']
  ): AutoDepConfig.Output.Match['test'] =>
    Array.isArray(input) ? new Set(input) : typeof input === 'string' ? new RegExp(input) : defaultValue;

  private unmarshalLogLevels = (input?: AutoDepConfig.Input.Log): AutoDepConfig.Output.Log => new Set(input);

  private unmarshalPathsSection = (input?: Paths): Paths => input ?? {};

  private unmarshalExcludeNodeModules = (input?: ExcludeNodeModules): ExcludeNodeModules => input ?? false;

  private unmarshalEnablePropagation = (input?: EnablePropagation): EnablePropagation => input ?? false;

  private unmarshalOnCreate = (
    input?: RecursivePartial<AutoDepConfig.Input.OnCreate>
  ): AutoDepConfig.Output.OnCreate => ({
    fileExtname: this.unmarshalFileExtname(input?.fileExtname),
    module: this.unmarshalOnCreateModule(input),
    fixture: this.unmarshalOnCreateFixture(input),
    test: this.unmarshalOnCreateTest(input),
  });

  private unmarshalFileExtname = (
    input?: AutoDepConfig.Input.OnCreate['fileExtname']
  ): AutoDepConfig.Output.OnCreate['fileExtname'] => input ?? '';

  private unmarshalOnCreateModule = (
    input?: RecursivePartial<AutoDepConfig.Input.OnCreate>
  ): AutoDepConfig.Output.OnCreate['module'] => ({
    name: this.unmarshalStandardField(DEFAULT_MODULE_RULE_NAME, input?.module?.name ?? input?.name),
    formatTarget: (targetPath) =>
      formatTarget(targetPath, input?.module?.targetFormat ?? input?.targetFormat ?? DEFAULT_TARGET_FORMAT_STRING),
    fileHeading: this.unmarshalStandardField('', input?.fileHeading),
    explicitDeps: this.unmarshalStandardField(true, input?.module?.explicitDeps ?? input?.explicitDeps),
    globMatchers: this.unmarshalOnCreateModuleGlobMatchers(input),
    omitEmptyFields: this.unmarshalStandardField(false, input?.module?.omitEmptyFields ?? input?.omitEmptyFields),
    subinclude: this.unmarshalNullableField(input?.module?.subinclude ?? input?.subinclude),
    testOnly: this.unmarshalNullableField(input?.module?.testOnly ?? input?.testOnly),
    initialVisibility: this.unmarshalInitialVisibility(
      DEFAULT_INITIAL_VISIBILITY,
      input?.module?.initialVisibility ?? input?.initialVisibility
    ),
  });

  private unmarshalOnCreateFixture = (
    input?: RecursivePartial<AutoDepConfig.Input.OnCreate>
  ): AutoDepConfig.Output.OnCreate['fixture'] => ({
    name: this.unmarshalStandardField(DEFAULT_FIXTURE_RULE_NAME, input?.fixture?.name ?? input?.name),
    formatTarget: (targetPath) =>
      formatTarget(targetPath, input?.fixture?.targetFormat ?? input?.targetFormat ?? DEFAULT_TARGET_FORMAT_STRING),
    fileHeading: this.unmarshalStandardField('', input?.fileHeading),
    explicitDeps: this.unmarshalStandardField(true, input?.fixture?.explicitDeps ?? input?.explicitDeps),
    globMatchers: this.unmarshalOnCreateFixtureGlobMatchers(input),
    omitEmptyFields: this.unmarshalStandardField(false, input?.fixture?.omitEmptyFields ?? input?.omitEmptyFields),
    subinclude: this.unmarshalNullableField(input?.fixture?.subinclude ?? input?.subinclude),
    testOnly: this.unmarshalNullableField(input?.fixture?.testOnly ?? input?.testOnly),
    initialVisibility: this.unmarshalInitialVisibility(
      DEFAULT_INITIAL_VISIBILITY,
      input?.fixture?.initialVisibility ?? input?.initialVisibility
    ),
  });

  private unmarshalOnCreateTest = (
    input?: RecursivePartial<AutoDepConfig.Input.OnCreate>
  ): AutoDepConfig.Output.OnCreate['test'] => ({
    name: this.unmarshalStandardField(DEFAULT_TEST_RULE_NAME, input?.test?.name ?? input?.name),
    formatTarget: (targetPath) =>
      formatTarget(targetPath, input?.test?.targetFormat ?? input?.targetFormat ?? DEFAULT_TARGET_FORMAT_STRING),
    fileHeading: this.unmarshalStandardField('', input?.fileHeading),
    explicitDeps: this.unmarshalStandardField(true, input?.test?.explicitDeps ?? input?.explicitDeps),
    omitEmptyFields: this.unmarshalStandardField(false, input?.test?.omitEmptyFields ?? input?.omitEmptyFields),
    globMatchers: this.unmarshalOnCreateTestGlobMatchers(input),
    subinclude: this.unmarshalNullableField(input?.test?.subinclude ?? input?.subinclude),
  });

  private unmarshalOnUpdate = (
    input?: RecursivePartial<AutoDepConfig.Input.OnUpdate>
  ): AutoDepConfig.Output.OnUpdate => ({
    module: this.unmarshalOnUpdateModule(input),
    fixture: this.unmarshalOnUpdateFixture(input),
    test: this.unmarshalOnUpdateTest(input),
  });

  private unmarshalOnUpdateModule = (
    input?: RecursivePartial<AutoDepConfig.Input.OnUpdate>
  ): AutoDepConfig.Output.OnUpdate['module'] => ({
    fileHeading: this.unmarshalStandardField('', input?.fileHeading),
    omitEmptyFields: this.unmarshalStandardField(false, input?.module?.omitEmptyFields ?? input?.omitEmptyFields),
    subinclude: this.unmarshalNullableField(input?.module?.subinclude ?? input?.subinclude),
  });

  private unmarshalOnUpdateFixture = (
    input?: RecursivePartial<AutoDepConfig.Input.OnUpdate>
  ): AutoDepConfig.Output.OnUpdate['fixture'] => ({
    fileHeading: this.unmarshalStandardField('', input?.fileHeading),
    omitEmptyFields: this.unmarshalStandardField(false, input?.fixture?.omitEmptyFields ?? input?.omitEmptyFields),
    subinclude: this.unmarshalNullableField(input?.fixture?.subinclude ?? input?.subinclude),
  });

  private unmarshalOnUpdateTest = (
    input?: RecursivePartial<AutoDepConfig.Input.OnUpdate>
  ): AutoDepConfig.Output.OnUpdate['test'] => ({
    fileHeading: this.unmarshalStandardField('', input?.fileHeading),
    omitEmptyFields: this.unmarshalStandardField(false, input?.test?.omitEmptyFields ?? input?.omitEmptyFields),
    subinclude: this.unmarshalNullableField(input?.test?.subinclude ?? input?.subinclude),
  });

  private unmarshalInitialVisibility = (defaultValue: readonly string[], input?: string[]): readonly string[] =>
    input ?? defaultValue;

  private unmarshalOnCreateModuleGlobMatchers = (
    input?: RecursivePartial<AutoDepConfig.Input.OnCreate>
  ): AutoDepConfig.Output.GlobMatchers =>
    input?.module?.globMatchers
      ? {
          include: input?.module?.globMatchers?.include ?? [],
          exclude: input?.module?.globMatchers?.exclude ?? [],
        }
      : input?.globMatchers?.include
      ? {
          include: input?.globMatchers?.include ?? [],
          exclude: input?.globMatchers?.exclude ?? [],
        }
      : {include: [], exclude: []};

  private unmarshalOnCreateFixtureGlobMatchers = (
    input?: RecursivePartial<AutoDepConfig.Input.OnCreate>
  ): AutoDepConfig.Output.GlobMatchers =>
    input?.fixture?.globMatchers
      ? {
          include: input?.fixture?.globMatchers?.include ?? [],
          exclude: input?.fixture?.globMatchers?.exclude ?? [],
        }
      : input?.globMatchers?.include
      ? {
          include: input?.globMatchers?.include ?? [],
          exclude: input?.globMatchers?.exclude ?? [],
        }
      : {include: [], exclude: []};

  private unmarshalOnCreateTestGlobMatchers = (
    input?: RecursivePartial<AutoDepConfig.Input.OnCreate>
  ): AutoDepConfig.Output.GlobMatchers =>
    input?.test?.globMatchers
      ? {
          include: input?.test?.globMatchers?.include ?? [],
          exclude: input?.test?.globMatchers?.exclude ?? [],
        }
      : input?.globMatchers?.include
      ? {
          include: input?.globMatchers?.include ?? [],
          exclude: input?.globMatchers?.exclude ?? [],
        }
      : {include: [], exclude: []};

  unmarshalIgnore = (input?: RecursivePartial<AutoDepConfig.Input.Ignore>): AutoDepConfig.Output.Ignore => ({
    module: {
      paths: input?.module?.paths ?? input?.paths ?? [],
      targets: new Set(input?.module?.targets ?? input?.targets ?? []),
    },
    fixture: {
      paths: input?.fixture?.paths ?? input?.paths ?? [],
      targets: new Set(input?.fixture?.targets ?? input?.targets ?? []),
    },
    test: {
      paths: input?.test?.paths ?? input?.paths ?? [],
      targets: new Set(input?.test?.targets ?? input?.targets ?? []),
    },
  });

  // Utility:

  private unmarshalStandardField = <V extends unknown>(defaultValue: V, input?: V): V => input ?? defaultValue;

  private unmarshalNullableField = <V extends unknown>(input?: V): V | null => input ?? null;
}

const formatTarget = (targetPath: string, formatString: string) => {
  const baseName = path.basename(targetPath);
  const fileName = path.parse(baseName).name;
  const firstName = fileName.split('.')[0];

  return formatString
    .replace(/<path>/g, targetPath)
    .replace(/<basename>/g, baseName)
    .replace(/<filename>/g, fileName)
    .replace(/<firstname>/g, firstName);
};

const getManagedSchemaFieldEntry = (
  entry: string | ManagedSchemaFieldEntry,
  defaultValue: ManagedSchemaFieldEntry
): ManagedSchemaFieldEntry =>
  typeof entry === 'string' ? {value: entry.replace(/ /gi, '_'), as: defaultValue.as} : entry;

const qualifyFilePath = (matcher: Set<string> | RegExp, filePath: string) => {
  if (matcher instanceof Set) {
    for (const entry of matcher) {
      if (filePath.endsWith(entry)) {
        return true;
      }
    }
    return false;
  }
  return matcher.test(filePath);
};
