import {TaskMessages} from './task';

interface NoBUILDFilesInWorkspaceOptions {
  proposedPath: string;
}

interface NoRuleFoundForDependencyOptions {
  dep: string;
  nearestBUILDFile: string;
}

export class ErrorMessages {
  static readonly precondition = {
    noBUILDFilesInWorkspace: ({proposedPath}: NoBUILDFilesInWorkspaceOptions) =>
      TaskMessages.locate.failure('any `BUILD` or `BUILD.plz` files in the workspace.') +
      `\nTo create one at ${proposedPath}, add \`enablePropagation: false\` to an .autodep.yaml file,` +
      ` either in the target directory or in a parent directory.`,
    noRuleFoundForDependency: ({dep, nearestBUILDFile}: NoRuleFoundForDependencyOptions) =>
      TaskMessages.resolve.failure(`${dep} in its nearest \`BUILD\` file ${nearestBUILDFile}`) +
      'Try saving that file to generate a valid rule.',
  };
}
