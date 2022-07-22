import minimatch from 'minimatch';
import path from 'path';
import {DEFAULT_MODULE_RULE_NAME, DEFAULT_TEST_RULE_NAME, SUPPORTED_MANAGED_BUILTINS} from '../common/const';
import {AutodepConfig} from '../common/types';
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

interface BuildRuleNameVisitorOptions {
  config: AutodepConfig;
  rootPath: string;
}
export class BuildRuleNameVisitor {
  private _ruleName: string | null;
  private fileName: string;
  private status: 'success' | 'failed' | 'idle' | 'passthrough';
  private reason: string;
  private config: AutodepConfig;
  private rootPath: string;
  private ruleType: 'module' | 'test';

  constructor({config, rootPath}: BuildRuleNameVisitorOptions) {
    this._ruleName = null;
    this.status = 'idle';
    this.reason = 'took no action';
    this.rootPath = rootPath;
    this.fileName = path.basename(rootPath);
    this.config = config;

    if (this.config.match.isTest(this.rootPath)) {
      this.ruleType = 'test';
    } else if (this.config.match.isModule(this.rootPath)) {
      this.ruleType = 'module';
    } else {
      const error = `[BuildRuleNameVisitor::init]: unsupported file type: ${this.rootPath}. Check your settings at \`<autodepConfig>.match.(module|test)\`. Note, you don't have to double-escape your regex matchers`;
      console.error(error);
      throw new Error(error);
    }
  }

  locateRuleName = (node: ASTNode) => {
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
      case 'Comment':
        result = this.visitCommentNode(node);
        break;
      default:
        this.status = 'passthrough';
        this.reason = 'irrelevant node type passed to `locateRuleName()`';
        return node;
    }

    if (this.status === 'success') {
      return result;
    } else {
      this.status = 'failed';
      this.reason = 'unable to find build rule name in given file';
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

    const isManagedRule = this.config.manage.rules.has(functionName);
    const isManagedBuiltin = SUPPORTED_MANAGED_BUILTINS.some((builtin) => functionName === builtin);
    const isDefaultModuleRule = this.ruleType === 'module' && functionName === DEFAULT_MODULE_RULE_NAME;
    const isDefaultTestRule = this.ruleType === 'test' && functionName !== DEFAULT_TEST_RULE_NAME;

    if (!isManagedRule && !isManagedBuiltin && !isDefaultModuleRule && !isDefaultTestRule) {
      return node;
    }

    if (node.args?.elements && node.args.elements.length > 0) {
      const isTargetRule = node.args.elements.some((element) => {
        if (element.kind === 'KeywordArgumentExpression') {
          switch (element.key.getTokenLiteral()) {
            case 'src':
              if (element.value?.kind === 'StringLiteral') {
                return element.value?.getTokenLiteral() === this.fileName;
              }
            case 'srcs':
              switch (element.value?.kind) {
                case 'ArrayLiteral':
                  return element.value.elements?.elements.some((element) => {
                    if (element?.kind === 'StringLiteral') {
                      return element.getTokenLiteral() === this.fileName;
                    }
                  });
                case 'CallExpression':
                  if (element.value.functionName?.getTokenLiteral() === 'glob') {
                    return element.value.args?.elements?.some((arg) => {
                      switch (arg.kind) {
                        case 'ArrayLiteral': // TODO: handle kwarg "glob" arguments
                          return arg.elements?.elements.some((matcher) =>
                            minimatch(this.fileName, String(matcher.getTokenLiteral()))
                          );
                        default:
                          break;
                      }
                    });
                  }
                  break;
                default:
                  break;
              }
          }
        }
      });

      if (isTargetRule) {
        node.args.elements = node.args.elements.map((element) => {
          if (element.kind === 'KeywordArgumentExpression') {
            return this.visitKeywordArgumentExpressionNode(element);
          }
          return element;
        });
      }
    }

    return node;
  };

  private visitKeywordArgumentExpressionNode = (node: KeywordArgumentExpression) => {
    switch (node.key.getTokenLiteral()) {
      case 'name':
        if (node.value?.kind === 'StringLiteral') {
          this.status = 'success';
          this.reason = 'build rule name found';
          this._ruleName = String(node.value.getTokenLiteral());
        }
        break;
      default:
        break;
    }

    return node;
  };

  getResult = () =>
    Object.seal({
      status: this.status,
      reason: this.reason,
      fileName: this.fileName,
      ruleName: this._ruleName,
    });
}
