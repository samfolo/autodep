import {SUPPORTED_MANAGED_BUILTINS} from '../../common/const';
import {AutoDepConfig} from '../../config/types';
import {RESERVED_TERM_LOOKUP, SYMBOLS} from './tokens';
import type {TokenType, TokenValue, Token} from './types';

export class Tokeniser {
  private input: string;
  private currentPosition: number;
  private readPosition: number;
  private tokens: Token[];
  private config: AutoDepConfig.Output.Schema;

  constructor(input: string, config: AutoDepConfig.Output.Schema) {
    this.input = input;
    this.config = config;
    this.currentPosition = 0;
    this.readPosition = this.currentPosition + 1;
    this.tokens = [];
  }

  private current = () => this.input[this.currentPosition] || 0;

  private peek = () => this.input[this.readPosition];

  private pushCursor = () => this.readPosition++;

  private consume = () => {
    this.currentPosition = this.readPosition;
    this.readPosition++;
  };

  getIdentTokenType = (ident: string): TokenType =>
    RESERVED_TERM_LOOKUP[ident] ||
    (SUPPORTED_MANAGED_BUILTINS.some((builtin) => builtin === ident) && 'BUILTIN') ||
    (this.config.manage.rules.has(ident) && 'RULE_NAME') ||
    (this.config.manage.fields.has(ident) && 'RULE_FIELD_NAME') ||
    'IDENT';

  createToken = createToken;

  tokenise = () => {
    while (this.current() !== SYMBOLS.EOF) {
      let tokenValue = '';

      switch (this.current()) {
        case SYMBOLS.OPEN_PAREN:
          this.tokens.push(this.createToken('OPEN_PAREN', this.current()));
          break;
        case SYMBOLS.CLOSE_PAREN:
          this.tokens.push(this.createToken('CLOSE_PAREN', this.current()));
          break;
        case SYMBOLS.OPEN_BRACE:
          this.tokens.push(this.createToken('OPEN_BRACE', this.current()));
          break;
        case SYMBOLS.CLOSE_BRACE:
          this.tokens.push(this.createToken('CLOSE_BRACE', this.current()));
          break;
        case SYMBOLS.OPEN_BRACKET:
          this.tokens.push(this.createToken('OPEN_BRACKET', this.current()));
          break;
        case SYMBOLS.CLOSE_BRACKET:
          this.tokens.push(this.createToken('CLOSE_BRACKET', this.current()));
          break;
        case SYMBOLS.COMMA:
          this.tokens.push(this.createToken('COMMA', this.current()));
          break;
        case SYMBOLS.PLUS:
          this.tokens.push(this.createToken('PLUS', this.current()));
          break;
        case SYMBOLS.MINUS:
          this.tokens.push(this.createToken('MINUS', this.current()));
          break;
        case SYMBOLS.FORWARD_SLASH:
          this.tokens.push(this.createToken('FORWARD_SLASH', this.current()));
          break;
        case SYMBOLS.ASTERISK:
          this.tokens.push(this.createToken('ASTERISK', this.current()));
          break;
        case SYMBOLS.EQUALS:
          this.tokens.push(this.createToken('EQUALS', this.current()));
          break;
        case SYMBOLS.SINGLE_QUOTE:
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
          this.tokens.push(this.createToken('COLON', this.current()));
          break;
        case SYMBOLS.POUND_SIGN:
          tokenValue += this.current();

          while (this.peek() !== SYMBOLS.NEW_LINE) {
            tokenValue += this.peek();
            this.pushCursor();
          }

          this.tokens.push(this.createToken('COMMENT', tokenValue));
          break;
        case SYMBOLS.NEW_LINE:
          if (this.peek() === SYMBOLS.NEW_LINE) {
            this.tokens.push(this.createToken('DOUBLE_NEW_LINE', `${this.current()}${this.current()}`));
          }
          while (this.peek() === SYMBOLS.NEW_LINE) {
            this.consume();
          }
          break;
        case SYMBOLS.SPACE:
          while (this.peek() === SYMBOLS.SPACE) {
            this.consume();
          }
          break;
        default:
          tokenValue += this.current();

          while (/[a-zA-Z_$]/.test(this.peek())) {
            tokenValue += this.peek();
            this.pushCursor();
          }

          this.tokens.push(this.createToken(this.getIdentTokenType(tokenValue), tokenValue));
          break;
      }

      this.consume();
    }

    this.tokens.push(this.createToken('EOF', this.current()));

    return this.tokens;
  };
}

export const createToken = (type: TokenType, value: TokenValue): Token => ({
  type,
  value,
});
