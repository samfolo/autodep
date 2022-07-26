import path from 'path';
import {TaskStatusClient} from '../clients/taskStatus/task';
import {AutoDepConfig} from '../config/types';
import {AutoDepBase} from '../inheritance/base';
import {RootNode} from '../language/ast/types';
import {DependencyBuilder} from '../language/builder/build';
import {Logger} from '../logger/log';
import {TaskMessages} from '../messages/task';

import {NodeQualifier} from './qualify';

interface VisitorBaseOptions {
  name: string;
  config: AutoDepConfig.Output.Schema;
  rootPath: string;
  targetBuildFilePath: string;
}

export class VisitorBase extends AutoDepBase {
  protected _builderCls: typeof DependencyBuilder;
  protected _nodeQualifierCls: typeof NodeQualifier;
  protected _builder: DependencyBuilder;
  protected _rootPath: string;
  protected _relativeFileName: string;
  protected _nodeQualifier: NodeQualifier;
  protected _taskStatusClient: TaskStatusClient;

  constructor(
    {config, name, rootPath, targetBuildFilePath}: VisitorBaseOptions,
    builderCls: typeof DependencyBuilder = DependencyBuilder,
    loggerCls: typeof Logger = Logger,
    nodeQualifierCls: typeof NodeQualifier = NodeQualifier,
    taskStatusClientCls: typeof TaskStatusClient = TaskStatusClient
  ) {
    super({config, name}, loggerCls, taskStatusClientCls);
    this._logger.trace({ctx: 'init', message: TaskMessages.initialise.attempt(this._name)});

    this._builderCls = builderCls;
    this._nodeQualifierCls = nodeQualifierCls;
    this._rootPath = rootPath;
    this._relativeFileName = path.relative(path.dirname(targetBuildFilePath), this._rootPath);
    this._builder = new this._builderCls({config: this._config, relativeFileName: this._relativeFileName});
    this._nodeQualifier = new this._nodeQualifierCls({
      config: this._config,
      rootPath: this._rootPath,
      relativeFileName: this._relativeFileName,
    });
    this._taskStatusClient = new this._taskStatusClientCls();
  }

  // We need to check whether the first line of any config `fileHeading` is the same as
  // the first line in the file:
  protected shouldUpdateCommentHeading = (node: RootNode, newFileHeading: string) => {
    const firstLineOfOnUpdateFileHeading = `# ${newFileHeading.split('\n')[0]}`;

    const onCreateFileHeading = this._config.onCreate[this._nodeQualifier.ruleType].fileHeading ?? '';
    const firstLineOfOnCreateFileHeading = `# ${onCreateFileHeading.split('\n')[0]}`;

    const firstStatement = node.statements[0];

    const firstStatementLiteral = String(firstStatement?.getTokenLiteral());
    const hasOnUpdateCommentHeading = firstLineOfOnUpdateFileHeading.startsWith(firstStatementLiteral);
    const hasOnCreateCommentHeading = firstLineOfOnCreateFileHeading.startsWith(firstStatementLiteral);

    const hasCommentHeading = hasOnCreateCommentHeading || hasOnUpdateCommentHeading;

    return newFileHeading && firstStatement?.kind === 'CommentStatement' && hasCommentHeading;
  };
}
