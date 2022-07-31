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
  | 'ASSIGN'
  | 'BANG'
  | 'AMPERSAND'
  | 'ASPERAND'
  | 'POUND_SIGN'
  | 'NEW_LINE'
  | 'DOUBLE_NEW_LINE'
  | 'SPACE'
  | 'POINT'
  | 'LT'
  | 'GT'
  | 'LT_EQ'
  | 'GT_EQ'
  | 'EQ'
  | 'NOT_EQ'
  | 'PIPE'
  | 'FTAG'
  | 'RTAG'
  | 'MODULO'
  | 'EOF';
export type ReservedTerm =
  | 'TRUE'
  | 'FALSE'
  | 'NONE'
  | 'IF'
  | 'ELSE'
  | 'ELIF'
  | 'LAMBDA'
  | 'DEF'
  | 'RETURN'
  | 'IS'
  | 'NOT'
  | 'WITH'
  | 'AS'
  | 'AND'
  | 'OR'
  | 'IN'
  | 'FOR'
  | 'ASSERT'
  | 'PASS'
  | 'CONTINUE';
export type Primitive = 'IDENT' | 'DECORATOR' | 'BUILTIN' | 'INT' | 'STRING' | 'COMMENT' | 'BOOLEAN';

export type TokenType = ReservedTerm | SymbolName | Primitive;

export interface Token {
  type: TokenType;
  value: TokenValue;
}
