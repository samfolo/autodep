import path from 'path';
import {
  SUPPORTED_MANAGED_BUILTINS_LOOKUP,
  SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES,
  WHITESPACE_SIZE,
} from '../../common/const';

import {ManagedSchemaFieldEntry, ManagedSchemaFieldType, ManagedSchemaFieldName, RuleType} from '../../common/types';
import {AutoDepConfig} from '../../config/types';
import {AutoDepError, ErrorType} from '../../errors/error';
import {AutoDepBase} from '../../inheritance/base';
import {ErrorMessages} from '../../messages/error';
import {TaskMessages} from '../../messages/task';

import {Expression} from '../ast/types';
import * as ast from '../ast/utils';
import {createToken} from '../tokeniser/tokenise';

interface DependencyBuilderOptions {
  config: AutoDepConfig.Output.Schema;
  relativeFileName: string;
}

export class DependencyBuilder extends AutoDepBase {
  private _relativeFileName: string;
  private _ruleType: RuleType;

  constructor({config, relativeFileName}: DependencyBuilderOptions) {
    super({config, name: 'DependencyBuilder'});

    this._relativeFileName = relativeFileName;

    if (this._config.match.isTest(this._relativeFileName)) {
      this._logger.trace({ctx: 'init', message: TaskMessages.identified('a test', `"${this._relativeFileName}"`)});
      this._ruleType = 'test';
    } else if (this._config.match.isFixture(this._relativeFileName)) {
      this._logger.trace({ctx: 'init', message: TaskMessages.identified('a fixture', `"${this._relativeFileName}"`)});
      this._ruleType = 'fixture';
    } else if (this._config.match.isModule(this._relativeFileName)) {
      this._logger.trace({ctx: 'init', message: TaskMessages.identified('a module', `"${this._relativeFileName}"`)});
      this._ruleType = 'module';
    } else {
      const message = ErrorMessages.user.unsupportedFileType({path: this._relativeFileName});
      this._logger.error({ctx: 'init', message});
      throw new AutoDepError(ErrorType.USER, message);
    }
  }

  readonly buildNewFile = (newDeps: string[]) => {
    const root = ast.createRootNode({statements: []});
    const fileConfig = this._config.onCreate[this._ruleType];

    if (fileConfig.fileHeading) {
      const commentStatement = this.buildFileHeadingCommentStatement(fileConfig.fileHeading);

      if (commentStatement) {
        root.statements.push(commentStatement);
      }
    }

    if (fileConfig.subinclude && fileConfig.subinclude.length > 0) {
      root.statements.push(this.buildSubincludeStatement(fileConfig.subinclude));
    }

    root.statements.push(this.buildNewRule(newDeps));

    return root;
  };

  readonly buildNewRule = (newDeps: string[], scope: number = 0) => {
    const fileConfig = this._config.onCreate[this._ruleType];

    const {name, srcs, deps, visibility, testOnly} = this.getRuleFieldSchema(
      fileConfig.explicitSrcs,
      this._config.manage.schema[fileConfig.name]
    );

    const buildNameNode = this.schemaBuilderMap[name.as];
    const buildSrcsNode =
      fileConfig.explicitSrcs && srcs.as !== 'glob' ? this.schemaBuilderMap[srcs.as] : this.schemaBuilderMap.glob;
    const buildDepsNode = this.schemaBuilderMap[deps.as];
    const buildVisibilityNode = this.schemaBuilderMap[visibility.as];
    const buildTestOnlyNode = this.schemaBuilderMap[testOnly.as];

    const nextScope = scope + WHITESPACE_SIZE;
    const thirdScope = scope + WHITESPACE_SIZE * 2;

    return ast.createExpressionStatementNode({
      token: createToken('IDENT', fileConfig.name, scope),
      expression: this.buildCallExpressionNode(
        fileConfig.name,
        [
          this.buildRuleFieldKwargNode(
            name.value,
            buildNameNode(this.getFormattedBuildRuleName(this._relativeFileName), thirdScope),
            nextScope
          ),
          this.buildRuleFieldKwargNode(srcs.value, buildSrcsNode(this._relativeFileName, thirdScope), nextScope),
          ...(newDeps.length > 0 || !fileConfig.omitEmptyFields
            ? [this.buildRuleFieldKwargNode(deps.value, buildDepsNode(newDeps, thirdScope), nextScope)]
            : []),
          ...('initialVisibility' in fileConfig && fileConfig.initialVisibility
            ? [
                this.buildRuleFieldKwargNode(
                  visibility.value,
                  buildVisibilityNode(fileConfig.initialVisibility, thirdScope),
                  nextScope
                ),
              ]
            : []),
          ...('testOnly' in fileConfig && fileConfig.testOnly !== null
            ? [
                this.buildRuleFieldKwargNode(
                  testOnly.value,
                  buildTestOnlyNode(fileConfig.testOnly, thirdScope),
                  nextScope
                ),
              ]
            : []),
        ],
        scope
      ),
    });
  };

