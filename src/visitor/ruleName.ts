import minimatch from 'minimatch';
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

export class BuildRuleNameVisitor {
  private fileName: string;
  private _ruleName: string | null;
  private status: 'success' | 'failed' | 'idle' | 'passthrough';
  private reason: string;

  constructor(fileName: string) {
    this.fileName = fileName;
    this._ruleName = null;
    this.status = 'idle';
    this.reason = '';
  }

  get ruleName() {
    return this._ruleName;
  }

  visit = (node: ASTNode) => {
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
        this.reason = 'Irrelevant node type';
        return node;
    }

    if (this.status === 'success') {
      return result;
    } else {
      this.status = 'failed';
      this.reason = 'Unable to find build rule name';
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
      if (this.ruleName === null) {
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
    if (node.args) {
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
          this.reason = 'Build rule name found';
          this._ruleName = String(node.value.getTokenLiteral());
        }
        break;
      default:
        break;
    }

    return node;
  };
}
