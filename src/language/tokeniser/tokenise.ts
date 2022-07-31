import {AutoDepConfig} from '../../config/types';
import {AutoDepBase} from '../../inheritance/base';

import {RESERVED_TERM_LOOKUP, SYMBOLS, TYPE_HINT_LOOKUP} from './tokens';
import type {TokenType, TokenValue, Token} from './types';

interface TokeniserOptions {
  input: string;
  config: AutoDepConfig.Output.Schema;
}

export class Tokeniser extends AutoDepBase {
  private input: string;
  private currentPosition: number;
  private readPosition: number;
  private tokens: Token[];
  private isScopeLocked: boolean;
  private currentIndentation: number;

  constructor({input, config}: TokeniserOptions) {
    super({config, name: 'Tokeniser'});

    this.input = input;
    this.currentPosition = 0;
    this.readPosition = this.currentPosition + 1;
    this.tokens = [];

    this.isScopeLocked = true;
    this.currentIndentation = 0;
  }

  // Scope tracking:

  private incrementScope = () => {
    if (!this.isScopeLocked) {
      this.currentIndentation++;
    }
  };

  private resetScope = () => {
    this.currentIndentation = 0;
  };

  private lockScope = () => {
    this.isScopeLocked = true;
  };

  private unlockScope = () => {
    this.isScopeLocked = false;
  };

  // Token cursor management:

  private current = () => this.input[this.currentPosition] || 0;

  private peek = () => this.input[this.readPosition];

  private pushCursor = () => this.readPosition++;

  private consume = () => {
    this.currentPosition = this.readPosition;
    this.readPosition++;
  };

  // Token creation:

  getIdentTokenType = (ident: string): TokenType =>
    RESERVED_TERM_LOOKUP[ident] || (TYPE_HINT_LOOKUP[ident] && 'TYPE_HINT') || 'IDENT';

  createToken = (type: TokenType, value: TokenValue) => createToken(type, value, this.currentIndentation);

  // Tokenisation:

  tokenise = () => {
    while (this.current() !== SYMBOLS.EOF) {
      let tokenValue = '';

      switch (this.current()) {
        case SYMBOLS.OPEN_PAREN:
          this.lockScope();
          this.tokens.push(this.createToken('OPEN_PAREN', this.current()));
          break;
        case SYMBOLS.CLOSE_PAREN:
          this.lockScope();
          this.tokens.push(this.createToken('CLOSE_PAREN', this.current()));
          break;
        case SYMBOLS.OPEN_BRACE:
          this.lockScope();
          this.tokens.push(this.createToken('OPEN_BRACE', this.current()));
          break;
        case SYMBOLS.CLOSE_BRACE:
          this.lockScope();
          this.tokens.push(this.createToken('CLOSE_BRACE', this.current()));
          break;
        case SYMBOLS.OPEN_BRACKET:
          this.lockScope();
          this.tokens.push(this.createToken('OPEN_BRACKET', this.current()));
          break;
        case SYMBOLS.CLOSE_BRACKET:
          this.lockScope();
          this.tokens.push(this.createToken('CLOSE_BRACKET', this.current()));
          break;
        case SYMBOLS.COMMA:
          this.lockScope();
          this.tokens.push(this.createToken('COMMA', this.current()));
          break;
        case SYMBOLS.PLUS:
          this.lockScope();
          this.tokens.push(this.createToken('PLUS', this.current()));
          break;
        case SYMBOLS.GT:
          this.lockScope();
          if (this.peek() === SYMBOLS.ASSIGN) {
            tokenValue += this.current();
            this.consume();
            this.tokens.push(this.createToken('GT_EQ', tokenValue + this.current()));
          } else {
            this.tokens.push(this.createToken('GT', this.current()));
          }
          break;
        case SYMBOLS.LT:
          this.lockScope();
          if (this.peek() === SYMBOLS.ASSIGN) {
            tokenValue += this.current();
            this.consume();
            this.tokens.push(this.createToken('LT_EQ', tokenValue + this.current()));
          } else {
            this.tokens.push(this.createToken('LT', this.current()));
          }
          break;
        case SYMBOLS.MINUS:
          this.lockScope();
          if (this.peek() === SYMBOLS.GT) {
            tokenValue += this.current();
            this.consume();
            this.tokens.push(this.createToken('POINT', tokenValue + this.current()));
          } else {
            this.tokens.push(this.createToken('MINUS', this.current()));
          }
          break;
        case SYMBOLS.FORWARD_SLASH:
          this.lockScope();
          this.tokens.push(this.createToken('FORWARD_SLASH', this.current()));
          break;
        case SYMBOLS.ASTERISK:
          this.lockScope();
          this.tokens.push(this.createToken('ASTERISK', this.current()));
          break;
        case SYMBOLS.ASSIGN:
          this.lockScope();
          if (this.peek() === SYMBOLS.ASSIGN) {
            tokenValue += this.current();
            this.consume();
            this.tokens.push(this.createToken('EQ', tokenValue + this.current()));
          } else {
            this.tokens.push(this.createToken('ASSIGN', this.current()));
          }
          break;
        case SYMBOLS.SINGLE_QUOTE:
          this.lockScope();
          while (this.peek() !== SYMBOLS.SINGLE_QUOTE) {
            tokenValue += this.peek();
            this.consume();

            if (this.peek() === SYMBOLS.EOF) {
              throw new Error(`Invalid input: unexpected EOF while reading string: "${tokenValue}...`);
            }
          }

          this.consume(); // move "current" pointer to closing quote
          this.tokens.push(this.createToken('STRING', tokenValue));
          break;
        case SYMBOLS.DOUBLE_QUOTE:
          this.lockScope();
          while (this.peek() !== SYMBOLS.DOUBLE_QUOTE) {
            tokenValue += this.peek();
            this.consume();

            if (this.peek() === SYMBOLS.EOF) {
              throw new Error(`Invalid input: unexpected EOF while reading string: "${tokenValue}...`);
            }
          }

          this.consume(); // move "current" pointer to closing quote
          this.tokens.push(this.createToken('STRING', tokenValue));
          break;
        case SYMBOLS.COLON:
          this.lockScope();
          this.tokens.push(this.createToken('COLON', this.current()));
          break;
        case SYMBOLS.BANG:
          this.lockScope();
          if (this.peek() === SYMBOLS.ASSIGN) {
            tokenValue += this.current();
            this.consume();
            this.tokens.push(this.createToken('NOT_EQ', tokenValue + this.current()));
          } else {
            this.tokens.push(this.createToken('BANG', this.current()));
          }
          break;
        case SYMBOLS.ASPERAND:
          this.lockScope();
          const asperand = this.current();
          tokenValue += this.current();

          while (/[a-zA-Z_$]/.test(this.peek())) {
            tokenValue += this.peek();
            this.pushCursor();
          }

          if (asperand === tokenValue) {
            this.tokens.push(this.createToken('ASPERAND', tokenValue));
          } else {
            this.tokens.push(this.createToken('DECORATOR', tokenValue));
          }
          break;
        case SYMBOLS.POUND_SIGN:
          this.lockScope();
          tokenValue += this.current();

          while (this.peek() !== SYMBOLS.NEW_LINE) {
            tokenValue += this.peek();
            this.pushCursor();
          }

          this.tokens.push(this.createToken('COMMENT', tokenValue));
          break;
        case SYMBOLS.NEW_LINE:
          this.resetScope();
          if (this.peek() === SYMBOLS.NEW_LINE) {
            this.tokens.push(this.createToken('DOUBLE_NEW_LINE', `${this.current()}${this.current()}`));
          }
          while (this.peek() === SYMBOLS.NEW_LINE) {
            this.consume();
          }
          this.unlockScope();
          break;
        case SYMBOLS.SPACE:
          this.incrementScope();
          while (this.peek() === SYMBOLS.SPACE) {
            this.consume();
            this.incrementScope();
          }
          break;
        default:
          this.lockScope();
          if (this.isLetter(this.current())) {
            tokenValue += this.current();

            while (this.isLetter(this.peek())) {
              tokenValue += this.peek();
              this.pushCursor();
            }

            this.tokens.push(this.createToken(this.getIdentTokenType(tokenValue), tokenValue));
          } else if (this.isDigit(this.current())) {
            tokenValue += this.current();

            while (this.isDigit(this.peek())) {
              tokenValue += this.peek();
              this.pushCursor();
            }

            this.tokens.push(this.createToken('INT', tokenValue));
          } else {
            this.tokens.push(this.createToken('ILLEGAL', this.current()));
          }
          break;
      }

      this.consume();
    }

    this.tokens.push(this.createToken('EOF', this.current()));

    return this.tokens;
  };

  private isLetter = (char: TokenValue) => typeof char === 'string' && /[A-Za-z_]/.test(char);
  private isDigit = (char: TokenValue) => typeof char === 'string' && !isNaN(Number(char));
}

export const createToken = (type: TokenType, value: TokenValue, scope: number): Token => ({
  type,
  value,
  scope,
});
