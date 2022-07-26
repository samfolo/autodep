import {
  ASTNode,
  CallExpression,
  ExpressionStatement,
  RootNode,
  Expression,
  Statement,
  Comment,
} from '../language/ast/types';
import {AutoDepConfig} from '../config/types';
import {SUPPORTED_MANAGED_BUILTINS_LOOKUP} from '../common/const';
import {DependencyBuilder} from '../language/builder/build';
import {TaskMessages} from '../messages/task';
import {NodeQualifier} from './qualify';
import {VisitorBase} from './base';
import {Logger} from '../logger/log';
import {TaskStatusClient} from '../clients/taskStatus/task';

interface RuleInsertionVisitorOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
  newDeps: string[];
  targetBuildFilePath: string;
}

export class RuleInsertionVisitor extends VisitorBase {
  private _didUpdateSubinclude: boolean;
  private _newDeps: string[];

  constructor(
    {config, rootPath, newDeps, targetBuildFilePath}: RuleInsertionVisitorOptions,
    builderCls: typeof DependencyBuilder = DependencyBuilder,
    loggerCls: typeof Logger = Logger,
    nodeQualifierCls: typeof NodeQualifier = NodeQualifier,
    taskStatusClientCls: typeof TaskStatusClient = TaskStatusClient
  ) {
    super(
      {config, rootPath, name: 'RuleInsertionVisitor', targetBuildFilePath},
      builderCls,
      loggerCls,
      nodeQualifierCls,
      taskStatusClientCls
    );
    this._didUpdateSubinclude = false;
    this._newDeps = newDeps;
  }

  insertRule = (node: ASTNode) => {
    let result: ASTNode;
    this._taskStatusClient.nextEffect('processing');

    switch (node.type) {
      case 'Root':
        this._logger.trace({ctx: 'insertRule', message: TaskMessages.visit.attempt('RootNode')});
        result = this.visitRootNode(node);
        break;
      case 'Expression':
        this._logger.trace({ctx: 'insertRule', message: TaskMessages.visit.attempt('RootNode')});
        result = this.visitExpressionNode(node);
        break;
      case 'Statement':
        this._logger.trace({ctx: 'insertRule', message: TaskMessages.visit.attempt('RootNode')});
        result = this.visitStatementNode(node);
        break;
      case 'Comment':
        this._logger.trace({ctx: 'insertRule', message: TaskMessages.visit.attempt('Comment')});
        result = this.visitCommentNode(node);
        break;
      default:
        this._taskStatusClient.nextEffect('passthrough', 'irrelevant node type passed to `insertRule` visitor');
        return node;
    }

    const taskState = this._taskStatusClient.getState();

    if (taskState.status === 'success' || taskState.status === 'failed') {
      return result;
    } else {
      this._taskStatusClient.forceState('failed', 'unable to insert rule into given file');
      return node;
    }
  };

  private visitRootNode = (node: RootNode) => {
    const onUpdateFileHeading = this._config.onUpdate[this._nodeQualifier.ruleType].fileHeading ?? '';
    const commentStatement = this._builder.buildFileHeadingCommentStatement(onUpdateFileHeading);

    node.statements = node.statements.map((statement) => this.visitStatementNode(statement));

    // add subinclude if one did not previously exist and subincludes have been specified:
    const subincludeStatement: ExpressionStatement[] = [];
    const newSubincludes = this._config.onUpdate[this._nodeQualifier.ruleType].subinclude;
    if (newSubincludes && !this._didUpdateSubinclude) {
      subincludeStatement.push(this._builder.buildSubincludeStatement([...newSubincludes]));
      this._didUpdateSubinclude = true;
    }

    if (this.shouldUpdateCommentHeading(node, onUpdateFileHeading)) {
      const [, ...nonFileHeadingStatements] = node.statements;

      node.statements = [
        ...(commentStatement ? [commentStatement] : []),
        ...subincludeStatement,
        ...nonFileHeadingStatements,
      ];
    } else {
      node.statements = [...(commentStatement ? [commentStatement] : []), ...subincludeStatement, ...node.statements];
    }

    node.statements.push(this._builder.buildNewRule(this._newDeps));

    this._taskStatusClient.nextEffect('success', 'new rule successfully inserted into given file');
    return node;
  };

  private visitStatementNode = (node: Statement): Statement => {
    switch (node.kind) {
      case 'ExpressionStatement':
        return this.visitExpressionStatementNode(node);
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

  private visitExpressionStatementNode = (node: ExpressionStatement) => {
    if (node.token.type === 'IDENT' && node.expression?.kind === 'CallExpression') {
      node.expression = this.visitCallExpressionNode(node.expression);
    }

    return node;
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
    const isFirstSubinclude =
      !this._didUpdateSubinclude &&
      node.functionName?.getTokenLiteral() === SUPPORTED_MANAGED_BUILTINS_LOOKUP.subinclude;

    if (isFirstSubinclude) {
      this.visitFirstSubinclude(node);
    }

    return node;
  };

  private visitFirstSubinclude = (node: CallExpression) => {
    const newSubincludes = this._config.onUpdate[this._nodeQualifier.ruleType].subinclude;

    if (node.args?.elements && node.args.elements.length > 0 && Array.isArray(newSubincludes)) {
      const seen = new Set();
      const uniqueSubincludes: Expression[] = [];

      for (const originalSubinclude of node.args.elements) {
        if (originalSubinclude.kind === 'StringLiteral' && !seen.has(originalSubinclude.value)) {
          seen.add(originalSubinclude.value);
        }
        uniqueSubincludes.push(originalSubinclude);
      }

      for (const newSubinclude of newSubincludes) {
        if (!seen.has(newSubinclude)) {
          uniqueSubincludes.push(this._builder.buildStringLiteralNode(newSubinclude, node.args.token.scope ?? 0));
          seen.add(newSubinclude);
        }
      }

      node.args.elements = uniqueSubincludes;
    }

    this._didUpdateSubinclude = true;
    return node;
  };

  getResult = () =>
    Object.seal({
      status: this._taskStatusClient.getState().status,
      reason: this._taskStatusClient.getState().reason,
    });
}
