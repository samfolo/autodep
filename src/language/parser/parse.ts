/* eslint-disable @typescript-eslint/naming-convention */
import {SYMBOLS} from '../tokeniser/tokens';
import {Token, TokenType, TokenValue} from '../tokeniser/types';

import * as ast from '../ast/utils';
import {Comment, Expression, ParameterList, Statement} from '../ast/types';
import {AutoDepBase} from '../../inheritance/base';
import {AutoDepConfig} from '../../config/types';
import {EventTracer} from '../utility/trace';

const traceEvents = function (): MethodDecorator {
  return function (_, memberName: string | symbol, propertyDescriptor: PropertyDescriptor) {
    const originalMethod: (...args: any[]) => any = propertyDescriptor.value;

    const newMethod = function (this: Parser, ...args: any[]) {
      const self = this;
      try {
        self.eventTracer.enter({ctx: String(memberName), token: self.getCurrentToken()});
        const method = originalMethod.bind(self);
        const result = method.apply(self, args);
        self.eventTracer.exit({
          ctx: String(memberName),
          token: self.getCurrentToken(),
          leadingComment: result?.leading?.toString(),
          trailingComment: result?.trailing?.toString(),
        });
        return result;
      } catch (error) {
        const err = error as Error;
        switch (err.constructor) {
          case SyntaxError:
          case TypeError:
            self._logger.error({ctx: String(memberName), message: err.stack ?? ''});
          default:
            throw err;
        }
      }
    };

    propertyDescriptor.value = newMethod;
    return propertyDescriptor;
  };
};

enum Precedence {
  LOWEST,
  EQ,
  LESSGREATER,
  SUM,
  PRODUCT,
  PREFIX,
  MEMBER,
  CALL,
  INDEX,
}

const precedenceMap = {
  [SYMBOLS.EQ]: Precedence.EQ,
  [SYMBOLS.PLUS]: Precedence.SUM,
  [SYMBOLS.MINUS]: Precedence.SUM,
  [SYMBOLS.FORWARD_SLASH]: Precedence.PRODUCT,
  [SYMBOLS.ASTERISK]: Precedence.PRODUCT,
  [SYMBOLS.DOT]: Precedence.MEMBER,
  [SYMBOLS.OPEN_PAREN]: Precedence.CALL,
  [SYMBOLS.OPEN_BRACKET]: Precedence.INDEX,
};

interface ParserOptions {
  tokens: Token[];
  config: AutoDepConfig.Output.Schema;
}

export class Parser extends AutoDepBase {
  private _eventTracerCls: typeof EventTracer;
  private _eventTracer: EventTracer;
  errors: string[];
  tokens: Token[];
  currentPosition: number;
  nextPosition: number;
  prefixParseFunctions: Partial<Record<TokenType, () => Expression | undefined>>;
  infixParseFunctions: Partial<Record<TokenType, (left: Expression | undefined) => Expression | undefined>>;

  constructor({tokens, config}: ParserOptions, eventTracerCls: typeof EventTracer = EventTracer) {
    super({config, name: 'Parser'});

    this._eventTracerCls = eventTracerCls;
    this.errors = [];
    this.tokens = tokens;
    this.currentPosition = 0;
    this.nextPosition = 1;
    this._eventTracer = new this._eventTracerCls();

    this.infixParseFunctions = {
      EQ: this.parseInfixExpression,
      NOT_EQ: this.parseInfixExpression,
      LT: this.parseInfixExpression,
      LT_EQ: this.parseInfixExpression,
      GT: this.parseInfixExpression,
      GT_EQ: this.parseInfixExpression,
      ASSIGN: this.parseInfixExpression,
      PLUS: this.parseInfixExpression,
      MINUS: this.parseInfixExpression,
      FORWARD_SLASH: this.parseInfixExpression,
      ASTERISK: this.parseInfixExpression,
      OPEN_PAREN: this.parseCallExpression,
      OPEN_BRACKET: this.parseIndexExpression,
      DOT: this.parseDotExpression,
    };

    this.prefixParseFunctions = {
      IDENT: this.parseIdentifier,
      // TODO: "parseTypeHint" for complex type hints
      TYPE_HINT: this.parseIdentifier,
      INT: this.parseIntegerLiteral,
      STRING: this.parseStringLiteral,
      FSTRING: this.parseFStringLiteral,
      BSTRING: this.parseBStringLiteral,
      RSTRING: this.parseRStringLiteral,
      USTRING: this.parseUStringLiteral,
      DOCSTRING: this.parseDocStringLiteral,
      BANG: this.parsePrefixExpression,
      MINUS: this.parsePrefixExpression,
      TRUE: this.parseBooleanLiteral,
      FALSE: this.parseBooleanLiteral,
      NONE: this.parseIdentifier,
      OPEN_PAREN: this.parseGroupedExpression,
      OPEN_BRACKET: this.parseArrayLiteral,
      OPEN_BRACE: this.parseMapLiteral,
    };
  }

