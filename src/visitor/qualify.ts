import minimatch from 'minimatch';
import path from 'path';

import {
  DEFAULT_MODULE_RULE_NAME,
  DEFAULT_TEST_RULE_NAME,
  SUPPORTED_MANAGED_BUILTINS,
  SUPPORTED_MANAGED_BUILTINS_LOOKUP,
} from '../common/const';
import {ManagedSchemaFieldEntry, ManagedSchemaFieldType} from '../common/types';
import {AutoDepConfig} from '../config/types';
import {AutoDepError, ErrorType} from '../errors/error';
import {AutoDepBase} from '../inheritance/base';
import {CallExpression, Expression, ArrayLiteral, StringLiteral} from '../language/ast/types';
import {ErrorMessages} from '../messages/error';
import {TaskMessages} from '../messages/task';

interface SrcsFieldReturnBase {
  type: ManagedSchemaFieldType;
  value: any;
}
interface StringSrcsFieldReturn extends SrcsFieldReturnBase {
  type: 'string';
  value: string;
}
interface ArraySrcsFieldReturn extends SrcsFieldReturnBase {
  type: 'array';
  value: string[];
}
interface GlobSrcsFieldReturn extends SrcsFieldReturnBase {
  type: 'glob';
  value: {include: string[]; exclude: string[]};
}
export type SrcsFieldReturn = StringSrcsFieldReturn | ArraySrcsFieldReturn | GlobSrcsFieldReturn;

interface NodeQualifierOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
}

export class NodeQualifier extends AutoDepBase {
  private _ruleType: 'module' | 'test';
  private _rootPath: string;
  private _fileName: string;

  constructor({config, rootPath}: NodeQualifierOptions) {
    super({config, name: 'NodeQualifier'});

    this._rootPath = rootPath;
    this._fileName = path.basename(this._rootPath);

    if (this._config.match.isTest(this._rootPath)) {
      this._logger.trace({ctx: 'init', message: TaskMessages.identified('a test', `"${this._fileName}"`)});
      this._ruleType = 'test';
    } else if (this._config.match.isModule(this._rootPath)) {
      this._logger.trace({ctx: 'init', message: TaskMessages.identified('a module', `"${this._fileName}"`)});
      this._ruleType = 'module';
    } else {
      const message = ErrorMessages.user.unsupportedFileType({path: this._rootPath});
      this._logger.error({ctx: 'init', message});
      throw new AutoDepError(ErrorType.USER, message);
    }
  }

  get ruleType() {
    return this._ruleType;
  }

  getTargetBuildRuleSrcsField = (
    node: CallExpression,
    functionName: string,
    srcsAliases: Set<ManagedSchemaFieldEntry>
  ): SrcsFieldReturn | null => {
    if (!node.args) {
      return null;
    }

    for (const element of node.args.elements) {
      if (element.kind === 'KeywordArgumentExpression') {
        const iterableAliases = [...srcsAliases];
        const relevantAliases = iterableAliases.filter((alias) => alias.value === element.key.getTokenLiteral());
        const permittedTypeUnion = relevantAliases.map((alias) => alias.as).join('|');

        for (const srcsAlias of relevantAliases) {
          this._logger.trace({
            ctx: 'getTargetBuildRuleSrcsField',
            message: TaskMessages.locate.success(`a rule with \`srcs\` alias "${srcsAlias.value}"`),
          });

          switch (srcsAlias.as) {
            case 'string':
              if (element.value?.kind === 'StringLiteral') {
                return {type: srcsAlias.as, value: element.value.getTokenLiteral()} as StringSrcsFieldReturn;
              } else {
                if (!relevantAliases.find((alias) => alias.as === srcsAlias.as)) {
                  this.warnOfBuildSchemaMismatch(
                    'getTargetBuildRuleSrcsField',
                    node,
                    functionName,
                    srcsAlias.value,
                    permittedTypeUnion
                  );
                }
              }
              continue;
            case 'array':
              if (element.value?.kind === 'ArrayLiteral') {
                return {
                  type: srcsAlias.as,
                  value: element.value.elements?.elements.map((element) => String(element.getTokenLiteral())) ?? [],
                };
              } else {
                if (!relevantAliases.find((alias) => alias.as === srcsAlias.as)) {
                  this.warnOfBuildSchemaMismatch(
                    'getTargetBuildRuleSrcsField',
                    node,
                    functionName,
                    srcsAlias.value,
                    permittedTypeUnion
                  );
                }
              }
              continue;
            case 'glob':
              if (this.isGlobDeclaration(element.value)) {
                const includeExpression = element.value?.args?.elements?.[0];
                const excludeExpression = element.value?.args?.elements?.[1];
                return {
                  type: srcsAlias.as,
                  value: {
                    include: this.getValuesFromGlobEntry('include', includeExpression),
                    exclude: this.getValuesFromGlobEntry('exclude', excludeExpression),
                  },
                };
              } else {
                if (!relevantAliases.find((alias) => alias.as === srcsAlias.as)) {
                  this.warnOfBuildSchemaMismatch(
                    'getTargetBuildRuleSrcsField',
                    node,
                    functionName,
                    srcsAlias.value,
                    permittedTypeUnion
                  );
                }
              }
              continue;
            default:
              break;
          }

          this._logger.trace({
            ctx: 'getTargetBuildRuleSrcsField',
            message:
              TaskMessages.resolve.failure(
                `${functionName}(${srcsAlias.value} = <${this._fileName}>)`,
                `"${this._fileName}"`
              ) + ' - continuing...',
            details: node.toString(),
          });
        }
      }
    }

    return null;
  };

