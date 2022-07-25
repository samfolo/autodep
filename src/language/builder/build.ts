import path from 'path';
import {SUPPORTED_MANAGED_BUILTINS_LOOKUP, SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES} from '../../common/const';

import {ManagedSchemaFieldEntry, ManagedSchemaFieldType, ManagedSchemaFieldName} from '../../common/types';
import {AutoDepConfig} from '../../config/types';
import {AutoDepError, ErrorType} from '../../errors/error';
import {ErrorMessages} from '../../messages/error';

import {Expression} from '../ast/types';
import * as ast from '../ast/utils';

interface DependencyBuilderOptions {
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
  newDeps: string[];
}

export class DependencyBuilder {
  private _config: AutoDepConfig.Output.Schema;
  private rootPath: string;
  private fileName: string;
  private initialRuleType: 'module' | 'test';
  private newDeps: string[];

  constructor({config, rootPath, newDeps}: DependencyBuilderOptions) {
    this._config = config;
    this.rootPath = rootPath;
    this.fileName = path.basename(this.rootPath);
    this.newDeps = newDeps;

    if (this._config.match.isTest(this.rootPath)) {
      this.initialRuleType = 'test';
    } else if (this._config.match.isModule(this.rootPath)) {
      this.initialRuleType = 'module';
    } else {
      throw new AutoDepError(ErrorType.USER, ErrorMessages.user.unsupportedFileType({path: this.rootPath}));
    }
  }

  readonly buildNewFile = () => {
    const root = ast.createRootNode({statements: []});
    const fileConfig = this._config.onCreate[this.initialRuleType];

    if (fileConfig.fileHeading) {
      root.statements.push(this.buildFileHeadingCommentStatement(fileConfig.fileHeading));
    }

    if (fileConfig.subinclude && fileConfig.subinclude.length > 0) {
      root.statements.push(this.buildSubincludeStatement(fileConfig.subinclude));
    }

    root.statements.push(this.buildNewRule());

    return root;
  };

  readonly buildNewRule = () => {
    const fileConfig = this._config.onCreate[this.initialRuleType];

    const {name, srcs, deps, visibility, testOnly} = this.getRuleFieldSchema(
      this._config.manage.schema[fileConfig.name]
    );

    const buildNameNode = this.schemaBuilderMap[name.as];
    const buildSrcsNode = this.schemaBuilderMap[srcs.as];
    const buildDepsNode = this.schemaBuilderMap[deps.as];
    const buildVisibilityNode = this.schemaBuilderMap[visibility.as];
    const buildTestOnlyNode = this.schemaBuilderMap[testOnly.as];

    return ast.createExpressionStatementNode({
      token: {type: 'RULE_NAME', value: fileConfig.name},
      expression: this.buildCallExpressionNode(fileConfig.name, [
        this.buildRuleFieldKwargNode(name.value, buildNameNode(path.parse(this.fileName).name)),
        this.buildRuleFieldKwargNode(srcs.value, buildSrcsNode(this.fileName)),
        ...(this.newDeps.length > 0 || !fileConfig.omitEmptyFields
          ? [this.buildRuleFieldKwargNode(deps.value, buildDepsNode(this.newDeps))]
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
      token: {type: 'RULE_NAME', value: 'subinclude'},
      expression: this.buildCallExpressionNode(
        'subinclude',
        subincludes.map((subinclude) =>
          ast.createStringLiteralNode({token: {type: 'STRING', value: subinclude}, value: subinclude})
        )
      ),
    });

  readonly buildRuleFieldKwargNode = (key: string, value: Expression) =>
    ast.createKeywordArgumentExpressionNode({
      token: {type: 'RULE_FIELD_NAME', value: key},
      key: ast.createIdentifierNode({
        token: {type: 'RULE_FIELD_NAME', value: key},
        value: key,
      }),
      value,
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
        token: {type: 'RULE_NAME', value: functionName},
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
    glob: (arg) =>
      Array.isArray(arg)
        ? this.buildCallExpressionNode(SUPPORTED_MANAGED_BUILTINS_LOOKUP.glob, [this.buildArrayNode(arg)])
        : this.buildCallExpressionNode(SUPPORTED_MANAGED_BUILTINS_LOOKUP.glob, [this.buildArrayNode([String(arg)])]),
  };
}
