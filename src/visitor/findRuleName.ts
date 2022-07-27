import path from 'path';

import {
  DEFAULT_MODULE_RULE_NAME,
  DEFAULT_TEST_RULE_NAME,
  SUPPORTED_MANAGED_BUILTINS,
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
import {NodeQualifier} from './qualify';

interface RuleNameVisitorOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
}
export class RuleNameVisitor extends AutoDepBase {
  private _nodeQualifierCls: typeof NodeQualifier;
  private _fileName: string;
  private _rootPath: string;
  private _ruleName: string | null;
  private _ruleType: 'module' | 'test';
  private _nodeQualifier: NodeQualifier;

  constructor({config, rootPath}: RuleNameVisitorOptions, nodeQualifierCls: typeof NodeQualifier = NodeQualifier) {
    super({config, name: 'RuleNameVisitor'});
    this._logger.trace({ctx: 'init', message: TaskMessages.initialise.attempt('RuleNameVisitor')});

    this._nodeQualifierCls = nodeQualifierCls;
    this._fileName = path.basename(rootPath);
    this._rootPath = rootPath;
    this._ruleName = null;
    this._nodeQualifier = new this._nodeQualifierCls({config: this._config, fileName: this._fileName});

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

    if (this._status === 'success' || this._status === 'failed') {
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
    const srcsAliases = managedSchema?.srcs ?? [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.SRCS];

    if (node.args?.elements && node.args.elements.length > 0) {
      this._logger.trace({
        ctx: 'visitCallExpressionNode',
        message: TaskMessages.identify.attempt('the target rule', `instance of "${functionName}"`),
      });

      if (this._nodeQualifier.isTargetBuildRule(node, functionName, srcsAliases)) {
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
    const nameAliases = managedSchema?.name ?? [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.NAME];

    for (const nameAlias of nameAliases) {
      if (node.key.getTokenLiteral() === nameAlias.value) {
        if (node.value?.kind === 'StringLiteral') {
          this._status = 'success';
          this._reason = 'build rule name found';
          this._ruleName = String(node.value.getTokenLiteral());
        } else {
          this._nodeQualifier.warnOfBuildSchemaMismatch(
            'visitKeywordArgumentExpressionNode',
            node,
            functionName,
            nameAlias
          );
          this._status = 'failed';
          this._reason = `"${nameAlias.value}"-aliased \`name\` field found, but was not of type "string"`;
        }
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