  /**
   * Gets the token literal values from a given `glob` declaration AST node. these should be strings,
   * and if they are not, they are cast to strings anyway.
   *
   * @param keyName the name of the key used to identify the entry if the entry is expressed
   * as a kwarg
   * @param entry the AST node representing the entry in the `glob` declaration
   * @returns either an empty array, or a list of string literals present in the given `glob` entry
   */
  private getValuesFromGlobEntry = (keyName: string, entry: Expression | undefined) => {
    if (entry?.kind === 'ArrayLiteral') {
      return entry.elements?.elements.map((el) => String(el.getTokenLiteral())) ?? [];
    } else if (
      entry?.kind === 'InfixExpression' &&
      entry?.left?.getTokenLiteral() === keyName &&
      entry?.right?.kind === 'ArrayLiteral'
    ) {
      return entry.right.elements?.elements.map((el) => String(el.getTokenLiteral())) ?? [];
    } else {
      return [];
    }
  };

  isTargetBuildRule = (node: CallExpression, functionName: string, srcsAliases: Set<ManagedSchemaFieldEntry>) => {
    if (!node.args) {
      return false;
    }

    return node.args.elements.some((element) => {
      if (element.kind === 'KeywordArgumentExpression') {
        const iterableAliases = [...srcsAliases];
        const relevantAliases = iterableAliases.filter((alias) => alias.value === element.key.getTokenLiteral());
        const permittedTypeUnion = relevantAliases.map((alias) => alias.as).join('|');

        return relevantAliases.some((srcsAlias) => {
          this._logger.trace({
            ctx: 'isTargetBuildRule',
            message: TaskMessages.locate.success(`a rule with \`srcs\` alias "${srcsAlias.value}"`),
          });

          switch (srcsAlias.as) {
            case 'string':
              if (element.value?.kind === 'StringLiteral') {
                return this.isTargetStringSrcsField(element.value, functionName, srcsAlias);
              } else {
                if (!relevantAliases.find((alias) => alias.as === srcsAlias.as)) {
                  this.warnOfBuildSchemaMismatch(
                    'isTargetBuildRule',
                    node,
                    functionName,
                    srcsAlias.value,
                    permittedTypeUnion
                  );
                }
              }
              break;
            case 'array':
              if (element.value?.kind === 'ArrayLiteral') {
                return this.isTargetArraySrcsField(element.value, functionName, srcsAlias);
              } else {
                if (!relevantAliases.find((alias) => alias.as === srcsAlias.as)) {
                  this.warnOfBuildSchemaMismatch(
                    'isTargetBuildRule',
                    node,
                    functionName,
                    srcsAlias.value,
                    permittedTypeUnion
                  );
                }
              }
              break;
            case 'glob':
              if (this.isGlobDeclaration(element.value)) {
                return this.isTargetGlobSrcsField(element.value, functionName, srcsAlias);
              } else {
                if (!relevantAliases.find((alias) => alias.as === srcsAlias.as)) {
                  this.warnOfBuildSchemaMismatch(
                    'isTargetBuildRule',
                    node,
                    functionName,
                    srcsAlias.value,
                    permittedTypeUnion
                  );
                }
              }
              break;
            default:
              break;
          }

          this._logger.trace({
            ctx: 'isTargetBuildRule',
            message:
              TaskMessages.resolve.failure(
                `${functionName}(${srcsAlias.value} = <${this._fileName}>)`,
                `"${this._fileName}"`
              ) + ' - continuing...',
            details: node.toString(),
          });

          return false;
        });
      }

      return false;
    });
  };