  readonly buildFileHeadingCommentStatement = (fileHeading: string) => {
    if (!fileHeading) {
      return null;
    }

    const commentLines = fileHeading.split('\n').map((line) => '# ' + line);
    const commentStatementToken = createToken('COMMENT', commentLines[0], 0);
    return ast.createCommentStatementNode({
      token: commentStatementToken,
      comment: ast.createCommentGroupNode({
        token: commentStatementToken,
        comments: commentLines.map((commentLine) =>
          ast.createSingleLineCommentNode({token: createToken('COMMENT', commentLine, 0), comment: commentLine})
        ),
      }),
    });
  };

  readonly buildSubincludeStatement = (subincludes: string[]) => {
    const subincludeCallToken = createToken('IDENT', 'subinclude', 0);
    return ast.createExpressionStatementNode({
      token: subincludeCallToken,
      expression: this.buildCallExpressionNode(
        'subinclude',
        subincludes.map((subinclude) => {
          const subincludeToken = createToken('STRING', subinclude, WHITESPACE_SIZE);
          return ast.createStringLiteralNode({token: subincludeToken, value: subinclude});
        })
      ),
    });
  };

  readonly buildRuleFieldKwargNode = (key: string, value: Expression, scope: number) => {
    const ruleFieldKwargToken = createToken('IDENT', key, scope);
    return ast.createInfixExpressionNode({
      token: ruleFieldKwargToken,
      left: ast.createIdentifierNode({
        token: ruleFieldKwargToken,
        value: key,
      }),
      operator: '=',
      right: value,
    });
  };

  readonly buildStringLiteralNode = (value: string, scope: number) => {
    const stringLiteralToken = createToken('STRING', value, scope);
    return ast.createStringLiteralNode({
      token: stringLiteralToken,
      value,
    });
  };

  readonly buildIntegerLiteralNode = (value: number, scope: number) => {
    const integerLiteralToken = createToken('INT', String(value), scope);
    return ast.createIntegerLiteralNode({
      token: integerLiteralToken,
      value,
    });
  };

  readonly buildBooleanLiteralNode = (value: boolean, scope: number) => {
    const booleanLiteralToken = createToken('BOOLEAN', String(value), scope);
    return ast.createBooleanLiteralNode({
      token: booleanLiteralToken,
      value,
    });
  };

  readonly buildArrayNode = (values: string[], scope: number) => {
    const arrayLiteralToken = createToken('OPEN_BRACKET', '[', scope);
    return ast.createArrayLiteralNode({
      token: arrayLiteralToken,
      elements: ast.createExpressionListNode({
        token: arrayLiteralToken,
        elements: values.map((value) => {
          const stringLiteralToken = createToken('STRING', value, scope + WHITESPACE_SIZE);
          return ast.createStringLiteralNode({
            token: stringLiteralToken,
            value,
          });
        }),
      }),
    });
  };

