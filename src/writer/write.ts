import {readFileSync, writeFileSync} from 'fs';
import cloneDeep from 'lodash.clonedeep';
import {AutoDepConfig} from '../common/types';
import {AutoDepError, ErrorType} from '../errors/error';
import {RootNode} from '../language/ast/types';
import {DependencyBuilder} from '../language/builder/build';
import {Logger} from '../logger/log';
import {TaskMessages} from '../messages/task';
import {BuildFile} from '../models/buildFile';
import {RuleInsertionVisitor} from '../visitor/insertRule';
import {DependencyUpdateVisitor} from '../visitor/updateDeps';

interface WriterOptions {
  rootPath: string;
  targetBuildFilePath: string;
  config: AutoDepConfig;
  newDeps: string[];
}

export class Writer {
  private rootPath: string;
  private targetBuildFilePath: string;
  private newDeps: string[];
  private _config: AutoDepConfig;
  private _logger: Logger;

  private updatesVisitorCls: typeof DependencyUpdateVisitor;
  private ruleInsertionVisitorCls: typeof RuleInsertionVisitor;
  private dependencyBuilderCls: typeof DependencyBuilder;
  private buildFileCls: typeof BuildFile;

  constructor(
    {rootPath, targetBuildFilePath, config, newDeps}: WriterOptions,
    updatesVisitorCls = DependencyUpdateVisitor,
    ruleInsertionVisitorCls = RuleInsertionVisitor,
    dependencyBuilderCls = DependencyBuilder,
    buildFileCls = BuildFile
  ) {
    this._config = config;
    this._logger = new Logger({namespace: 'Writer', config: this._config});

    this.rootPath = rootPath;
    this.targetBuildFilePath = targetBuildFilePath;
    this.newDeps = newDeps;

    this.updatesVisitorCls = updatesVisitorCls;
    this.ruleInsertionVisitorCls = ruleInsertionVisitorCls;
    this.dependencyBuilderCls = dependencyBuilderCls;
    this.buildFileCls = buildFileCls;
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
      targetBuildFile = readFileSync(this.targetBuildFilePath, {encoding: 'utf-8', flag: 'r'});
    } catch {
      this._logger.info({
        ctx: 'processUpdate',
        message: TaskMessages.locate.failure(
          `an updatable \`BUILD\` or \`BUILD.plz\` file at ${this.targetBuildFilePath}.`
        ),
      });
      this._logger.info({ctx: 'processUpdate', message: TaskMessages.attempt('create', 'a new file')});

      this.beginNewFile();

      return true;
    }

    const ast = new this.buildFileCls({file: targetBuildFile, config: this._config}).toAST();

    const existingRuleUpdated = this.updateExistingRule(ast);
    if (existingRuleUpdated) {
      return true;
    }

    this._logger.info({
      ctx: 'processUpdate',
      message: TaskMessages.locate.failure(`updatable rule at ${this.targetBuildFilePath}`),
    });
    this._logger.info({ctx: 'processUpdate', message: TaskMessages.attempt('append', 'a new rule to file')});

    const newRuleInserted = this.appendNewRule(ast);
    if (newRuleInserted) {
      return true;
    }

    this._logger.error({
      ctx: 'processUpdate',
      message: TaskMessages.failure('insert', `rule at ${this.targetBuildFilePath}`),
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
    const visitor = new this.updatesVisitorCls({
      config: this._config,
      rootPath: this.rootPath,
      newDeps: this.newDeps,
    });
    const updatedAST = visitor.updateDeps(cloneDeep(ast));
    const result = visitor.getResult();

    switch (result.status) {
      case 'success':
        writeFileSync(this.targetBuildFilePath, updatedAST.toString(), {encoding: 'utf-8', flag: 'w'});
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
   * APPEND strategy:
   * - Attempt to append a new rule to the `BUILD` or `BUILD.plz` file, and update any `subinclude` statements
   * - If this strategy is successful, return `true`, else return `false`
   *
   * @param ast an AST representation of the target document
   * @returns a boolean indicating whether this strategy was successful
   */
  private appendNewRule = (ast: RootNode) => {
    const visitor = new this.ruleInsertionVisitorCls({
      config: this._config,
      rootPath: this.rootPath,
      newDeps: this.newDeps,
    });
    const updatedAST = visitor.insertRule(cloneDeep(ast));
    const result = visitor.getResult();

    switch (result.status) {
      case 'success':
        writeFileSync(this.targetBuildFilePath, updatedAST.toString(), {encoding: 'utf-8', flag: 'w'});
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
    const ast = new this.dependencyBuilderCls({
      config: this._config,
      rootPath: this.rootPath,
      newDeps: this.newDeps,
    }).buildNewFile();

    writeFileSync(this.targetBuildFilePath, ast.toString(), {encoding: 'utf-8', flag: 'w'});
  };
}