  get eventTracer() {
    return this._eventTracer;
  }

  @traceEvents()
  parse() {
    const root = ast.createRootNode({statements: []});
    if (this.peekCurrentTokenIs(['DOUBLE_NEW_LINE'])) {
      this.getNextRealToken();
    }

    while (this.getCurrentToken() && this.getCurrentToken().type !== 'EOF') {
      const statement = this.parseStatement();
      if (statement) {
        root.statements.push(statement);
      }
      this.getNextRealToken();
    }
    return root;
  }

  // Statements:

  @traceEvents()
  parseStatement(leadingComment?: Comment): Statement | null {
    switch (this.getCurrentToken().type) {
      case 'DEF':
        return this.parseFunctionDefinition(leadingComment);
      case 'RETURN':
      case 'COMMENT':
        const comment = this.parseLeadingComment();
        this.getNextToken();

        if (this.peekCurrentTokenIs(['DOUBLE_NEW_LINE'])) {
          return this.parseCommentStatement(comment);
        }
        return this.parseStatement(comment);
      default:
        return this.parseExpressionStatement(leadingComment);
    }
  }

  @traceEvents()
  parseExpressionStatement(leadingComment?: Comment) {
    const statement = ast.createExpressionStatementNode({
      token: this.getCurrentToken(),
      expression: this.parseExpression(Precedence.LOWEST, leadingComment),
    });

    return statement;
  }

  @traceEvents()
  parseBlockStatement(leadingComment?: Comment) {
    const blockStatementToken = this.getCurrentToken();
    const blockStatement = ast.createBlockStatementNode({token: blockStatementToken, statements: []});
    blockStatement.commentMap.leading = leadingComment;

    const isInBlockStatement = () =>
      blockStatementToken.scope <= this.getCurrentToken().scope && this.getCurrentToken().type !== 'EOF';

    while (isInBlockStatement()) {
      const statement = this.parseStatement();
      if (statement) {
        blockStatement.statements.push(statement);
      }
      this.getNextToken();
    }

    return blockStatement;
  }

  @traceEvents()
  parseCommentStatement(comment: Comment) {
    return ast.createCommentStatementNode({
      token: comment.token,
      comment,
    });
  }

  // Comments:

