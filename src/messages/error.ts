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

export class ErrorMessages {
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
      `found "${fieldAlias}"-aliased \`${fieldName}\` field within \`${ruleName ?? '<unknown>'}\`` +
      ` rule, but it was not of type "${expectedFieldType}" type.` +
      ` Check your \`<autodepConfig>.manage.schema\` if this is incorrect.`,
  };
}
