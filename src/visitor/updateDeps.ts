import minimatch from 'minimatch';

import * as ast from '../language/ast/utils';
import {
  ASTNode,
  CallExpression,
  ArrayLiteral,
  KeywordArgumentExpression,
  ExpressionStatement,
  RootNode,
  Expression,
  Statement,
} from '../language/ast/types';
import {createToken} from '../language/tokeniser/tokenise';
import {AutoDepConfig} from '../common/types';
import path from 'path';
import {
  DEFAULT_MODULE_RULE_NAME,
  DEFAULT_TEST_RULE_NAME,
  SUPPORTED_MANAGED_BUILTINS,
  SUPPORTED_MANAGED_BUILTINS_LOOKUP,
  SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES,
} from '../common/const';
import {DependencyBuilder} from '../language/builder/build';

interface RuleInsertionVisitorOptions {
  config: AutoDepConfig;
  rootPath: string;
  newDeps: string[];
  builderCls?: typeof DependencyBuilder;
}

export class DependencyUpdateVisitor {
  private readonly builder: DependencyBuilder;
  private readonly fileName: string;
  private readonly newDeps: string[];
  private status: 'success' | 'failed' | 'idle' | 'passthrough';
  private reason: string;
  private removedDeps: string[];
  private config: AutoDepConfig;
  private ruleType: 'module' | 'test';
  private rootPath: string;

  constructor({config, rootPath, newDeps, builderCls = DependencyBuilder}: RuleInsertionVisitorOptions) {
    this.builder = new builderCls({config, rootPath, newDeps});
    this.rootPath = rootPath;
    this.fileName = path.basename(this.rootPath);
    this.config = config;
    this.newDeps = newDeps;
    this.status = 'idle';
    this.reason = 'took no action';
    this.removedDeps = [];

    if (this.config.match.isTest(this.rootPath)) {
      this.ruleType = 'test';
    } else if (this.config.match.isModule(this.rootPath)) {
      this.ruleType = 'module';
    } else {
      const error = `[RuleInsertionVisitor::init]: unsupported file type: ${this.rootPath}. Check your settings at \`<autodepConfig>.match.(module|test)\`. Note, you don't have to double-escape your regex matchers`;
      console.error(error);
      throw new Error(error);
    }
  }

  updateDeps = (node: ASTNode) => {
    let result: ASTNode;

    switch (node.type) {
      case 'Root':
        result = this.visitRootNode(node);
        break;
      case 'Expression':
        result = this.visitExpressionNode(node);
        break;
      case 'Statement':
        result = this.visitStatementNode(node);
        break;
      default:
        this.status = 'passthrough';
        this.reason = 'irrelevant node type passed to `updateDeps()`';
        return node;
    }

    if (this.status === 'success') {
      return result;
    } else {
      this.status = 'failed';
      this.reason = 'unable to find target rule in given file';
      return node;
    }
  };

  private visitRootNode = (node: RootNode) => {
    // We need to check whether the first line of any config `fileHeading` is the same as
    // the first line in the file:
    const onUpdateFileHeading = this.config.onUpdate[this.ruleType].fileHeading ?? '';
    const firstLineOfOnUpdateFileHeading = `# ${onUpdateFileHeading.split('\n')[0]}`;

    const onCreateFileHeading = this.config.onCreate[this.ruleType].fileHeading ?? '';
    const firstLineOfOnCreateFileHeading = `# ${onCreateFileHeading.split('\n')[0]}`;

    const firstStatement = node.statements[0];

    const hasOnUpdateCommentHeading = firstLineOfOnUpdateFileHeading.startsWith(
      String(firstStatement?.getTokenLiteral())
    );
    const hasOnCreateCommentHeading = firstLineOfOnCreateFileHeading.startsWith(
      String(firstStatement?.getTokenLiteral())
    );

    if (firstStatement.kind === 'CommentStatement' && (hasOnCreateCommentHeading || hasOnUpdateCommentHeading)) {
      const [, ...nonFileHeadingStatements] = node.statements;

      node.statements = [
        this.builder.buildFileHeadingCommentStatement(onUpdateFileHeading),
        ...nonFileHeadingStatements.map((statement) => this.visitStatementNode(statement)),
      ];
    } else {
      node.statements = node.statements.map((statement) => this.visitStatementNode(statement));
    }

    return node;
  };

  private visitStatementNode = (node: Statement): Statement => {
    switch (node.kind) {
      case 'ExpressionStatement':
        return this.visitExpressionStatementNode(node);
      case 'CommentStatement':
      default:
        return node;
    }
  };

  private visitExpressionStatementNode = (node: ExpressionStatement) => {
    if (node.token.type === 'RULE_NAME' && node.expression?.kind === 'CallExpression') {
      node.expression = this.visitCallExpressionNode(node.expression);
    }

    return node;
  };