  @traceEvents()
  parseLeadingComment() {
    if (this.peekNextTokenIs(['COMMENT'])) {
      const commentGroup = ast.createCommentGroupNode({token: this.getCurrentToken(), comments: []});

      commentGroup.comments.push(
        ast.createSingleLineCommentNode({
          token: this.getCurrentToken(),
          comment: String(this.getCurrentToken().value),
        })
      );

      while (this.peekNextTokenIs(['COMMENT'])) {
        this.getNextRealToken();

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
  }

  @traceEvents()
  parseTrailingComment(type: 'standard-trail' | 'multiline-trail' = 'standard-trail') {
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
  }

  // Expressions:

  @traceEvents()
  parseExpression(
    precedence: Precedence,
    leadingComment: Comment | undefined,
    trailingCommentType: 'standard-trail' | 'multiline-trail' = 'standard-trail'
  ) {
    // need to bind `this` here so `this` context is not lost in the `@traceEvents` decorator.
    const prefixFunction = this.prefixParseFunctions[this.getCurrentToken().type]?.bind(this);

    if (!prefixFunction) {
      this.addMissingPrefixParseFunctionError('parseExpression', this.getCurrentToken().type);
      return;
    }

    let leftExpression = prefixFunction();

    if (leftExpression) {
      leftExpression.commentMap.leading = leadingComment;
    }

    while (precedence < this.getTokenPrecedence('next')) {
      // need to bind `this` here so `this` context is not lost in the `@traceEvents` decorator.
      const infixFunction = this.infixParseFunctions[this.peekNextToken().type]?.bind(this);
      if (!infixFunction) {
        if (leftExpression && this.peekNextTokenIs(['COMMENT'])) {
          this.getNextRealToken();
          leftExpression.commentMap.trailing = this.parseTrailingComment(trailingCommentType);
        }
        return leftExpression;
      }

      this.getNextRealToken();
      leftExpression = infixFunction(leftExpression);
    }

    if (leftExpression && this.peekNextTokenIs(['COMMENT'])) {
      this.getNextRealToken();
      leftExpression.commentMap.trailing = this.parseTrailingComment(trailingCommentType);
    }

    return leftExpression;
  }

  // - variables:

  @traceEvents()
  parseIdentifier() {
    return ast.createIdentifierNode({token: this.getCurrentToken(), value: String(this.getCurrentToken().value)});
  }

  // - literals:

  @traceEvents()
  parseStringLiteral() {
    return ast.createStringLiteralNode({token: this.getCurrentToken(), value: String(this.getCurrentToken().value)});
  }

  @traceEvents()
  parseFStringLiteral() {
    return ast.createFStringLiteralNode({
      token: this.getCurrentToken(),
      value: String(this.getCurrentToken().value),
      prefix: 'f',
    });
  }

  @traceEvents()
  parseBStringLiteral() {
    return ast.createBStringLiteralNode({
      token: this.getCurrentToken(),
      value: String(this.getCurrentToken().value),
      prefix: 'b',
    });
  }

  @traceEvents()
  parseRStringLiteral() {
    return ast.createRStringLiteralNode({
      token: this.getCurrentToken(),
      value: String(this.getCurrentToken().value),
      prefix: 'r',
    });
  }

  @traceEvents()
  parseUStringLiteral() {
    return ast.createUStringLiteralNode({
      token: this.getCurrentToken(),
      value: String(this.getCurrentToken().value),
      prefix: 'u',
    });
  }

  @traceEvents()
  parseDocStringLiteral() {
    return ast.createDocStringLiteralNode({
      token: this.getCurrentToken(),
      value: String(this.getCurrentToken().value),
    });
  }

  @traceEvents()
  parseBooleanLiteral() {
    return ast.createBooleanLiteralNode({
      token: this.getCurrentToken(),
      value: this.getCurrentToken().value === 'True',
    });
  }

  @traceEvents()
  parseIntegerLiteral() {
    const value = String(this.getCurrentToken().value);
    const integerValue = parseInt(value);

    if (isNaN(integerValue)) {
      this.addIntegerParseError('parseIntegerLiteral', value);
      return;
    }

    return ast.createIntegerLiteralNode({token: this.getCurrentToken(), value: integerValue});
  }

  @traceEvents()
  parseArrayLiteral() {
    return ast.createArrayLiteralNode({
      token: this.getCurrentToken(),
      elements: this.parseExpressionList('CLOSE_BRACKET'),
    });
  }

  @traceEvents()
  parseMapLiteral() {
    return ast.createMapLiteralNode({
      token: this.getCurrentToken(),
      map: this.parseKeyValueExpressionList('CLOSE_BRACE'),
    });
  }

  @traceEvents()
  parseKeyValueExpressionList(endToken: TokenType) {
    const pairsExpression = ast.createKeyValueExpressionListNode({token: this.getCurrentToken(), pairs: []});

    if (this.peekNextTokenIs([endToken])) {
      this.getNextRealToken();
      return pairsExpression;
    }

    while (!this.peekNextTokenIs([endToken])) {
      this.getNextRealToken();

      let keyLeadingComment: Comment | undefined;
      if (this.peekCurrentTokenIs(['COMMENT'])) {
        // short-circuit:
        if (this.peekNextTokenIs([endToken])) {
          pairsExpression.commentMap.trailing = this.parseTrailingComment('multiline-trail');
          this.getNextRealToken();
          return pairsExpression;
        }

        keyLeadingComment = this.parseLeadingComment();
        this.getNextRealToken();
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
      if (!this.getNextTokenOfTypeOrFail(['COLON'])) {
        return;
      }

      this.getNextRealToken();

      let valueLeadingComment: Comment | undefined;
      if (this.peekCurrentTokenIs(['COMMENT'])) {
        valueLeadingComment = this.parseLeadingComment();
        this.getNextRealToken();
      }

      const value = this.parseExpression(Precedence.LOWEST, valueLeadingComment);

      if (key && value) {
        pairsExpression.pairs.push(ast.createKeyValueExpressionNode({token: keyToken, key, value}));
      } else {
        this.addMapLiteralParseError('parseMapLiteral', key, value);
        return;
      }

      if (this.peekNextTokenIs([endToken])) {
        break;
      }

      if (!this.getNextTokenOfTypeOrFail(['COMMA', 'COMMENT'])) {
        return;
      }
    }

    let trailingComment: Comment | undefined;
    if (this.peekNextTokenIs(['COMMENT'])) {
      this.getNextRealToken();
      trailingComment = this.parseTrailingComment();
    }

    if (!this.getNextTokenOfTypeOrFail([endToken])) {
      return;
    }

    pairsExpression.commentMap.trailing = trailingComment;
    return pairsExpression;
  }

  @traceEvents()
  parseFunctionDefinition(leadingComment?: Comment) {
    const functionDefinitionToken = this.getCurrentToken();
    if (!this.getNextTokenOfTypeOrFail(['IDENT'])) {
      return null;
    }

    const functionName = this.parseIdentifier();

    if (!this.getNextTokenOfTypeOrFail(['OPEN_PAREN'])) {
      return null;
    }
    const params = this.parseFunctionParameters();

    let typeHint: Expression | undefined;

    if (this.peekNextTokenIs(['POINT'])) {
      this.getNextRealToken();
      if (!this.getNextTokenOfTypeOrFail(['NONE', 'TYPE_HINT'])) {
        return null;
      }
      typeHint = this.parseExpression(Precedence.LOWEST, leadingComment, 'multiline-trail');
    }

    if (!this.getNextTokenOfTypeOrFail(['COLON'])) {
      return null;
    }

    this.getNextRealToken();

    const body = this.parseBlockStatement();

    const functionDefinition = ast.createFunctionDefinitionNode({
      token: functionDefinitionToken,
      name: functionName,
      params,
      typeHint,
      body,
    });

    return functionDefinition;
  }

  @traceEvents()
  parseFunctionParameters(): ParameterList | undefined {
    const functionParameters = ast.createParameterListNode({token: this.getCurrentToken(), elements: []});

    if (this.peekNextTokenIs(['CLOSE_PAREN'])) {
      this.getNextRealToken();
      return functionParameters;
    }

    this.getNextRealToken();

    let leadingComment: Comment | undefined;
    if (this.peekCurrentTokenIs(['COMMENT'])) {
      leadingComment = this.parseLeadingComment();
      this.getNextRealToken();
    }

    const firstEl = this.parseFunctionParameter(leadingComment);
    if (firstEl) {
      functionParameters.elements.push(firstEl);
      this.logCollectionEvent('parseFunctionParameters');
    }

    while (this.peekNextTokenIs(['COMMA'])) {
      // skip the comma:
      this.getNextRealToken();
      this.getNextRealToken();

      let nextComment: Comment | undefined;
      if (this.peekCurrentTokenIs(['COMMENT'])) {
        nextComment = this.parseLeadingComment();
        this.getNextRealToken();
      }

      // if it was a trailing comma:
      if (this.peekCurrentTokenIs(['CLOSE_PAREN'])) {
        functionParameters.commentMap.trailing = nextComment;
        return functionParameters;
      }

      const nextEl = this.parseFunctionParameter(nextComment);
      if (nextEl) {
        functionParameters.elements.push(nextEl);
        this.logCollectionEvent('parseFunctionParameters');
      }
    }

    this.logEndOfListEvent('parseFunctionParameters');

    if (this.peekNextTokenIs(['COMMA'])) {
      this.getNextRealToken();
      this.getNextRealToken();
    }

    let trailingComment: Comment | undefined;
    if (this.peekNextTokenIs(['COMMENT'])) {
      this.getNextRealToken();
      trailingComment = this.parseTrailingComment();
    }

    if (!this.getNextTokenOfTypeOrFail(['CLOSE_PAREN'])) {
      return;
    }

    functionParameters.commentMap.trailing = trailingComment;
    return functionParameters;
  }

  @traceEvents()
  parseFunctionParameter(leadingComment?: Comment) {
    const functionParameterToken = this.getCurrentToken();
    const name = this.parseExpression(Precedence.LOWEST, leadingComment, 'multiline-trail');

    let typeHint: Expression | undefined;
    if (this.peekNextTokenIs(['COLON'])) {
      this.getNextRealToken();

      let typeHintComment: Comment | undefined;
      if (this.peekNextTokenIs(['COMMENT'])) {
        this.getNextRealToken();
        typeHintComment = this.parseLeadingComment();
      }

      if (!this.getNextTokenOfTypeOrFail(['NONE', 'TYPE_HINT'])) {
        return;
      }

      typeHint = this.parseExpression(Precedence.LOWEST, typeHintComment, 'multiline-trail');
    }

    let defaultValue: Expression | undefined;
    if (this.peekNextTokenIs(['ASSIGN'])) {
      this.getNextRealToken();

      let defaultValueComment: Comment | undefined;
      if (this.peekNextTokenIs(['COMMENT'])) {
        this.getNextRealToken();
        defaultValueComment = this.parseLeadingComment();
      }

      this.getNextRealToken();

      defaultValue = this.parseExpression(Precedence.LOWEST, defaultValueComment, 'multiline-trail');
    }

    const parameter = ast.createParameterNode({
      token: functionParameterToken,
      name,
      typeHint,
      defaultValue,
    });
    return parameter;
  }

  // - complex expressions:

  @traceEvents()
  parsePrefixExpression() {
    const prefixToken = this.getCurrentToken();
    let prefixLeadingComment: Comment | undefined;

    this.getNextRealToken();

    if (this.peekCurrentTokenIs(['COMMENT'])) {
      prefixLeadingComment = this.parseLeadingComment();
      this.getNextRealToken();
    }

    const prefixExpression = ast.createPrefixExpressionNode({
      token: prefixToken,
      operator: String(prefixToken.value),
      right: this.parseExpression(Precedence.PREFIX, undefined),
    });

    prefixExpression.commentMap.leading = prefixLeadingComment;
    return prefixExpression;
  }

  @traceEvents()
  parseInfixExpression(leftExpression: Expression | undefined) {
    this._eventTracer.event({
      ctx: 'parseInfixExpression',
      token: this.getCurrentToken(),
      message: `left: ${leftExpression?.token.type} :: ${leftExpression?.token.value}`,
    });
    const infixToken = this.getCurrentToken();
    const infixPrecedence = this.getTokenPrecedence('current');

    this.getNextRealToken();

    let infixLeadingComment: Comment | undefined;
    if (this.peekCurrentTokenIs(['COMMENT'])) {
      infixLeadingComment = this.parseLeadingComment();
      this.getNextRealToken();
    }

    const infixExpression = ast.createInfixExpressionNode({
      token: infixToken,
      operator: String(infixToken.value),
      left: leftExpression,
      right: this.parseExpression(infixPrecedence, infixLeadingComment),
    });
    return infixExpression;
  }

  @traceEvents()
  parseDotExpression(leftExpression: Expression | undefined) {
    this._eventTracer.event({
      ctx: 'parseDotExpression',
      token: this.getCurrentToken(),
      message: `left: ${leftExpression?.token.type} :: ${leftExpression?.token.value}`,
    });
    const dotToken = this.getCurrentToken();
    const dotPrecedence = this.getTokenPrecedence('current');

    let dotLeadingComment: Comment | undefined;
    if (this.peekNextTokenIs(['COMMENT'])) {
      this.getNextRealToken();
      dotLeadingComment = this.parseLeadingComment();
    }

    if (!this.getNextTokenOfTypeOrFail(['IDENT'])) {
      return;
    }

    const dotExpression = ast.createDotExpressionNode({
      token: dotToken,
      left: leftExpression,
      operator: String(dotToken.value),
      right: this.parseExpression(dotPrecedence, dotLeadingComment),
    });
    return dotExpression;
  }

  @traceEvents()
  parseCallExpression(functionName: Expression | undefined) {
    const callExpression = ast.createCallExpressionNode({
      token: this.getCurrentToken(),
      functionName,
      args: this.parseExpressionList('CLOSE_PAREN'),
    });
    return callExpression;
  }

  @traceEvents()
  parseExpressionList(endToken: TokenType) {
    const expressionList = ast.createExpressionListNode({token: this.getCurrentToken(), elements: []});
    if (this.peekNextTokenIs([endToken])) {
      this.getNextRealToken();
      return expressionList;
    }

    this.getNextRealToken();

    let leadingComment: Comment | undefined;
    if (this.peekCurrentTokenIs(['COMMENT'])) {
      leadingComment = this.parseLeadingComment();
      this.getNextRealToken();
    }

    if (this.peekCurrentTokenIs([endToken])) {
      return expressionList;
    }

    const firstEl = this.parseExpression(Precedence.LOWEST, leadingComment);
    if (firstEl) {
      // handle the case the element is a kwarg:
      if (this.peekNextTokenIs(['ASSIGN'])) {
        this.getNextRealToken();
        expressionList.elements.push(this.parseInfixExpression(firstEl));
      } else if (this.peekNextTokenIs(['DOT'])) {
        this.getNextRealToken();
        const dotExpression = this.parseDotExpression(firstEl);
        if (dotExpression) {
          expressionList.elements.push(dotExpression);
        } else {
          expressionList.elements.push(firstEl);
        }
      } else {
        expressionList.elements.push(firstEl);
      }
      this.logCollectionEvent('parseExpressionList');
    }

    while (this.peekNextTokenIs(['COMMA'])) {
      // skip the comma:
      this.getNextRealToken();
      this.getNextRealToken();

      let nextComment: Comment | undefined;
      if (this.peekCurrentTokenIs(['COMMENT'])) {
        nextComment = this.parseLeadingComment();
        this.getNextRealToken();
      }

      // if it was a trailing comma:
      if (this.peekCurrentTokenIs([endToken])) {
        expressionList.commentMap.trailing = nextComment;
        return expressionList;
      }

      const nextEl = this.parseExpression(Precedence.LOWEST, nextComment);
      if (nextEl) {
        if (this.peekNextTokenIs(['ASSIGN'])) {
          this.getNextRealToken();
          expressionList.elements.push(this.parseInfixExpression(nextEl));
        } else if (this.peekNextTokenIs(['DOT'])) {
          this.getNextRealToken();
          const dotExpression = this.parseDotExpression(nextEl);
          if (dotExpression) {
            expressionList.elements.push(dotExpression);
          } else {
            expressionList.elements.push(nextEl);
          }
        } else {
          expressionList.elements.push(nextEl);
        }
        this.logCollectionEvent('parseExpressionList');
      }
    }

    this.logEndOfListEvent('parseExpressionList');

    if (this.peekNextTokenIs(['COMMA'])) {
      this.getNextRealToken();
    }

    let trailingComment: Comment | undefined;
    if (this.peekNextTokenIs(['COMMENT'])) {
      this.getNextRealToken();
      trailingComment = this.parseTrailingComment();
    }

    if (!this.getNextTokenOfTypeOrFail([endToken])) {
      return;
    }

    expressionList.commentMap.trailing = trailingComment;
    return expressionList;
  }

  @traceEvents()
  parseIndexExpression(left: Expression | undefined) {
    const indexToken = this.getCurrentToken();
    this.getNextRealToken();

    let indexLeadingComment: Comment | undefined;
    if (this.peekCurrentTokenIs(['COMMENT'])) {
      indexLeadingComment = this.parseLeadingComment();
      this.getNextRealToken();
    }
    const indexExpression = ast.createIndexExpressionNode({
      token: indexToken,
      left,
      index: this.parseExpression(Precedence.LOWEST, indexLeadingComment),
    });

    if (!this.getNextTokenOfTypeOrFail(['CLOSE_BRACKET'])) {
      return;
    }
    return indexExpression;
  }

  @traceEvents()
  parseGroupedExpression() {
    this.getNextRealToken();

    let groupedLeadingComment: Comment | undefined;
    if (this.peekCurrentTokenIs(['COMMENT'])) {
      groupedLeadingComment = this.parseLeadingComment();
      this.getNextRealToken();
    }

    const expression = this.parseExpression(Precedence.LOWEST, groupedLeadingComment);

    if (!this.getNextTokenOfTypeOrFail(['CLOSE_PAREN'])) {
      return;
    }

    return expression;
  }

  // Token management:

  getCurrentToken() {
    return this.tokens[this.currentPosition];
  }

  peekNextToken() {
    return this.tokens[this.nextPosition];
  }

  getNextToken() {
    this.currentPosition = this.nextPosition;
    this.nextPosition++;
    this._eventTracer.event({ctx: 'getNextToken', token: this.getCurrentToken()});
  }

  getNextRealToken() {
    while (this.peekNextTokenIs(['DOUBLE_NEW_LINE'])) {
      this.getNextToken();
    }
    this.getNextToken();
  }

  getNextTokenOfTypeOrFail(expectedTypes: TokenType[]) {
    this._eventTracer.assertNext({
      ctx: 'getNextTokenOfTypeOrFail',
      token: this.getCurrentToken(),
      nextToken: this.peekNextToken(),
      expectedTypes,
    });
    if (expectedTypes.includes(this.peekNextToken().type)) {
      this._eventTracer.event({
        ctx: 'getNextTokenOfTypeOrFail',
        token: this.getCurrentToken(),
        message: 'success',
      });
      this.getNextRealToken();
      return true;
    } else {
      this.addNextTokenError('getNextTokenOfTypeOrFail', expectedTypes);
      return false;
    }
  }

  peekCurrentTokenIs(types: TokenType[]) {
    this._eventTracer.assertCurrent({
      ctx: 'peekCurrentTokenIs',
      token: this.getCurrentToken(),
      expectedTypes: types,
    });
    if (types.includes(this.getCurrentToken().type)) {
      this._eventTracer.event({
        ctx: 'peekCurrentTokenIs',
        token: this.getCurrentToken(),
        message: 'yup',
      });
      return true;
    } else {
      this._eventTracer.event({
        ctx: 'peekCurrentTokenIs',
        token: this.getCurrentToken(),
        message: 'nope',
      });
      return false;
    }
  }

  peekNextTokenIs(types: TokenType[]) {
    this._eventTracer.assertNext({
      ctx: 'peekNextTokenIs',
      token: this.getCurrentToken(),
      nextToken: this.peekNextToken(),
      expectedTypes: types,
    });
    if (types.includes(this.peekNextToken().type)) {
      this._eventTracer.event({
        ctx: 'peekNextTokenIs',
        token: this.peekNextToken(),
        message: 'yup',
      });
      return true;
    } else {
      this._eventTracer.event({
        ctx: 'peekNextTokenIs',
        token: this.peekNextToken(),
        message: 'nope',
      });
      return false;
    }
  }

  getTokenPrecedence(position: 'current' | 'next') {
    switch (position) {
      case 'current':
        return precedenceMap[this.getCurrentToken().value] ?? Precedence.LOWEST;
      case 'next':
        return precedenceMap[this.peekNextToken().value] ?? Precedence.LOWEST;
      default:
        return Precedence.LOWEST;
    }
  }

  listPreviousNTokens(count: number = 1) {
    return this.tokens.slice(this.currentPosition - count, this.currentPosition);
  }

  listNextNTokens(count: number = 1) {
    return this.tokens.slice(this.currentPosition + 1, this.currentPosition + count + 1);
  }

  // Error handling:

  addNextTokenError(source: string, expected: TokenType[]) {
    this._eventTracer.error({
      ctx: 'addNextTokenError',
      token: this.getCurrentToken(),
      previousTokens: this.listPreviousNTokens(5),
      nextTokens: this.listNextNTokens(5),
    });
    const lastFewTokens = this.listPreviousNTokens(5);
    const nextFewTokens = this.listNextNTokens(5);
    this.errors.push(
      `${source}: Expected ${expected.join(' | ')} at next position, found token: ${this.peekNextToken().type}.`
    );
    console.error(
      `${source}: Expected ${expected.join(' | ')} at next position, found token: ${this.peekNextToken().type}.`
    );

    console.error(
      `...\n${JSON.stringify(lastFewTokens, null, 2)}\n\n${JSON.stringify(
        this.getCurrentToken(),
        null,
        2
      )}\n\n${JSON.stringify(nextFewTokens, null, 2)}\n...`
    );
  }

  addMissingPrefixParseFunctionError(source: string, target: TokenType) {
    this._eventTracer.error({
      ctx: 'addMissingPrefixParseFunctionError',
      token: this.getCurrentToken(),
      previousTokens: this.listPreviousNTokens(5),
      nextTokens: this.listNextNTokens(5),
    });
    this.errors.push(`${source}: No prefix parse function found for token: ${target}.`);
    console.error(`${source}: No prefix parse function found for token: ${target}.`);
  }

  addIntegerParseError(source: string, value: TokenValue) {
    this._eventTracer.error({
      ctx: 'addIntegerParseError',
      token: this.getCurrentToken(),
      previousTokens: this.listPreviousNTokens(5),
      nextTokens: this.listNextNTokens(5),
    });
    this.errors.push(`${source}: Cannot parse value as integer: ${value}.`);
    console.error(`${source}: Cannot parse value as integer: ${value}.`);
  }

  addMapLiteralParseError(source: string, key: Expression | undefined, value: Expression | undefined) {
    this._eventTracer.error({
      ctx: 'addIntegerParseError',
      token: this.getCurrentToken(),
      previousTokens: this.listPreviousNTokens(5),
      nextTokens: this.listNextNTokens(5),
    });
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
  }

  // Utility:

  logCollectionEvent(ctx: string) {
    this._eventTracer.event({
      ctx,
      token: this.getCurrentToken(),
      message: 'collecting item to list...',
    });
  }

  logEndOfListEvent(ctx: string) {
    this._eventTracer.event({
      ctx,
      token: this.getCurrentToken(),
      message: 'end of list...',
    });
  }
}
