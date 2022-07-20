import path from 'path';
import {SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES} from '../../common/const';

import {ManagedSchemaFieldEntry, ManagedSchemaFieldType, SchemaField, WorkspacePluginConfig} from '../../common/types';

import {Expression} from '../ast/types';
import * as ast from '../ast/utils';

interface DependencyBuilderOptions {
  config: WorkspacePluginConfig;
  rootPath: string;
  initialDeps: string[];
}

export class DependencyFileBuilder {
  private config: WorkspacePluginConfig;
  private rootPath: string;
  private fileName: string;
  private initialRuleType: 'module' | 'test';
  private initialDeps: string[];

  constructor({config, rootPath, initialDeps}: DependencyBuilderOptions) {
    this.config = config;
    this.rootPath = rootPath;
    this.fileName = path.basename(this.rootPath);
    this.initialDeps = initialDeps;

    if (this.config.match.isTest(this.rootPath)) {
      this.initialRuleType = 'test';
    } else if (this.config.match.isModule(this.rootPath)) {
      this.initialRuleType = 'module';
    } else {
      const error = `[DependencyFileBuilder::init]: unsupported file type: ${this.rootPath}. Check your settings at <config>.match.(module|test). Note, you don't have to double-escape your regex matchers`;
      console.error(error);
      throw new Error(error);
    }
  }

  build = () => {
    const root = ast.createRootNode({statements: []});
    const fileConfig = this.config.onCreate[this.initialRuleType];

    if (fileConfig.fileHeading) {
      root.statements.push(this.buildFileHeadingCommentStatement(fileConfig.fileHeading));
    }

    if (fileConfig.subinclude && fileConfig.subinclude.length > 0) {
      root.statements.push(this.buildSubincludeStatement(fileConfig.subinclude));
    }

    const {name, srcs, deps, visibility, testOnly} = this.getRuleFieldSchema(
      this.config.manage.schema[fileConfig.name]
    );

    const buildNameNode = this.schemaBuilderMap[name.as];
    const buildSrcsNode = this.schemaBuilderMap[srcs.as];
    const buildDepsNode = this.schemaBuilderMap[deps.as];
    const buildVisibilityNode = this.schemaBuilderMap[visibility.as];
    const buildTestOnlyNode = this.schemaBuilderMap[testOnly.as];

    root.statements.push(
      ast.createExpressionStatementNode({
        token: {type: 'RULE_NAME', value: fileConfig.name},
        expression: this.buildCallExpressionNode(fileConfig.name, [
          this.buildRuleFieldKwargNode(name.value, buildNameNode(path.parse(this.fileName).name)),
          this.buildRuleFieldKwargNode(srcs.value, buildSrcsNode(this.fileName)),
          ...(this.initialDeps.length > 0 || !fileConfig.omitEmptyFields
            ? [this.buildRuleFieldKwargNode(deps.value, buildDepsNode(this.initialDeps))]
            : []),
          ...('initialVisibility' in fileConfig && fileConfig.initialVisibility
            ? [this.buildRuleFieldKwargNode(visibility.value, buildVisibilityNode(fileConfig.initialVisibility))]
            : []),
          ...('testOnly' in fileConfig && fileConfig.testOnly !== null
            ? [this.buildRuleFieldKwargNode(testOnly.value, buildTestOnlyNode(fileConfig.testOnly))]
            : []),
        ]),
      })
    );

    return root;
  };

  private buildFileHeadingCommentStatement = (fileHeading: string) => {
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

  private buildSubincludeStatement = (subincludes: string[]) =>
    ast.createExpressionStatementNode({
      token: {type: 'RULE_NAME', value: 'subinclude'},
      expression: this.buildCallExpressionNode(
        'subinclude',
        subincludes.map((subinclude) =>
          ast.createStringLiteralNode({token: {type: 'STRING', value: subinclude}, value: subinclude})
        )
      ),
    });

  private buildRuleFieldKwargNode = (key: string, value: Expression) =>
    ast.createKeywordArgumentExpressionNode({
      token: {type: 'RULE_FIELD_NAME', value: key},
      key: ast.createIdentifierNode({
        token: {type: 'RULE_FIELD_NAME', value: key},
        value: key,
      }),
      value,
    });

  private buildStringLiteralNode = (value: string) =>
    ast.createStringLiteralNode({
      token: {type: 'STRING', value},
      value,
    });

  private buildIntegerLiteralNode = (value: number) =>
    ast.createIntegerLiteralNode({
      token: {type: 'INT', value: String(value)},
      value,
    });

  private buildBooleanLiteralNode = (value: boolean) =>
    ast.createBooleanLiteralNode({
      token: {type: 'BOOLEAN', value: String(value)},
      value,
    });

  private buildArrayNode = (values: string[]) =>
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

  // Utils:

  private buildCallExpressionNode = (functionName: string, args: Expression[]) =>
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

  private getRuleFieldSchema = (schema: Partial<Record<SchemaField, Set<ManagedSchemaFieldEntry>>>) => {
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
  };
}