  private visitExpressionNode = (node: Expression): Expression => {
    switch (node.kind) {
      case 'CallExpression':
        return this.visitCallExpressionNode(node);
      default:
        return node;
    }
  };

  private visitCallExpressionNode = (node: CallExpression) => {
    const functionName = String(node.functionName?.getTokenLiteral() ?? '');

    const isManagedRule = this.config.manage.rules.has(functionName);
    const isManagedBuiltin = SUPPORTED_MANAGED_BUILTINS.some((builtin) => functionName === builtin);
    const isDefaultModuleRule = this.ruleType === 'module' && functionName === DEFAULT_MODULE_RULE_NAME;
    const isDefaultTestRule = this.ruleType === 'test' && functionName !== DEFAULT_TEST_RULE_NAME;

    if (!isManagedRule && !isManagedBuiltin && !isDefaultModuleRule && !isDefaultTestRule) {
      return node;
    }

    const managedSchema = this.config.manage.schema[functionName];
    const srcsSchemaFieldEntries = managedSchema?.srcs ?? [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.SRCS];

    if (node.args?.elements && node.args.elements.length > 0) {
      const isTargetRule = node.args.elements.some((element) => {
        if (element.kind === 'KeywordArgumentExpression') {
          for (const srcsAlias of srcsSchemaFieldEntries) {
            if (element.key.getTokenLiteral() === srcsAlias.value) {
              switch (srcsAlias.as) {
                case 'string':
                  if (element.value?.kind === 'StringLiteral') {
                    return element.value.getTokenLiteral() === this.fileName;
                  } else {
                    console.warn(
                      `[DependencyUpdateVisitor::updateDeps]: Found "${
                        srcsAlias.value
                      }"-aliased \`srcs\` field within \`${
                        node.functionName?.getTokenLiteral() ?? '<unknown>'
                      }\` rule, but it was not of type "${
                        srcsAlias.as
                      }" type.  Check your \`<autodepConfig>.manage.schema\` if this is incorrect.`
                    );
                  }
                  break;
                case 'array':
                  if (element.value?.kind === 'ArrayLiteral') {
                    return element.value.elements?.elements.some((subElement) => {
                      if (subElement?.kind === 'StringLiteral') {
                        return subElement.getTokenLiteral() === this.fileName;
                      }
                    });
                  } else {
                    console.warn(
                      `[DependencyUpdateVisitor::updateDeps]: Found "${
                        srcsAlias.value
                      }"-aliased \`srcs\` field within \`${
                        node.functionName?.getTokenLiteral() ?? '<undefinedFn>'
                      }\` rule, but it was not of type "${
                        srcsAlias.as
                      }" type.  Check your \`<autodepConfig>.manage.schema\` if this is incorrect.`
                    );
                  }
                default:
                  if (
                    element.value?.kind === 'CallExpression' &&
                    element.value.functionName?.getTokenLiteral() === SUPPORTED_MANAGED_BUILTINS_LOOKUP.glob
                  ) {
                    return element.value.args?.elements?.some((arg) => {
                      if (arg.kind === 'ArrayLiteral') {
                        // TODO: handle kwarg "glob" arguments
                        return arg.elements?.elements.some((matcher) =>
                          minimatch(this.fileName, String(matcher.getTokenLiteral()))
                        );
                      }
                    });
                  }
                  break;
              }
            }
          }
        }
      });

      if (isTargetRule) {
        node.args.elements = node.args.elements.map((element) => {
          if (element.kind === 'KeywordArgumentExpression') {
            return this.visitKeywordArgumentExpressionNode(element, functionName);
          }
          return element;
        });
      }
    }

    return node;
  };

  private visitKeywordArgumentExpressionNode = (node: KeywordArgumentExpression, functionName: string) => {
    const managedSchema = this.config.manage.schema[functionName];
    const depsSchemaFieldEntries = managedSchema?.deps ?? [SUPPORTED_MANAGED_SCHEMA_FIELD_ENTRIES.DEPS];

    for (const depsAlias of depsSchemaFieldEntries) {
      if (node.key.getTokenLiteral() === depsAlias.value && node.value?.kind === 'ArrayLiteral') {
        node.value = this.visitArrayLiteralNode(node.value);
      }
    }

    return node;
  };

  private visitArrayLiteralNode = (node: ArrayLiteral) => {
    if (node.elements) {
      this.status = 'success';
      this.reason = 'target rule found, dependencies updated';
      this.removedDeps = node.elements.elements.map(String);

      node.elements.elements = this.newDeps.map((dep) =>
        ast.createStringLiteralNode({token: createToken('STRING', dep), value: dep})
      );
    }
    return node;
  };

  getResult = () =>
    Object.seal({
      status: this.status,
      reason: this.reason,
      removedDeps: this.removedDeps,
    });
}
