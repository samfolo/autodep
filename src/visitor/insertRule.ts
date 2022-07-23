import {ASTNode, CallExpression, ExpressionStatement, RootNode, Expression, Statement} from '../language/ast/types';
import {AutoDepConfig} from '../common/types';
import {SUPPORTED_MANAGED_BUILTINS_LOOKUP} from '../common/const';
import {DependencyBuilder} from '../language/builder/build';

interface RuleInsertionVisitorOptions {
  config: AutoDepConfig;
  rootPath: string;
  newDeps: string[];
  builderCls?: typeof DependencyBuilder;
}

export class RuleInsertionVisitor {
  private readonly builder: DependencyBuilder;
  private status: 'success' | 'failed' | 'idle' | 'passthrough';
  private ruleType: 'module' | 'test';
  private reason: string;
  private config: AutoDepConfig;
  private rootPath: string;

  constructor({config, rootPath, newDeps, builderCls = DependencyBuilder}: RuleInsertionVisitorOptions) {
    this.builder = new builderCls({config, rootPath, newDeps});
    this.status = 'idle';
    this.reason = 'took no action';
    this.config = config;
    this.rootPath = rootPath;

    if (this.config.match.isTest(this.rootPath)) {
      this.ruleType = 'test';
    } else if (this.config.match.isModule(this.rootPath)) {
      this.ruleType = 'module';
    } else {
      const error = `[RuleInsertionVisitor::init]: unsupported file type: ${this.rootPath}. Check your settings at \`<autodepConfig>.match.(module|test)\`. Note, you don't have to double-escape your regex matchers`;
      console.error(error);
      throw new Error(error);
    }
  }

  insertRule = (node: ASTNode) => {
    let result: ASTNode;

    switch (node.type) {
      case 'Root':
        result = this.visitRootNode(node);
        break;
      case 'Expression':
        result = this.visitExpressionNode(node);
        break;
      case 'Statement':
        result = this.visitStatementNode(node);
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
    const onUpdateFileHeading = this.config.onUpdate[this.ruleType].fileHeading ?? '';
    const firstLineOfOnUpdateFileHeading = `# ${onUpdateFileHeading.split('\n')[0]}`;

    const onCreateFileHeading = this.config.onCreate[this.ruleType].fileHeading ?? '';
    const firstLineOfOnCreateFileHeading = `# ${onCreateFileHeading.split('\n')[0]}`;

    const firstStatement = node.statements[0];

    const hasOnUpdateCommentHeading = firstLineOfOnUpdateFileHeading.startsWith(
      String(firstStatement?.getTokenLiteral())
    );
    const hasOnCreateCommentHeading = firstLineOfOnCreateFileHeading.startsWith(
      String(firstStatement?.getTokenLiteral())
    );

    if (firstStatement.kind === 'CommentStatement' && (hasOnCreateCommentHeading || hasOnUpdateCommentHeading)) {
      const [, ...nonFileHeadingStatements] = node.statements;

      node.statements = [
        this.builder.buildFileHeadingCommentStatement(onUpdateFileHeading),
        ...nonFileHeadingStatements.map((statement) => this.visitStatementNode(statement)),
      ];
    } else {
      node.statements = node.statements.map((statement) => this.visitStatementNode(statement));
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
    if (node.functionName?.getTokenLiteral() === SUPPORTED_MANAGED_BUILTINS_LOOKUP.subinclude) {
      const newSubincludes = this.config.onUpdate[this.ruleType].subinclude;

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
