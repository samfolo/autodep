import minimatch from 'minimatch';
import path from 'path';

import {
  DEFAULT_MODULE_RULE_NAME,
  DEFAULT_TEST_RULE_NAME,
  SUPPORTED_MANAGED_BUILTINS,
  SUPPORTED_MANAGED_BUILTINS_LOOKUP,
} from '../common/const';
import {FileMatcherDeclaration, ManagedSchemaFieldEntry, ManagedSchemaFieldType} from '../common/types';
import {AutoDepConfig} from '../config/types';
import {AutoDepError, ErrorType} from '../errors/error';
import {AutoDepBase} from '../inheritance/base';
import {CallExpression, Expression, StringLiteral} from '../language/ast/types';
import {ErrorMessages} from '../messages/error';
import {TaskMessages} from '../messages/task';

interface FieldLiteral {
  type: ManagedSchemaFieldType;
  alias: string;
  value: any;
}
interface StringSrcsFieldLiteral extends FieldLiteral {
  type: 'string';
  value: string;
}
interface ArraySrcsFieldLiteral extends FieldLiteral {
  type: 'array';
  value: string[];
}
interface GlobSrcsFieldLiteral extends FieldLiteral {
  type: 'glob';
  value: {include: string[]; exclude: string[]};
}
export type SrcsFieldLiteral = StringSrcsFieldLiteral | ArraySrcsFieldLiteral | GlobSrcsFieldLiteral;

