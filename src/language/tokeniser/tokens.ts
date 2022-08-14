/* eslint-disable @typescript-eslint/naming-convention */
import {Primitive, ReservedTerm, SymbolName, TokenValue, TypeHint} from './types';

const keysAsValues = <T extends Record<any, any>>(record: T) =>
  Object.entries(record).reduce<Record<T[keyof T], keyof T>>((acc, [k, v]: [keyof T, T[keyof T]]) => {
    acc[v] = k;
    return acc;
  }, {} as Record<T[keyof T], T>);

export const SYMBOLS: Record<SymbolName, TokenValue> = {
  OPEN_PAREN: '(',
  CLOSE_PAREN: ')',
  OPEN_BRACE: '{',
  CLOSE_BRACE: '}',
  OPEN_BRACKET: '[',
  CLOSE_BRACKET: ']',
  COMMA: ',',
  SINGLE_QUOTE: "'",
  DOUBLE_QUOTE: '"',
  COLON: ':',
  PLUS: '+',
  MINUS: '-',
  FORWARD_SLASH: '/',
  ASTERISK: '*',
  ASSIGN: '=',
  BANG: '!',
  AMPERSAND: '&',
  ASPERAND: '@',
  POUND_SIGN: '#',
  NEW_LINE: '\n',
  DOUBLE_NEW_LINE: '\n\n',
  SPACE: ' ',
  POINT: '->',
  GT: '>',
  LT: '<',
  LT_EQ: '<=',
  GT_EQ: '>=',
  EQ: '==',
  NOT_EQ: '!=',
  PIPE: '|',
  FSTRING: 'f',
  RSTRING: 'r',
  BSTRING: 'b',
  USTRING: 'u',
  MODULO: '%',
  DOT: '.',
  EOF: 0,
  ILLEGAL: 0,
} as const;

export const RESERVED_TERMS: Record<ReservedTerm, TokenValue> = {
  TRUE: 'True',
  FALSE: 'False',
  NONE: 'None',
  IF: 'if',
  ELIF: 'elif',
  ELSE: 'else',
  FOR: 'for',
  DEF: 'def',
  RETURN: 'return',
  IS: 'is',
  NOT: 'not',
  WITH: 'with',
  AS: 'as',
  AND: 'and',
  OR: 'or',
  IN: 'in',
  LAMBDA: 'lambda',
  ASSERT: 'assert',
  PASS: 'pass',
  CONTINUE: 'continue',
};
export const RESERVED_TERM_LOOKUP = keysAsValues(RESERVED_TERMS);

export const TYPE_HINTS: Record<TypeHint, TokenValue> = {
  STR: 'str',
  BOOL: 'bool',
  FLOAT: 'float',
  BYTES: 'bytes',
  INT: 'int',
  LIST: 'list',
  SET: 'set',
  TUPLE: 'tuple',
};
export const TYPE_HINT_LOOKUP = keysAsValues(TYPE_HINTS);

export const PRIMITIVES: Record<Primitive, Primitive> = {
  IDENT: 'IDENT',
  INT: 'INT',
  STRING: 'STRING',
  DOCSTRING: 'DOCSTRING',
  BOOLEAN: 'BOOLEAN',
  BUILTIN: 'BUILTIN',
  TYPE_HINT: 'TYPE_HINT',
  COMMENT: 'COMMENT',
  DECORATOR: 'DECORATOR',
};
