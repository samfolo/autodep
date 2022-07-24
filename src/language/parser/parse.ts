/* eslint-disable @typescript-eslint/naming-convention */
import {SYMBOLS} from '../tokeniser/tokens';
import {Token, TokenType, TokenValue} from '../tokeniser/types';

import * as ast from '../ast/utils';
import {Comment, Expression} from '../ast/types';

enum Precedence {
  LOWEST,
  EQUALS,
  LESSGREATER,
  SUM,
  PRODUCT,
  PREFIX,
  CALL,
  INDEX,
}

const precedenceMap = {
  [SYMBOLS.EQUALS]: Precedence.EQUALS,
  [SYMBOLS.PLUS]: Precedence.SUM,
  [SYMBOLS.MINUS]: Precedence.SUM,
  [SYMBOLS.FORWARD_SLASH]: Precedence.PRODUCT,
  [SYMBOLS.ASTERISK]: Precedence.PRODUCT,
  [SYMBOLS.OPEN_PAREN]: Precedence.CALL,
  [SYMBOLS.OPEN_BRACKET]: Precedence.INDEX,
};

export class Parser {
  errors: string[];
  tokens: Token[];
  currentPosition: number;
  nextPosition: number;
  prefixParseFunctions: Partial<Record<TokenType, () => Expression | undefined>>;
  infixParseFunctions: Partial<Record<TokenType, (left: Expression | undefined) => Expression | undefined>>;

  constructor(tokens: Token[]) {
    this.errors = [];
    this.tokens = tokens;
    this.currentPosition = 0;
    this.nextPosition = 1;

    this.infixParseFunctions = {
      EQUALS: this.parseInfixExpression,
      PLUS: this.parseInfixExpression,
      MINUS: this.parseInfixExpression,
      FORWARD_SLASH: this.parseInfixExpression,
      ASTERISK: this.parseInfixExpression,
      OPEN_PAREN: this.parseCallExpression,
      OPEN_BRACKET: this.parseIndexExpression,
    };

    this.prefixParseFunctions = {
      RULE_NAME: this.parseIdentifier,
      RULE_FIELD_NAME: this.parseKeywordArgumentExpression,
      BUILTIN: this.parseIdentifier,
      IDENT: this.parseIdentifier,
      INT: this.parseIntegerLiteral,
      STRING: this.parseStringLiteral,
      MINUS: this.parsePrefixExpression,
      TRUE: this.parseBooleanLiteral,
      FALSE: this.parseBooleanLiteral,
      NONE: this.parseBooleanLiteral,
      OPEN_PAREN: this.parseGroupedExpression,
      OPEN_BRACKET: this.parseArrayLiteral,
      OPEN_BRACE: this.parseMapLiteral,
    };

    // comment parse function?
  }

  parse = () => {
    const root = ast.createRootNode({statements: []});
    while (this.getCurrentToken() && this.getCurrentToken().type !== 'EOF') {
      const statement = this.parseStatement();
      if (statement) {
        root.statements.push(statement);
      }
      this.getNextToken();
    }
    return root;
  };

  // Statements:

  private parseStatement = () => {
    switch (this.getCurrentToken().type) {
      case 'DOUBLE_NEW_LINE':
        while (this.peekNextToken().type === 'DOUBLE_NEW_LINE') {
          this.getNextToken();
        }
        break;
      case 'COMMENT':
        const leadingComment = this.parseLeadingComment();
        this.getNextToken();

        if (this.getCurrentToken().type === 'DOUBLE_NEW_LINE') {
          return this.parseCommentStatement(leadingComment);
        }
        return this.parseExpressionStatement(leadingComment);
      default:
        return this.parseExpressionStatement();
    }
  };

  private parseExpressionStatement = (leadingComment?: Comment) => {
    const statement = ast.createExpressionStatementNode({
      token: this.getCurrentToken(),
      expression: this.parseExpression(Precedence.LOWEST, leadingComment),
    });

    return statement;
  };

  private parseCommentStatement = (comment: Comment) =>
    ast.createCommentStatementNode({
      token: comment.token,
      comment,
    });

  // Comments:

  parseLeadingComment = () => {
    if (this.peekNextToken().type === 'COMMENT') {
      const commentGroup = ast.createCommentGroupNode({token: this.getCurrentToken(), comments: []});

      commentGroup.comments.push(
        ast.createSingleLineCommentNode({
          token: this.getCurrentToken(),
          comment: String(this.getCurrentToken().value),
        })
      );

      while (this.peekNextToken().type === 'COMMENT') {
        this.getNextToken();

        commentGroup.comments.push(
          ast.createSingleLineCommentNode({
            token: this.getCurrentToken(),
            comment: String(this.getCurrentToken().value),
          })
        );
      }

      return commentGroup;
    }

    return ast.createSingleLineCommentNode({
      token: this.getCurrentToken(),
      comment: String(this.getCurrentToken().value),
    });
  };

  parseTrailingComment = (type: 'standard-trail' | 'multiline-trail' = 'standard-trail') => {
    switch (type) {
      case 'standard-trail':
        return ast.createSingleLineCommentNode({
          token: this.getCurrentToken(),
          comment: String(this.getCurrentToken().value),
        });
      // concatenate trailing lines when requested:
      case 'multiline-trail': {
        return this.parseLeadingComment();
      }
      default:
    }
  };

  // Expressions:

  private parseExpression = (
    precedence: Precedence,
    leadingComment: Comment | undefined,
    trailingCommentType: 'standard-trail' | 'multiline-trail' = 'standard-trail'
  ) => {
    const prefixFunction = this.prefixParseFunctions[this.getCurrentToken().type];

    if (!prefixFunction) {
      this.addMissingPrefixParseFunctionError('parseExpression', this.getCurrentToken().type);
      return;
    }

    let leftExpression = prefixFunction();

    if (leftExpression) {
      leftExpression.commentMap.leading = leadingComment;
    }

    while (precedence < this.getTokenPrecedence('next')) {
      const infixFunction = this.infixParseFunctions[this.peekNextToken().type];
      if (!infixFunction) {
        if (leftExpression && this.peekNextToken().type === 'COMMENT') {
          this.getNextToken();
          leftExpression.commentMap.trailing = this.parseTrailingComment(trailingCommentType);
        }
        return leftExpression;
      }

      this.getNextToken();
      leftExpression = infixFunction(leftExpression);
    }

    if (leftExpression && this.peekNextToken().type === 'COMMENT') {
      this.getNextToken();
      leftExpression.commentMap.trailing = this.parseTrailingComment(trailingCommentType);
    }

    return leftExpression;
  };

  // - variables:

  private parseIdentifier = () =>
    ast.createIdentifierNode({token: this.getCurrentToken(), value: String(this.getCurrentToken().value)});

  // - literals:

  private parseStringLiteral = () =>
    ast.createStringLiteralNode({token: this.getCurrentToken(), value: String(this.getCurrentToken().value)});

  private parseBooleanLiteral = () =>
    ast.createBooleanLiteralNode({token: this.getCurrentToken(), value: Boolean(this.getCurrentToken().value)});

  private parseIntegerLiteral = () => {
    const value = String(this.getCurrentToken().value);
    const integerValue = parseInt(value);

    if (isNaN(integerValue)) {
      this.addIntegerParseError('parseIntegerLiteral', value);
      return;
    }

    return ast.createIntegerLiteralNode({token: this.getCurrentToken(), value: integerValue});
  };

  private parseArrayLiteral = () =>
    ast.createArrayLiteralNode({token: this.getCurrentToken(), elements: this.parseExpressionList('CLOSE_BRACKET')});

  private parseMapLiteral = () =>
    ast.createMapLiteralNode({
      token: this.getCurrentToken(),
      map: this.parseKeyValueExpressionList('CLOSE_BRACE'),
    });

