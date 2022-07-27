import path from 'path';

import {AutoDepConfig} from '../config/types';
import {AutoDepError, ErrorType} from '../errors/error';
import {AutoDepBase} from '../inheritance/base';
import {RootNode} from '../language/ast/types';
import {DependencyBuilder} from '../language/builder/build';
import {ErrorMessages} from '../messages/error';
import {TaskMessages} from '../messages/task';
import {NodeQualifier} from './qualify';

interface VisitorBaseOptions {
  name: string;
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
}

export class VisitorBase extends AutoDepBase {
  protected _builderCls: typeof DependencyBuilder;
  protected _nodeQualifierCls: typeof NodeQualifier;
  protected _builder: DependencyBuilder;
  protected _rootPath: string;
  protected _fileName: string;
  protected _nodeQualifier: NodeQualifier;
  protected _ruleType: 'module' | 'test';

  constructor(
    {config, name, rootPath}: VisitorBaseOptions,
    builderCls: typeof DependencyBuilder = DependencyBuilder,
    nodeQualifierCls: typeof NodeQualifier = NodeQualifier
  ) {
    super({config, name});
    this._logger.trace({ctx: 'init', message: TaskMessages.initialise.attempt(this._name)});

    this._builderCls = builderCls;
    this._nodeQualifierCls = nodeQualifierCls;
    this._builder = new this._builderCls({config: this._config, rootPath});
    this._rootPath = rootPath;
    this._fileName = path.basename(this._rootPath);
    this._nodeQualifier = new this._nodeQualifierCls({config: this._config, fileName: this._fileName});

    if (this._config.match.isTest(this._rootPath)) {
      this._logger.trace({ctx: 'init', message: TaskMessages.identified('a test', `"${this._fileName}"`)});
      this._ruleType = 'test';
    } else if (this._config.match.isModule(this._rootPath)) {
      this._logger.trace({ctx: 'init', message: TaskMessages.identified('a module', `"${this._fileName}"`)});
      this._ruleType = 'module';
    } else {
      const message = ErrorMessages.user.unsupportedFileType({path: this._rootPath});
      this._logger.error({ctx: 'init', message});
      throw new AutoDepError(ErrorType.USER, message);
    }
  }

  // We need to check whether the first line of any config `fileHeading` is the same as
  // the first line in the file:
  protected shouldUpdateCommentHeading = (node: RootNode, newFileHeading: string) => {
    const firstLineOfOnUpdateFileHeading = `# ${newFileHeading.split('\n')[0]}`;

    const onCreateFileHeading = this._config.onCreate[this._ruleType].fileHeading ?? '';
    const firstLineOfOnCreateFileHeading = `# ${onCreateFileHeading.split('\n')[0]}`;

    const firstStatement = node.statements[0];

    const firstStatementLiteral = String(firstStatement?.getTokenLiteral());
    const hasOnUpdateCommentHeading = firstLineOfOnUpdateFileHeading.startsWith(firstStatementLiteral);
    const hasOnCreateCommentHeading = firstLineOfOnCreateFileHeading.startsWith(firstStatementLiteral);

    const hasCommentHeading = hasOnCreateCommentHeading || hasOnUpdateCommentHeading;

    return newFileHeading && firstStatement?.kind === 'CommentStatement' && hasCommentHeading;
  };
}
