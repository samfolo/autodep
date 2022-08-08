import {
  SUPPORTED_MANAGED_BUILTINS_LOOKUP,
  SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES,
  WHITESPACE_SIZE,
} from '../common/const';
import {AutoDepConfig} from '../config/types';
import {AutoDepError, ErrorType} from '../errors/error';
import * as ast from '../language/ast/utils';
import {
  ASTNode,
  CallExpression,
  ArrayLiteral,
  ExpressionStatement,
  RootNode,
  Expression,
  Statement,
  Comment,
  InfixExpression,
} from '../language/ast/types';
import {createToken} from '../language/tokeniser/tokenise';
import {DependencyBuilder} from '../language/builder/build';
import {TaskMessages} from '../messages/task';
import {NodeQualifier} from './qualify';
import {VisitorBase} from './base';
import {Logger} from '../logger/log';
import {TaskStatusClient} from '../clients/taskStatus/task';

interface DependencyUpdateVisitorOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
  newDeps: string[];
  targetBuildFilePath: string;
}

export class DependencyUpdateVisitor extends VisitorBase {
  private _newDeps: string[];
  private _didUpdateSubinclude: boolean;

  constructor(
    {config, rootPath, newDeps, targetBuildFilePath}: DependencyUpdateVisitorOptions,
    builderCls: typeof DependencyBuilder = DependencyBuilder,
    loggerCls: typeof Logger = Logger,
    nodeQualifierCls: typeof NodeQualifier = NodeQualifier,
    taskStatusClientCls: typeof TaskStatusClient = TaskStatusClient
  ) {
    super(
      {config, rootPath, name: 'DependencyUpdateVisitor', targetBuildFilePath},
      builderCls,
      loggerCls,
      nodeQualifierCls,
      taskStatusClientCls
    );
    this._newDeps = newDeps;
    this._didUpdateSubinclude = false;
  }

  updateDeps = (node: ASTNode) => {
    let result: ASTNode;
    this._taskStatusClient.nextEffect('processing');

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
        this._taskStatusClient.nextEffect('passthrough', 'irrelevant node type passed to `updateDeps` visitor');
        return node;
    }

    const taskState = this._taskStatusClient.getState();

    if (taskState.status === 'success' || taskState.status === 'failed') {
      return result;
    } else {
      this._taskStatusClient.forceState('failed', 'unable to find target rule in given file');
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
    if (node.token.type === 'IDENT' && node.expression?.kind === 'CallExpression') {
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

    const isFirstSubinclude =
      !this._didUpdateSubinclude &&
      node.functionName?.getTokenLiteral() === SUPPORTED_MANAGED_BUILTINS_LOOKUP.subinclude;

    if (isFirstSubinclude) {
      this.visitFirstSubinclude(node);
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
          message: TaskMessages.identify.success(`target BUILD rule for "${this._relativeFileName}"`, functionName),
          details: node.toString(),
        });

        // this is where the deps are added; find the `deps` kwarg field and replace:
        node.args.elements = node.args.elements.map((element) => {
          if (element.kind === 'InfixExpression' && element.operator === '=') {
            return this.visitInfixExpressionNode(element, functionName);
          }
          return element;
        });

        const taskState = this._taskStatusClient.getState();
        // this is specific to updateDeps:
        if (taskState.status !== 'success') {
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
            this._builder.buildRuleFieldKwargNode(
              firstDepsAlias.value,
              this._builder.buildArrayNode(
                this._newDeps,
                node.args.token.scope ? node.args.token.scope + WHITESPACE_SIZE : WHITESPACE_SIZE
              ),
              node.args.token.scope ?? 0
            )
          );

          this._taskStatusClient.forceState(
            'success',
            `target rule found, \`${firstDepsAlias.value}\` field added and dependencies updated`
          );
        }
      } else {
        this._logger.trace({
          ctx: 'visitCallExpressionNode',
          message: TaskMessages.identify.failure(`target BUILD rule for "${this._relativeFileName}"`, functionName),
          details: node.toString(),
        });
      }
    }

    return node;
  };

  private visitInfixExpressionNode = (node: InfixExpression, functionName: string) => {
    const managedSchema = this._config.manage.schema[functionName];
    const depsSchemaFieldEntries = managedSchema?.deps ?? [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.DEPS];

    for (const depsAlias of depsSchemaFieldEntries) {
      if (node.left?.getTokenLiteral() === depsAlias.value && node.right?.kind === 'ArrayLiteral') {
        node.right = this.visitArrayLiteralNode(node.right);
        break;
      }
    }

    return node;
  };

  private visitArrayLiteralNode = (node: ArrayLiteral) => {
    if (node.elements) {
      node.elements.elements = this._newDeps.map((dep) =>
        ast.createStringLiteralNode({
          token: createToken('STRING', dep, node.token.scope ? node.token.scope + WHITESPACE_SIZE : 0),
          value: dep,
        })
      );
      this._taskStatusClient.nextEffect('success', 'target rule found, dependencies updated');
    } else {
      throw new AutoDepError(
        ErrorType.PARSER,
        `malformed \`ArrayLiteral\` node has no \`ExpressionList\`: ${node.toString()}`
      );
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
