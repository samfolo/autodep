import {readFileSync, writeFileSync} from 'fs';
import cloneDeep from 'lodash.clonedeep';

import {AutoDepConfig} from '../config/types';
import {AutoDepError, ErrorType} from '../errors/error';
import {AutoDepBase} from '../inheritance/base';
import {RootNode} from '../language/ast/types';
import {DependencyBuilder} from '../language/builder/build';
import {TaskMessages} from '../messages/task';
import {BuildFile} from '../models/buildFile';
import {RuleInsertionVisitor} from '../visitor/insertRule';
import {DependencyUpdateVisitor} from '../visitor/updateDeps';

interface WriterOptions {
  rootPath: string;
  targetBuildFilePath: string;
  config: AutoDepConfig.Output.Schema;
  newDeps: string[];
}

export class Writer extends AutoDepBase {
  private _newDeps: string[];
  private _rootPath: string;
  private _targetBuildFilePath: string;

  private _updatesVisitorCls: typeof DependencyUpdateVisitor;
  private _ruleInsertionVisitorCls: typeof RuleInsertionVisitor;
  private _dependencyBuilderCls: typeof DependencyBuilder;
  private _buildFileCls: typeof BuildFile;

  constructor(
    {rootPath, targetBuildFilePath, config, newDeps}: WriterOptions,
    updatesVisitorCls = DependencyUpdateVisitor,
    ruleInsertionVisitorCls = RuleInsertionVisitor,
    dependencyBuilderCls = DependencyBuilder,
    buildFileCls = BuildFile
  ) {
    super({config, name: 'Writer'});

    this._updatesVisitorCls = updatesVisitorCls;
    this._ruleInsertionVisitorCls = ruleInsertionVisitorCls;
    this._dependencyBuilderCls = dependencyBuilderCls;
    this._buildFileCls = buildFileCls;

    this._newDeps = newDeps;
    this._rootPath = rootPath;
    this._targetBuildFilePath = targetBuildFilePath;
  }

  /**
   * Manages the process of writing dependency updates to the target workspace.  It has access to three strategies:
   * UPDATE, APPEND and BEGIN
   *
   * - It will first try to UPDATE the `deps` field of the trigger file's associate rule located at `this.targetFilePath`
   *   with all the formatting specified in `<autodepConfig>.onUpdate`
   *   - If UPDATE fails gracefully, it will then try to APPEND a new rule to the file, updating `subincludes` and applying
   *     any formatting specified in `<autodepConfig>.onUpdate`. If UPDATE fails, the function returns `false`.
   *   - If UPDATE errors, however, the file is assumed not to exist, and so the BEGIN strategy is used, which creates
   *     a brand new file at `this.targetFilePath`, with all the formatting specified in `<autodepConfig>.onCreate`
   */
  writeUpdatesToFileSystem = () => {
    let targetBuildFile: string;

    try {
      targetBuildFile = readFileSync(this._targetBuildFilePath, {encoding: 'utf-8', flag: 'r'});
    } catch {
      this._logger.info({
        ctx: 'processUpdate',
        message: TaskMessages.locate.failure(
          `an updatable \`BUILD\` or \`BUILD.plz\` file at ${this._targetBuildFilePath}.`
        ),
      });
      this._logger.info({ctx: 'processUpdate', message: TaskMessages.attempt('create', 'a new file')});

      this.beginNewFile();

      return true;
    }

    const ast = new this._buildFileCls({file: targetBuildFile, config: this._config}).toAST();

    const existingRuleUpdated = this.updateExistingRule(ast);
    if (existingRuleUpdated) {
      return true;
    }

    this._logger.info({
      ctx: 'processUpdate',
      message: TaskMessages.locate.failure(`updatable rule at ${this._targetBuildFilePath}`),
    });
    this._logger.info({ctx: 'processUpdate', message: TaskMessages.attempt('append', 'a new rule to file')});

    const newRuleInserted = this.appendNewRule(ast);
    if (newRuleInserted) {
      return true;
    }

    this._logger.error({
      ctx: 'processUpdate',
      message: TaskMessages.failure('insert', `rule at ${this._targetBuildFilePath}`),
    });

    return false;
  };

  /**
   * UPDATE strategy:
   * - Search the target `BUILD` or `BUILD.plz` file for an existing rule which
   * contains the trigger file in its `srcs` value.
   * - If this strategy is successful, return `true`, else return `false`
   *
   * @param ast an AST representation of the target document
   * @returns a boolean indicating whether this strategy was successful
   */
  private updateExistingRule = (ast: RootNode) => {
    const visitor = new this._updatesVisitorCls({
      config: this._config,
      rootPath: this._rootPath,
      newDeps: this._newDeps,
    });
    const updatedAST = visitor.updateDeps(cloneDeep(ast));
    const result = visitor.getResult();

    switch (result.status) {
      case 'success':
        this._logger.trace({
          ctx: 'processUpdate',
          message: TaskMessages.update.success(this._targetBuildFilePath, 'new BUILD dependencies'),
        });
        writeFileSync(this._targetBuildFilePath, updatedAST.toString(), {encoding: 'utf-8', flag: 'w'});
        return true;
      case 'failed':
        this._logger.trace({
          ctx: 'processUpdate',
          message: TaskMessages.update.failure(this._targetBuildFilePath, 'new BUILD dependencies'),
        });
        return false;
      case 'passthrough':
      case 'idle':
        throw new AutoDepError(ErrorType.UNEXPECTED, result.reason);
      default:
        throw new AutoDepError(ErrorType.UNEXPECTED, TaskMessages.unknown(result.status, 'result status'));
    }
  };

  /**
   * APPEND strategy:
   * - Attempt to append a new rule to the `BUILD` or `BUILD.plz` file, and update any `subinclude` statements
   * - If this strategy is successful, return `true`, else return `false`
   *
   * @param ast an AST representation of the target document
   * @returns a boolean indicating whether this strategy was successful
   */
  private appendNewRule = (ast: RootNode) => {
    const visitor = new this._ruleInsertionVisitorCls({
      config: this._config,
      rootPath: this._rootPath,
      newDeps: this._newDeps,
    });
    const updatedAST = visitor.insertRule(cloneDeep(ast));
    const result = visitor.getResult();

    switch (result.status) {
      case 'success':
        writeFileSync(this._targetBuildFilePath, updatedAST.toString(), {encoding: 'utf-8', flag: 'w'});
        return true;
      case 'failed':
        return false;
      case 'passthrough':
      case 'idle':
        throw new AutoDepError(ErrorType.UNEXPECTED, result.reason);
      default:
        throw new AutoDepError(ErrorType.UNEXPECTED, TaskMessages.unknown(result.status, 'result status'));
    }
  };

  /**
   * BEGIN strategy:
   * - Create an entirely new `BUILD` or `BUILD.plz` file
   * - This should not fail, but if it does, it will throw an error
   */
  private beginNewFile = () => {
    const ast = new this._dependencyBuilderCls({
      config: this._config,
      rootPath: this._rootPath,
    }).buildNewFile(this._newDeps);

    writeFileSync(this._targetBuildFilePath, ast.toString(), {encoding: 'utf-8', flag: 'w'});
  };
}
