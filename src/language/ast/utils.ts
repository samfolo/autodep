import type {
  RootNode,
  Identifier,
  IntegerLiteral,
  InfixExpression,
  PrefixExpression,
  ExpressionStatement,
  BooleanLiteral,
  CallExpression,
  StringLiteral,
  ArrayLiteral,
  IndexExpression,
  MapLiteral,
  UniqueNodeProperties,
  SingleLineComment,
  ExpressionList,
  DocStringLiteral,
  CommentStatement,
  CommentGroup,
  CommentMap,
  KeyValueExpressionList,
  KeyValueExpression,
  BlockStatement,
  FunctionDefinition,
  ParameterList,
  Parameter,
} from './types';

export const createRootNode = ({statements}: UniqueNodeProperties<RootNode>): RootNode => {
  return {
    type: 'Root',
    kind: 'RootNode',
    statements,
    getTokenLiteral: function () {
      return this.statements?.[0]?.getTokenLiteral() ?? '#undefined';
    },
    toLines: function (depth = 0) {
      return indent(
        this.statements.reduce<string[]>((acc, statement) => [...acc, ...statement.toLines(depth), ''], []),
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
  };
};

export const createExpressionStatementNode = ({
  token,
  expression,
}: UniqueNodeProperties<ExpressionStatement>): ExpressionStatement => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Statement',
    kind: 'ExpressionStatement',
    token,
    expression,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return indent(withCommentLines(this.expression?.toLines(depth), this.commentMap, depth), depth);
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createIdentifierNode = ({token, value}: UniqueNodeProperties<Identifier>): Identifier => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'Identifier',
    token,
    value,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return withCommentLines([this.value], this.commentMap, depth);
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createPrefixExpressionNode = ({
  token,
  operator,
  right,
}: UniqueNodeProperties<PrefixExpression>): PrefixExpression => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'PrefixExpression',
    token,
    operator,
    right,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      const [firstLine, ...otherLines] = this.right?.toLines(depth) ?? [];
      return indent(
        withCommentLines([this.operator + (firstLine ?? '#{illegal}'), ...otherLines], this.commentMap, depth),
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createInfixExpressionNode = ({
  token,
  left,
  operator,
  right,
}: UniqueNodeProperties<InfixExpression>): InfixExpression => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'InfixExpression',
    token,
    left,
    operator,
    right,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      const leftLines = this.left?.toLines(Math.max(0, depth - 1)) ?? [];
      const otherLeftLines = leftLines.slice(0, -1);
      const lastLeftLine = leftLines[leftLines.length - 1] ?? '#{illegal}';

      const [firstRightLine, ...otherRightLines] = this.right?.toLines(Math.max(0, depth - 1)) ?? ['#{illegal}'];

      return indent(
        withCommentLines(
          [...otherLeftLines, `${lastLeftLine} ${this.operator} ${firstRightLine.trimStart()}`, ...otherRightLines],
          this.commentMap,
          depth
        ),
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createIntegerLiteralNode = ({token, value}: UniqueNodeProperties<IntegerLiteral>): IntegerLiteral => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'IntegerLiteral',
    token,
    value,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return withCommentLines([String(this.value)], this.commentMap, depth);
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createBooleanLiteralNode = ({token, value}: UniqueNodeProperties<BooleanLiteral>): BooleanLiteral => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'BooleanLiteral',
    token,
    value,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      const bool = String(this.value);
      const capitalisedBool = bool[0].toUpperCase() + bool.slice(1);
      return withCommentLines([capitalisedBool], this.commentMap, depth);
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createStringLiteralNode = ({token, value}: UniqueNodeProperties<StringLiteral>): StringLiteral => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'StringLiteral',
    token,
    value,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return indent(withCommentLines([`"${this.value}"`], this.commentMap, depth), depth);
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createArrayLiteralNode = ({token, elements}: UniqueNodeProperties<ArrayLiteral>): ArrayLiteral => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'ArrayLiteral',
    token,
    elements,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      const elementsLines = this.elements?.toLines(depth + 1) ?? ['#{illegal}'];
      return indent(withCommentLines(['[', ...elementsLines, ']'], this.commentMap, depth), depth);
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createMapLiteralNode = ({token, map}: UniqueNodeProperties<MapLiteral>): MapLiteral => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'MapLiteral',
    token,
    map,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      const mapLines = this.map?.toLines(depth + 1) ?? ['#{illegal}'];

      return indent(withCommentLines(['{', ...mapLines, '}'], this.commentMap, depth), depth, 'b');
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createCallExpressionNode = ({
  token,
  functionName,
  args,
}: UniqueNodeProperties<CallExpression>): CallExpression => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'CallExpression',
    token,
    functionName,
    args,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      const functionNameLines = this.functionName?.toLines(depth + 1) ?? ['#{illegal}'];
      const lastFunctionNameLine = functionNameLines[functionNameLines.length - 1];
      const otherFunctionNameLines = functionNameLines.slice(0, -1);
      const argsLines = this.args?.toLines(depth + 1) ?? ['#{illegal}'];

      return indent(
        withCommentLines(
          [...otherFunctionNameLines, lastFunctionNameLine + '(', ...argsLines, ')'],
          this.commentMap,
          depth
        ),
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createIndexExpressionNode = ({
  token,
  left,
  index,
}: UniqueNodeProperties<IndexExpression>): IndexExpression => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'IndexExpression',
    token,
    left,
    index,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      const leftLines = this.left?.toLines(Math.max(0, depth - 1)) ?? ['#{illegal}'];
      const lastLeftLine = leftLines[leftLines.length - 1];
      const otherLeftLines = leftLines.slice(0, -1);
      const indexLines = this.index?.toLines(depth - 1) ?? ['#{illegal}'];

      return indent(
        withCommentLines([...otherLeftLines, lastLeftLine + '[', ...indexLines, ']'], this.commentMap, depth),
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createExpressionListNode = ({token, elements}: UniqueNodeProperties<ExpressionList>): ExpressionList => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'ExpressionList',
    token,
    elements,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return withCommentLines(
        this.elements.reduce<string[]>((acc, element) => {
          const elementLines = element.toLines(depth);
          const otherElementLines = elementLines.slice(0, -1);
          const lastElementLine = elementLines[elementLines.length - 1] ?? '#{illegal}';

          return [...acc, ...otherElementLines, lastElementLine + ','];
        }, []),
        this.commentMap,
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createKeyValueExpressionListNode = ({
  token,
  pairs,
}: UniqueNodeProperties<KeyValueExpressionList>): KeyValueExpressionList => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'KeyValueExpressionList',
    token,
    pairs,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return withCommentLines(
        this.pairs.reduce<string[]>((acc, pair) => {
          const pairLines = pair.toLines(depth);
          const otherPairLines = pairLines.slice(0, -1);
          const lastPairLine = pairLines[pairLines.length - 1] ?? '#{illegal}';

          return [...acc, ...otherPairLines, lastPairLine + ','];
        }, []),
        this.commentMap,
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createKeyValueExpressionNode = ({
  token,
  key,
  value,
}: UniqueNodeProperties<KeyValueExpression>): KeyValueExpression => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'KeyValueExpression',
    token,
    key,
    value,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      const keyLines = this.key?.toLines(Math.max(0, depth - 1)) ?? [];
      const otherKeyLines = keyLines.slice(0, -1);
      const lastKeyLine = keyLines[keyLines.length - 1] ?? '#{illegal}';

      const [firstValueLine, ...otherValueLines] = this.value?.toLines(Math.max(0, depth - 1)) ?? ['#{illegal}'];

      return indent(
        withCommentLines(
          [...otherKeyLines, `${lastKeyLine}: ${firstValueLine.trimStart()}`, ...otherValueLines],
          this.commentMap,
          depth
        ),
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createDocStringLiteralNode = ({
  token,
  value,
}: UniqueNodeProperties<DocStringLiteral>): DocStringLiteral => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'DocStringLiteral',
    token,
    value,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return indent(withCommentLines([this.value], this.commentMap, depth), depth);
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createSingleLineCommentNode = ({
  token,
  comment,
}: UniqueNodeProperties<SingleLineComment>): SingleLineComment => {
  return {
    type: 'Comment',
    kind: 'SingleLineComment',
    token,
    comment,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return indent([comment], depth);
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
  };
};

export const createCommentGroupNode = ({token, comments}: UniqueNodeProperties<CommentGroup>): CommentGroup => {
  return {
    type: 'Comment',
    kind: 'CommentGroup',
    token,
    comments,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return indent(
        comments.reduce<string[]>((acc, comment) => [...acc, ...comment.toLines(depth)], []),
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
  };
};

export const createCommentStatementNode = ({
  token,
  comment,
}: UniqueNodeProperties<CommentStatement>): CommentStatement => {
  return {
    type: 'Statement',
    kind: 'CommentStatement',
    token,
    comment,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return indent(comment.toLines(depth), depth);
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
  };
};

export const createBlockStatementNode = ({token, statements}: UniqueNodeProperties<BlockStatement>): BlockStatement => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    token,
    type: 'Statement',
    kind: 'BlockStatement',
    statements,
    getTokenLiteral: function () {
      return this.statements?.[0]?.getTokenLiteral() ?? '#undefined';
    },
    toLines: function (depth = 0) {
      return indent(
        withCommentLines(
          this.statements.reduce<string[]>((acc, statement) => [...acc, ...statement.toLines(depth), ''], []),
          this.commentMap,
          depth
        ),
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createFunctionDefinitionNode = ({
  token,
  name,
  params,
  body,
  typeHint,
}: UniqueNodeProperties<FunctionDefinition>): FunctionDefinition => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    token,
    type: 'Statement',
    kind: 'FunctionDefinition',
    name,
    params,
    body,
    typeHint,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      const functionHeadingLine = `def ${this.name}(${this.params?.toString() ?? '#{illegal}'})${
        this.typeHint?.toString() ?? ''
      }:`;
      const blockStatementLines = this.body.toLines(depth + 1);
      return indent(withCommentLines([functionHeadingLine, ...blockStatementLines], this.commentMap, depth), depth);
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createParameterListNode = ({token, elements}: UniqueNodeProperties<ParameterList>): ParameterList => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    token,
    type: 'Expression',
    kind: 'ParameterList',
    elements,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      return withCommentLines(
        this.elements.reduce<string[]>((acc, element) => {
          const elementLines = element.toLines(depth);
          const otherElementLines = elementLines.slice(0, -1);
          const lastElementLine = elementLines[elementLines.length - 1] ?? '#{illegal}';

          return [...acc, ...otherElementLines, lastElementLine];
        }, []),
        this.commentMap,
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

export const createParameterNode = ({
  token,
  name,
  typeHint,
  defaultValue,
}: UniqueNodeProperties<Parameter>): Parameter => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'Parameter',
    token,
    name,
    typeHint,
    defaultValue,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function (depth = 0) {
      const nameLines = this.name?.toLines(Math.max(0, depth - 1)) ?? [];
      const otherNameLines = nameLines.slice(0, -1);
      const lastNameLine = nameLines[nameLines.length - 1] ?? '#{illegal}';

      const typeHintLines = this.typeHint?.toLines(Math.max(0, depth - 1)) ?? [];
      const [firstTypeHintLine, ...otherTypeHintLines] = typeHintLines.slice(0, -1) ?? [];
      const lastTypeHintLine = typeHintLines[typeHintLines.length - 1];

      const [firstDefaultValueLine, ...otherDefaultValueLines] = this.defaultValue?.toLines(Math.max(0, depth - 1)) ?? [
        '#{illegal}',
      ];

      const nameToTypeHint = `${lastNameLine || ''}${firstTypeHintLine ? `: ${firstTypeHintLine.trimStart()}` : ''}`;
      const typeHintToDefaultValue = `${lastTypeHintLine || ''}${
        firstDefaultValueLine ? ` = ${firstDefaultValueLine.trimStart()}` : ''
      }`;

      const adjoiningLines =
        otherTypeHintLines.length > 0
          ? [nameToTypeHint, ...otherTypeHintLines, typeHintToDefaultValue]
          : [`${nameToTypeHint}${typeHintToDefaultValue}`];

      return indent(
        withCommentLines([...otherNameLines, ...adjoiningLines, ...otherDefaultValueLines], this.commentMap, depth),
        depth
      );
    },
    toString: function (depth = 0) {
      return this.toLines(Number(depth)).join('\n');
    },
    commentMap,
  };
};

// Util:

const getIndentation = (depth: number, char: string = ' ') => char.repeat(4 * depth);

const indent = (lines: string[], depth: number, char: string = ' ') =>
  lines.map((line) => getIndentation(depth, char) + line);

const withCommentLines = (valueLines: string[] = [], commentMap: CommentMap, depth: number) => {
  let result = [];

  const leadingComments = commentMap.leading?.toLines(Math.max(0, depth - 1)) ?? [];
  if (leadingComments.length > 0) {
    result.push(...leadingComments);
  }

  if (valueLines.length > 0) {
    result.push(...valueLines.slice(0, -1));
  }

  const lastValueLine = valueLines[valueLines.length - 1] ?? '';
  const trailingComments = commentMap.trailing?.toLines(depth) ?? [];

  // all trailing comment expressions should end in a newline:
  const lastTrailing = trailingComments[trailingComments.length - 1];
  if (lastTrailing) {
    trailingComments[trailingComments.length - 1] = `${lastTrailing}\n${getIndentation(depth)}`;
  }

  const [firstTrailingComment, ...otherTrailingComments] = trailingComments ?? [];

  if (lastValueLine && firstTrailingComment) {
    const trailedLine = lastValueLine + '  ' + firstTrailingComment.trimStart();
    result.push(trailedLine);
  } else if (lastValueLine) {
    result.push(lastValueLine);
  } else if (firstTrailingComment) {
    result.push(firstTrailingComment);
  }

  if (otherTrailingComments.length > 0) {
    result.push(...otherTrailingComments);
  }

  return result;
};
