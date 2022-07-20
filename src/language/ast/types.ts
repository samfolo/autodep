import type {Token, TokenValue} from '../tokeniser/types';

// Foundational:

type WithCommentMap<N extends BaseNode> = N & {commentMap: CommentMap};

export interface BaseNode {
  type: 'Root' | 'Expression' | 'Statement' | 'Comment';
  kind: string;
  getTokenLiteral: () => TokenValue;
  toString: (depth?: number) => string;
  toLines: (depth: number) => string[];
}

export interface RootNode extends BaseNode {
  type: 'Root';
  kind: 'RootNode';
  statements: (Statement | CommentStatement)[];
}

export interface BaseExpression extends WithCommentMap<BaseNode> {
  type: 'Expression';
}

export interface BaseStatement extends WithCommentMap<BaseNode> {
  type: 'Statement';
}

export interface BaseComment extends BaseNode {
  type: 'Comment';
}

export interface CommentMap {
  leading: Comment | undefined;
  trailing: Comment | undefined;
}

// Expressions:

export interface Identifier extends BaseExpression {
  token: Token;
  kind: 'Identifier';
  value: string;
}

export interface RuleFieldName extends BaseExpression {
  token: Token;
  kind: 'RuleFieldName';
  value: string;
}

export interface RuleName extends BaseExpression {
  token: Token;
  kind: 'RuleName';
  value: string;
}

export interface IntegerLiteral extends BaseExpression {
  token: Token;
  kind: 'IntegerLiteral';
  value: number;
}

export interface PrefixExpression extends BaseExpression {
  token: Token;
  kind: 'PrefixExpression';
  operator: string;
  right: Expression | undefined;
}

export interface InfixExpression extends BaseExpression {
  token: Token;
  kind: 'InfixExpression';
  left: Expression | undefined;
  operator: string;
  right: Expression | undefined;
}

export interface BooleanLiteral extends BaseExpression {
  token: Token;
  kind: 'BooleanLiteral';
  value: boolean;
}

export interface CallExpression extends BaseExpression {
  token: Token;
  kind: 'CallExpression';
  functionName: Expression | undefined;
  args: ExpressionList | undefined;
}

export interface StringLiteral extends BaseExpression {
  token: Token;
  kind: 'StringLiteral';
  value: string;
}

export interface ArrayLiteral extends BaseExpression {
  token: Token;
  kind: 'ArrayLiteral';
  elements: ExpressionList | undefined;
}

export interface IndexExpression extends BaseExpression {
  token: Token;
  kind: 'IndexExpression';
  left: Expression | undefined;
  index: Expression | undefined;
}

export interface KeywordArgumentExpression extends BaseExpression {
  token: Token;
  kind: 'KeywordArgumentExpression';
  key: Expression;
  value: Expression | undefined;
}

export interface MapLiteral extends BaseExpression {
  token: Token;
  kind: 'MapLiteral';
  map: KeyValueExpressionList | undefined;
}

export interface ExpressionList extends BaseExpression {
  token: Token;
  kind: 'ExpressionList';
  elements: Expression[];
}

export interface KeyValueExpressionList extends BaseExpression {
  token: Token;
  kind: 'KeyValueExpressionList';
  pairs: KeyValueExpression[];
}

export interface KeyValueExpression extends BaseExpression {
  token: Token;
  kind: 'KeyValueExpression';
  key: Expression;
  value: Expression;
}

export interface DocStringLiteral extends BaseExpression {
  token: Token;
  kind: 'DocStringLiteral';
  value: string;
}

export type Expression =
  | Identifier
  | RuleFieldName
  | RuleName
  | IntegerLiteral
  | PrefixExpression
  | InfixExpression
  | BooleanLiteral
  | CallExpression
  | StringLiteral
  | ArrayLiteral
  | IndexExpression
  | KeywordArgumentExpression
  | MapLiteral
  | ExpressionList
  | KeyValueExpressionList
  | KeyValueExpression
  | DocStringLiteral;

// Statements:

export interface ExpressionStatement extends BaseStatement {
  token: Token;
  kind: 'ExpressionStatement';
  expression: Expression | undefined;
}

export interface CommentStatement extends Omit<BaseStatement, 'commentMap'> {
  token: Token;
  kind: 'CommentStatement';
  comment: Comment;
}

export type Statement = ExpressionStatement | CommentStatement;

// Comments:

export interface SingleLineComment extends BaseComment {
  token: Token;
  kind: 'SingleLineComment';
  comment: string;
}

export interface CommentGroup extends BaseComment {
  token: Token;
  kind: 'CommentGroup';
  comments: Comment[];
}

export type Comment = SingleLineComment | CommentGroup;

// Utility:

export type UniqueNodeProperties<N extends BaseNode> = Omit<N, keyof WithCommentMap<BaseNode>>;

export type ASTNode = Expression | Statement | Comment | RootNode;