  private isTargetStringSrcsField = (
    elementValue: StringLiteral,
    functionName: string,
    srcsAlias: ManagedSchemaFieldEntry
  ) => {
    this._logger.trace({
      ctx: 'isTargetStringSrcsField',
      message: TaskMessages.identified(`a string field`, `\`${functionName}.${srcsAlias.value}\``),
    });
    const isMatch = elementValue?.getTokenLiteral() === this._fileName;
    this._logger.trace({
      ctx: 'isTargetStringSrcsField',
      message: TaskMessages.locate[isMatch ? 'success' : 'failure'](
        `"${this._fileName}" at \`${functionName}.${srcsAlias.value}\``
      ),
    });
    return isMatch;
  };

  private isTargetArraySrcsField = (
    elementValue: ArrayLiteral,
    functionName: string,
    srcsAlias: ManagedSchemaFieldEntry
  ) => {
    this._logger.trace({
      ctx: 'isTargetArraySrcsField',
      message: TaskMessages.identified(`an array field`, `\`${functionName}.${srcsAlias.value}\``),
    });
    const isMatch = !!elementValue.elements?.elements.some((subElement) => {
      if (subElement?.kind === 'StringLiteral') {
        return subElement.getTokenLiteral() === this._fileName;
      }
    });
    this._logger.trace({
      ctx: 'isTargetArraySrcsField',
      message: TaskMessages.locate[isMatch ? 'success' : 'failure'](
        `"${this._fileName}" in \`${functionName}.${srcsAlias.value}\``
      ),
    });
    return isMatch;
  };

  private isGlobDeclaration = (elementValue?: Expression): elementValue is CallExpression =>
    elementValue?.kind === 'CallExpression' &&
    elementValue.functionName?.getTokenLiteral() === SUPPORTED_MANAGED_BUILTINS_LOOKUP.glob;

  private isTargetGlobSrcsField = (
    elementValue: CallExpression,
    functionName: string,
    srcsAlias: ManagedSchemaFieldEntry
  ) => {
    this._logger.trace({
      ctx: 'isTargetGlobSrcsField',
      message: TaskMessages.identified(`a \`glob\` builtin field`, `\`${functionName}.${srcsAlias.value}\``),
    });
    // TODO: also handle "glob" exclude kwargs
    const isMatch = !!elementValue.args?.elements?.some(
      (arg) => arg.kind === 'ArrayLiteral' && this.matchesAtLeastOneGlobDeclarationInclude(arg)
    );
    this._logger.trace({
      ctx: 'isTargetGlobSrcsField',
      message: TaskMessages[isMatch ? 'success' : 'failure'](
        isMatch ? 'matched' : 'match',
        `"${this._fileName}" against a matcher in \`${functionName}.${srcsAlias.value}\``
      ),
    });
    return isMatch;
  };

  private matchesAtLeastOneGlobDeclarationInclude = (includes: ArrayLiteral) =>
    !!includes.elements?.elements.some((matcher) => {
      this._logger.trace({
        ctx: 'matchesAtLeastOneGlobDeclarationInclude',
        message: TaskMessages.attempt('match', `${this._fileName} against "${matcher.getTokenLiteral()}"`),
      });
      return minimatch(this._fileName, String(matcher.getTokenLiteral()));
    });

  warnOfBuildSchemaMismatch = (
    ctx: string,
    node: Expression,
    functionName: string,
    fieldAlias: string,
    expectedFieldType: string
  ) =>
    this._logger.warn({
      ctx,
      message: ErrorMessages.user.buildRuleSchemaMismatch({
        ruleName: functionName,
        fieldName: 'srcs',
        fieldAlias,
        expectedFieldType,
      }),
      details: node.toString(),
    });

  isManagedNode = (node: CallExpression) => {
    const functionName = String(node.functionName?.getTokenLiteral() ?? '');

    const isManagedRule = this._config.manage.rules.has(functionName);
    const isManagedBuiltin = SUPPORTED_MANAGED_BUILTINS.some((builtin) => functionName === builtin);
    const isDefaultModuleRule = this._ruleType === 'module' && functionName === DEFAULT_MODULE_RULE_NAME;
    const isDefaultTestRule = this._ruleType === 'test' && functionName !== DEFAULT_TEST_RULE_NAME;

    this._logger.trace({
      ctx: 'isManagedNode',
      message: TaskMessages.success('entered', 'CallExpression'),
      details: JSON.stringify(
        {
          functionName,
          isManagedRule,
          isManagedBuiltin,
          isDefaultModuleRule,
          isDefaultTestRule,
        },
        null,
        2
      ),
    });

    return isManagedRule || isManagedBuiltin || isDefaultModuleRule || isDefaultTestRule;
  };
}
