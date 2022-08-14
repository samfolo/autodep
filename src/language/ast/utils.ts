import {WHITESPACE_SIZE} from '../../common/const';
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
  FStringLiteral,
  BStringLiteral,
  RStringLiteral,
  UStringLiteral,
  DotExpression,
} from './types';

export const createRootNode = ({statements}: UniqueNodeProperties<RootNode>): RootNode => {
  return {
    type: 'Root',
    kind: 'RootNode',
    statements,
    getTokenLiteral: function () {
      return this.statements?.[0]?.getTokenLiteral() ?? '#undefined';
    },
    toLines: function () {
      return this.statements.reduce<string[]>((acc, statement) => [...acc, ...statement.toLines(), ''], []);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return withCommentLines(this.expression?.toLines(), this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return withCommentLines([this.value], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      const [firstLine, ...otherLines] = this.right?.toLines() ?? [];
      return withCommentLines([this.operator + (firstLine ?? '#{illegal}'), ...otherLines], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      const leftLines = this.left?.toLines() ?? [];
      const otherLeftLines = leftLines.slice(0, -1);
      const lastLeftLine = leftLines[leftLines.length - 1] ?? '#{illegal}';

      const [firstRightLine, ...otherRightLines] = this.right?.toLines() ?? ['#{illegal}'];

      return withCommentLines(
        [...otherLeftLines, `${lastLeftLine} ${this.operator} ${firstRightLine}`, ...otherRightLines],
        this.commentMap
      );
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return withCommentLines([String(this.value)], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      const bool = String(this.value);
      const capitalisedBool = bool[0].toUpperCase() + bool.slice(1);
      return withCommentLines([capitalisedBool], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return withCommentLines([`"${this.value}"`], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
    },
    commentMap,
  };
};

export const createFStringLiteralNode = ({
  token,
  prefix,
  value,
}: UniqueNodeProperties<FStringLiteral>): FStringLiteral => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'FStringLiteral',
    prefix,
    token,
    value,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function () {
      return withCommentLines([`${this.prefix}"${this.value}"`], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
    },
    commentMap,
  };
};

export const createBStringLiteralNode = ({
  token,
  prefix,
  value,
}: UniqueNodeProperties<BStringLiteral>): BStringLiteral => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'BStringLiteral',
    prefix,
    token,
    value,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function () {
      return withCommentLines([`${this.prefix}"${this.value}"`], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
    },
    commentMap,
  };
};

export const createRStringLiteralNode = ({
  token,
  prefix,
  value,
}: UniqueNodeProperties<RStringLiteral>): RStringLiteral => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'RStringLiteral',
    prefix,
    token,
    value,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function () {
      return withCommentLines([`${this.prefix}"${this.value}"`], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
    },
    commentMap,
  };
};

export const createUStringLiteralNode = ({
  token,
  prefix,
  value,
}: UniqueNodeProperties<UStringLiteral>): UStringLiteral => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'UStringLiteral',
    prefix,
    token,
    value,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function () {
      return withCommentLines([`${this.prefix}"${this.value}"`], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      const elementsLines = this.elements?.toLines() ?? ['#{illegal}'];
      return withCommentLines(getListLines('[', elementsLines, ']'), this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      const elementsLines = this.map?.toLines() ?? ['#{illegal}'];
      return withCommentLines(getListLines('{', elementsLines, '}'), this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      const functionNameLines = this.functionName?.toLines() ?? ['#{illegal}'];
      const lastFunctionNameLine = functionNameLines[functionNameLines.length - 1];
      const otherFunctionNameLines = functionNameLines.slice(0, -1);
      const argsLines = this.args?.toLines() ?? ['#{illegal}'];
      return withCommentLines(
        [...otherFunctionNameLines, ...getListLines(lastFunctionNameLine + '(', argsLines, ')')],
        this.commentMap
      );
    },
    toString: function () {
      return this.toLines().join('\n');
    },
    commentMap,
  };
};

export const createDotExpressionNode = ({token, left, right}: UniqueNodeProperties<DotExpression>): DotExpression => {
  const commentMap: CommentMap = {leading: undefined, trailing: undefined};

  return {
    type: 'Expression',
    kind: 'DotExpression',
    token,
    left,
    operator: '.',
    right,
    getTokenLiteral: function () {
      return this.token.value;
    },
    toLines: function () {
      const leftLines = this.left?.toLines() ?? [];
      const otherLeftLines = leftLines.slice(0, -1);
      const lastLeftLine = leftLines[leftLines.length - 1] ?? '#{illegal}';

      const [firstRightLine, ...otherRightLines] = this.right?.toLines() ?? ['#{illegal}'];

      return withCommentLines(
        [...otherLeftLines, `${lastLeftLine}${this.operator}${firstRightLine}`, ...otherRightLines],
        this.commentMap
      );
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      const leftLines = this.left?.toLines() ?? ['#{illegal}'];
      const lastLeftLine = leftLines[leftLines.length - 1];
      const otherLeftLines = leftLines.slice(0, -1);
      const indexLines = this.index?.toLines() ?? ['#{illegal}'];

      return withCommentLines([...otherLeftLines, lastLeftLine + '[', ...indexLines, ']'], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return indent(
        withCommentLines(
          this.elements.reduce<string[]>((acc, element) => {
            const elementLines = element.toLines();
            const otherElementLines = elementLines.slice(0, -1);
            const lastElementLine = elementLines[elementLines.length - 1] ?? '#{illegal}';

            return [...acc, ...otherElementLines, lastElementLine + ','];
          }, []),
          this.commentMap
        )
      );
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return indent(
        withCommentLines(
          this.pairs.reduce<string[]>((acc, pair) => {
            const pairLines = pair.toLines();
            const otherPairLines = pairLines.slice(0, -1);
            const lastPairLine = pairLines[pairLines.length - 1] ?? '#{illegal}';

            return [...acc, ...otherPairLines, lastPairLine + ','];
          }, []),
          this.commentMap
        )
      );
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      const keyLines = this.key?.toLines() ?? [];
      const otherKeyLines = keyLines.slice(0, -1);
      const lastKeyLine = keyLines[keyLines.length - 1] ?? '#{illegal}';

      const [firstValueLine, ...otherValueLines] = this.value?.toLines() ?? ['#{illegal}'];

      return withCommentLines(
        [...otherKeyLines, `${lastKeyLine}: ${firstValueLine}`, ...otherValueLines],
        this.commentMap
      );
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return withCommentLines([`"""${this.value}"""`], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return [comment];
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return comments.reduce<string[]>((acc, comment) => [...acc, ...comment.toLines()], []);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return comment.toLines();
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return indent(
        withCommentLines(
          this.statements.reduce<string[]>((acc, statement) => [...acc, ...statement.toLines(), ''], []),
          this.commentMap
        )
      );
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      const functionOpeningLine = `def ${this.name}(`;
      const parameterLines = this.params?.toLines() ?? ['#{illegal}'];
      const functionClosingLine = `)${this.typeHint ? ` -> ${this.typeHint?.toString()}` : ''}:`;
      const blockStatementLines = this.body.toLines();

      const functionHeadingLines = getListLines(functionOpeningLine, parameterLines, functionClosingLine);
      return withCommentLines([...functionHeadingLines, ...blockStatementLines], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      return indent(
        withCommentLines(
          this.elements.reduce<string[]>((acc, element) => {
            const elementLines = element.toLines();
            const otherElementLines = elementLines.slice(0, -1);
            const lastElementLine = elementLines[elementLines.length - 1] ?? '#{illegal}';

            return [...acc, ...otherElementLines, lastElementLine + ','];
          }, []),
          this.commentMap
        )
      );
    },
    toString: function () {
      return this.toLines().join('\n');
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
    toLines: function () {
      const nameLines = this.name?.toLines() ?? [];
      const otherNameLines = nameLines.slice(0, -1);
      const lastNameLine = nameLines[nameLines.length - 1] ?? '#{illegal}';

      const typeHintLines = this.typeHint?.toLines() ?? [];
      const [firstTypeHintLine, ...otherTypeHintLines] = typeHintLines.slice(0, -1);
      const lastTypeHintLine = typeHintLines[typeHintLines.length - 1];

      const [firstDefaultValueLine, ...otherDefaultValueLines] = this.defaultValue?.toLines() ?? [];

      const nameToTypeHint = `${lastNameLine || ''}${firstTypeHintLine ? `: ${firstTypeHintLine}` : ''}`;
      const typeHintToDefaultValue = `${lastTypeHintLine ? `: ${lastTypeHintLine}` : ''}${
        firstDefaultValueLine ? ` = ${firstDefaultValueLine}` : ''
      }`;

      const adjoiningLines =
        otherTypeHintLines.length > 0
          ? [nameToTypeHint, ...otherTypeHintLines, typeHintToDefaultValue]
          : [`${nameToTypeHint}${typeHintToDefaultValue}`];

      return withCommentLines([...otherNameLines, ...adjoiningLines, ...otherDefaultValueLines], this.commentMap);
    },
    toString: function () {
      return this.toLines().join('\n');
    },
    commentMap,
  };
};

// Util:

const getIndentation = (char: string = ' ') => char.repeat(WHITESPACE_SIZE);

const indent = (lines: string[], char: string = ' ') => lines.map((line) => getIndentation(char) + line);

const withCommentLines = (valueLines: string[] = [], commentMap: CommentMap) => {
  let result = [];

  const leadingComments = commentMap.leading?.toLines() ?? [];
  if (leadingComments.length > 0) {
    result.push(...leadingComments);
  }

  if (valueLines.length > 0) {
    result.push(...valueLines.slice(0, -1));
  }

  const lastValueLine = valueLines[valueLines.length - 1] ?? '';
  const trailingComments = commentMap.trailing?.toLines() ?? [];

  const [firstTrailingComment, ...otherTrailingComments] = trailingComments ?? [];

  if (lastValueLine && firstTrailingComment) {
    const trailedLine = lastValueLine + '  ' + firstTrailingComment;
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

const getListLines = (openingLine: string, lines: string[], closingLine: string) =>
  lines.length < 2 && lines[0] !== '#{illegal}'
    ? [`${openingLine}${lines[0]?.trimStart().slice(0, -1) ?? ''}${closingLine}`]
    : [openingLine, ...lines, closingLine];
