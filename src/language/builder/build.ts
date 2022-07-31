import path from 'path';
import {SUPPORTED_MANAGED_BUILTINS_LOOKUP, SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES} from '../../common/const';

import {ManagedSchemaFieldEntry, ManagedSchemaFieldType, ManagedSchemaFieldName} from '../../common/types';
import {AutoDepConfig} from '../../config/types';
import {AutoDepError, ErrorType} from '../../errors/error';
import {AutoDepBase} from '../../inheritance/base';
import {ErrorMessages} from '../../messages/error';

import {Expression} from '../ast/types';
import * as ast from '../ast/utils';

interface DependencyBuilderOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
}

export class DependencyBuilder extends AutoDepBase {
  private _fileName: string;
  private _rootPath: string;
  private _ruleType: 'module' | 'test';

  constructor({config, rootPath}: DependencyBuilderOptions) {
    super({config, name: 'DependencyBuilder'});

    this._rootPath = rootPath;
    this._fileName = path.basename(this._rootPath);

    if (this._config.match.isTest(this._rootPath)) {
      this._ruleType = 'test';
    } else if (this._config.match.isModule(this._rootPath)) {
      this._ruleType = 'module';
    } else {
      throw new AutoDepError(ErrorType.USER, ErrorMessages.user.unsupportedFileType({path: this._rootPath}));
    }
  }

  readonly buildNewFile = (newDeps: string[]) => {
    const root = ast.createRootNode({statements: []});
    const fileConfig = this._config.onCreate[this._ruleType];

    if (fileConfig.fileHeading) {
      root.statements.push(this.buildFileHeadingCommentStatement(fileConfig.fileHeading));
    }

    if (fileConfig.subinclude && fileConfig.subinclude.length > 0) {
      root.statements.push(this.buildSubincludeStatement(fileConfig.subinclude));
    }

    root.statements.push(this.buildNewRule(newDeps));

    return root;
  };

  readonly buildNewRule = (newDeps: string[]) => {
    const fileConfig = this._config.onCreate[this._ruleType];

    const {name, srcs, deps, visibility, testOnly} = this.getRuleFieldSchema(
      this._config.manage.schema[fileConfig.name]
    );

    const buildNameNode = this.schemaBuilderMap[name.as];
    const buildSrcsNode = fileConfig.explicitDeps ? this.schemaBuilderMap[srcs.as] : this.schemaBuilderMap.glob;
    const buildDepsNode = this.schemaBuilderMap[deps.as];
    const buildVisibilityNode = this.schemaBuilderMap[visibility.as];
    const buildTestOnlyNode = this.schemaBuilderMap[testOnly.as];

    return ast.createExpressionStatementNode({
      token: {type: 'IDENT', value: fileConfig.name},
      expression: this.buildCallExpressionNode(fileConfig.name, [
        this.buildRuleFieldKwargNode(name.value, buildNameNode(path.parse(this._fileName).name)),
        this.buildRuleFieldKwargNode(srcs.value, buildSrcsNode(this._fileName)),
        ...(newDeps.length > 0 || !fileConfig.omitEmptyFields
          ? [this.buildRuleFieldKwargNode(deps.value, buildDepsNode(newDeps))]
          : []),
        ...('initialVisibility' in fileConfig && fileConfig.initialVisibility
          ? [this.buildRuleFieldKwargNode(visibility.value, buildVisibilityNode(fileConfig.initialVisibility))]
          : []),
        ...('testOnly' in fileConfig && fileConfig.testOnly !== null
          ? [this.buildRuleFieldKwargNode(testOnly.value, buildTestOnlyNode(fileConfig.testOnly))]
          : []),
      ]),
    });
  };

  readonly buildFileHeadingCommentStatement = (fileHeading: string) => {
    const commentLines = fileHeading.split('\n').map((line) => '# ' + line);
    return ast.createCommentStatementNode({
      token: {type: 'COMMENT', value: commentLines[0]},
      comment: ast.createCommentGroupNode({
        token: {type: 'COMMENT', value: commentLines[0]},
        comments: commentLines.map((commentLine) =>
          ast.createSingleLineCommentNode({token: {type: 'COMMENT', value: commentLine}, comment: commentLine})
        ),
      }),
    });
  };