export interface NameFieldLiteral extends FieldLiteral {
  type: 'string';
  value: string;
}

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

  getNameFieldLiteral = (
    node: CallExpression,
    functionName: string,
    nameAliases: Set<ManagedSchemaFieldEntry>
  ): NameFieldLiteral | null => {
    if (!node.args) {
      return null;
    }

    for (const element of node.args.elements) {
      if (element.kind === 'InfixExpression' && element.operator === '=') {
        const iterableAliases = [...nameAliases];
        const relevantAliases = iterableAliases.filter((alias) => alias.value === element.left?.getTokenLiteral());
        const permittedTypeUnion = relevantAliases.map((alias) => alias.as).join('|');

        for (const nameAlias of relevantAliases) {
          this._logger.trace({
            ctx: 'getNameFieldLiteral',
            message: TaskMessages.locate.success(`a rule with \`name\` alias "${nameAlias.value}"`),
          });

          switch (nameAlias.as) {
            case 'string':
              if (element.right?.kind === 'StringLiteral') {
                return {type: nameAlias.as, alias: nameAlias.value, value: String(element.right?.getTokenLiteral())};
              } else {
                if (!relevantAliases.find((alias) => alias.as === nameAlias.as)) {
                  this.warnOfBuildSchemaMismatch(
                    'getNameFieldLiteral',
                    node,
                    functionName,
                    nameAlias.value,
                    permittedTypeUnion
                  );
                }
              }
              continue;
            default:
              break;
          }

          this._logger.trace({
            ctx: 'getNameFieldLiteral',
            message:
              TaskMessages.resolve.failure(
                `${functionName}(${nameAlias.value} = <${this._fileName}>)`,
                '`name` field value'
              ) + ' - continuing...',
            details: node.toString(),
          });
        }
      }
    }

    return null;
  };

  getSrcsFieldLiteral = (
    node: CallExpression,
    functionName: string,
    srcsAliases: Set<ManagedSchemaFieldEntry>
  ): SrcsFieldLiteral | null => {
    if (!node.args) {
      return null;
    }

    for (const element of node.args.elements) {
      if (element.kind === 'InfixExpression' && element.operator === '=') {
        const iterableAliases = [...srcsAliases];
        const relevantAliases = iterableAliases.filter((alias) => alias.value === element.left?.getTokenLiteral());
        const permittedTypeUnion = relevantAliases.map((alias) => alias.as).join('|');

        for (const srcsAlias of relevantAliases) {
          this._logger.trace({
            ctx: 'getSrcsFieldLiteral',
            message: TaskMessages.locate.success(`a rule with \`srcs\` alias "${srcsAlias.value}"`),
          });

          switch (srcsAlias.as) {
            case 'string':
              if (element.right?.kind === 'StringLiteral') {
                return {type: srcsAlias.as, alias: srcsAlias.value, value: String(element.right?.getTokenLiteral())};
              } else {
                if (!relevantAliases.find((alias) => alias.as === srcsAlias.as)) {
                  this.warnOfBuildSchemaMismatch(
                    'getSrcsFieldLiteral',
                    node,
                    functionName,
                    srcsAlias.value,
                    permittedTypeUnion
                  );
                }
              }
              continue;
            case 'array':
              if (element.right?.kind === 'ArrayLiteral') {
                return {
                  type: srcsAlias.as,
                  alias: srcsAlias.value,
                  value: element.right.elements?.elements.map((element) => String(element.getTokenLiteral())) ?? [],
                };
              } else {
                if (!relevantAliases.find((alias) => alias.as === srcsAlias.as)) {
                  this.warnOfBuildSchemaMismatch(
                    'getSrcsFieldLiteral',
                    node,
                    functionName,
                    srcsAlias.value,
                    permittedTypeUnion
                  );
                }
              }
              continue;
            case 'glob':
              if (this.isGlobDeclaration(element.right)) {
                const includeExpression = element.right?.args?.elements?.[0];
                const excludeExpression = element.right?.args?.elements?.[1];
                return {
                  type: srcsAlias.as,
                  alias: srcsAlias.value,
                  value: {
                    include: this.getValuesFromGlobEntry('include', includeExpression),
                    exclude: this.getValuesFromGlobEntry('exclude', excludeExpression),
                  },
                };
              } else {
                if (!relevantAliases.find((alias) => alias.as === srcsAlias.as)) {
                  this.warnOfBuildSchemaMismatch(
                    'getSrcsFieldLiteral',
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
            ctx: 'getSrcsFieldLiteral',
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
      if (element.kind === 'InfixExpression' && element.operator === '=') {
        const iterableAliases = [...srcsAliases];
        const relevantAliases = iterableAliases.filter((alias) => alias.value === element.left?.getTokenLiteral());
        const permittedTypeUnion = relevantAliases.map((alias) => alias.as).join('|');

        return relevantAliases.some((srcsAlias) => {
          this._logger.trace({
            ctx: 'isTargetBuildRule',
            message: TaskMessages.locate.success(`a rule with \`srcs\` alias "${srcsAlias.value}"`),
          });

          switch (srcsAlias.as) {
            case 'string':
              if (element.right?.kind === 'StringLiteral') {
                return this.isTargetStringSrcsField(element.right, functionName, srcsAlias);
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
              if (element.right?.kind === 'ArrayLiteral') {
                return this.isTargetArraySrcsField(element.right, functionName, srcsAlias);
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
              if (this.isGlobDeclaration(element.right)) {
                return this.isTargetGlobSrcsField(element.right, functionName, srcsAlias);
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
    elementValue: Expression | undefined,
    functionName: string,
    srcsAlias: ManagedSchemaFieldEntry
  ) => {
    this._logger.trace({
      ctx: 'isTargetArraySrcsField',
      message: TaskMessages.identified(`an array field`, `\`${functionName}.${srcsAlias.value}\``),
    });
    const isMatch =
      elementValue?.kind === 'ArrayLiteral' &&
      !!elementValue?.elements?.elements.some((subElement) => {
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

    const includeExpression = elementValue?.args?.elements?.[0];
    const excludeExpression = elementValue?.args?.elements?.[1];
    const globLiteralValue: FileMatcherDeclaration = {
      include: this.getValuesFromGlobEntry('include', includeExpression),
      exclude: this.getValuesFromGlobEntry('exclude', excludeExpression),
    };

    const isMatch = this.matchesFileMatcherDeclaration(this._fileName, globLiteralValue);
    this._logger.trace({
      ctx: 'isTargetGlobSrcsField',
      message: TaskMessages[isMatch ? 'success' : 'failure'](
        isMatch ? 'matched' : 'match',
        `"${this._fileName}" against a matcher in \`${functionName}.${srcsAlias.value}\``
      ),
    });
    return isMatch;
  };

  /**
   * A boolean predicate to check whether a path matches the `include` and `exclude` conditions of a
   * file matcher declaration, typically whether it matches at least one `include` and at most zero
   * `exclude` entries in the given declaration.
   *
   * @param path the path you are trying to match
   * @param fileMatcherDeclaration an object containing an `include` and `exclude` array pair
   * @returns a boolean indicating whether the path matches at least one `include` and at most
   * zero `exclude` entries in the given declaration.
   */
  private matchesFileMatcherDeclaration = (path: string, fileMatcherDeclaration: FileMatcherDeclaration) =>
    fileMatcherDeclaration.include.length > 0 &&
    fileMatcherDeclaration.include.some((matcher) => {
      this._logger.trace({
        ctx: 'matchesFileMatcherDeclaration',
        message: TaskMessages.attempt('match', `${this._fileName} against "${matcher}"`),
      });
      return minimatch(path, matcher);
    }) &&
    (fileMatcherDeclaration.exclude.length === 0 ||
      fileMatcherDeclaration.exclude.every((matcher) => {
        this._logger.trace({
          ctx: 'matchesFileMatcherDeclaration',
          message: TaskMessages.attempt('match', `${this._fileName} against "${matcher}"`),
        });
        return !minimatch(path, matcher);
      }));

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
      message: TaskMessages.success('entered', 'managed node'),
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
