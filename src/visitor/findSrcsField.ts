import {SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES} from '../common/const';
import {AutoDepConfig} from '../config/types';
import {
  ASTNode,
  Comment,
  CallExpression,
  ExpressionStatement,
  RootNode,
  Expression,
  Statement,
} from '../language/ast/types';
import {DependencyBuilder} from '../language/builder/build';
import {TaskMessages} from '../messages/task';
import {VisitorBase} from './base';
import {NodeQualifier, SrcsFieldReturn} from './qualify';

interface SrcsFieldVisitorOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
}

export class SrcsFieldVisitor extends VisitorBase {
  private _srcsField: SrcsFieldReturn | null;

  constructor(
    {config, rootPath}: SrcsFieldVisitorOptions,
    builderCls: typeof DependencyBuilder = DependencyBuilder,
    nodeQualifierCls: typeof NodeQualifier = NodeQualifier
  ) {
    super({config, rootPath, name: 'SrcsFieldVisitor'}, builderCls, nodeQualifierCls);
    this._srcsField = null;
  }

  locateSrcsField = (node: ASTNode) => {
    let result: ASTNode;

    switch (node.type) {
      case 'Root':
        this._logger.trace({ctx: 'locateSrcsField', message: TaskMessages.visit.attempt('RootNode')});
        result = this.visitRootNode(node);
        break;
      case 'Expression':
        this._logger.trace({ctx: 'locateSrcsField', message: TaskMessages.visit.attempt('Expression')});
        result = this.visitExpressionNode(node);
        break;
      case 'Statement':
        this._logger.trace({ctx: 'locateSrcsField', message: TaskMessages.visit.attempt('Statement')});
        result = this.visitStatementNode(node);
        break;
      case 'Comment':
        this._logger.trace({ctx: 'locateSrcsField', message: TaskMessages.visit.attempt('Comment')});
        result = this.visitCommentNode(node);
        break;
      default:
        this._status = 'passthrough';
        this._reason = 'irrelevant node type passed to `locateSrcsField` visitor';
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
      if (this._srcsField === null) {
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

    if (!this._nodeQualifier.isManagedNode(node)) {
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

        this._status = 'success';
        this._reason = 'build rule srcs field found';
        this._srcsField = this._nodeQualifier.getTargetBuildRuleSrcsField(node, functionName, srcsAliases);
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

  getResult = () =>
    Object.seal({
      status: this._status,
      reason: this._reason,
      ruleName: this._srcsField,
      srcsField: this._srcsField,
    });
}