  private parseKeyValueExpressionList = (endToken: TokenType) => {
    const pairsExpression = ast.createKeyValueExpressionListNode({token: this.getCurrentToken(), pairs: []});

    if (this.peekNextToken().type === endToken) {
      this.getNextToken();
      return pairsExpression;
    }

    while (this.peekNextToken().type !== endToken) {
      this.getNextToken();

      let keyLeadingComment: Comment | undefined;
      if (this.getCurrentToken().type === 'COMMENT') {
        // short-circuit:
        if (this.peekNextToken().type === endToken) {
          pairsExpression.commentMap.trailing = this.parseTrailingComment('multiline-trail');
          this.getNextToken();
          return pairsExpression;
        }

        keyLeadingComment = this.parseLeadingComment();
        this.getNextToken();
      }

      const keyToken = this.getCurrentToken();
      /**
       * weird edge-case means a multiline-trailing comment...
       * ```
       * {
       *   "k" // this comment is trailing k
       *   // this comment is also trailing k
       *   : "v"
       * }
       * ```
       */
      const key = this.parseExpression(Precedence.LOWEST, keyLeadingComment, 'multiline-trail');
      if (!this.getNextTokenOfTypeOrFail('COLON')) {
        return;
      }

      this.getNextToken();

      let valueLeadingComment: Comment | undefined;
      if (this.getCurrentToken().type === 'COMMENT') {
        valueLeadingComment = this.parseLeadingComment();
        this.getNextToken();
      }

      const value = this.parseExpression(Precedence.LOWEST, valueLeadingComment);

      if (key && value) {
        pairsExpression.pairs.push(ast.createKeyValueExpressionNode({token: keyToken, key, value}));
      } else {
        this.addMapLiteralParseError('parseMapLiteral', key, value);
        return;
      }

      if (
        this.peekNextToken().type !== endToken &&
        this.peekNextToken().type !== 'COMMENT' &&
        !this.getNextTokenOfTypeOrFail('COMMA')
      ) {
        return;
      }
    }

    let trailingComment: Comment | undefined;
    if (this.peekNextToken().type === 'COMMENT') {
      this.getNextToken();
      trailingComment = this.parseTrailingComment();
    }

    if (!this.getNextTokenOfTypeOrFail(endToken)) {
      return;
    }

    pairsExpression.commentMap.trailing = trailingComment;
    return pairsExpression;
  };

  // - complex expressions:

  private parsePrefixExpression = () => {
    const prefixToken = this.getCurrentToken();
    let prefixLeadingComment: Comment | undefined;

    this.getNextToken();

    if (this.getCurrentToken().type === 'COMMENT') {
      prefixLeadingComment = this.parseLeadingComment();
      this.getNextToken();
    }

    const prefixExpression = ast.createPrefixExpressionNode({
      token: prefixToken,
      operator: String(prefixToken.value),
      right: this.parseExpression(Precedence.PREFIX, undefined),
    });

    prefixExpression.commentMap.leading = prefixLeadingComment;

    return prefixExpression;
  };

  private parseInfixExpression = (leftExpression: Expression | undefined) => {
    const infixToken = this.getCurrentToken();
    const infixPrecedence = this.getTokenPrecedence('current');

    this.getNextToken();

    let infixLeadingComment: Comment | undefined;
    if (this.getCurrentToken().type === 'COMMENT') {
      infixLeadingComment = this.parseLeadingComment();
      this.getNextToken();
    }

    return ast.createInfixExpressionNode({
      token: infixToken,
      operator: String(infixToken.value),
      left: leftExpression,
      right: this.parseExpression(infixPrecedence, infixLeadingComment),
    });
  };

  private parseCallExpression = (functionName: Expression | undefined) =>
    ast.createCallExpressionNode({
      token: this.getCurrentToken(),
      functionName,
      args: this.parseExpressionList('CLOSE_PAREN'),
    });

  private parseExpressionList = (endToken: TokenType) => {
    const expressionList = ast.createExpressionListNode({token: this.getCurrentToken(), elements: []});
    if (this.peekNextToken().type === endToken) {
      this.getNextToken();
      return expressionList;
    }

    this.getNextToken();

    let leadingComment: Comment | undefined;
    if (this.getCurrentToken().type === 'COMMENT') {
      leadingComment = this.parseLeadingComment();
      this.getNextToken();
    }

    const firstEl = this.parseExpression(Precedence.LOWEST, leadingComment);
    if (firstEl) {
      expressionList.elements.push(firstEl);
    }

    while (this.peekNextToken().type === 'COMMA') {
      // skip the comma:
      this.getNextToken();
      this.getNextToken();

      let nextComment: Comment | undefined;
      if (this.getCurrentToken().type === 'COMMENT') {
        nextComment = this.parseLeadingComment();
        this.getNextToken();
      }

      // if it was a trailing comma:
      if (this.getCurrentToken().type === endToken) {
        expressionList.commentMap.trailing = nextComment;
        return expressionList;
      }

      const nextEl = this.parseExpression(Precedence.LOWEST, nextComment);
      if (nextEl) {
        expressionList.elements.push(nextEl);
      }
    }

    if (this.peekNextToken().type === 'COMMA') {
      this.getNextToken();
      this.getNextToken();
    }

    let trailingComment: Comment | undefined;
    if (this.peekNextToken().type === 'COMMENT') {
      this.getNextToken();
      trailingComment = this.parseTrailingComment();
    }

    if (!this.getNextTokenOfTypeOrFail(endToken)) {
      return;
    }

    expressionList.commentMap.trailing = trailingComment;
    return expressionList;
  };

