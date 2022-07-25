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
import {AutoDepError, ErrorType} from '../errors/error';
import {DependencyBuilder} from '../language/builder/build';
import {Logger} from '../logger/log';
import {TaskMessages} from '../messages/task';
import {ErrorMessages} from '../messages/error';

interface RuleInsertionVisitorOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
  newDeps: string[];
}

export class RuleInsertionVisitor {
  private builderCls: typeof DependencyBuilder;

  private _config: AutoDepConfig.Output.Schema;
  private _logger: Logger;

  private builder: DependencyBuilder;
  private status: 'success' | 'failed' | 'idle' | 'passthrough';
  private ruleType: 'module' | 'test';
  private reason: string;
  private rootPath: string;
  private didUpdateSubinclude: boolean;

  constructor(
    {config, rootPath, newDeps}: RuleInsertionVisitorOptions,
    builderCls: typeof DependencyBuilder = DependencyBuilder
  ) {
    this._config = config;
    this._logger = new Logger({namespace: 'RuleInsertionVisitor', config: this._config});

    this.builderCls = builderCls;

    this.builder = new this.builderCls({config: this._config, rootPath, newDeps});
    this.status = 'idle';
    this.reason = 'took no action';
    this.rootPath = rootPath;
    this.didUpdateSubinclude = false;

    if (this._config.match.isTest(this.rootPath)) {
      this.ruleType = 'test';
    } else if (this._config.match.isModule(this.rootPath)) {
      this.ruleType = 'module';
    } else {
      throw new AutoDepError(ErrorType.USER, ErrorMessages.user.unsupportedFileType({path: this.rootPath}));
    }
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
        this.status = 'passthrough';
        this.reason = 'irrelevant node type passed to `insertRule` visitor';
        return node;
    }

    if (this.status === 'success') {
      return result;
    } else {
      this.status = 'failed';
      this.reason = 'unable to insert rule into given file';
      return node;
    }
  };

  private visitRootNode = (node: RootNode) => {
    // We need to check whether the first line of any config `fileHeading` is the same as
    // the first line in the file:
    const onUpdateFileHeading = this._config.onUpdate[this.ruleType].fileHeading ?? '';
    const firstLineOfOnUpdateFileHeading = `# ${onUpdateFileHeading.split('\n')[0]}`;

    const onCreateFileHeading = this._config.onCreate[this.ruleType].fileHeading ?? '';
    const firstLineOfOnCreateFileHeading = `# ${onCreateFileHeading.split('\n')[0]}`;

    const firstStatement = node.statements[0];

    const hasOnUpdateCommentHeading = firstLineOfOnUpdateFileHeading.startsWith(
      String(firstStatement?.getTokenLiteral())
    );
    const hasOnCreateCommentHeading = firstLineOfOnCreateFileHeading.startsWith(
      String(firstStatement?.getTokenLiteral())
    );

    const hasCommentHeading = hasOnCreateCommentHeading || hasOnUpdateCommentHeading;

    this._logger.debug({
      ctx: 'insertRule',
      message: JSON.stringify(firstStatement, null, 2),
      details: JSON.stringify(
        {
          hasOnCreateCommentHeading,
          hasOnUpdateCommentHeading,
          firstStatement: String(firstStatement?.getTokenLiteral()),
          firstOnCreate: firstLineOfOnCreateFileHeading,
          firstOnUpdate: firstLineOfOnUpdateFileHeading,
        },
        null,
        2
      ),
    });
    if (firstStatement?.kind === 'CommentStatement' && hasCommentHeading) {
      const [, ...nonFileHeadingStatements] = node.statements;

      node.statements = [
        this.builder.buildFileHeadingCommentStatement(onUpdateFileHeading),
        ...nonFileHeadingStatements.map((statement) => this.visitStatementNode(statement)),
      ];
    } else {
      node.statements = [
        this.builder.buildFileHeadingCommentStatement(onUpdateFileHeading),
        ...node.statements.map((statement) => this.visitStatementNode(statement)),
      ];
    }

    node.statements.push(this.builder.buildNewRule());

    this.status = 'success';
    this.reason = 'new rule successfully inserted into given file';

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
      !this.didUpdateSubinclude &&
      node.functionName?.getTokenLiteral() === SUPPORTED_MANAGED_BUILTINS_LOOKUP.subinclude
    ) {
      const newSubincludes = this._config.onUpdate[this.ruleType].subinclude;

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
            uniqueSubincludes.push(this.builder.buildStringLiteralNode(newSubinclude));
            seen.add(newSubinclude);
          }
        }

        node.args.elements = uniqueSubincludes;
      }

      this.didUpdateSubinclude = true;
    }

    return node;
  };

  getResult = () =>
    Object.seal({
      status: this.status,
      reason: this.reason,
      ruleType: this.ruleType,
    });
}
