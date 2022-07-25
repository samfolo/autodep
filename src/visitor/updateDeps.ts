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
import * as ast from '../language/ast/utils';
import {
  ASTNode,
  CallExpression,
  ArrayLiteral,
  KeywordArgumentExpression,
  ExpressionStatement,
  RootNode,
  Expression,
  Statement,
  Comment,
} from '../language/ast/types';
import {createToken} from '../language/tokeniser/tokenise';
import {DependencyBuilder} from '../language/builder/build';
import {TaskMessages} from '../messages/task';
import {ErrorMessages} from '../messages/error';
import {AutoDepBase} from '../inheritance/base';

interface DependencyUpdateVisitorOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
  newDeps: string[];
  builderCls?: typeof DependencyBuilder;
}

export class DependencyUpdateVisitor extends AutoDepBase {
  private _builderCls: typeof DependencyBuilder;
  private _builder: DependencyBuilder;
  private _fileName: string;
  private _newDeps: string[];
  private _removedDeps: string[];
  private _rootPath: string;
  private _ruleType: 'module' | 'test';

  constructor(
    {config, rootPath, newDeps}: DependencyUpdateVisitorOptions,
    builderCls: typeof DependencyBuilder = DependencyBuilder
  ) {
    super({config, name: 'DependencyUpdateVisitor'});
    this._logger.trace({ctx: 'init', message: TaskMessages.initialise.attempt('DependencyUpdateVisitor')});

    this._builderCls = builderCls;

    this._builder = new this._builderCls({config: this._config, rootPath, newDeps});
    this._fileName = path.basename(rootPath);
    this._newDeps = newDeps;
    this._removedDeps = [];
    this._rootPath = rootPath;

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

  updateDeps = (node: ASTNode) => {
    let result: ASTNode;

    switch (node.type) {
      case 'Root':
        this._logger.trace({ctx: 'updateDeps', message: TaskMessages.visit.attempt('RootNode')});
        result = this.visitRootNode(node);
        break;
      case 'Expression':
        this._logger.trace({ctx: 'updateDeps', message: TaskMessages.visit.attempt('Expression')});
        result = this.visitExpressionNode(node);
        break;
      case 'Statement':
        this._logger.trace({ctx: 'updateDeps', message: TaskMessages.visit.attempt('Statement')});
        result = this.visitStatementNode(node);
        break;
      case 'Comment':
        this._logger.trace({ctx: 'updateDeps', message: TaskMessages.visit.attempt('Comment')});
        result = this.visitCommentNode(node);
        break;
      default:
        this._status = 'passthrough';
        this._reason = 'irrelevant node type passed to `updateDeps` visitor';
        return node;
    }

    if (this._status === 'success') {
      return result;
    } else {
      this._status = 'failed';
      this._reason = 'unable to find target rule in given file';
      return node;
    }
  };

  private visitRootNode = (node: RootNode) => {
    // We need to check whether the first line of any config `fileHeading` is the same as
    // the first line in the file:
    const onUpdateFileHeading = this._config.onUpdate[this._ruleType].fileHeading ?? '';
    const firstLineOfOnUpdateFileHeading = `# ${onUpdateFileHeading.split('\n')[0]}`;

    const onCreateFileHeading = this._config.onCreate[this._ruleType].fileHeading ?? '';
    const firstLineOfOnCreateFileHeading = `# ${onCreateFileHeading.split('\n')[0]}`;

    const firstStatement = node.statements[0];

    const hasOnUpdateCommentHeading = firstLineOfOnUpdateFileHeading.startsWith(
      String(firstStatement?.getTokenLiteral())
    );
    const hasOnCreateCommentHeading = firstLineOfOnCreateFileHeading.startsWith(
      String(firstStatement?.getTokenLiteral())
    );

    const hasCommentHeading = hasOnCreateCommentHeading || hasOnUpdateCommentHeading;

    if (firstStatement?.kind === 'CommentStatement' && hasCommentHeading) {
      const [, ...nonFileHeadingStatements] = node.statements;

      node.statements = [
        this._builder.buildFileHeadingCommentStatement(onUpdateFileHeading),
        ...nonFileHeadingStatements.map((statement) => this.visitStatementNode(statement)),
      ];
    } else {
      node.statements = [
        this._builder.buildFileHeadingCommentStatement(onUpdateFileHeading),
        ...node.statements.map((statement) => this.visitStatementNode(statement)),
      ];
    }

    return node;
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

  private visitExpressionStatementNode = (node: ExpressionStatement) => {
    if (node.token.type === 'RULE_NAME' && node.expression?.kind === 'CallExpression') {
      node.expression = this.visitCallExpressionNode(node.expression);
    }

    return node;
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
        return this.visitCallExpressionNode(node);
      default:
        return node;
    }
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
          name: functionName,
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
                          minimatch(this._fileName, String(matcher.getTokenLiteral()));
                        });
                      }
                    });
                    this._logger.trace({
                      ctx: 'visitCallExpressionNode',
                      message: TaskMessages[isMatch ? 'success' : 'failure'](
                        'match',
                        `"${this._fileName}" against a matcher in \`${functionName}.${srcsAlias.value}\``
                      ),
                    });
                  }
                  break;
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

        // this is specific to updateDeps:
        if (this._status !== 'success') {
          // this means there was no deps array... so we add one:
          const managedSchema = this._config.manage.schema[functionName];
          const [firstDepsAlias] = managedSchema?.deps ?? [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.DEPS];

          this._logger.trace({
            ctx: 'visitCallExpressionNode',
            message:
              TaskMessages.locate.failure(`"${firstDepsAlias.value}"-aliased \`deps\` field in target rule`) +
              ' - inserting one...',
            details: node.toString(),
          });
          node.args.elements.push(
            this._builder.buildRuleFieldKwargNode(firstDepsAlias.value, this._builder.buildArrayNode(this._newDeps))
          );

          this._status = 'success';
          this._reason = `target rule found, \`${firstDepsAlias.value}\` field added and dependencies updated`;
        }
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
    const depsSchemaFieldEntries = managedSchema?.deps ?? [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.DEPS];

    for (const depsAlias of depsSchemaFieldEntries) {
      if (node.key.getTokenLiteral() === depsAlias.value && node.value?.kind === 'ArrayLiteral') {
        node.value = this.visitArrayLiteralNode(node.value);
        break;
      }
    }

    return node;
  };

  private visitArrayLiteralNode = (node: ArrayLiteral) => {
    if (node.elements) {
      this._removedDeps = node.elements.elements.map(String);

      node.elements.elements = this._newDeps.map((dep) =>
        ast.createStringLiteralNode({token: createToken('STRING', dep), value: dep})
      );
      this._status = 'success';
      this._reason = 'target rule found, dependencies updated';
    }
    return node;
  };

  getResult = () =>
    Object.seal({
      status: this._status,
      reason: this._reason,
      removedDeps: this._removedDeps,
    });
}
