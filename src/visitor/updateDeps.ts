import {SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES} from '../common/const';
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
import {NodeQualifier} from './qualify';
import {VisitorBase} from './base';

interface DependencyUpdateVisitorOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
  newDeps: string[];
  builderCls?: typeof DependencyBuilder;
}

export class DependencyUpdateVisitor extends VisitorBase {
  private _newDeps: string[];
  private _removedDeps: string[];

  constructor(
    {config, rootPath, newDeps}: DependencyUpdateVisitorOptions,
    builderCls: typeof DependencyBuilder = DependencyBuilder,
    nodeQualifierCls: typeof NodeQualifier = NodeQualifier
  ) {
    super({config, rootPath, name: 'RuleInsertionVisitor'}, builderCls, nodeQualifierCls);
    this._newDeps = newDeps;
    this._removedDeps = [];
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

    if (this._status === 'success' || this._status === 'failed') {
      return result;
    } else {
      this._status = 'failed';
      this._reason = 'unable to find target rule in given file';
      return node;
    }
  };

  private visitRootNode = (node: RootNode) => {
    const onUpdateFileHeading = this._config.onUpdate[this._nodeQualifier.ruleType].fileHeading ?? '';

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

        // where the deps are added, find the `deps` kwarg field and replace:
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
    } else {
      throw new AutoDepError(
        ErrorType.PARSER,
        `malformed \`ArrayLiteral\` node has no \`ExpressionList\`: ${node.toString()}`
      );
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
