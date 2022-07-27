import minimatch from 'minimatch';
import path from 'path';

import {SUPPORTED_MANAGED_BUILTINS_LOOKUP} from '../common/const';
import {ManagedSchemaFieldEntry} from '../common/types';
import {AutoDepConfig} from '../config/types';
import {AutoDepBase} from '../inheritance/base';
import {CallExpression, Expression, ArrayLiteral, StringLiteral} from '../language/ast/types';
import {ErrorMessages} from '../messages/error';
import {TaskMessages} from '../messages/task';

interface NodeQualifierOptions {
  config: AutoDepConfig.Output.Schema;
  fileName: string;
}

export class NodeQualifier extends AutoDepBase {
  private _fileName: string;

  constructor({config, fileName}: NodeQualifierOptions) {
    super({config, name: 'NodeQualifier'});

    this._fileName = path.basename(fileName);
  }

  isTargetBuildRule = (node: CallExpression, functionName: string, srcsAliases: Set<ManagedSchemaFieldEntry>) => {
    if (!node.args) {
      return false;
    }

    return node.args.elements.some((element) => {
      if (element.kind === 'KeywordArgumentExpression') {
        for (const srcsAlias of srcsAliases) {
          if (element.key.getTokenLiteral() === srcsAlias.value) {
            this._logger.trace({
              ctx: 'isTargetBuildRule',
              message: TaskMessages.locate.success(`a rule with \`srcs\` alias "${srcsAlias.value}"`),
            });

            switch (srcsAlias.as) {
              case 'string':
                if (element.value?.kind === 'StringLiteral') {
                  return this.isTargetStringSrcsField(element.value, functionName, srcsAlias);
                } else {
                  this.warnOfBuildSchemaMismatch('isTargetBuildRule', node, functionName, srcsAlias);
                }
                break;
              case 'array':
                if (element.value?.kind === 'ArrayLiteral') {
                  return this.isTargetArraySrcsField(element.value, functionName, srcsAlias);
                } else {
                  this.warnOfBuildSchemaMismatch('isTargetBuildRule', node, functionName, srcsAlias);
                }
                break;
              case 'glob':
                if (this.isGlobDeclaration(element.value)) {
                  return this.isTargetGlobSrcsField(element.value, functionName, srcsAlias);
                } else {
                  this.warnOfBuildSchemaMismatch('isTargetBuildRule', node, functionName, srcsAlias);
                }
                break;
              default:
                break;
            }
          }

          this._logger.trace({
            ctx: 'visitCallExpressionNode',
            message:
              TaskMessages.resolve.failure(
                `${functionName}(${srcsAlias.value} = <${this._fileName}>)`,
                `"${this._fileName}"`
              ) + ' - continuing...',
          });

          return false;
        }
      }

      return false;
    });
  };

  private isTargetStringSrcsField = (
    elementValue: StringLiteral,
    functionName: string,
    srcsAlias: ManagedSchemaFieldEntry
  ) => {
    this._logger.trace({
      ctx: 'isTargetStringSrcsField',
      message: TaskMessages.identified(`a string field`, `\`${functionName}.${srcsAlias.value}\``),
    });
    const isMatch = elementValue?.getTokenLiteral() === this._fileName;
    this._logger.trace({
      ctx: 'isTargetStringSrcsField',
      message: TaskMessages.locate[isMatch ? 'success' : 'failure'](
        `"${this._fileName}" at \`${functionName}.${srcsAlias.value}\``
      ),
    });
    return isMatch;
  };

  private isTargetArraySrcsField = (
    elementValue: ArrayLiteral,
    functionName: string,
    srcsAlias: ManagedSchemaFieldEntry
  ) => {
    this._logger.trace({
      ctx: 'isTargetArraySrcsField',
      message: TaskMessages.identified(`an array field`, `\`${functionName}.${srcsAlias.value}\``),
    });
    const isMatch = !!elementValue.elements?.elements.some((subElement) => {
      if (subElement?.kind === 'StringLiteral') {
        return subElement.getTokenLiteral() === this._fileName;
      }
    });
    this._logger.trace({
      ctx: 'isTargetArraySrcsField',
      message: TaskMessages.locate[isMatch ? 'success' : 'failure'](
        `"${this._fileName}" in \`${functionName}.${srcsAlias.value}\``
      ),
    });
    return isMatch;
  };

  private isGlobDeclaration = (elementValue?: Expression): elementValue is CallExpression =>
    elementValue?.kind === 'CallExpression' &&
    elementValue.functionName?.getTokenLiteral() === SUPPORTED_MANAGED_BUILTINS_LOOKUP.glob;

  private isTargetGlobSrcsField = (
    elementValue: CallExpression,
    functionName: string,
    srcsAlias: ManagedSchemaFieldEntry
  ) => {
    this._logger.trace({
      ctx: 'isTargetGlobSrcsField',
      message: TaskMessages.identified(`a \`glob\` builtin field`, `\`${functionName}.${srcsAlias.value}\``),
    });
    // TODO: also handle "glob" exclude kwargs
    const isMatch = !!elementValue.args?.elements?.some(
      (arg) => arg.kind === 'ArrayLiteral' && this.matchesAtLeastOneGlobDeclarationInclude(arg)
    );
    this._logger.trace({
      ctx: 'isTargetGlobSrcsField',
      message: TaskMessages[isMatch ? 'success' : 'failure'](
        isMatch ? 'matched' : 'match',
        `"${this._fileName}" against a matcher in \`${functionName}.${srcsAlias.value}\``
      ),
    });
    return isMatch;
  };

  private matchesAtLeastOneGlobDeclarationInclude = (includes: ArrayLiteral) =>
    !!includes.elements?.elements.some((matcher) => {
      this._logger.trace({
        ctx: 'matchesAtLeastOneGlobDeclarationInclude',
        message: TaskMessages.attempt('match', `${this._fileName} against "${matcher.getTokenLiteral()}"`),
      });
      return minimatch(this._fileName, String(matcher.getTokenLiteral()));
    });

  warnOfBuildSchemaMismatch = (ctx: string, node: Expression, functionName: string, alias: ManagedSchemaFieldEntry) =>
    this._logger.warn({
      ctx,
      message: ErrorMessages.user.buildRuleSchemaMismatch({
        ruleName: functionName,
        fieldName: 'srcs',
        fieldAlias: alias.value,
        expectedFieldType: alias.as,
      }),
      details: node.toString(),
    });
}