  readonly buildSubincludeStatement = (subincludes: string[]) =>
    ast.createExpressionStatementNode({
      token: {type: 'IDENT', value: 'subinclude'},
      expression: this.buildCallExpressionNode(
        'subinclude',
        subincludes.map((subinclude) =>
          ast.createStringLiteralNode({token: {type: 'STRING', value: subinclude}, value: subinclude})
        )
      ),
    });

  readonly buildRuleFieldKwargNode = (key: string, right: Expression) =>
    ast.createInfixExpressionNode({
      token: {type: 'IDENT', value: key},
      left: ast.createIdentifierNode({
        token: {type: 'IDENT', value: key},
        value: key,
      }),
      operator: '=',
      right,
    });

  readonly buildStringLiteralNode = (value: string) =>
    ast.createStringLiteralNode({
      token: {type: 'STRING', value},
      value,
    });

  readonly buildIntegerLiteralNode = (value: number) =>
    ast.createIntegerLiteralNode({
      token: {type: 'INT', value: String(value)},
      value,
    });

  readonly buildBooleanLiteralNode = (value: boolean) =>
    ast.createBooleanLiteralNode({
      token: {type: 'BOOLEAN', value: String(value)},
      value,
    });

  readonly buildArrayNode = (values: string[]) =>
    ast.createArrayLiteralNode({
      token: {type: 'OPEN_BRACKET', value: '['},
      elements: ast.createExpressionListNode({
        token: {type: 'IDENT', value: 'name'},
        elements: values.map((value) =>
          ast.createStringLiteralNode({
            token: {type: 'STRING', value},
            value,
          })
        ),
      }),
    });

  readonly buildCallExpressionNode = (functionName: string, args: Expression[]) =>
    ast.createCallExpressionNode({
      token: {type: 'OPEN_PAREN', value: '('},
      functionName: ast.createIdentifierNode({
        token: {type: 'IDENT', value: functionName},
        value: functionName,
      }),
      args: ast.createExpressionListNode({
        token: {type: args[0].token.type, value: args[0].getTokenLiteral()},
        elements: args,
      }),
    });

  // Utils:

  private getRuleFieldSchema = (schema: Partial<Record<ManagedSchemaFieldName, Set<ManagedSchemaFieldEntry>>>) => {
    const [configName] = schema.name || [];
    const [configSrcs] = schema.srcs || [];
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

  private schemaBuilderMap: Record<ManagedSchemaFieldType, (arg: any) => Expression> = {
    string: (arg) =>
      Array.isArray(arg) && arg.length > 0
        ? this.buildStringLiteralNode(arg[0])
        : this.buildStringLiteralNode(String(arg)),
    array: (arg) => (Array.isArray(arg) ? this.buildArrayNode(arg) : this.buildArrayNode([arg])),
    number: (arg) =>
      Array.isArray(arg) && arg.length > 0
        ? this.buildIntegerLiteralNode(Number(arg[0]))
        : typeof arg === 'number'
        ? this.buildIntegerLiteralNode(arg)
        : this.buildIntegerLiteralNode(Number(arg)),
    bool: (arg) =>
      Array.isArray(arg) && arg.length > 0
        ? this.buildBooleanLiteralNode(Boolean(arg[0]))
        : typeof arg === 'boolean'
        ? this.buildBooleanLiteralNode(arg)
        : this.buildBooleanLiteralNode(Boolean(arg)),
    glob: (arg) => {
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

      return this.buildCallExpressionNode(SUPPORTED_MANAGED_BUILTINS_LOOKUP.glob, [
        this.buildRuleFieldKwargNode('include', this.buildArrayNode(includeMatchers)),
        ...(excludeMatchers ? [this.buildRuleFieldKwargNode('exclude', this.buildArrayNode(excludeMatchers))] : []),
      ]);
    },
  };

  private toGlobMatcher = (fileName: string) => `**/*${path.extname(fileName)}`;
}
