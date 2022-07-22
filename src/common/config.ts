import {
  DEFAULT_INITIAL_VISIBILITY,
  KNOWN_RULE_FIELD_NAMES,
  SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES,
  DEFAULT_MODULE_FILENAME_MATCHER,
  DEFAULT_MODULE_RULE_NAME,
  DEFAULT_TEST_FILENAME_MATCHER,
  DEFAULT_TEST_RULE_NAME,
  SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRY_TYPES,
} from './const';
import {
  ManagedSchemaFieldEntry,
  ManagedSchemaFieldType,
  ManagedSchemaField,
  AutodepConfig,
  AutodepConfigInput,
} from './types';

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

const getManagedSchemaFieldEntry = (
  field: ManagedSchemaField,
  entry: string | ManagedSchemaFieldEntry,
  fallback: ManagedSchemaFieldEntry,
  configValidTypings?: ManagedSchemaFieldType[],
  configValidValues?: any[]
): ManagedSchemaFieldEntry => {
  if (typeof entry === 'string') {
    return {value: entry.replace(/ /gi, '_'), as: fallback.as};
  }

  const result: ManagedSchemaFieldEntry = {value: '', as: 'string'};

  const validTypings = configValidTypings || SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRY_TYPES;
  const isValidTyping = validTypings.includes(entry.as);
  if (isValidTyping) {
    result.as = entry.as;
  } else {
    const message = `[initConfig]: invalid typing "${entry.as}" passed to "${field}" field.`;
    const suggestion = `Must be one of [${validTypings.join(', ')}].`;
    const action = `Using fallback typing "${fallback.as}"`;
    console.warn(`${message} ${suggestion} ${action}`);
    result.as = fallback.as;
  }

  const isValidValue =
    typeof entry.value === 'string' && (!configValidValues || configValidValues.includes(entry.value));
  if (isValidValue) {
    result.value = entry.value.replace(/ /gi, '_');
  } else {
    const message = `[initConfig]: invalid value "${entry.value}" passed to "${field}" field.`;
    const suggestion = configValidValues ? `Must be one of [${configValidValues?.join(', ')}].` : '';
    const action = `Using fallback value "${fallback.value}"`;
    console.warn(`${message} ${suggestion} ${action}`);
    result.value = fallback.value;
  }

  return result;
};

