import minimatch from 'minimatch';
import path from 'path';

import {
  DEFAULT_MODULE_RULE_NAME,
  DEFAULT_TEST_RULE_NAME,
  SUPPORTED_MANAGED_BUILTINS,
  SUPPORTED_MANAGED_BUILTINS_LOOKUP,
  SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES,
} from '../common/const';
import {AutoDepConfig} from '../config/types';
import {AutoDepError, ErrorType} from '../errors/error';
import {AutoDepBase} from '../inheritance/base';
import {
  ASTNode,
  Comment,
  CallExpression,
  KeywordArgumentExpression,
  ExpressionStatement,
  RootNode,
  Expression,
  Statement,
} from '../language/ast/types';
import {ErrorMessages} from '../messages/error';
import {TaskMessages} from '../messages/task';

interface RuleNameVisitorOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
}
export class RuleNameVisitor extends AutoDepBase {
  private _fileName: string;
  private _rootPath: string;
  private _ruleName: string | null;
  private _ruleType: 'module' | 'test';

  constructor({config, rootPath}: RuleNameVisitorOptions) {
    super({config, name: 'RuleNameVisitor'});
    this._logger.trace({ctx: 'init', message: TaskMessages.initialise.attempt('RuleNameVisitor')});

    this._fileName = path.basename(rootPath);
    this._rootPath = rootPath;
    this._ruleName = null;

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

  locateRuleName = (node: ASTNode) => {
    let result: ASTNode;

    switch (node.type) {
      case 'Root':
        this._logger.trace({ctx: 'locateRuleName', message: TaskMessages.visit.attempt('RootNode')});
        result = this.visitRootNode(node);
        break;
      case 'Expression':
        this._logger.trace({ctx: 'locateRuleName', message: TaskMessages.visit.attempt('Expression')});
        result = this.visitExpressionNode(node);
        break;
      case 'Statement':
        this._logger.trace({ctx: 'locateRuleName', message: TaskMessages.visit.attempt('Statement')});
        result = this.visitStatementNode(node);
        break;
      case 'Comment':
        this._logger.trace({ctx: 'locateRuleName', message: TaskMessages.visit.attempt('Comment')});
        result = this.visitCommentNode(node);
        break;
      default:
        this._status = 'passthrough';
        this._reason = 'irrelevant node type passed to `locateRuleName` visitor';
        return node;
    }

    if (this._status === 'success') {
      return result;
    } else {
      this._status = 'failed';
      this._reason = 'unable to find build rule name in given file';
      return node;
    }
  };

  private visitStatementNode = (node: Statement): Statement => {
    switch (node.kind) {
      case 'ExpressionStatement':
        return this.visitExpressionStatementNode(node);
      case 'CommentStatement':
      default:
        return node;
    }
  };

  private visitCommentNode = (node: Comment): Comment => {
    switch (node.kind) {
      case 'SingleLineComment':
      case 'CommentGroup':
      default:
        return node;
    }
  };

  private visitExpressionNode = (node: Expression): Expression => {
    switch (node.kind) {
      case 'CallExpression':
        this._logger.trace({ctx: 'visitExpressionNode', message: TaskMessages.visit.attempt('CallExpression')});
        return this.visitCallExpressionNode(node);
      case 'RuleFieldName':
      case 'Identifier':
      case 'IntegerLiteral':
      case 'PrefixExpression':
      case 'InfixExpression':
      case 'BooleanLiteral':
      case 'StringLiteral':
      case 'ArrayLiteral':
      case 'IndexExpression':
      case 'KeywordArgumentExpression':
      case 'MapLiteral':
      case 'ExpressionList':
      case 'KeyValueExpressionList':
      case 'KeyValueExpression':
      case 'DocStringLiteral':
      default:
        return node;
    }
  };

  private visitRootNode = (node: RootNode) => {
    node.statements = node.statements.map((statement) => {
      if (this._ruleName === null) {
        return this.visitStatementNode(statement);
      }
      return statement;
    });
    return node;
  };

  private visitExpressionStatementNode = (node: ExpressionStatement) => {
    if (node.token.type === 'RULE_NAME' && node.expression?.kind === 'CallExpression') {
      node.expression = this.visitCallExpressionNode(node.expression);
    }

    return node;
  };

  private visitCallExpressionNode = (node: CallExpression) => {
    const functionName = String(node.functionName?.getTokenLiteral() ?? '');

    const isManagedRule = this._config.manage.rules.has(functionName);
    const isManagedBuiltin = SUPPORTED_MANAGED_BUILTINS.some((builtin) => functionName === builtin);
    const isDefaultModuleRule = this._ruleType === 'module' && functionName === DEFAULT_MODULE_RULE_NAME;
    const isDefaultTestRule = this._ruleType === 'test' && functionName !== DEFAULT_TEST_RULE_NAME;

    this._logger.trace({
      ctx: 'visitCallExpressionNode',
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

    if (!isManagedRule && !isManagedBuiltin && !isDefaultModuleRule && !isDefaultTestRule) {
      return node;
    }

    const managedSchema = this._config.manage.schema[functionName];
    const srcsSchemaFieldEntries = managedSchema?.srcs ?? [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.SRCS];

    if (node.args?.elements && node.args.elements.length > 0) {
      this._logger.trace({
        ctx: 'visitCallExpressionNode',
        message: TaskMessages.identify.attempt('the target rule', `instance of "${functionName}"`),
      });
      const isTargetRule = node.args.elements.some((element) => {
        if (element.kind === 'KeywordArgumentExpression') {
          for (const srcsAlias of srcsSchemaFieldEntries) {
            if (element.key.getTokenLiteral() === srcsAlias.value) {
              this._logger.trace({
                ctx: 'visitCallExpressionNode',
                message: TaskMessages.locate.success(`a rule with \`srcs\` alias "${srcsAlias.value}"`),
              });

              switch (srcsAlias.as) {
                case 'string':
                  if (element.value?.kind === 'StringLiteral') {
                    this._logger.trace({
                      ctx: 'visitCallExpressionNode',
                      message: TaskMessages.identified(`a string field`, `\`${functionName}.${srcsAlias.value}\``),
                    });
                    const isMatch = element.value.getTokenLiteral() === this._fileName;
                    this._logger.trace({
                      ctx: 'visitCallExpressionNode',
                      message: TaskMessages.locate[isMatch ? 'success' : 'failure'](
                        `"${this._fileName}" at \`${functionName}.${srcsAlias.value}\``
                      ),
                    });
                    return isMatch;
                  } else {
                    this._logger.warn({
                      ctx: 'visitCallExpressionNode',
                      message: ErrorMessages.user.buildRuleSchemaMismatch({
                        ruleName: functionName,
                        fieldName: 'srcs',
                        fieldAlias: srcsAlias.value,
                        expectedFieldType: srcsAlias.as,
                      }),
                      details: node.toString(),
                    });
                  }
                  break;
                case 'array':
                  if (element.value?.kind === 'ArrayLiteral') {
                    this._logger.trace({
                      ctx: 'visitCallExpressionNode',
                      message: TaskMessages.identified(`an array field`, `\`${functionName}.${srcsAlias.value}\``),
                    });
                    const isMatch = element.value.elements?.elements.some((subElement) => {
                      if (subElement?.kind === 'StringLiteral') {
                        return subElement.getTokenLiteral() === this._fileName;
                      }
                    });
                    this._logger.trace({
                      ctx: 'visitCallExpressionNode',
                      message: TaskMessages.locate[isMatch ? 'success' : 'failure'](
                        `"${this._fileName}" in \`${functionName}.${srcsAlias.value}\``
                      ),
                    });
                    return isMatch;
                  } else {
                    this._logger.warn({
                      ctx: 'visitCallExpressionNode',
                      message: ErrorMessages.user.buildRuleSchemaMismatch({
                        ruleName: functionName,
                        fieldName: 'srcs',
                        fieldAlias: srcsAlias.value,
                        expectedFieldType: srcsAlias.as,
                      }),
                      details: node.toString(),
                    });
                  }
                  break;
                default:
                  break;
              }

              if (
                element.value?.kind === 'CallExpression' &&
                element.value.functionName?.getTokenLiteral() === SUPPORTED_MANAGED_BUILTINS_LOOKUP.glob
              ) {
                this._logger.trace({
                  ctx: 'visitCallExpressionNode',
                  message: TaskMessages.identified(
                    `a \`glob\` builtin field`,
                    `\`${functionName}.${srcsAlias.value}\``
                  ),
                });
                const isMatch = element.value.args?.elements?.some((arg) => {
                  if (arg.kind === 'ArrayLiteral') {
                    // TODO: handle "glob" include-exclude kwargs
                    return arg.elements?.elements.some((matcher) => {
                      this._logger.trace({
                        ctx: 'visitCallExpressionNode',
                        message: TaskMessages.attempt(
                          'match',
                          `${this._fileName} against "${matcher.getTokenLiteral()}"`
                        ),
                      });
                      return minimatch(this._fileName, String(matcher.getTokenLiteral()));
                    });
                  }
                });
                this._logger.trace({
                  ctx: 'visitCallExpressionNode',
                  message: TaskMessages[isMatch ? 'success' : 'failure'](
                    isMatch ? 'matched' : 'match',
                    `"${this._fileName}" against a matcher in \`${functionName}.${srcsAlias.value}\``
                  ),
                });
                return isMatch;
              }
            }

            this._logger.trace({
              ctx: 'visitCallExpressionNode',
              message:
                TaskMessages.resolve.failure(
                  `${functionName}(${srcsAlias.value} = <${this._fileName}>)`,
                  `"${this._fileName}"`
                ) + ' - continuing...',
            });
          }
        }
      });

      if (isTargetRule) {
        this._logger.trace({
          ctx: 'visitCallExpressionNode',
          message: TaskMessages.identify.success(`target BUILD rule for "${this._fileName}"`, functionName),
          details: node.toString(),
        });
        node.args.elements = node.args.elements.map((element) => {
          if (element.kind === 'KeywordArgumentExpression') {
            return this.visitKeywordArgumentExpressionNode(element, functionName);
          }
          return element;
        });
      } else {
        this._logger.trace({
          ctx: 'visitCallExpressionNode',
          message: TaskMessages.identify.failure(`target BUILD rule for "${this._fileName}"`, functionName),
          details: node.toString(),
        });
      }
    }

    return node;
  };

  private visitKeywordArgumentExpressionNode = (node: KeywordArgumentExpression, functionName: string) => {
    const managedSchema = this._config.manage.schema[functionName];
    const nameSchemaFieldEntries = managedSchema?.name ?? [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.NAME];

    for (const nameAlias of nameSchemaFieldEntries) {
      if (node.key.getTokenLiteral() === nameAlias.value && node.value?.kind === 'StringLiteral') {
        this._status = 'success';
        this._reason = 'build rule name found';
        this._ruleName = String(node.value.getTokenLiteral());
        break;
      }
    }

    return node;
  };

  getResult = () =>
    Object.seal({
      status: this._status,
      reason: this._reason,
      fileName: this._fileName,
      ruleName: this._ruleName,
    });
}
