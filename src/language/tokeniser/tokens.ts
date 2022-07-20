/* eslint-disable @typescript-eslint/naming-convention */
import {Primitive, ReservedTerm, SymbolName, TokenValue} from './types';

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
  EQUALS: '=',
  POUND_SIGN: '#',
  NEW_LINE: '\n',
  DOUBLE_NEW_LINE: '\n\n',
  SPACE: ' ',
  EOF: 0,
} as const;

export const BUILTINS: readonly string[] = ['subinclude', 'glob'] as const; // TODO: make dynamic via workspace config

export const RESERVED_TERMS: Record<ReservedTerm, TokenValue> = {
  TRUE: 'True',
  FALSE: 'False',
  NONE: 'None',
};
export const RESERVED_TERM_LOOKUP = keysAsValues(RESERVED_TERMS);

export const PRIMITIVES: Record<Primitive, Primitive> = {
  IDENT: 'IDENT',
  INT: 'INT',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',
  RULE_NAME: 'RULE_NAME',
  BUILTIN: 'BUILTIN',
  RULE_FIELD_NAME: 'RULE_FIELD_NAME',
  COMMENT: 'COMMENT',
};
