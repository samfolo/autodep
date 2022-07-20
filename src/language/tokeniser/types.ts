export type TokenValue = string | 0;

export type SymbolName =
  | 'OPEN_PAREN'
  | 'CLOSE_PAREN'
  | 'OPEN_BRACKET'
  | 'CLOSE_BRACKET'
  | 'OPEN_BRACE'
  | 'CLOSE_BRACE'
  | 'COMMA'
  | 'SINGLE_QUOTE'
  | 'DOUBLE_QUOTE'
  | 'COLON'
  | 'PLUS'
  | 'MINUS'
  | 'FORWARD_SLASH'
  | 'ASTERISK'
  | 'EQUALS'
  | 'POUND_SIGN'
  | 'NEW_LINE'
  | 'DOUBLE_NEW_LINE'
  | 'SPACE'
  | 'EOF';
export type ReservedTerm = 'TRUE' | 'FALSE' | 'NONE';
export type Primitive =
  | 'IDENT'
  | 'RULE_NAME'
  | 'RULE_FIELD_NAME'
  | 'BUILTIN'
  | 'INT'
  | 'STRING'
  | 'COMMENT'
  | 'BOOLEAN';

export type TokenType = ReservedTerm | SymbolName | Primitive;

export interface Token {
  type: TokenType;
  value: TokenValue;
}