  readonly buildCallExpressionNode = (functionName: string, args: Expression[], scope: number = 0) => {
    const callExpressionToken = createToken('OPEN_PAREN', '(', scope);
    const functionNameToken = createToken('IDENT', functionName, scope);
    const argsToken = createToken(args[0].token.type, args[0].getTokenLiteral(), scope + WHITESPACE_SIZE);
    return ast.createCallExpressionNode({
      token: callExpressionToken,
      functionName: ast.createIdentifierNode({
        token: functionNameToken,
        value: functionName,
      }),
      args: ast.createExpressionListNode({
        token: argsToken,
        elements: args,
      }),
    });
  };

  // Utils:

  private getRuleFieldSchema = (
    shouldUseExplicitDeps: boolean,
    schema: Partial<Record<ManagedSchemaFieldName, Set<ManagedSchemaFieldEntry>>>
  ) => {
    const globSrcsField = [...(schema.srcs ?? [])].find((entry) => entry.as === 'glob');
    const shouldUseGlobSrcsField = !shouldUseExplicitDeps && Boolean(globSrcsField);

    const [configName] = schema.name || [];
    const [configSrcs] = (shouldUseGlobSrcsField ? [globSrcsField] : schema.srcs) || [];
    const [configDeps] = schema.deps || [];
    const [configVisibility] = schema.visibility || [];
    const [configTestOnly] = schema.testOnly || [];

    return {
      name: configName || SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.NAME,
      srcs: configSrcs || SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.SRCS,
      deps: configDeps || SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.DEPS,
      visibility: configVisibility || SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.VISIBILITY,
      testOnly: configTestOnly || SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.TEST_ONLY,
    };
  };

  private schemaBuilderMap: Record<ManagedSchemaFieldType, (arg: any, scope: number) => Expression> = {
    string: (arg, scope) =>
      Array.isArray(arg) && arg.length > 0
        ? this.buildStringLiteralNode(arg[0], scope)
        : this.buildStringLiteralNode(String(arg), scope),
    array: (arg, scope) => (Array.isArray(arg) ? this.buildArrayNode(arg, scope) : this.buildArrayNode([arg], scope)),
    number: (arg, scope) =>
      Array.isArray(arg) && arg.length > 0
        ? this.buildIntegerLiteralNode(Number(arg[0]), scope)
        : typeof arg === 'number'
        ? this.buildIntegerLiteralNode(arg, scope)
        : this.buildIntegerLiteralNode(Number(arg), scope),
    bool: (arg, scope) =>
      Array.isArray(arg) && arg.length > 0
        ? this.buildBooleanLiteralNode(Boolean(arg[0]), scope)
        : typeof arg === 'boolean'
        ? this.buildBooleanLiteralNode(arg, scope)
        : this.buildBooleanLiteralNode(Boolean(arg), scope),
    glob: (arg, scope) => {
      const globMatcherConfig = this._config.onCreate[this._ruleType].globMatchers;

      let includeMatchers: string[];

      if (Array.isArray(arg)) {
        includeMatchers =
          globMatcherConfig.include.length > 0
            ? globMatcherConfig.include
            : Array.from(new Set(arg.map((element) => this.toGlobMatcher(String(element)))));
      } else {
        includeMatchers =
          globMatcherConfig.include.length > 0 ? globMatcherConfig.include : [this.toGlobMatcher(String(arg))];
      }

      const excludeMatchers: string[] | null = globMatcherConfig.exclude.length > 0 ? globMatcherConfig.exclude : null;

      const nextScope = scope + WHITESPACE_SIZE;
      const thirdScope = scope + WHITESPACE_SIZE * 2;

      return this.buildCallExpressionNode(
        SUPPORTED_MANAGED_BUILTINS_LOOKUP.glob,
        [
          this.buildRuleFieldKwargNode('include', this.buildArrayNode(includeMatchers, thirdScope), nextScope),
          ...(excludeMatchers
            ? [this.buildRuleFieldKwargNode('exclude', this.buildArrayNode(excludeMatchers, thirdScope), nextScope)]
            : []),
        ],
        scope
      );
    },
  };

  private toGlobMatcher = (fileName: string) => `**/*${path.extname(fileName)}`;

  private getFormattedBuildRuleName = (relativeFileName: string) =>
    this._config.onCreate[this._ruleType].formatTarget(relativeFileName);
}
