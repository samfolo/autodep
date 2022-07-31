import {TaskStatusClient} from '../clients/taskStatus/task';
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
import {Logger} from '../logger/log';
import {TaskMessages} from '../messages/task';
import {VisitorBase} from './base';
import {NodeQualifier, NameFieldLiteral, SrcsFieldLiteral} from './qualify';

interface RuleMetadataVisitorOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
}
export class RuleMetadataVisitor extends VisitorBase {
  private _nameFieldValue: NameFieldLiteral | null;
  private _srcsFieldValue: SrcsFieldLiteral | null;
  private _targetNode: CallExpression | null;

  constructor(
    {config, rootPath}: RuleMetadataVisitorOptions,
    builderCls: typeof DependencyBuilder = DependencyBuilder,
    loggerCls: typeof Logger = Logger,
    nodeQualifierCls: typeof NodeQualifier = NodeQualifier,
    taskStatusClientCls: typeof TaskStatusClient = TaskStatusClient
  ) {
    super(
      {config, rootPath, name: 'RuleMetadataVisitor'},
      builderCls,
      loggerCls,
      nodeQualifierCls,
      taskStatusClientCls
    );

    this._nameFieldValue = null;
    this._srcsFieldValue = null;
    this._targetNode = null;
  }

  collectMetadata = (node: ASTNode) => {
    let result: ASTNode;
    this._taskStatusClient.nextEffect('processing');

    switch (node.type) {
      case 'Root':
        this._logger.trace({ctx: 'collectMetadata', message: TaskMessages.visit.attempt('RootNode')});
        result = this.visitRootNode(node);
        break;
      case 'Expression':
        this._logger.trace({ctx: 'collectMetadata', message: TaskMessages.visit.attempt('Expression')});
        result = this.visitExpressionNode(node);
        break;
      case 'Statement':
        this._logger.trace({ctx: 'collectMetadata', message: TaskMessages.visit.attempt('Statement')});
        result = this.visitStatementNode(node);
        break;
      case 'Comment':
        this._logger.trace({ctx: 'collectMetadata', message: TaskMessages.visit.attempt('Comment')});
        result = this.visitCommentNode(node);
        break;
      default:
        this._taskStatusClient.nextEffect('passthrough', 'irrelevant node type passed to `collectMetadata` visitor');
        return node;
    }

    const taskState = this._taskStatusClient.getState();

    if (taskState.status === 'success' || taskState.status === 'failed') {
      return result;
    } else {
      this._taskStatusClient.forceState('failed', 'unable to find build rule metadata in given file');
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
      if (this._nameFieldValue === null) {
        return this.visitStatementNode(statement);
      }
      return statement;
    });
    return node;
  };

  private visitExpressionStatementNode = (node: ExpressionStatement) => {
    if (node.token.type === 'IDENT' && node.expression?.kind === 'CallExpression') {
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
    const nameAliases = managedSchema?.name ?? [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.NAME];
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

        /* set values here, as target node has been found: */
        this._taskStatusClient.nextEffect('success', 'build rule data found');
        const srcsFieldValue = this._nodeQualifier.getSrcsFieldLiteral(node, functionName, srcsAliases);
        if (!srcsFieldValue) {
          this._taskStatusClient.nextEffect('failed', 'retrieved incomplete data');
        }
        this._srcsFieldValue = srcsFieldValue;

        const nameFieldValue = this._nodeQualifier.getNameFieldLiteral(node, functionName, nameAliases);
        if (!nameFieldValue) {
          this._taskStatusClient.nextEffect('failed', 'retrieved incomplete data');
        }
        this._nameFieldValue = nameFieldValue;

        this._targetNode = node;
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
      status: this._taskStatusClient.getState().status,
      reason: this._taskStatusClient.getState().reason,
      output: {
        name: this._nameFieldValue,
        srcs: this._srcsFieldValue,
        node: this._targetNode,
      },
    });
}