  private parseIndexExpression = (left: Expression | undefined) => {
    const indexToken = this.getCurrentToken();
    this.getNextToken();

    let indexLeadingComment: Comment | undefined;
    if (this.getCurrentToken().type === 'COMMENT') {
      indexLeadingComment = this.parseLeadingComment();
      this.getNextToken();
    }
    const indexExpression = ast.createIndexExpressionNode({
      token: indexToken,
      left,
      index: this.parseExpression(Precedence.LOWEST, indexLeadingComment),
    });

    if (!this.getNextTokenOfTypeOrFail('CLOSE_BRACKET')) {
      return;
    }

    return indexExpression;
  };

  private parseGroupedExpression = () => {
    this.getNextToken();

    let groupedLeadingComment: Comment | undefined;
    if (this.getCurrentToken().type === 'COMMENT') {
      groupedLeadingComment = this.parseLeadingComment();
      this.getNextToken();
    }

    const expression = this.parseExpression(Precedence.LOWEST, groupedLeadingComment);

    if (!this.getNextTokenOfTypeOrFail('CLOSE_PAREN')) {
      return;
    }

    return expression;
  };

  private parseKeywordArgumentExpression = () => {
    const kwargKeyExpression = ast.createIdentifierNode({
      token: this.getCurrentToken(),
      value: String(this.getCurrentToken().value),
    });

    if (this.peekNextToken().type === 'COMMENT') {
      this.getNextToken();
      kwargKeyExpression.commentMap.trailing = this.parseTrailingComment('multiline-trail');
    }

    if (!this.getNextTokenOfTypeOrFail('EQUALS')) {
      return;
    }

    this.getNextToken();

    let kwargValueLeadingComment: Comment | undefined;
    if (this.getCurrentToken().type === 'COMMENT') {
      kwargValueLeadingComment = this.parseLeadingComment();
      this.getNextToken();
    }

    return ast.createKeywordArgumentExpressionNode({
      token: kwargKeyExpression.token,
      key: kwargKeyExpression,
      value: this.parseExpression(Precedence.LOWEST, kwargValueLeadingComment),
    });
  };

  // Token management:

  private getCurrentToken = () => this.tokens[this.currentPosition];

  private peekNextToken = () => this.tokens[this.nextPosition];

  private getNextToken = () => {
    this.currentPosition = this.nextPosition;
    this.nextPosition++;
  };

  private getNextTokenOfTypeOrFail = (expectedType: TokenType) => {
    if (this.peekNextToken().type === expectedType) {
      this.getNextToken();
      return true;
    } else {
      this.addNextTokenError('getNextTokenOfTypeOrFail', expectedType);
      return false;
    }
  };

  private getTokenPrecedence = (position: 'current' | 'next') => {
    switch (position) {
      case 'current':
        return precedenceMap[this.getCurrentToken().value] ?? Precedence.LOWEST;
      case 'next':
        return precedenceMap[this.peekNextToken().value] ?? Precedence.LOWEST;
      default:
        return Precedence.LOWEST;
    }
  };

  // Error handling:

  private addNextTokenError = (source: string, expected: TokenType) => {
    this.errors.push(`${source}: Expected ${expected} at next position, found token: ${this.peekNextToken().type}.`);
    console.error(`${source}: Expected ${expected} at next position, found token: ${this.peekNextToken().type}.`);
  };

  private addMissingPrefixParseFunctionError = (source: string, target: TokenType) => {
    this.errors.push(`${source}: No prefix parse function found for token: ${target}.`);
    console.error(`${source}: No prefix parse function found for token: ${target}.`);
  };

  private addIntegerParseError = (source: string, value: TokenValue) => {
    this.errors.push(`${source}: Cannot parse value as integer: ${value}.`);
    console.error(`${source}: Cannot parse value as integer: ${value}.`);
  };

  private addMapLiteralParseError = (source: string, key: Expression | undefined, value: Expression | undefined) => {
    let reason = '';

    switch (true) {
      case !key && value:
        reason = `invalid key expression: ${key}`;
        break;
      case key && !value:
        reason = `invalid value expression: ${value}`;
        break;
      default:
        reason = `invalid expressions for key: ${key} and value: ${value} `;
        break;
    }

    this.errors.push(`${source}: Cannot parse map literal: ${reason}.`);
    console.error(`${source}: Cannot parse map literal: ${reason}.`);
  };
}