export const initConfig = (overrides: Partial<AutodepConfigInput> = {}): AutodepConfig => ({
  manage: {
    rules: new Set(['filegroup', 'genrule', ...(overrides.manage?.rules || [])]),
    fields: new Set([...KNOWN_RULE_FIELD_NAMES, ...(overrides.manage?.fields || [])]),
    schema: Object.entries(overrides.manage?.schema ?? {}).reduce(
      (acc, [key, entry]) => ({
        ...acc,
        [key]: {
          name: new Set(
            Array.isArray(entry.name) && entry.name.length > 0
              ? entry.name?.map((el) =>
                  getManagedSchemaFieldEntry('name', el, SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.NAME, ['string'])
                )
              : [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.NAME]
          ),
          srcs: new Set(
            Array.isArray(entry.srcs) && entry.srcs.length > 0
              ? entry.srcs?.map((el) =>
                  getManagedSchemaFieldEntry('srcs', el, SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.SRCS)
                )
              : [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.SRCS]
          ),
          deps: new Set(
            Array.isArray(entry.deps) && entry.deps.length > 0
              ? entry.deps?.map((el) =>
                  getManagedSchemaFieldEntry('deps', el, SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.DEPS, ['array'])
                )
              : [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.DEPS]
          ),
          visibility: new Set(
            Array.isArray(entry.visibility) && entry.visibility.length > 0
              ? entry.visibility?.map((el) =>
                  getManagedSchemaFieldEntry('visibility', el, SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.VISIBILITY)
                )
              : [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.VISIBILITY]
          ),
          testOnly: new Set(
            Array.isArray(entry.testOnly) && entry.testOnly.length > 0
              ? entry.visibility?.map((el) =>
                  getManagedSchemaFieldEntry(
                    'testOnly',
                    el,
                    SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.TEST_ONLY,
                    ['bool'],
                    [true, false]
                  )
                )
              : [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.TEST_ONLY]
          ),
        },
      }),
      {} as AutodepConfig['manage']['schema']
    ),
  },
  match: {
    module: Array.isArray(overrides.match?.module)
      ? new Set(overrides.match?.module)
      : typeof overrides.match?.module === 'string'
      ? new RegExp(overrides.match?.module)
      : DEFAULT_MODULE_FILENAME_MATCHER,
    isModule: function (filePath) {
      return qualifyFilePath(this.module, filePath);
    },
    test: Array.isArray(overrides.match?.test)
      ? new Set(overrides.match?.test)
      : typeof overrides.match?.test === 'string'
      ? new RegExp(overrides.match?.test)
      : DEFAULT_TEST_FILENAME_MATCHER,
    isTest: function (filePath) {
      return qualifyFilePath(this.test, filePath);
    },
  },
  log: new Set(Array.isArray(overrides.log) ? overrides.log : []),
  paths: overrides.paths ?? {},
  excludeNodeModules: overrides.excludeNodeModules ?? false,
  enablePropagation: overrides.enablePropagation ?? false,
  onCreate: {
    module: {
      name: overrides.onCreate?.module?.name ?? overrides.onCreate?.name ?? DEFAULT_MODULE_RULE_NAME,
      fileHeading: overrides.onCreate?.module?.fileHeading ?? overrides.onCreate?.fileHeading ?? '',
      explicitDeps: overrides.onCreate?.module?.explicitDeps ?? overrides.onCreate?.explicitDeps ?? false,
      omitEmptyFields: overrides.onCreate?.module?.omitEmptyFields ?? overrides.onCreate?.omitEmptyFields ?? false,
      initialVisibility: overrides.onCreate?.module?.initialVisibility?.every((el) => typeof el === 'string')
        ? overrides.onCreate.module.initialVisibility
        : overrides.onCreate?.initialVisibility?.every((el) => typeof el === 'string')
        ? overrides.onCreate.initialVisibility
        : DEFAULT_INITIAL_VISIBILITY,
      subinclude: overrides.onCreate?.module?.subinclude?.every((el) => typeof el === 'string')
        ? overrides.onCreate.module.subinclude
        : overrides.onCreate?.subinclude?.every((el) => typeof el === 'string')
        ? overrides.onCreate.subinclude
        : null,
      testOnly: overrides.onCreate?.module?.testOnly ?? overrides.onCreate?.testOnly ?? null,
    },
    test: {
      name: overrides.onCreate?.test?.name ?? overrides.onCreate?.name ?? DEFAULT_TEST_RULE_NAME,
      fileHeading: overrides.onCreate?.test?.fileHeading ?? overrides.onCreate?.fileHeading ?? '',
      explicitDeps: overrides.onCreate?.test?.explicitDeps ?? overrides.onCreate?.explicitDeps ?? false,
      omitEmptyFields: overrides.onCreate?.test?.omitEmptyFields ?? overrides.onCreate?.omitEmptyFields ?? false,
      subinclude: overrides.onCreate?.test?.subinclude?.every((el) => typeof el === 'string')
        ? overrides.onCreate.test.subinclude
        : overrides.onCreate?.subinclude?.every((el) => typeof el === 'string')
        ? overrides.onCreate.subinclude
        : null,
    },
  },
  onUpdate: {
    module: {
      fileHeading: overrides.onUpdate?.module?.fileHeading ?? overrides.onUpdate?.fileHeading ?? '',
      omitEmptyFields: overrides.onUpdate?.module?.omitEmptyFields ?? overrides.onUpdate?.omitEmptyFields ?? false,
      subinclude: overrides.onUpdate?.module?.subinclude?.every((el) => typeof el === 'string')
        ? overrides.onUpdate.module.subinclude
        : overrides.onUpdate?.subinclude?.every((el) => typeof el === 'string')
        ? overrides.onUpdate.subinclude
        : null,
    },
    test: {
      fileHeading: overrides.onUpdate?.test?.fileHeading ?? overrides.onUpdate?.fileHeading ?? '',
      omitEmptyFields: overrides.onUpdate?.test?.omitEmptyFields ?? overrides.onUpdate?.omitEmptyFields ?? false,
      subinclude: overrides.onUpdate?.test?.subinclude?.every((el) => typeof el === 'string')
        ? overrides.onUpdate.test.subinclude
        : overrides.onUpdate?.subinclude?.every((el) => typeof el === 'string')
        ? overrides.onUpdate.subinclude
        : null,
    },
  },
});
