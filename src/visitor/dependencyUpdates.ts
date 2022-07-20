import minimatch from 'minimatch';

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
} from '../language/ast/types';
import {createToken} from '../language/tokeniser/tokenise';

export class DependencyUpdateVisitor {
  private readonly fileName: string;
  private readonly updatedDeps: string[];
  private status: 'success' | 'failed' | 'idle' | 'passthrough';
  private reason: string;
  private removedDeps: string[];

  constructor(fileName: string, updatedDeps: string[]) {
    this.fileName = fileName;
    this.updatedDeps = updatedDeps;
    this.status = 'idle';
    this.reason = '';
    this.removedDeps = [];
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
      default:
        this.status = 'passthrough';
        this.reason = 'Irrelevant node type';
        return node;
    }

    if (this.status === 'success') {
      return result;
    } else {
      this.status = 'failed';
      this.reason = 'Unable to find target rule';
      return node;
    }
  };

  private visitRootNode = (node: RootNode) => {
    node.statements = node.statements.map((statement) => this.visitStatementNode(statement));
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
      case 'deps':
        if (node.value?.kind === 'ArrayLiteral') {
          node.value = this.visitArrayLiteralNode(node.value);
        }
        break;
      default:
        break;
    }

    return node;
  };

  private visitArrayLiteralNode = (node: ArrayLiteral) => {
    if (node.elements) {
      this.status = 'success';
      this.reason = 'Target rule found, deps updated';
      this.removedDeps = node.elements.elements.map(String);

      node.elements.elements = this.updatedDeps.map((dep) =>
        ast.createStringLiteralNode({token: createToken('STRING', dep), value: dep})
      );
    }
    return node;
  };

  getResult = () =>
    Object.seal({
      status: this.status,
      reason: this.reason,
      removedDeps: this.removedDeps,
    });
}
