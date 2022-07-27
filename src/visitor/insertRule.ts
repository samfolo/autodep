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

interface RuleInsertionVisitorOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
  newDeps: string[];
}

export class RuleInsertionVisitor extends VisitorBase {
  private _didUpdateSubinclude: boolean;
  private _newDeps: string[];

  constructor(
    {config, rootPath, newDeps}: RuleInsertionVisitorOptions,
    builderCls: typeof DependencyBuilder = DependencyBuilder,
    nodeQualifierCls: typeof NodeQualifier = NodeQualifier
  ) {
    super({config, rootPath, name: 'RuleInsertionVisitor'}, builderCls, nodeQualifierCls);
    this._didUpdateSubinclude = false;
    this._newDeps = newDeps;
  }

  insertRule = (node: ASTNode) => {
    let result: ASTNode;

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
        this._status = 'passthrough';
        this._reason = 'irrelevant node type passed to `insertRule` visitor';
        return node;
    }

    if (this._status === 'success') {
      return result;
    } else {
      this._status = 'failed';
      this._reason = 'unable to insert rule into given file';
      return node;
    }
  };

  private visitRootNode = (node: RootNode) => {
    const onUpdateFileHeading = this._config.onUpdate[this._ruleType].fileHeading ?? '';

    if (this.shouldUpdateCommentHeading(node, onUpdateFileHeading)) {
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

    node.statements.push(this._builder.buildNewRule(this._newDeps));

    this._status = 'success';
    this._reason = 'new rule successfully inserted into given file';

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

  private visitExpressionNode = (node: Expression): Expression => {
    switch (node.kind) {
      case 'CallExpression':
        return this.visitCallExpressionNode(node);
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

  private visitCallExpressionNode = (node: CallExpression) => {
    if (
      !this._didUpdateSubinclude &&
      node.functionName?.getTokenLiteral() === SUPPORTED_MANAGED_BUILTINS_LOOKUP.subinclude
    ) {
      const newSubincludes = this._config.onUpdate[this._ruleType].subinclude;

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
            uniqueSubincludes.push(this._builder.buildStringLiteralNode(newSubinclude));
            seen.add(newSubinclude);
          }
        }

        node.args.elements = uniqueSubincludes;
      }

      this._didUpdateSubinclude = true;
    }

    return node;
  };

  getResult = () =>
    Object.seal({
      status: this._status,
      reason: this._reason,
      ruleType: this._ruleType,
    });
}
