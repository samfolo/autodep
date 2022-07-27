import {ErrorObject} from 'ajv';
import path from 'path';
import {TaskMessages} from './task';

interface NoBUILDFilesInWorkspaceOptions {
  proposedPath: string;
}

interface NoRuleFoundForDependencyOptions {
  dep: string;
  nearestBUILDFile: string;
}

interface UnsupportedFileTypeOptions {
  path: string;
}

interface BuildRuleSchemaMismatchOptions {
  ruleName: string;
  fieldName: string;
  fieldAlias: string;
  expectedFieldType: string;
}

interface InvalidConfigOptions {
  configPath: string;
  validationErrors: ErrorObject[] | null | undefined;
}

export class ErrorMessages {
  static readonly unexpected = {
    noStartTimeSetForProcess: () =>
      'no starting time was set for this process, meaning the process was not correctly initialised,' +
      ' and may have had an undesirable outcome.',
  };
  static readonly precondition = {
    noBUILDFilesInWorkspace: ({proposedPath}: NoBUILDFilesInWorkspaceOptions) =>
      TaskMessages.locate.failure('any `BUILD` or `BUILD.plz` files in the workspace.') +
      `\nTo create one at ${proposedPath}, add \`enablePropagation: false\` to an .autodep.yaml file,` +
      ` either in the target directory or in a parent directory.`,
    noRuleFoundForDependency: ({dep, nearestBUILDFile}: NoRuleFoundForDependencyOptions) =>
      TaskMessages.resolve.failure(`${dep} in its nearest \`BUILD\` file ${nearestBUILDFile}.`) +
      '\nTry:' +
      '\n - saving that file to generate a valid rule, if one does not exist yet' +
      "\n - setting `excludeNodeModules` to `true` in the nearest .autodep.yaml file, if it's a `node_module`" +
      `\n - checking your \`<autodepConfig>.match\` settings, to ensure it covers the target extension ` +
      `(\`${path.extname(dep)}\`)`,
  };
  static readonly user = {
    unsupportedFileType: ({path}: UnsupportedFileTypeOptions) =>
      `unsupported file type: ${path}. Check your settings at \`<autodepConfig>.match.(module|test)\`.` +
      ` Note, you don't have to double-escape your regex matchers.`,
    buildRuleSchemaMismatch: ({ruleName, fieldName, fieldAlias, expectedFieldType}: BuildRuleSchemaMismatchOptions) =>
      `found "${fieldAlias}"-aliased \`${fieldName}\` field within \`${ruleName ?? '<unknown field>'}\`` +
      ` rule, but it was not of type "${expectedFieldType}".` +
      ` Check your \`<autodepConfig>.manage.schema\` if this is incorrect.`,
    invalidConfig: ({configPath, validationErrors}: InvalidConfigOptions) =>
      `${TaskMessages.failure('validate', configPath)}:\n` +
        validationErrors
          ?.map((error) => {
            return `<autodepConfig>${error.instancePath.replace(/\//gi, '.')} ${error.message ?? '<unknown issue>'}`;
          })
          .join('\n') ?? '<unknown issue>',
  };
}
